// Builds the installable web app into ../deliberation, which GitHub Pages serves at
// https://eddie144-ai.github.io/Training/deliberation/. Override with BASE_URL and OUT_DIR.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = (process.env.BASE_URL ?? '/Training/deliberation').replace(/\/$/, '');
const out = resolve(process.env.OUT_DIR ?? '../deliberation');

const embedded = ['EXPO_PUBLIC_ANTHROPIC_API_KEY', 'EXPO_PUBLIC_GEMINI_API_KEY'].filter((k) => process.env[k]);
if (embedded.length) {
  // The hosted build is public; a key here would be readable by anyone.
  console.error(`Unset ${embedded.join(' and ')} in your shell before building for hosting. (.env is ignored.)`);
  process.exit(1);
}

// Expo won't export outside the project, so build into dist/ and move it.
rmSync('dist', { recursive: true, force: true });
execSync('npx expo export --platform web --clear --output-dir dist', {
  stdio: 'inherit',
  env: { ...process.env, EXPO_BASE_URL: base, EXPO_NO_DOTENV: '1' },
});
rmSync(out, { recursive: true, force: true });
cpSync('dist', out, { recursive: true });
rmSync('dist', { recursive: true, force: true });

const head = `
  <link rel="manifest" href="${base}/manifest.json" />
  <link rel="apple-touch-icon" href="${base}/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Council" />
  <script>
    if ('serviceWorker' in navigator) {
      addEventListener('load', () => navigator.serviceWorker.register('${base}/sw.js', { scope: '${base}/' }));
    }
  </script>
`;
const indexPath = `${out}/index.html`;
const html = readFileSync(indexPath, 'utf8')
  .replace('</head>', `${head}</head>`)
  .replace(
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, viewport-fit=cover"',
  );
writeFileSync(indexPath, html);
// GitHub Pages serves 404.html for unknown paths, so reloading a deep link still boots the app.
copyFileSync(indexPath, `${out}/404.html`);
console.log(`Built ${out} for ${base}/`);
