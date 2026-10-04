# eddie144-ai.github.io

The home page for the apps in [Training](https://github.com/eddie144-ai/Training), live at
**https://eddie144-ai.github.io/**.

- `index.html`: **Iron & Eggs**, the master app. Read-only, from the apps' own data on the same phone
  (nothing is sent anywhere, and no other app's data is ever changed):
  - **Today** from Shredded Trainer (`shtrainer.v1`): eating mode and window, protein and calories,
    weight and 7-day average, sessions this week and how the last one felt, steps, sleep.
  - **Chains** from the summary Shredded Trainer saves (`shtrainer.chains`).
  - **Everything else**: YouTube, wealth and family ticks, Life RPG quests (`liferpg.v1`), Council
    commitments (`council.v1`) and MASSA open bets (`massa.v1`).
  - **Apps** open inside Iron & Eggs (`#/app/<id>`), with a bar to switch apps, go back to HQ or open
    the app on its own. Saving in an app refreshes HQ straight away.
- `manifest.json`, `sw.js`: install it from Chrome's menu (**Add to Home screen**). The service worker
  only caches this page; everything under `/Training/` is left to each app's own service worker.
- `404.html`: GitHub Pages paths are case-sensitive and the repository is `Training`, so links with a
  lowercase `/training/...` used to show "Site not found". Pages sends any unknown path on this site to
  `404.html`, which forwards `/training/...` (any letter case) to `/Training/...`, keeping the rest of the
  address.

Background photo: Vince Gironda, *Tomorrow's Man*, June 1953, Irvin Johnson Health Studio. Public domain
in the US (copyright not renewed), via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Vince_Gironda_Tomorrows_Man_v1_n5_1953.jpg).

## Where this lives
These files are the source for the `eddie144-ai.github.io` repository. They're kept here so they're
versioned with the apps. The live copy is https://github.com/eddie144-ai/eddie144-ai.github.io; copy changes there
(including `.nojekyll`). It only works from there: a user site at `eddie144-ai.github.io` is what GitHub Pages
serves for every path that isn't a project site such as `/Training/`.
