# Memebot: a paper-trading bot for memecoins

A multi-agent trading bot that starts with a **virtual $50** and trades short-term
memecoin momentum (Solana by default). It runs in **paper mode only**: no wallet, no
keys, no real orders. It logs every decision and every virtual dollar of P&L so you can
judge the strategy before any real money is involved.

- Pure Python 3.9+ standard library, so there's nothing to `pip install`.
- Runs offline against a built-in simulated market, or on **live prices** from DexScreener
  with Solana safety data from RugCheck.
- Has a terminal dashboard and a small web dashboard.
- Exports trades, decisions and the equity curve to CSV and JSON.

> **Read this first.** Most memecoins go to zero, and most short-term memecoin traders lose
> money. Paper results flatter you, because real fills are worse (MEV, failed transactions,
> latency, spreads) and simulated markets aren't real markets. Treat this as a tool for
> testing discipline and logic, not a money printer. Nothing here is financial advice.

---

## Quick start

```bash
cd memebot
python3 -m memebot run                 # 1 simulated day (1440 one-minute ticks), offline
python3 -m memebot run --ticks 10080   # 1 simulated week
python3 -m memebot run --web           # same, plus a dashboard at http://127.0.0.1:8050
```

With live market data (needs internet; the bot polls every 30 seconds and runs until you
press Ctrl+C):

```bash
python3 -m memebot run --source dexscreener --web
```

Everything else:

```bash
python3 -m memebot status                       # dashboard for the saved state
python3 -m memebot export --format both         # CSV + JSON into data/<source>/export/
python3 -m memebot resume                       # clear a drawdown pause (stop the bot first)
python3 -m memebot reset                        # delete saved state and logs
python3 -m memebot web                          # web dashboard for saved state
python3 -m unittest discover -s tests -v        # run the tests
```

Add `--source dexscreener` to `status`, `export`, `resume`, `reset` and `web` when you
mean the live-data run. Simulated and live runs keep separate state in `data/simulated/`
and `data/dexscreener/`.

### Configuration

```bash
cp config.example.json config.json     # edit, then:
python3 -m memebot run -c config.json
```

You only need to include the keys you change. Every option, with its default and an
explanation, is in [`memebot/config.py`](memebot/config.py). Common options also work
as flags:

| Flag | Config key | Default |
|---|---|---|
| `--capital 50` | `starting_capital` | 50 |
| `--risk 0.03` | `risk.risk_per_trade_pct` | 0.03 (3%) |
| `--max-positions 3` | `risk.max_concurrent_positions` | 3 |
| `--chains solana,base` | `market.chains` | `["solana"]` |
| `--source dexscreener` | `market.source` | `simulated` |
| `--seed 7` | `market.sim_seed` | 42 |

Percentages are fractions throughout (0.03 = 3%). Unknown keys and out-of-range values are
rejected at startup, so a typo can't silently change your risk.

---

## How it works

Five agents, each with one job. They pass plain data records to each other
([`memebot/models.py`](memebot/models.py)), and the orchestrator runs them once per tick.

```
            market data (simulated or DexScreener + RugCheck)
                               │
   ┌───────────┐   ┌───────────────┐   ┌──────────────┐   ┌────────────┐
   │   Scout   │──▶│ Safety filter │──▶│ Risk manager │──▶│  Executor  │
   │ momentum  │   │ rug checks    │   │ size, exits, │   │ paper fills│
   │ candidates│   │ (fail closed) │   │ breakers     │   │            │
   └───────────┘   └───────────────┘   └──────────────┘   └────────────┘
         └───────────────┴────────┬─────────┴──────────────────┘
                           ┌──────▼──────┐
                           │   Logger    │  decisions.jsonl · trades.jsonl
                           │  (journal)  │  equity.jsonl · state.json
                           └─────────────┘
```

Each tick goes through these steps in order (see [`orchestrator.py`](memebot/orchestrator.py)):

1. **Market data.** Scan the token universe and quote the open positions.
2. **Exits first.** The risk manager checks every open position, and the executor closes
   the ones it flags. Exits run even while the bot is halted or paused.
3. **Circuit breakers.** It checks the daily loss limit and the drawdown stop.
4. **Entries, if allowed.** Scout picks candidates, the safety filter vets them, the risk
   manager sizes them, and the executor fills them.
