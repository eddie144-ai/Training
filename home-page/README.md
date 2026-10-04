# eddie144-ai.github.io: Iron & Eggs

The main training and diet app, live at **https://eddie144-ai.github.io/**: Today · Plan · Train · Fuel ·
Body · Hero across the bottom, with Hero → **Apps** for the other apps and a one-tap backup of all of them.

It's the app in [`shredded-trainer/`](../shredded-trainer), copied here by `build.mjs`. Both copies use the
same saved data (`shtrainer.v1`; GitHub Pages serves both from one origin), so nothing moves when you switch.
The copy at `/Training/shredded-trainer/` shows a note pointing here.

- Change the app in `shredded-trainer/` (tests: `node shredded-trainer/tests/app.test.mjs`).
- Run `node home-page/build.mjs`, then copy this folder's contents (including `.nojekyll`, not `build.mjs`)
  to the root of the `eddie144-ai.github.io` repository.
- `404.html`: GitHub Pages paths are case-sensitive and the repository is `Training`, so lowercase
  `/training/...` links (any letter case) are forwarded to `/Training/...`, keeping the rest of the address.
- The service worker leaves everything under `/Training/` alone when it runs at the root, so each app there
  keeps its own.

Background photo: Vince Gironda, *Tomorrow's Man*, June 1953, Irvin Johnson Health Studio. Public domain
in the US (copyright not renewed), via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Vince_Gironda_Tomorrows_Man_v1_n5_1953.jpg).
