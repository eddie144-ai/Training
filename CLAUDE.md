# Training repo

A collection of Eddie's personal apps, mostly offline-first phone web apps. GitHub Pages serves
`main` from the repo root at `https://eddie144-ai.github.io/Training/<folder>/`. Read the app's own
`README.md` before changing it; each one documents its files, data model and quirks.

## Apps

| Folder | What it is | Stack | Tests |
|---|---|---|---|
| `/` (root `index.html`, `app.js`, `data.js`) | Trainer: the original RPG habit, training and nutrition app | Plain HTML/JS, `localStorage` | none |
| `shredded-trainer/` | Iron & Eggs: the main training + diet app | Plain HTML/JS | `node shredded-trainer/tests/app.test.mjs` |
| `home-page/` | **Generated copy** of `shredded-trainer/` for `eddie144-ai.github.io`. Don't edit by hand: change `shredded-trainer/`, then run `node home-page/build.mjs` | — | — |
| `gym-fuel/` | Gym & Fuel: Iron & Eggs cut down to gym + nutrition | Plain HTML/JS | `node gym-fuel/tests/app.test.mjs` |
| `gym-fuel/worker/` | Cloudflare Worker for photo food logging (Gemini). Deployed by `.github/workflows/deploy-food-ai.yml` | Workers JS | `node gym-fuel/worker/test/worker.test.mjs` |
| `shredded-system/` | Gironda Cut guide, spec, datasets; app in `shredded-system/app/` | Plain HTML/JS | `node shredded-system/tests/app.test.mjs` |
| `liferpg/` | Life RPG: 4 pillars as one-tap quests; reads Trainer data via `trainer-adapter.js` | Plain HTML/JS | `node liferpg/tests/liferpg.test.mjs` |
| `council/` | Council: therapy/life app + Council Coach (Claude, Groq, OpenRouter with fallback) | Plain HTML/JS | `node council/tests/coach.test.mjs` |
| `deliberation-council/` | Deliberation Council source (Expo / React Native / TypeScript). Has its own `CLAUDE.md` and `AGENTS.md`: read them first | Expo SDK, npm | `npm ci && npx tsc --noEmit` (in the folder) |
| `deliberation/` | **Build output** of `deliberation-council/` (`npm run build:web`). Never edit by hand | — | — |
| `massa/` | MASSA multi-sport value-betting engine and bankroll automation | Node, no deps | `cd massa && node --test` |
| `memebot/` | Memecoin **paper-trading** bot | Python 3 stdlib | `cd memebot && python3 -m unittest discover -s tests` |
| `n8n/telemetry-ingest/` | n8n workflow: daily log → Claude → JSON → Postgres | n8n + JS nodes | none |

## Running the browser tests

The phone-app tests drive the real app in Chromium with Playwright and serve files from the repo
root, so always run them **from the repo root**. Playwright isn't a committed dependency:

```bash
npm i --no-save --no-package-lock playwright
npx playwright install chromium     # skip if a Chromium is already installed for Playwright
node gym-fuel/tests/app.test.mjs
```

CI runs every suite above on each pull request (`.github/workflows/tests.yml`). When you add an app
with tests, add it to that workflow and to this table.

## Conventions

- No build step and no dependencies for the plain HTML/JS apps. Don't add a bundler or framework.
- Data lives in the browser's `localStorage`. Any change to stored data must keep existing users'
  data working: migrate it, never silently drop it.
- When you change cached files in an app, bump `VERSION` in that app's `sw.js` (e.g. `gymfuel-v1.10` → `gymfuel-v1.11`) so installed
  phones pick up the new version.
- Never commit API keys. The hosted builds are public; keys are entered by the user on the device.

## Safety rules for the money apps

- `memebot/` is **paper mode only**. Don't add wallet keys, real order placement or a live mode.
- `massa/`'s real account stays locked per sport until its paper record passes the validation
  gate in `massa/README.md`. Don't weaken or bypass that gate, and don't automate real bet placement.
