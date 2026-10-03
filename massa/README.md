# MASSA: value betting engine and bankroll automation

MASSA is a multi-sport value betting engine: football, darts, basketball, American football, ice hockey, baseball, rugby, Aussie rules, tennis, MMA, boxing and cricket. It automates the loop from capital in to money out:

**deposit → settle → rate teams → fetch odds → find value → size stakes → place → sweep profit / stop-loss → withdraw.**

It runs as an installable web app at `<site>/massa/` and as a Node script for cron or n8n. Neither one has a build step or any dependencies.

## What's automated, and what isn't

| Step | How |
|---|---|
| Capital in | You enter a deposit in **Money** (or run `run.mjs deposit`). Each account tracks cash, principal and peak. |
| Settlement | Scores come from The Odds API. Open bets settle as won, lost or void (a whole-number total that lands exactly is void). |
| Results history (other sports) | Every cycle adds the last 3 days of scores; you can also paste past results. |
| Team ratings | Attack and defence are fitted from this season's and last season's football-data.co.uk results. They're time-decayed (180-day half-life), adjusted for opponent strength, shrunk toward the league average, and refitted daily. |
| Odds | The Odds API returns match, handicap and totals odds on the main line (the one most bookmakers quote), taking the best price among the bookmakers you hold accounts with. |
| Value | Each sport's model (below) gives model probabilities. The bookmaker margin is removed (power de-vig by default), and EV = p·o − 1. Markets with more than 8% margin are rejected. Selections below 2% EV are passed. |
| Correlation | One bet at most per fixture: the highest-EV selection. |
| Staking | Quarter Kelly with these caps: 1% a bet, 2% a fixture, 3% a day, 5% a rolling week. Stakes halve past 10% drawdown and quarter past 20%. Minimum stake is £0.10. |
| Settlement fallback | When the scores feed reports nothing for an event (some fights, darts), the bet shows Won, Lost and Void buttons 3 hours after the start. |
| Placement | **Paper:** bets are placed automatically. **Real:** each cycle lists the bets for you to place at your bookmaker; you tap *Placed* and enter the price you got. |
| Money rules | Up 20% on principal, the profit is withdrawn (swept). Down 30%, betting halts. After a 5% daily loss, there are no more bets that day. |
| Withdrawal | Profit sweeps happen automatically in the ledger. To take money out for real, you withdraw at your bookmaker and record it here. |

### Why real money isn't hands-free

1. **No access.** UK bookmakers don't offer a public API for placing bets, depositing or withdrawing. Their terms also ban automated accounts, and breaking them gets accounts closed and winnings voided.
   - The Betfair Exchange API does allow automated betting, but it needs a server-side login with a certificate and a paid app key. A static web page can't hold those.
   - Deposits and withdrawals have no API anywhere.
2. **Your own rules.** Betting Council v1.1 allows real-money staking only after walk-forward validation. Until then the default is research or paper trading.

## Models by sport

| Sport | Model | Learns from | Markets |
|---|---|---|---|
| Football | Dixon-Coles goals grid | football-data.co.uk results | 1X2, totals, handicap (half and whole lines), BTTS in the calculator |
| Darts | Leg model (below) | Your player table: average and checkout % | Match, handicap, total legs or sets |
| Darts, players missing from the table | Elo | Results history | Match |
| Basketball, American football, rugby, AFL | Attack and defence on points; normal margin and total. Spread of results per sport: NBA ±12.5 margin / ±18 total, NFL ±13.5 / ±13.5, AFL ±36 / ±26 | Results history | Match, handicap, totals |
| Ice hockey | Attack and defence on goals, Poisson grid. A level score is split by scoring rate (overtime) | Results history | Match, puck line, totals |
| Baseball | As hockey, on runs | Results history | Match, run line (no totals: runs vary too much for Poisson) |
| Tennis, MMA, boxing, cricket, anything else with a two-way market | Elo | Results history | Match |
| Tennis (calculator) | Serve model (below) | Serve points won | Match, games handicap, total games |

Outright and futures markets aren't modelled.

### Darts

1. **Visits per leg.** A won leg of D darts has an average of 1503 / D by definition, so mean visits ≈ 501 / average.
   - These split into scoring visits (normally distributed, at least 2) and checkout visits.
   - Each checkout visit succeeds with chance 1 − (1 − checkout)², assuming two darts at a double.
