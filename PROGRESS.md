# Progress

We work through this one item at a time: verify it, commit, tick it off, then clear context.
The original design is summarized at the bottom.

## Checklist

- [x] **Build check**: `tsc`, `eslint`, 12/12 vitest, `next build` all clean; prod server serves every page, `/api/cron/poll` returns 401 without the secret.
- [x] **Favorite theatres**: `npm run dev`, search on /theatres (mock: `62701`, `Springfield`, `Chicago`), star/unstar, favorites list updates. Verified against a dev server: `62701` returns Riverside/Downtown/Northgate (mock zip search matches the first 3 digits), `Springfield` returns 2, `Chicago` returns 1, a nonsense query shows the empty state, star/unstar toggles the button and the "Your theatres" list.
- [ ] **Watchlist**: /movies, Watch/unwatch from Now playing + Coming soon, save notes, dashboard shows the movie.
- [ ] **New-showtime alerts**: Check now (first poll seeds silently, no alerts), Settings → Advance mock step → Check now → "Tickets are up: Glass Meridian" alert in-app. Then paste a real Discord/Slack webhook, Send test, confirm delivery.
- [ ] **Programming deadlines**: add a deadline for Paper Comets (only plays at AMC Harborview 8). Check it goes Programmed when that theatre is a favorite, and "Likely not programmed" after the date passes without it.
- [ ] **README**: setup, mock mode, going live, webhooks, cron hosting.
- [ ] **Live AMC API** (blocked until the key is active): `AMC_API_KEY=... npm run amc:smoke -- <zip>`, fix `ENDPOINTS` in `src/lib/amc/httpClient.ts` and the zod schemas in `src/lib/amc/types.ts`.

## Notes for a fresh session

- Node is installed with nvm, so run `. ~/.nvm/nvm.sh` before any `npm`/`npx` command.
- If `AMC_API_KEY` is exported in your shell, the app goes live and gets a 403 until the key is active. Run with `AMC_MODE=mock npm run dev` to force mock mode.
- With no `AMC_API_KEY`, the app runs in mock mode (`src/lib/amc/mockClient.ts`). The mock's "release step" lives in settings and is changed from /settings.
- DB: SQLite at `./data/app.db` (gitignored). Delete it to start fresh. Migrations are in `./drizzle` and run at startup.
- The scheduler runs from `src/instrumentation.ts`. `DISABLE_SCHEDULER=1` turns it off.
- Testing server actions without a browser: each `<form>` renders a hidden `$ACTION_ID_<hash>` input. POST multipart to the page with that field plus the form fields, e.g. `curl -F '$ACTION_ID_<hash>=' -F 'theatre={...}' localhost:3000/theatres`. Point `DATABASE_URL` at a scratch file so the real DB isn't touched.
- Main logic is in `src/lib/poll/runPoll.ts`, with tests in `runPoll.test.ts`.

## Design summary

- Next.js 15 App Router + server actions, Tailwind v4, Drizzle + better-sqlite3, zod, node-cron, vitest.
- Each poll fetches showtimes for every favorite theatre × each day ahead and diffs them against `showtimes_seen`. A newly added movie/theatre pair is seeded silently, so adding things doesn't flood you with alerts. Each pair with new showtimes gets one alert.
- Deadlines: `met` once any showtime exists in scope. `missed` once the date has passed, but only if that poll had no errors.
- Alerts go into the in-app feed and to the webhook (Discord embed or Slack blocks, detected from the URL). Failed deliveries are retried for 24h.
