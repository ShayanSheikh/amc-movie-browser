import { and, eq, gte, inArray, isNull, like, lt, ne, sql } from "drizzle-orm";
import type { Db } from "../../db";
import { getSettings } from "../../db";
import {
  alerts,
  deadlines,
  movies,
  pollCoverage,
  settings,
  showtimesSeen,
  theatres,
  watchlist,
  type AlertKind,
  type AlertPayload,
} from "../../db/schema";
import type { AmcClient } from "../amc/client";
import type { Showtime } from "../amc/types";
import { dateRange, formatDay, formatTime, toLocalDate, toLocalIso } from "../dates";
import { sendWebhook } from "../notify/webhook";

export interface PollDeps {
  db: Db;
  client: AmcClient;
  now?: Date;
  send?: (url: string, kind: AlertKind, payload: AlertPayload) => Promise<void>;
}

export interface PollSummary {
  theatres: number;
  movies: number;
  requests: number;
  newShowtimes: number;
  alertsCreated: number;
  alertsDelivered: number;
  errors: string[];
}

const MAX_LINES = 15;
/** Retry failed webhook deliveries for this long, then give up (they stay in the in-app feed). */
const DELIVERY_RETRY_MS = 24 * 60 * 60_000;

export async function runPoll({ db, client, now = new Date(), send = sendWebhook }: PollDeps): Promise<PollSummary> {
  const today = toLocalDate(now);
  const nowLocal = toLocalIso(now);
  const stamp = now.toISOString();
  const cfg = getSettings(db);
  const summary: PollSummary = {
    theatres: 0,
    movies: 0,
    requests: 0,
    newShowtimes: 0,
    alertsCreated: 0,
    alertsDelivered: 0,
    errors: [],
  };

  // 1. What to poll: watched movies plus pending deadlines, at favorite theatres plus deadline theatres.
  const pending = db.select().from(deadlines).where(eq(deadlines.status, "pending")).all();
  const favoriteIds = db
    .select({ id: theatres.id })
    .from(theatres)
    .where(eq(theatres.isFavorite, true))
    .all()
    .map((t) => t.id);
  const theatreIds = unique([...favoriteIds, ...pending.flatMap((d) => (d.theatreId ? [d.theatreId] : []))]);
  const movieIds = unique([
    ...db.select({ id: watchlist.movieId }).from(watchlist).all().map((w) => w.id),
    ...pending.map((d) => d.movieId),
  ]);
  summary.theatres = theatreIds.length;
  summary.movies = movieIds.length;

  const movieById = new Map(
    (movieIds.length ? db.select().from(movies).where(inArray(movies.id, movieIds)).all() : []).map((m) => [m.id, m]),
  );
  const theatreById = new Map(
    (theatreIds.length ? db.select().from(theatres).where(inArray(theatres.id, theatreIds)).all() : []).map((t) => [t.id, t]),
  );

  // 2. Fetch, one request per theatre per date.
  const dates = dateRange(today, cfg.daysAhead);
  const fetched = new Map<number, { okDates: string[]; shows: Showtime[]; complete: boolean }>();
  if (movieIds.length) {
    const watched = new Set(movieIds);
    for (const theatreId of theatreIds) {
      const entry = { okDates: [] as string[], shows: [] as Showtime[], complete: true };
      for (const date of dates) {
        summary.requests++;
        try {
          const shows = await client.getShowtimes(theatreId, date);
          entry.shows.push(...shows.filter((s) => watched.has(s.movieId)));
          entry.okDates.push(date);
        } catch (err) {
          entry.complete = false;
          summary.errors.push(`theatre ${theatreId} ${date}: ${(err as Error).message}`);
        }
      }
      fetched.set(theatreId, entry);
    }
  }

  // 3. Diff against the snapshot and write new showtimes.
  const newAlerts: { kind: AlertKind; payload: AlertPayload }[] = [];
  db.transaction((tx) => {
    for (const [theatreId, { okDates, shows, complete }] of fetched) {
      for (const movieId of movieIds) {
        const pairShows = shows.filter((s) => s.movieId === movieId);
        const covered = tx
          .select()
          .from(pollCoverage)
          .where(and(eq(pollCoverage.movieId, movieId), eq(pollCoverage.theatreId, theatreId)))
          .get();
        const existingIds = new Set(
          pairShows.length
            ? tx
                .select({ id: showtimesSeen.id })
                .from(showtimesSeen)
                .where(inArray(showtimesSeen.id, pairShows.map((s) => s.id)))
                .all()
                .map((r) => r.id)
            : [],
        );
        const priorCount = covered
          ? tx
              .select({ n: sql<number>`count(*)` })
              .from(showtimesSeen)
              .where(and(eq(showtimesSeen.movieId, movieId), eq(showtimesSeen.theatreId, theatreId)))
              .get()!.n
          : 0;

        const fresh = pairShows.filter((s) => !existingIds.has(s.id));
        for (const s of pairShows) {
          tx.insert(showtimesSeen)
            .values({
              id: s.id,
              movieId: s.movieId,
              theatreId: s.theatreId,
              startsAt: s.startsAt,
              format: s.format,
              isSoldOut: s.isSoldOut,
              purchaseUrl: s.purchaseUrl,
              firstSeenAt: stamp,
              lastSeenAt: stamp,
            })
            .onConflictDoUpdate({
              target: showtimesSeen.id,
              set: { lastSeenAt: stamp, isSoldOut: s.isSoldOut, startsAt: s.startsAt, format: s.format },
            })
            .run();
        }

        if (covered && fresh.length) {
          summary.newShowtimes += fresh.length;
          newAlerts.push({
            kind: "new_showtimes",
            payload: showtimeAlert(
              movieById.get(movieId)?.name ?? `Movie ${movieId}`,
              theatreById.get(theatreId)?.name ?? `Theatre ${theatreId}`,
              fresh,
              priorCount === 0,
              movieById.get(movieId)?.slug ?? null,
              movieId,
              theatreId,
            ),
          });
        } else if (!covered && complete) {
          // First full poll of this pair: seed it silently.
          tx.insert(pollCoverage).values({ movieId, theatreId, firstPolledAt: stamp }).onConflictDoNothing().run();
        }
      }

      // Drop future showtimes that no longer appear on dates we fetched successfully (cancelled or moved).
      for (const date of okDates) {
        tx.delete(showtimesSeen)
          .where(
            and(
              eq(showtimesSeen.theatreId, theatreId),
              like(showtimesSeen.startsAt, `${date}%`),
              gte(showtimesSeen.startsAt, nowLocal),
              ne(showtimesSeen.lastSeenAt, stamp),
              movieIds.length ? inArray(showtimesSeen.movieId, movieIds) : sql`1`,
            ),
          )
          .run();
      }
    }

    // 4. Deadlines. Skip "missed" checks if anything failed, so an API outage doesn't cause false alarms.
    for (const d of pending) {
      const scope = d.theatreId ? [d.theatreId] : favoriteIds;
      const movieName = movieById.get(d.movieId)?.name ?? `Movie ${d.movieId}`;
      const where = scope.length
        ? and(eq(showtimesSeen.movieId, d.movieId), inArray(showtimesSeen.theatreId, scope))
        : sql`0`;
      const found = tx.select().from(showtimesSeen).where(where).orderBy(showtimesSeen.startsAt).all();
      const scopeLabel = d.theatreId ? (theatreById.get(d.theatreId)?.name ?? `theatre ${d.theatreId}`) : "your favorite theatres";

      if (found.length) {
        const at = unique(found.map((f) => theatreById.get(f.theatreId)?.name ?? `Theatre ${f.theatreId}`));
        tx.update(deadlines).set({ status: "met", resolvedAt: stamp }).where(eq(deadlines.id, d.id)).run();
        newAlerts.push({
          kind: "deadline_met",
          payload: {
            title: `${movieName} is programmed at ${scopeLabel}`,
            lines: [
              `Showtimes found before your ${formatDay(d.deadlineDate)} deadline.`,
              `Playing at: ${at.join(", ")}`,
              `Earliest: ${formatDay(found[0].startsAt.slice(0, 10))} ${formatTime(found[0].startsAt)}`,
            ],
            movieId: d.movieId,
            theatreId: d.theatreId ?? undefined,
          },
        });
      } else if (today > d.deadlineDate && summary.errors.length === 0 && scope.length) {
        tx.update(deadlines).set({ status: "missed", resolvedAt: stamp }).where(eq(deadlines.id, d.id)).run();
        newAlerts.push({
          kind: "deadline_missed",
          payload: {
            title: `${movieName}: still no showtimes at ${scopeLabel}`,
            lines: [
              `Your deadline of ${formatDay(d.deadlineDate)} has passed and no showtimes have appeared.`,
              `It's likely not being programmed there. Consider another theatre.`,
            ],
            movieId: d.movieId,
            theatreId: d.theatreId ?? undefined,
          },
        });
      }
    }

    for (const a of newAlerts) {
      tx.insert(alerts).values({ kind: a.kind, payload: a.payload, createdAt: stamp }).run();
    }
    summary.alertsCreated = newAlerts.length;
  });

  // 5. Delivery. Includes earlier undelivered alerts still inside the retry window.
  if (cfg.webhookUrl) {
    const cutoff = new Date(now.getTime() - DELIVERY_RETRY_MS).toISOString();
    const queue = db
      .select()
      .from(alerts)
      .where(and(isNull(alerts.deliveredAt), gte(alerts.createdAt, cutoff)))
      .orderBy(alerts.id)
      .all();
    for (const a of queue) {
      try {
        await send(cfg.webhookUrl, a.kind, a.payload);
        db.update(alerts).set({ deliveredAt: new Date().toISOString(), deliveryError: null }).where(eq(alerts.id, a.id)).run();
        summary.alertsDelivered++;
      } catch (err) {
        db.update(alerts).set({ deliveryError: (err as Error).message }).where(eq(alerts.id, a.id)).run();
        summary.errors.push(`webhook: ${(err as Error).message}`);
      }
    }
  }

  // Housekeeping: forget showtimes more than a day in the past.
  const yesterday = toLocalIso(new Date(now.getTime() - 86_400_000));
  db.delete(showtimesSeen).where(lt(showtimesSeen.startsAt, yesterday)).run();

  db.update(settings)
    .set({
      lastPollAt: stamp,
      lastPollError: summary.errors.length ? summary.errors.slice(0, 5).join("\n") : null,
      lastPollSummary: JSON.stringify(summary),
    })
    .where(eq(settings.id, 1))
    .run();

  return summary;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function showtimeAlert(
  movie: string,
  theatre: string,
  shows: Showtime[],
  firstEver: boolean,
  slug: string | null,
  movieId: number,
  theatreId: number,
): AlertPayload {
  const byDate = new Map<string, Showtime[]>();
  for (const s of [...shows].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const d = s.startsAt.slice(0, 10);
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  const lines = [...byDate].map(
    ([d, list]) =>
      `**${formatDay(d)}**: ${list.map((s) => formatTime(s.startsAt) + (s.format ? ` (${s.format})` : "")).join(", ")}`,
  );
  const extra = lines.length - MAX_LINES;
  return {
    title: firstEver ? `Tickets are up: ${movie} @ ${theatre}` : `${shows.length} new showtime${shows.length === 1 ? "" : "s"}: ${movie} @ ${theatre}`,
    lines: extra > 0 ? [...lines.slice(0, MAX_LINES), `…and ${extra} more day${extra === 1 ? "" : "s"}`] : lines,
    url: shows.find((s) => s.purchaseUrl)?.purchaseUrl ?? (slug ? `https://www.amctheatres.com/movies/${slug}` : undefined),
    movieId,
    theatreId,
  };
}

// Shared by the scheduler and the API route so two polls never overlap.
let inFlight: Promise<PollSummary> | null = null;
export function runPollExclusive(deps: PollDeps): Promise<PollSummary> {
  if (!inFlight) inFlight = runPoll(deps).finally(() => (inFlight = null));
  return inFlight;
}