2. **Legs.** Throwing first, a player wins the leg if they need no more visits than the opponent. Throwing second, they need fewer.
   - A 100 average comes out at 15.2 darts a leg.
   - Equal players hold throw 61.5% of the time.
3. **Match.** The full score distribution is worked out leg by leg, with the throw alternating.
   - Formats are `legs:N` (first to N legs) or `sets:N:L` (first to N sets of first to L legs). Who starts each set alternates.
   - If the first throw is unknown, it's treated as a 50/50 bull.
4. **Automated cycles** use the format set in **Settings → Darts**. The odds feed doesn't say the format, so set it for the event you're betting.
   - The final-set "two clear legs" rule isn't modelled.

### Tennis

- A player's serve points won gives their hold chance.
- Tie-breaks are worked out point by point.
- Sets and the match follow from those, with a standard tie-break at 6-6 in every set. This is Barnett & Clarke's model.
- Automated tennis cycles use Elo from results, because no free feed gives serve stats.

### The validation gate

The gate is **per sport**: an edge in one sport says nothing about another (Betting Council v1.1). The **real account stays locked** for a sport until its own paper record passes all three checks:

- at least 200 settled paper bets;
- a 95% confidence interval on ROI whose lower bound is above 0;
- model Brier score better than the de-vigged market's Brier score on the same bets.

The pick log from 16 September 2026 has no settled results yet, so nothing has been validated so far.

## Files

| File | What it does |
|---|---|
| `engine.js` | Poisson and Dixon-Coles models, score matrix, market probabilities, overround, de-vig (proportional or power), EV, capped Kelly, market and fixture evaluation, settlement |
| `ratings.js` | Parses football-data.co.uk CSVs, fits ratings, and matches team names across feeds (e.g. "Manchester United" = "Man United") |
| `feeds.js` | The Odds API odds, scores and sports list, results downloads, results CSV parser, football league map |
| `sports/registry.js` | Which model each sport uses, fitting, and fixture evaluation |
| `sports/darts.js` | The darts leg and match model, formats, player table |
| `sports/tennis.js` | Hold, tie-break, set and match model |
| `sports/elo.js` | Elo ratings |
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

1. Get a free key at [the-odds-api.com](https://the-odds-api.com).
   - The free plan gives 500 requests a month.
   - Each sport costs one request per market each cycle (up to 3).
   - Scores cost 2 more. Sports other than football fetch scores every cycle, because that's how they learn.
   - Pick a few sports, or run cycles less often.
2. Open the app, then go to **Settings**:
   - paste the key;
   - pick sports (**Load all in-season sports** lists everything the feed has);
   - for darts, fill in the player table and the match format;
   - for other sports, paste past results under **Results history** so they can start betting before enough games have come in;
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
node run.mjs set sports '["soccer_epl","basketball_nba","icehockey_nhl"]'
node run.mjs results basketball_nba nba-2025-26.csv   # date, home, away, home score, away score
node run.mjs settle <bet-id> won                       # when the scores feed missed an event
```

Example crontab, at 08:50 and 18:50 daily:

```
50 8,18 * * * cd ~/Training/massa && ODDS_API_KEY=xxxx node run.mjs cycle >> massa.log 2>&1
```

State is stored in `massa-state.json` (set `MASSA_STATE` to change the path). It uses the same format as the app's **Export** and **Import**, so you can move between the two. The API key passed in through the environment is never written to the file.

## Limits

- The models only use scores: no lineups, injuries, weather or xG data.
  - That's well short of what the Betting Council spec asks for. This is why the gate exists.
  - Large EVs, like +60% on a heavy favourite, usually mean the ratings are wrong, not that the market is.
- Every sport is fitted on scores alone. Elo sports only price the match winner.
- Hockey totals are modelled for regulation time, but most bookmakers settle them including overtime.
- Spreads of results per sport are fixed estimates, not fitted.
- BTTS needs per-event Odds API requests, so automated cycles don't price it. The Board's manual check covers BTTS.
- Bets settle on the score the feed reports. In tennis that may be sets, not games, so automated tennis prices the match winner only.
- Cup and European fixtures aren't in the league results files, so those teams go unrated and are skipped.
- Scores are settled as The Odds API reports them. Check cup ties that go to extra time.

Only bet money you can afford to lose. If it stops being fun, these can help:

- [GAMSTOP](https://www.gamstop.co.uk) self-exclusion;
- GamCare on 0808 8020 133;
- [BeGambleAware](https://www.begambleaware.org).
