# Life RPG

The 4 pillars (Health & Wellness, Wealth & Career, Family & Personal, Technology & Learning) as
one-tap quests, with six stats, HP, streaks and levels. It's built for high openness and low
conscientiousness: every quest is one tap or one number, and Trainer fills in what it already knows.

Same architecture as Trainer: `index.html` (page and styles), `data.js` (stats, pillars, goals,
quests, rules), `app.js` (engine and UI), `manifest.json`, `sw.js` and `icons/`. There's no build step.
Data lives in `localStorage` under `liferpg.v1`. Served at `<site>/liferpg/`.

## Tabs
- **Today:** the HUD (level, HP, XP, STR/VIT/INT/DISC/CAP/CHA), today's quests by pillar, and the
  weekly quests. ◀ ▶ lets you fix a past day. The **quick dock** above the tab bar logs Workout,
  Steps, Gironda meal, Business task, Kids time and AI build in one tap.
- **Quests:** the pillar → goal → quest tree with the last 7 days as dots. Tap a quest to rename it,
  change its XP, target or stat, or switch it off. **+ Add quest** adds your own.
- **Hero:** character sheet, stat bars, a 5-week calendar, the combat log (HP lost, respecs, ended
  streaks, full weeks), your Big Five trait profile (entered by you, kept on the phone) and the rules.
- **Setup:** start date, the Trainer link, high contrast, backup and restore, and reset.

## Rules
| Rule | How it works |
|---|---|
| Quest tap | Open → done → missed → open. Training goes done → rest day → missed. Zero alcohol/coffee counts by itself unless you report a slip. |
| Core quests | Training plan followed, Gironda protocol, zero alcohol/coffee. Each one missed on a past day costs 10 HP. |
| Perfect day | Every required daily quest done (steps and volume are bonus): +20 DISC, +10 HP, and the streak grows. |
| Streak multiplier | ×1.0, then +0.1 for each perfect day in a row, up to ×1.5. |
| Respec | At 0 HP you lose the XP inside your current level and HP refills. Stats keep their XP. |
| Weekly quests | Pay out on the day you tick them. All of them in one week: +50 DISC. |
| Levels | Level L starts at 125·L·(L−1) XP. A stat's value is 1 + √(XP/10). |

Everything is recalculated from the logs on each render, so an edit to a past day can never leave
XP or HP wrong.

## Trainer link
With both apps on the same site, Life RPG reads Trainer's data (it never writes it):
- **Training plan followed:** a workout logged that day, or a planned rest/fast day, or within 7 days
  of your last session (Mentzer recovery). Rest days keep the quest but earn no XP.
- **Lifting volume:** kg × reps summed over that day's sets.
- **Steps:** Trainer's steps, including the Garmin entries.
- **Gironda protocol:** both Gironda meals and nothing else, or a fast day. Trainer's own cut-chain correction wins.
- **Zero coffee:** Trainer's coffee check-in or slip. Alcohol is yours to report here.

Anything you tap in Life RPG wins over Trainer.
