# Progress

We work through this in small batches: take the next unchecked item plus any small items that use the same code (2–3 at most), verify, commit, tick them off, then clear context. Bigger or unrelated items (Deadlines, README, Live AMC API) get a session each. Prefer a reusable verification script over one-off curl checks.
The original design is summarized at the bottom.

## Checklist

- [x] **Build check**: `tsc`, `eslint`, 12/12 vitest, `next build` all clean; prod server serves every page, `/api/cron/poll` returns 401 without the secret.
- [x] **Favorite theatres**: `npm run dev`, search on /theatres (mock: `62701`, `Springfield`, `Chicago`), star/unstar, favorites list updates. Verified against a dev server: `62701` returns Riverside/Downtown/Northgate (mock zip search matches the first 3 digits), `Springfield` returns 2, `Chicago` returns 1, a nonsense query shows the empty state, star/unstar toggles the button and the "Your theatres" list.
- [x] **Watchlist**: /movies, Watch/unwatch from Now playing + Coming soon, save notes, dashboard shows the movie. Covered by `npm run verify`.
- [x] **New-showtime alerts**: Check now (first poll seeds silently, no alerts), Settings → Advance mock step → Check now → "Tickets are up: Glass Meridian" alert in-app, Send test, delivery to a local fake webhook, re-poll adds nothing, Clear. Covered by `npm run verify`.
  - [ ] Real webhook (needs the user's URL): `WEBHOOK_URL=https://discord.com/api/webhooks/... npm run verify`, then confirm the test message and the Glass Meridian alert show up in the channel.
- [x] **Programming deadlines**: add a deadline for Paper Comets (only plays at AMC Harborview 8). Check it goes Programmed when that theatre is a favorite, and "Likely not programmed" after the date passes without it. Covered by `npm run verify`: two "any favorite" deadlines (today+14 and yesterday, since the form accepts past dates), poll with only Riverside starred, so the past one goes missed with a "still no showtimes" alert and the future one stays Waiting. Then star Harborview and poll, so the future one goes Programmed with an "is programmed" alert. Both alerts reach the webhook, and Remove deletes a deadline.
- [x] **README**: setup, mock mode, going live, webhooks, cron hosting, env vars, dev/verify commands. Notes that SQLite needs a persistent disk (not Vercel's ephemeral FS) and that `/api/cron/poll` ignores the settings interval.
- [ ] **Live AMC API: fix theatre search.** The key went active on 2026-11-13 and is exported in the shell. `npm run amc:smoke -- 10001` passes now playing (75) and coming soon (302), but search finds 0 theatres, so showtimes never get tested. Checked with curl on 2026-11-13:
  - `/v2/location-suggestions/?query=10001` → `_embedded.suggestions[]` = `{title, type: "zipcode", _links}`. There's no lat/lng field. The coordinates are only in `_links["https://api.amctheatres.com/rels/v2/locations"].href` (`.../v2/locations?latitude=40.750742&longitude=-73.99653`). `LocationSuggestionSchema` and `searchTheatres` need to read them from there (or follow that href).
  - `/v2/theatres/views/closest?...` → **404**. Use `/v2/locations?latitude=&longitude=` instead (paged, 48 near 10001). Each theatre is at `_embedded.locations[i]._embedded.theatre`, with `rank` and `distance` alongside. The theatre fields (`id`, `name`, `longName`, `slug`, `location.{addressLine1,city,state,postalCode,latitude,longitude}`) already match `TheatreSchema`.
  - `/v2/theatres/2120/showtimes/11-13-26` → 200. The current `ENDPOINTS.showtimes` is fine, and the fields match `ShowtimeSchema` (`id, movieId, movieName, theatreId, showDateTimeLocal, purchaseUrl, isSoldOut, attributes`).
  - Done when `amc:smoke` fully passes, and one live poll against a scratch `DATABASE_URL` with a starred theatre succeeds. Update the "not checked against the live API" warnings in `httpClient.ts` and the README.

## Notes for a fresh session

- Node is installed with nvm, so run `. ~/.nvm/nvm.sh` before any `npm`/`npx` command.
- `AMC_API_KEY` is exported in the shell and active (since 2026-11-13), so the app runs live by default. Run with `AMC_MODE=mock npm run dev` to force mock mode.
- With no `AMC_API_KEY`, the app runs in mock mode (`src/lib/amc/mockClient.ts`). The mock's "release step" lives in settings and is changed from /settings.
- DB: SQLite at `./data/app.db` (gitignored). Delete it to start fresh. Migrations are in `./drizzle` and run at startup.
- The scheduler runs from `src/instrumentation.ts`. `DISABLE_SCHEDULER=1` turns it off.
- Testing server actions without a browser: each `<form>` renders a hidden `$ACTION_ID_<hash>` input. POST multipart to the page with that field plus the form fields, e.g. `curl -F '$ACTION_ID_<hash>=' -F 'theatre={...}' localhost:3000/theatres`. Point `DATABASE_URL` at a scratch file so the real DB isn't touched.
- `npm run verify` (`scripts/verify-flows.mjs`) starts `next dev` on :3100 with a scratch DB and mock mode, drives the server actions like the forms do, and checks the pages (~1 min). Extend it for new flows (e.g. Deadlines) instead of writing one-off curl checks. Non-form actions are called by name via `.next/server/server-reference-manifest.json`.
- Main logic is in `src/lib/poll/runPoll.ts`, with tests in `runPoll.test.ts`.

## Design summary

- Next.js 15 App Router + server actions, Tailwind v4, Drizzle + better-sqlite3, zod, node-cron, vitest.
- Each poll fetches showtimes for every favorite theatre × each day ahead and diffs them against `showtimes_seen`. A newly added movie/theatre pair is seeded silently, so adding things doesn't flood you with alerts. Each pair with new showtimes gets one alert.
- Deadlines: `met` once any showtime exists in scope. `missed` once the date has passed, but only if that poll had no errors.
- Alerts go into the in-app feed and to the webhook (Discord embed or Slack blocks, detected from the URL). Failed deliveries are retried for 24h.
