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
- **Coach** (new): the therapist and coach side.
  - **Talk:** an AI coach in five modes: *Therapist* (CBT/ACT-style listening and reframing), *Coach*
    (GROW and accountability), *Psychiatrist-style interview* (a structured assessment ending in a 4 Ps
    formulation), *Council roundtable* (five advisors, their disagreements, the Chairman's verdict, from the
    AI Council Decision Engine prompt) and *Future self*. It knows your profile, Self-Authoring, recent
    interviews and the last 14 days of Council (turn sharing off in Coach settings). Every session ends with a
    decision and an action you can add to your commitments.
    Uses Claude Opus 5.5 or Gemini with your own key, called straight from the phone, sharing the keys
    Deliberation Council saves on this site. Keys never go into backups. With no key, *Copy for Claude*
    puts the brief and the conversation on the clipboard for the Claude app.
  - **Interviews:** offline question sets saved on the phone: a full intake (the questions a psychiatrist
    asks at a first appointment), PHQ-9 and GAD-7 screens with scoring, GROW coaching, motivational
    interviewing for a habit, a DBT slip analysis for broken chains, a life story interview and an ACT
    values compass. Any finished interview goes to the coach with one tap.
  - **Author:** Self-Authoring in the structure of Jordan Peterson's suite: Past (epochs and key
    experiences), Present (faults and virtues by Big Five domain, each written through), Future (one-year
    vision, ideal future by area, the future to avoid, goals with motives, obstacles, strategy and
    measures). Import and export as a file; your own work comes in from a private file, never this repo.
  - **Prompts:** the prompt library from Drive (reflection, truth, focus, future, decisions, money), run
    with the coach or copied.
  - Safety: crisis words in a message or an answer, or a positive risk answer, show UK help at once
    (Samaritans 116 123, NHS 111 option 2, 999, SHOUT 85258). The coach is told never to diagnose or give
    medication advice.
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

## Tests
```bash
node council/tests/coach.test.mjs   # from the repo root (needs: npm i playwright)
```
9 tests: every tab, Talk with no key, Claude (request shape, streaming, closing into a commitment) and
Gemini with faked APIs, crisis help, PHQ-9 scoring, Self-Authoring import, the prompt library, and keys
kept out of backups.

## Install
Served with Trainer at `<site>/council/`. Open it in Chrome, then tap **⋮ → Install app**.
