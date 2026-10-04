# Council: therapy and life app

Built from the "Eddie personality" folder (mainly *Eddie Info.pdf* and the test results). Same
setup as Trainer: offline-first, no build step, data in `localStorage` on the phone. Files:
`index.html` (page and styles), `data.js` (profile, Council lenses, patterns, hypotheses, lines),
`app.js` (logic), `sw.js`, `manifest.json`, `icons/`.

## Design rationale
The profile's central finding is intellect at the 93rd percentile with conscientiousness at the 9th:
designing systems is easy, running them daily is the bottleneck, and system design itself can become
procrastination. So the app keeps daily input to about three minutes and puts the structure outside
your head. Shredded Trainer keeps the body (training, diet, fasting). Council covers mind, money, projects,
fatherhood and relationships, and reads Shredded Trainer's sleep, steps and training (or the original
Trainer's, if that's all there is) when both are installed
from the same site.

## Tabs
- **Today:** check-in (mood, energy, sleep, novelty urge, irritation); up to 3 commitments with one
  ★ One Thing, suggested from your projects' and goals' next actions; **Start 10 min** timers (the
  cost of starting, not knowledge, is the bottleneck); built vs consumed minutes; *Caught ruminating*
  parks the thought until the worry window; *New idea* sends it to the vault; evening review with an
  evidence line and tomorrow's One Thing.
- **Unresolved and the tomorrow loop:** open commitments from past days must be closed. Moving one
  counts as a postponement; after two moves the only options are *shrink it* or *kill it*. "Don't miss
  twice" appears after a missed One Thing.
- **Goals:** vision, priorities in stated order, one 90-day goal per domain (Wealth, Health, Father,
  Build, Relationships, Mind) with pace tracking. **Projects** have a limit on active projects
  (default 2); ideas cool off for 7 days in the vault, and promoting one needs a done definition, kill
  criteria, a deadline under 90 days and a next action, and asks for a money path. **Week:** a review
  with a kill decision and next week's one commitment.
- **Council:** timeboxed sessions (default 15 min) that only close with a Chairman decision, which
  becomes a commitment. *Session* is a CBT thought record with distortions and the six lenses (Beck,
  Peterson, Maté, Jung, Perel, Frankl). *Standards* rates a relationship on observed behaviour against
  your minimum standards and files a verdict; parking a worry about that person shows the verdict on
  file. *Decide* covers options, info that would change your mind, a steelman, second-order effects and
  kill criteria.
- **Mirror:** Say/Do score (kept ÷ (kept + broken); retracting before the day doesn't count against
  you), actions vs words by domain, built vs consumed, a live monitor for the six patterns from the
  profile, a hypothesis lab that tests claims about you against your own logs, state trends, and the
  evidence file.
- **Me:** profile baseline, editable operating rules, **Copy briefing** for Claude (profile, protocol,
  last 14 days), settings, backup and restore, crisis numbers.

## Install
Served with Trainer at `<site>/council/`. Open it in Chrome, then tap **⋮ → Install app**.
