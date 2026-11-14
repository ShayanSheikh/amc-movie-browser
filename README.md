# AMC Movie Browser

A small self-hosted app that watches AMC showtimes for you. Star the theatres you go to, add movies to a watchlist, and it polls AMC on a schedule. When tickets go on sale for a movie you're watching, it alerts you in the app and through a Discord or Slack webhook. It can also track **programming deadlines** ("will Paper Comets be at one of my theatres by the 20th?") and tells you when a deadline is met or has passed.

Built with Next.js 15 (App Router + server actions), Tailwind v4, Drizzle + SQLite (better-sqlite3), zod and node-cron.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # optional: every setting has a default
npm run dev                  # http://localhost:3000
```

The SQLite database is created at `./data/app.db` on first start, and migrations in `./drizzle` run automatically. To start fresh, stop the server and delete `./data/app.db`.

Pages:

- **/** shows the dashboard: your watchlist with per-movie showtime status, deadlines and the alert feed.
- **/theatres**: search by zip or city, then star theatres. Only starred theatres get polled.
- **/movies**: Now playing and Coming soon. Add movies to your watchlist (with notes) and add deadlines.
- **/settings**: webhook URL, poll interval, how many days ahead to check, "Check now", and mock controls.

## Mock mode

With no `AMC_API_KEY` set, the app uses built-in fixture data (`src/lib/amc/mockClient.ts`), so you can try everything offline. Theatre searches that work: `62701`, `Springfield`, `Chicago`.

To simulate new showtimes appearing, go to /settings → Mock data controls, click **Advance →**, then **Check now**. At step 1, Glass Meridian goes on sale. Paper Comets only ever plays at AMC Harborview 8, which makes it handy for testing deadlines. The first poll after you add a theatre or movie fills the baseline silently, so you won't get alerts for showtimes that already existed.

If `AMC_API_KEY` is exported in your shell but you want mock data anyway, set `AMC_MODE=mock`.

## Going live

1. Get an AMC vendor API key and set `AMC_API_KEY` in `.env.local`.
2. Run the smoke test before relying on it:

   ```bash
   AMC_API_KEY=... npm run amc:smoke -- 10001   # any zip or city
   ```

   It calls each endpoint once and validates the responses. All of them were checked against the live API on 2026-11-13. If a step fails later (AMC changed something), fix the path in `ENDPOINTS` (`src/lib/amc/httpClient.ts`) or the zod schema in `src/lib/amc/types.ts`.

Mind the request budget: each poll makes one request per starred theatre per day ahead (3 theatres × 14 days = 42 requests). The client backs off when AMC returns `429`.

## Webhooks

Paste a webhook URL on /settings and use **Send test** to check it. The format is picked from the URL:

| URL | Format |
| --- | --- |
| `https://discord.com/api/webhooks/...` | Discord embed, colour-coded by alert type |
| `https://hooks.slack.com/...` | Slack header + section blocks |
| anything else | generic JSON: `{ kind, title, text, lines, url?, movieId?, theatreId? }` |

Alert types: `new_showtimes`, `deadline_met`, `deadline_missed`, `test`. Every alert also stays in the in-app feed. If a delivery fails, it's retried on each poll for 24 hours, then dropped (it stays in the feed).

## Scheduling polls

There are two ways to run polls. Pick one.

**Built-in scheduler (default).** It suits a home server, a VPS, or `npm run dev` on your laptop. The scheduler starts with the server (`src/instrumentation.ts`), ticks every minute, and polls once the interval set on /settings has passed (default 30 minutes). Changing the interval doesn't need a restart. In production:

```bash
npm run build
npm start          # keep it running with systemd, pm2, Docker, etc.
```

**External cron.** Use this for hosts where the process doesn't stay running. Set `DISABLE_SCHEDULER=1` and a `CRON_SECRET`, then have something call the poll endpoint:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/poll
```

It accepts GET or POST and returns the poll summary as JSON (`401` without the right secret). Vercel Cron sends the `Authorization: Bearer $CRON_SECRET` header for you. The endpoint polls every time it's called and ignores the interval on /settings, so your cron schedule sets the interval.

The database is a SQLite file, so the host needs a **persistent disk**. On serverless platforms with ephemeral filesystems (e.g. Vercel) the data won't survive between invocations. Point `DATABASE_URL` at a mounted volume or use a host with a disk.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AMC_API_KEY` | none | AMC vendor key. Leave unset for mock mode. |
| `AMC_MODE` | `live` if a key is set, else `mock` | Force `mock` or `live`. |
| `DATABASE_URL` | `./data/app.db` | SQLite file path. |
| `CRON_SECRET` | none | Required for `/api/cron/poll`. Without it the endpoint always returns 401. |
| `DISABLE_SCHEDULER` | unset | `1` turns off the built-in scheduler. |

## Development

```bash
npm test          # vitest: poll diffing, deadlines, webhook formatting
npm run lint
npm run verify    # end-to-end: starts next dev on :3100 with a scratch DB in mock mode
                  # and drives theatres, watchlist, alerts and deadlines (~1 min)
WEBHOOK_URL=https://discord.com/api/webhooks/... npm run verify   # also send to a real webhook
```

The core logic is `src/lib/poll/runPoll.ts`. Each poll fetches showtimes for every starred theatre × day ahead, diffs them against the `showtimes_seen` table, and creates one alert per movie/theatre pair with new showtimes. A deadline is `met` once any showtime exists in its scope. It is `missed` once its date has passed, but only if that poll had no errors.
