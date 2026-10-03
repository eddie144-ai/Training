# Deliberation Council

A mobile decision-audit app. Type or dictate a decision, pick a domain, and four AI seats
(First-Principles Thinker, Contrarian Risk Auditor, Expansionist Asymmetry Finder, The Executor)
analyse it in parallel, streaming live. A synthesis pass turns their work into a verdict,
blindspots, friction points and an action protocol. Audits are saved on the phone.

Built with Expo SDK 57, Expo Router, NativeWind, the Anthropic TypeScript SDK and the Gemini REST API.

## Use it on your phone
Open **https://eddie144-ai.github.io/Training/deliberation/** on your phone, then:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Install app** (or **Add to Home screen**).

Open it from the home screen, tap the gear, pick an engine and paste its key:
- **Gemini (free):** get a key at aistudio.google.com/apikey. No card needed. The free tier allows
  only a few requests a minute, so space audits about a minute apart, and Google may use free-tier
  prompts to improve its products.
- **Claude (paid):** Claude Opus 5.5, key from console.anthropic.com. Set a spend limit.

Keys stay on that phone. Saved audits work offline; running a new one
needs a connection. Dictation isn't available in the web version, but the keyboard's mic is.

## Develop
```bash
cd deliberation-council
npm install
npx expo start                # press w for web, or scan the QR code with Expo Go
```

Dictation uses `expo-speech-recognition`, a native module that isn't in Expo Go. In Expo Go the mic
button is hidden and the keyboard's own mic works instead. For in-app dictation, make a development
build: `npx expo run:ios` / `npx expo run:android`, or `npx eas-cli@latest build --profile development`.

## Cost
Each audit makes five calls (four seats and one synthesis). On Gemini's free tier that's free; on
Claude it's five Claude Opus 5.5 calls at medium effort.

Add your key in the app's Settings, or put it in `.env` (see `.env.example`) for local
development only.

To update the hosted version, run `npm run build:web` and commit the `../deliberation/` folder.

## Security
The key is kept on your device and sent only to Anthropic. Set a monthly spend limit on it anyway.
`build:web` ignores `.env` and refuses to run if the key is set in your shell, so it never ships in the hosted build.

See `CLAUDE.md` for the architecture and conventions.
