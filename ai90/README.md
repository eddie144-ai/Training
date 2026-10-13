# AI 90

**[▶ Open AI 90](https://eddie144-ai.github.io/Training/ai90/)** · open in Chrome or Safari, then install it from the browser menu (Add to Home Screen).

Ninety days to learn Claude, Gemini Pro and SuperGrok properly, and to use them to get a real offer
in front of real buyers. One job a day, with the tool to use, the steps and a prompt to copy.

## The plan
13 weeks in three phases: **Learn the three** (weeks 1–4: set-up, prompting, research, making
images/video/mini apps), **Build the offer** (weeks 5–8: offer, landing page and payment link,
version one, content engine) and **Sell it** (weeks 9–13: first conversations, first sale, systems,
double down, day 90). Each week is four tasks, a **bake-off** (the same job given to all three
tools; you pick the winner and the Plan tab keeps the score), a **ship day** with the week's
deliverable, and a review. Day 90 is week 13's ship day.

## Tabs
- **Today:** the day's task, its tool, the steps and the prompt (Copy), notes and Mark done. Arrows
  browse any day. A banner nudges when yesterday isn't ticked ("never miss twice").
- **Plan:** all 90 days by week, bake-off wins per tool; tap a day to open it.
- **Tools:** what each subscription is best at, when to use another one, and power moves.
- **Money:** money in (with a goal), a leads list with stages, and **Copy summary** to paste into
  Claude for the week 12 numbers review.
- **Setup:** Day 1, the money goal, the **lane** and backup. The lane (apps, fitness content,
  local automation or freelance services) fills `{offer}`, `{audience}`, `{niche}`, `{channel}`
  and `{price}` in every prompt; each field can be edited.

## Files and data
`index.html` (page and styles), `data.js` (the plan, lanes and tool guide), `app.js` (logic),
`manifest.json`, `sw.js` (offline cache), `icons/`. No build step, no dependencies. Everything
lives in `localStorage` under `ai90-v1` as `{ meta: { start, lane, niche, audience, offer, channel,
price, goal }, days: { '1'..'90': { done, note, winner } }, income: [{ date, amount, source, at }],
leads: [{ name, where, stage, at }] }`. Backups merge in without wiping: a day on the phone wins
unless it's empty, and money and leads are matched by `at`.

## Tests
From the repo root: `node ai90/tests/app.test.mjs` (needs Playwright, see the root `CLAUDE.md`).
