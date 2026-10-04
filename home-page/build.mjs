// Copies the app (shredded-trainer/) into this folder, which is what eddie144-ai.github.io serves at its root.
// Run from the repo root after any change to shredded-trainer/, then copy this folder to the site repository:
//   node home-page/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..', 'shredded-trainer');
const FILES = ['index.html', 'app.js', 'data.js', 'photos.js', 'scan.js', 'reminders.js', 'sw.js', 'manifest.json'];
for (const f of FILES) fs.copyFileSync(path.join(app, f), path.join(here, f));
fs.mkdirSync(path.join(here, 'icons'), { recursive: true });
for (const f of fs.readdirSync(path.join(app, 'icons'))) fs.copyFileSync(path.join(app, 'icons', f), path.join(here, 'icons', f));
console.log(`Copied ${FILES.length} files and icons/ from shredded-trainer/`);
