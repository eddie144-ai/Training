# eddie144-ai.github.io

The home page for the apps in [Training](https://github.com/eddie144-ai/Training), live at
**https://eddie144-ai.github.io/**.

- `index.html`: **Training HQ**. Every chain with its current and best streak (read from the summary
  Shredded Trainer saves on the same phone, key `shtrainer.chains`; nothing is sent anywhere) and links
  to every app.
- `404.html`: GitHub Pages paths are case-sensitive and the repository is `Training`, so links with a
  lowercase `/training/...` used to show "Site not found". Pages sends any unknown path on this site to
  `404.html`, which forwards `/training/...` (any letter case) to `/Training/...`, keeping the rest of the
  address.

Background photo: Vince Gironda, *Tomorrow's Man*, June 1953, Irvin Johnson Health Studio. Public domain
in the US (copyright not renewed), via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Vince_Gironda_Tomorrows_Man_v1_n5_1953.jpg).

## Where this lives
These files are the source for the `eddie144-ai.github.io` repository. They're kept here so they're
versioned with the apps. Copy the folder's contents (including `.nojekyll`) to the root of that
repository. It only works from there: a user site at `eddie144-ai.github.io` is what GitHub Pages
serves for every path that isn't a project site such as `/Training/`.
