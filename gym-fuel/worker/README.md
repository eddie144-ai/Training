# Gym & Fuel free photo logging (Cloudflare Worker)

Lets anyone using Gym & Fuel log food from a photo with no API key of their own. The app sends the photo and an
optional note here; the Worker asks Google's Gemini (free tier) with your key and returns each food with its grams,
calories and macros.

- **Your key stays secret:** it's a Worker secret on Cloudflare, never in the app or this repo.
- **Food photos only:** the prompt and JSON schema live in the Worker (identical to `../foodai.js`, checked by the
  tests), so it can't be used as a general free AI.
- **Only from the app:** requests must come from `ALLOWED_ORIGINS` (`https://eddie144-ai.github.io`).
- **Daily caps:** `PER_IP_DAILY` (10) photos per internet connection and `DAILY_TOTAL` (200) for everyone, counted
  exactly in a Durable Object (SQLite, free plan). IP addresses are stored only as a salted hash and dropped the next
  day. Change the numbers in `wrangler.toml`.
- **Cost:** Cloudflare's free plan (100,000 requests a day) and Gemini's free tier. Google may use what's sent on the
  free tier to improve its products; the app says so where you choose "Free".

## One-time setup (about 10 minutes, works from a phone)

1. **Cloudflare account:** sign up free at <https://dash.cloudflare.com/sign-up>, open **Workers & Pages** once and
   pick your `workers.dev` subdomain.
2. **Account ID:** on the **Workers & Pages** page, copy the **Account ID** shown on the right.
3. **API token:** **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template → Continue → Create**.
   Copy the token (it's shown once).
4. **Gemini key:** a free key from <https://aistudio.google.com/apikey>. A separate key (in its own Google Cloud
   project) is best, because free-tier limits are per project and this keeps your own use separate.
5. **GitHub secrets:** in this repo, **Settings → Secrets and variables → Actions → New repository secret**, add:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `GEMINI_API_KEY`.
6. **Deploy:** **Actions → Deploy free food AI → Run workflow**. It runs the tests, then deploys. Later changes to the
   Worker deploy themselves when merged.
7. **Switch it on in the app:** the end of the deploy log shows the address,
   `https://gym-fuel-food-ai.<your-subdomain>.workers.dev`. Set `FREE_AI_URL` in `../foodai.js` to it (or ask
   Claude to) so everyone gets it. To try it first on your own phone: **Body → Settings → Photo logging → Free service
   address**. Opening the address in a browser shows `"ready": true` once the key is in place.

## Tests

```bash
node gym-fuel/worker/test/worker.test.mjs
```
No Cloudflare runtime needed: covers the shared prompt and schema, CORS and origin checks, the request to Gemini
(the client can't change the prompt), the per-connection and total caps with refunds on failures, input checks, the
not-set-up state and Google being busy.