5. **Logging.** It saves state, records an equity point and refreshes the dashboards.

### Scout ([`agents/scout.py`](memebot/agents/scout.py))
The scout uses cheap market data only. It looks for tokens that are rising with buyers
in control, but it skips ones that have already gone vertical:

- 5-minute change between +2% and +25%.
- 1-hour change between +3% and +150%.
- Buys outnumber sells at least 1.2 to 1.
- Enough 5-minute volume and pool liquidity.
- Not held already, and not in the post-exit cooldown.

Candidates are scored on momentum, buy pressure, turnover and depth, with a penalty for
how extended the move already is. Only the top 3 per tick go to the safety filter.

### Safety filter ([`agents/safety.py`](memebot/agents/safety.py))
Every check must pass. **If data is missing, the check fails**, so the bot sits out
rather than buying blind when RugCheck is down. Checks you allow to be unknown are
listed in `safety.allow_unknown`.

| Check | Default rule |
|---|---|
| Liquidity | ≥ $20,000 in the pool |
| LP status | ≥ 90% of LP tokens locked or burned |
| Mint authority | revoked (no infinite printing) |
| Freeze authority | revoked (your tokens can't be frozen) |
| Top-10 holders | ≤ 35% of supply (pool accounts excluded) |
| Largest holder | ≤ 10% |
| Holder count | ≥ 300 |
| Token age | between 30 minutes and 7 days |
| 24h volume | ≥ $50,000 |
| Honeypot / sell tax | not a honeypot, sell tax ≤ 5% (may be unknown by default) |

### Risk manager ([`agents/risk.py`](memebot/agents/risk.py))
**Sizing.** Each trade is `risk_per_trade_pct` of current equity: 3% by default, so $1.50
on $50. A hard cap in code (`HARD_MAX_RISK_PER_TRADE`) stops any config from going above 5%.
The whole position counts as money at risk, because a rug takes all of it. The size is
then reduced further if needed:
- to stay within total exposure (15% of equity across all positions);
- to keep cash for network fees;
- to keep price impact at or below 2% of pool depth.

Trades under $0.50 are skipped.

**Exits**, checked in this order:
1. **Liquidity pulled:** the pool lost half its liquidity since entry.
2. **Stop loss:** −12%.
3. **Trailing stop:** 10% below the high, armed once the position is up 10%.
4. **Take profit:** +30%.
5. **Time stop:** 3 hours.
6. **No quote:** 5 failed quotes in a row; it exits at the last price with a 10% haircut.

**Circuit breakers:**
- **Daily loss limit (10%).** If equity falls 10% below its level at the start of the UTC
  day, no new entries open until the next UTC day. Open positions are still managed.
- **Drawdown stop (25%).** If equity falls 25% below its peak, the bot is **PAUSED**. By
  default it closes all positions (`flatten_on_pause`). The pause is saved and survives
  restarts. Only `python3 -m memebot resume` clears it, which also resets the peak to
  current equity. A pause is a prompt to review the trade log before resuming.

### Executor ([`agents/executor.py`](memebot/agents/executor.py))
`PaperExecutor` fills orders against a constant-product pool model. The effective price
is `mid × (1 ± (0.5% base slippage + 2 × size / liquidity))`. On top of that it charges a
0.25% swap fee and $0.002 network fee per transaction. All of these are configurable
under `execution`. Make them more pessimistic if anything.

### Logger ([`agents/journal.py`](memebot/agents/journal.py))
All files go to `data/<source>/`:

| File | Contents |
|---|---|
| `decisions.jsonl` | Every decision by every agent: scan summaries, candidates with reasons, safety pass or reject with each failure, risk approve or deny with sizing notes, fills with slippage and fees, exit signals, circuit breakers, resumes |
| `trades.jsonl` | Every closed trade |
| `equity.jsonl` | Equity, cash, exposure, drawdown and status at every tick |
| `state.json` | The full portfolio, rewritten atomically. A live run resumes from it after a restart |

`export` writes `trades.csv`, `decisions.csv` and `equity.csv`, plus
`trades.json`, `decisions.json`, `equity.json` and `summary.json`.

---

## Market data

**`simulated` (default).** An offline synthetic market in which one tick is one simulated
minute. It's deliberately harsh:
- About 45% of tokens are scams that eventually rug (price drops 85–98%, liquidity drains).
- Most scams show red flags, but about 30% look clean.
- About half of all pumps are fake breakouts that reverse sharply.
- Prices bleed slowly between moves.

It's for testing logic and risk rules. **It is not a backtest, and its P&L says nothing
about real profitability.** With default settings, 8 random seeds over 2 simulated days
ranged from about −11% to +16%, with a median just below zero: noise around break-even
after fees, which is about what you should expect. Use `--seed` to check that a change
helps across many seeds, not just one.

**`dexscreener` (live, read-only).**
- New tokens come from DexScreener's latest token profiles and boosts, plus your
  `market.watchlist`.
- Price, liquidity, volume, transactions and age come from the deepest pair for each token.
- Solana safety data (authorities, holders, LP lock) comes from RugCheck and is cached for
  15 minutes.
- Other chains get no safety data yet, so with default settings they never pass the filter.
  Add a provider in `DexScreenerSource.enrich_safety` first (honeypot.is for EVM chains,
  for example).
- Both APIs are public and rate limited. Keep `poll_interval_seconds` at 30 or more.

API response formats can change. The parsers turn anything unexpected into "unknown",
and the safety filter then rejects it. If live runs never pass safety, look at the
`safety reject` lines in `decisions.jsonl` to see which field is missing.

---

## Deploying

**Locally, kept running:** `nohup python3 -m memebot run --source dexscreener --web > bot.log 2>&1 &`

**Docker:**
```bash
docker build -t memebot .
docker run -d --name memebot --restart unless-stopped \
  -v "$PWD/data:/app/data" -p 127.0.0.1:8050:8050 memebot
docker exec memebot python -m memebot status --source dexscreener
docker exec memebot python -m memebot export --source dexscreener
```
The image runs live data with paper fills by default. To pass a config, mount it and
override the command, for example:
`... -v "$PWD/config.json:/app/config.json" memebot run -c config.json --source dexscreener --web 8050 --host 0.0.0.0`.

**VPS:** run it with Docker or a systemd service, as above. The web dashboard has no login
and only reads data, but keep it on 127.0.0.1 and view it through an SSH tunnel
(`ssh -L 8050:127.0.0.1:8050 you@server`) or a reverse proxy with authentication.

---

## Adding a real exchange or wallet connector (later, carefully)

The code is set up so that live trading is a contained change. **It is intentionally not
implemented.**

1. Implement the `Executor` interface in `agents/executor.py`. `LiveExecutorStub` documents
   the contract and a Solana/Jupiter checklist:
   - Quote with strict slippage.
   - Re-check price impact before sending.
   - Sign outside this process.
   - Wait for confirmation.
   - Build the `Fill` from the confirmed transaction, not from the request.
   - Raise on any failure.
2. Return it from `build_executor`. Live mode already requires **both**
   `"mode": "live"` in the config **and** the environment variable
   `MEMEBOT_ENABLE_LIVE_TRADING=I_ACCEPT_THE_RISK`. Without both, the bot refuses to start.
3. Never put private keys in the config, the repository or the logs. Use a hardware wallet,
   the OS keychain or a separate signer service, and fund the wallet with only what you can
   lose.
4. Add a reconciliation step at startup that compares on-chain balances with `state.json`.
5. Run the paper bot alongside the live one with the same config, and compare fills.

New data sources implement `MarketDataSource` (`data/base.py`) and register in
`data/__init__.py`. New safety checks go in `SafetyAgent.check`.

## Project layout

```
memebot/
  __main__.py        CLI (run, status, export, resume, reset, web)
  config.py          all settings, validation, hard caps
  models.py          data records shared by the agents
  portfolio.py       cash, positions, trades, stats, persistence
  orchestrator.py    the per-tick pipeline
  agents/            scout, safety, risk, executor, journal (logger)
  data/              simulated market, DexScreener + RugCheck source
  dashboard/         terminal and web dashboards
tests/test_bot.py    unit and integration tests
config.example.json  every common option
Dockerfile
```
