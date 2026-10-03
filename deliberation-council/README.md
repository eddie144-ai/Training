# Deliberation Council

A mobile decision-audit app. Type or dictate a decision, pick a domain, and four Claude seats
(First-Principles Thinker, Contrarian Risk Auditor, Expansionist Asymmetry Finder, The Executor)
analyse it in parallel, streaming live. A synthesis pass turns their work into a verdict,
blindspots, friction points and an action protocol. Audits are saved on the phone.

Built with Expo SDK 57, Expo Router, NativeWind and the Anthropic TypeScript SDK.

## Run it
```bash
cd deliberation-council
npm install
cp .env.example .env          # then paste your Anthropic API key
npx expo start                # press w for web, or scan the QR code with Expo Go
```

Dictation uses `expo-speech-recognition`, a native module that isn't in Expo Go. In Expo Go the mic
button is hidden and the keyboard's own mic works instead. For in-app dictation, make a development
build: `npx expo run:ios` / `npx expo run:android`, or `npx eas-cli@latest build --profile development`.

## Cost
Each audit makes five calls to Claude Opus 5.5 (four seats and one synthesis) at medium effort.

## Security
The API key is compiled into the app. Use a key with a low spend limit, and don't publish builds
that contain it.

See `CLAUDE.md` for the architecture and conventions.
