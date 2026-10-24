# Drawdown

A one-page V60 dial-in bench. Brews live in Cloudflare D1, which is SQLite. A Worker asks Gemini for the next recipe. The API key stays on the Worker.

The page opens with the two cups from your notes, and the recipe that followed them (18 g / 260 g, grind 7.5, 90–91 °C). Those days are only dates, because the notes did not include a time. Remove a cup if you want to enter the real one.

## Local

```bash
npm install
cp .dev.vars.example .dev.vars
```

Put a Gemini API key in `.dev.vars` as `GEMINI_API_KEY`. A key from [Google AI Studio](https://aistudio.google.com/apikey) is enough. `APP_PASSWORD` is optional on your own machine and worth setting before the site is public.

```bash
npm run dev
```

Open http://localhost:8787

`npm test` checks the recipe rules and the imported cups.

## Deploy on Cloudflare’s free plan

```bash
npx wrangler login
npx wrangler d1 create drawdown
```

Copy the printed `database_id` into `wrangler.toml`, then:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_PASSWORD
npm run deploy
```

The Worker creates the tables and the two imported cups on the first request. The model defaults to `gemini-3.8-flash` with thinking set to `low`. Both are in `wrangler.toml`.

Log a cup, including how it tasted, and the page asks for the next recipe. When the bag or the gear changes, edit Coffee and gear, tick “New coffee or equipment”, and describe what changed. Older flavor notes stay in the log and are not treated as this coffee.
