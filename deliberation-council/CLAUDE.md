# Deliberation Council: build guide

Read `AGENTS.md` too: it holds Expo's own rules for this project (use `npx expo install`, Expo Router
in `src/app/`, no hand-edited `ios/` or `android/`).

## What it is
A mobile-first decision-audit app (Expo SDK 57, React Native, Expo Router, NativeWind v4). The user
states a proposition, picks a domain and optional hard constraints, and four AI "seats" analyse
it in parallel, streaming into their cards. A fifth call synthesises a matrix: verdict, blindspots,
friction points and an action protocol. Every audit is saved on the device. The seats run on
Claude (paid) or Gemini (free tier), chosen in Settings.

## Layout
- `src/app/_layout.tsx`: root stack, dark background, imports `global.css`.
- `src/app/index.tsx`: proposition input, dictation, domain selector, hard constraints.
- `src/app/deliberation/[id].tsx`: loads the saved session by id. A new or interrupted session
  runs; a finished one is shown from storage. Retry on failure.
- `src/app/history.tsx`: saved audits, newest first, with delete.
- `src/app/settings.tsx`: choose Claude or Gemini, manage each key, set the Gemini model.
- `src/app/behavioral-audit.tsx`: paste a communication record and get an actions-vs-words audit
  (one `generateJson` call through `src/lib/behavioralAudit.ts`, shown by `AuditReportView`). Not saved.
- `src/components/`: `AgentCard`, `MatrixView`, `DomainSelector`, `AudioInputButton`.
- `src/lib/council.ts`: orchestration (parallel seats, synthesis, shape check) over an `Engine`
  (`src/lib/engine.ts`). `src/lib/anthropic.ts` and `src/lib/gemini.ts` are the two engines.
  `src/lib/prompts.ts`: seat prompts, domain context, the
  matrix JSON schema. `src/lib/seats.ts`: seat names, accents, icons. `src/lib/storage.ts`:
  AsyncStorage persistence (key `council.sessions.v1`, last 100 sessions). `src/lib/apiKey.ts`:
  provider choice, Gemini model, and both keys (SecureStore on iOS/Android, browser storage on web).
- `src/types/index.ts`: shared types.

## Engine rules: Claude
- Model `claude-opus-5-5` for every call. Thinking is adaptive (it can't be disabled on this
  model); `output_config.effort` is set explicitly to `medium`. No `temperature`: Opus 5.5 rejects
  sampling parameters.
- Every call goes through `client.beta.messages` with `fallbacks: 'default'` and the
  `server-side-fallback-2026-07-01` beta, so a safety-classifier decline re-runs on the
  recommended fallback model. `stop_reason === 'refusal'` is still checked.
- Seats stream with `client.beta.messages.stream`. On native the client is given `expo/fetch`,
  because React Native's built-in fetch can't stream response bodies.
- A failed seat doesn't sink the run. Synthesis needs at least two answered seats.
- The synthesiser uses structured outputs (`output_config.format` with `MATRIX_SCHEMA`), and the
  result is still shape-checked before use.

## Engine rules: Gemini
- Plain REST (no SDK) against `generativelanguage.googleapis.com/v1beta`, key in the
  `x-goog-api-key` header. Default model `gemini-3.8-flash` (free tier); the user can change it.
- Seats use `streamGenerateContent?alt=sse`, parsed by hand; parts with `thought: true` are
  dropped. Native uses `expo/fetch` for a streaming body.
- Synthesis uses `generateContent` with `responseMimeType: application/json` and
  `responseJsonSchema: MATRIX_SCHEMA`.
- 429 means the free-tier rate limit; the error tells the user to wait a minute.
- Free-tier prompts may be used by Google to improve its products; Settings says so.

## Design system ("Obsidian Tactical")
Tokens live in `tailwind.config.js`: `obsidian` #050507, `charcoal` #0F0F12, `slate-matte`
#18181C, `slate-edge` #27272A, `cream` #F4F4F5, `muted` #71717A. Seat accents: First-Principles
cyan #06B6D4, Contrarian crimson #EF4444, Expansionist amber #F59E0B, Executor emerald #10B981.
Mono uppercase tracked labels, 1px borders, accent glow via `shadowColor`.

NativeWind `className` does not apply to Reanimated's `Animated.View`. Use `Animated.View` only
for `entering` animations and animated styles, and put the classes on a plain `View` inside it.

## API key
The user pastes their keys in Settings and they're stored only on their device. `getApiKey()`
falls back to `EXPO_PUBLIC_ANTHROPIC_API_KEY` / `EXPO_PUBLIC_GEMINI_API_KEY` from `.env` for local
development. `EXPO_PUBLIC_` values
are compiled into the bundle, so `npm run build:web` ignores `.env` (`EXPO_NO_DOTENV`) and refuses
to run if either variable is set in the shell.

## Web app (phone install)
`npm run build:web` exports the web build into `../deliberation/`, which GitHub Pages serves at
`https://eddie144-ai.github.io/Training/deliberation/` once it's on `main`. It sets Expo's
`baseUrl` through `app.config.js` (`BASE_URL` overrides `/Training/deliberation`), injects the
manifest, Apple tags and service worker from `public/`, and copies `index.html` to `404.html` so
deep links survive a reload. Rebuild and commit `../deliberation/` after changing the app.

## Checks
```bash
npx tsc --noEmit
npx prettier --check "src/**/*.{ts,tsx}"
npx expo export --platform android --output-dir /tmp/android   # native bundle compiles
npm run build:web                                              # hosted web build
```
