# MASSA: value betting engine and bankroll automation

MASSA is a Dixon-Coles value betting engine. It automates the loop from capital in to money out:

**deposit → settle → rate teams → fetch odds → find value → size stakes → place → sweep profit / stop-loss → withdraw.**

It runs as an installable web app at `<site>/massa/` and as a Node script for cron or n8n. Neither one has a build step or any dependencies.

## What's automated, and what isn't

| Step | How |
|---|---|
| Capital in | You enter a deposit in **Money** (or run `run.mjs deposit`). Each account tracks cash, principal and peak. |
| Settlement | Scores come from The Odds API. Open bets settle as won, lost or void (a whole-number total that lands exactly is void). |
| Team ratings | Attack and defence are fitted from this season's and last season's football-data.co.uk results. They're time-decayed (180-day half-life), adjusted for opponent strength, shrunk toward the league average, and refitted daily. |
| Odds | The Odds API returns 1X2 and Over/Under 2.5, taking the best price among the bookmakers you hold accounts with. |
| Value | The Dixon-Coles score matrix gives model probabilities. The bookmaker margin is removed (power de-vig by default), and EV = p·o − 1. Markets with more than 8% margin are rejected. Selections below 2% EV are passed. |
| Correlation | One bet at most per fixture: the highest-EV selection. |
| Staking | Quarter Kelly with these caps: 1% a bet, 2% a fixture, 3% a day, 5% a rolling week. Stakes halve past 10% drawdown and quarter past 20%. Minimum stake is £0.10. |
| Placement | **Paper:** bets are placed automatically. **Real:** each cycle lists the bets for you to place at your bookmaker; you tap *Placed* and enter the price you got. |
| Money rules | Up 20% on principal, the profit is withdrawn (swept). Down 30%, betting halts. After a 5% daily loss, there are no more bets that day. |
| Withdrawal | Profit sweeps happen automatically in the ledger. To take money out for real, you withdraw at your bookmaker and record it here. |

### Why real money isn't hands-free

1. **No access.** UK bookmakers don't offer a public API for placing bets, depositing or withdrawing. Their terms also ban automated accounts, and breaking them gets accounts closed and winnings voided.
   - The Betfair Exchange API does allow automated betting, but it needs a server-side login with a certificate and a paid app key. A static web page can't hold those.
   - Deposits and withdrawals have no API anywhere.
2. **Your own rules.** Betting Council v1.1 allows real-money staking only after walk-forward validation. Until then the default is research or paper trading.

### The validation gate

The **real account stays locked** until the paper record passes all three checks:

- at least 200 settled paper bets;
- a 95% confidence interval on ROI whose lower bound is above 0;
- model Brier score better than the de-vigged market's Brier score on the same bets.

The pick log from 16 September 2026 has no settled results yet, so nothing has been validated so far.

## Files

| File | What it does |
|---|---|
| `engine.js` | Poisson and Dixon-Coles models, score matrix, market probabilities, overround, de-vig (proportional or power), EV, capped Kelly, market and fixture evaluation, settlement |
| `ratings.js` | Parses football-data.co.uk CSVs, fits ratings, and matches team names across feeds (e.g. "Manchester United" = "Man United") |
| `feeds.js` | The Odds API odds and scores, results download, league map |
| `bankroll.js` | Paper and real accounts, ledger, deposits, withdrawals, caps, drawdown throttle, settlement, profit sweep, stop-loss, validation gate |
| `pipeline.js` | One full cycle, shared by the app and the runner |
| `app.js`, `index.html`, `sw.js`, `manifest.json`, `icons/` | The app (data stays in `localStorage`) |
| `run.mjs` | Command-line runner |
| `test/` | `npm test` (Node 18+) |

### Fixes from the original TypeScript engine

| Original problem | Fix |
|---|---|
| `expectedGoals` always came back as 0–0 | Returned from `evaluateFixture` |
| Fair odds for p = 0 were `Infinity` | Returns `null` |
| Odds of 1 or less were accepted | Rejected |
| Margin over 8% was rated LOW | Now REJECT |
| Kelly stakes had no cap | Capped |
| Probabilities were rounded before EV | Kept unrounded |
| De-vig was proportional only | Power de-vig added |
| Over/Under and BTTS were never evaluated | Both evaluated |

## Set up

1. Get a free key at [the-odds-api.com](https://the-odds-api.com). The free plan gives 500 requests a month, and each league costs about 2 requests a cycle (4 when bets are waiting to settle).
2. Open the app, then go to **Settings**:
   - paste the key;
   - pick leagues;
   - optionally list the bookmaker keys you hold accounts with (e.g. `williamhill, paddypower, betfair_ex_uk`).
3. In **Money**, deposit paper capital.
4. Leave the app open (it runs every 3 hours while open) or use the runner.

### Runner (cron, or n8n's Execute Command node)

```sh
cd massa
node run.mjs init
node run.mjs deposit 100
ODDS_API_KEY=xxxx node run.mjs cycle
node run.mjs status
```

Example crontab, at 08:50 and 18:50 daily:

```
50 8,18 * * * cd ~/Training/massa && ODDS_API_KEY=xxxx node run.mjs cycle >> massa.log 2>&1
```

State is stored in `massa-state.json` (set `MASSA_STATE` to change the path). It uses the same format as the app's **Export** and **Import**, so you can move between the two. The API key passed in through the environment is never written to the file.

## Limits

- The model only uses goals: no lineups, injuries, weather or xG data.
  - That's well short of what the Betting Council spec asks for. This is why the gate exists.
  - Large EVs, like +60% on a heavy favourite, usually mean the ratings are wrong, not that the market is.
- BTTS needs per-event Odds API requests, so automated cycles only cover 1X2 and O/U 2.5. The Board's manual check covers BTTS.
- Cup and European fixtures aren't in the league results files, so those teams go unrated and are skipped.
- There's no darts model.
- Scores are settled as The Odds API reports them. Check cup ties that go to extra time.

Only bet money you can afford to lose. If it stops being fun, these can help:

- [GAMSTOP](https://www.gamstop.co.uk) self-exclusion;
- GamCare on 0808 8020 133;
- [BeGambleAware](https://www.begambleaware.org).
