# The Floor

**[▶ Open The Floor](https://eddie144-ai.github.io/Training/floor/)** · open in Chrome or Safari, then install it from the browser menu (Add to Home Screen).

Not the plan: the minimum that counts as a day. Started as a Claude artifact and moved here so it
installs on the phone like Iron & Eggs.

## Tabs
- **Today:** the six (up and outside, walk with steps, one proper meal, one brick, something for the
  girls, screens off on time). Four makes the day count; a 14-day strip shows the run. A banner
  handles slips ("never miss twice"). Tonight: mood and pain 1–5 (mood 1–2 shows support numbers),
  sleep, tomorrow's brick and a free-text "today I did".
- **Girls log:** a dated factual record (planned, happened, changed, cancelled by them / by me), with
  90-day counts and "copy record as text".
- **Parked:** the one project, plus ideas parked for seven days before you can act on them.

## Settings and backup
Steps target, screens-off time, your name (only used in the copied record) and what counts as a
brick. **Save backup** shares or downloads a JSON file; **Restore backup** (or paste) merges one in
without wiping anything: entries are matched by timestamp, and a day already on the phone wins
unless it's empty.

## Files and data
`index.html` (page and styles), `app.js` (logic), `manifest.json`, `sw.js` (offline cache),
`icons/`. No build step, no dependencies. Everything lives in `localStorage` under `the-floor-v1`
as `{ meta: { steps, bed, oneProject, contacts[], parked[], name, brickWhat }, days: { 'YYYY-MM-DD':
{ checks, steps, brick, mood, pain, sleep, did } } }`. Nothing personal is in the code: the hosted
build is public, the data stays on the phone.

## Tests
From the repo root: `node floor/tests/app.test.mjs` (needs Playwright, see the root `CLAUDE.md`).
