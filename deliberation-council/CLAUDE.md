# Deliberation Council: build guide

Read `AGENTS.md` too: it holds Expo's own rules for this project (use `npx expo install`, Expo Router
in `src/app/`, no hand-edited `ios/` or `android/`).

## What it is
A mobile-first decision-audit app (Expo SDK 57, React Native, Expo Router, NativeWind v4). The user
states a proposition, picks a domain and optional hard constraints, and four Claude "seats" analyse
it in parallel, streaming into their cards. A fifth call synthesises a matrix: verdict, blindspots,
friction points and an action protocol. Every audit is saved on the device.

## Layout
- `src/app/_layout.tsx`: root stack, dark background, imports `global.css`.
- `src/app/index.tsx`: proposition input, dictation, domain selector, hard constraints.
- `src/app/deliberation/[id].tsx`: loads the saved session by id. A new or interrupted session
  runs; a finished one is shown from storage. Retry on failure.
- `src/app/history.tsx`: saved audits, newest first, with delete.
- `src/components/`: `AgentCard`, `MatrixView`, `DomainSelector`, `AudioInputButton`.
- `src/lib/anthropic.ts`: the engine. `src/lib/prompts.ts`: seat prompts, domain context, the
  matrix JSON schema. `src/lib/seats.ts`: seat names, accents, icons. `src/lib/storage.ts`:
  AsyncStorage persistence (key `council.sessions.v1`, last 100 sessions).
- `src/types/index.ts`: shared types.

## Engine rules
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

## Design system ("Obsidian Tactical")
Tokens live in `tailwind.config.js`: `obsidian` #050507, `charcoal` #0F0F12, `slate-matte`
#18181C, `slate-edge` #27272A, `cream` #F4F4F5, `muted` #71717A. Seat accents: First-Principles
cyan #06B6D4, Contrarian crimson #EF4444, Expansionist amber #F59E0B, Executor emerald #10B981.
Mono uppercase tracked labels, 1px borders, accent glow via `shadowColor`.

NativeWind `className` does not apply to Reanimated's `Animated.View`. Use `Animated.View` only
for `entering` animations and animated styles, and put the classes on a plain `View` inside it.

## API key
`EXPO_PUBLIC_ANTHROPIC_API_KEY` in `.env` (see `.env.example`). `EXPO_PUBLIC_` values are compiled
into the bundle, so the key can be extracted from any build. Fine for a personal build with a spend
limit; put a small proxy in front of the API before sharing the app.

## Checks
```bash
npx tsc --noEmit
npx prettier --check "src/**/*.{ts,tsx}"
npx expo export --platform web      # bundles; also try --platform android
```
