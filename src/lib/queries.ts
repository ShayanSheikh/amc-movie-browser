import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { toLocalIso } from "./dates";

const { theatres, movies, watchlist, showtimesSeen, deadlines, alerts } = schema;

export function favoriteTheatres() {
  return getDb().select().from(theatres).where(eq(theatres.isFavorite, true)).orderBy(asc(theatres.name)).all();
}

export function watchedMovies() {
  return getDb()
    .select({ movie: movies, notes: watchlist.notes, addedAt: watchlist.addedAt })
    .from(watchlist)
    .innerJoin(movies, eq(movies.id, watchlist.movieId))
    .orderBy(asc(movies.releaseDate), asc(movies.name))
    .all();
}

export function upcomingShowtimes(movieIds: number[], theatreIds: number[]) {
  if (!movieIds.length || !theatreIds.length) return [];
  return getDb()
    .select()
    .from(showtimesSeen)
    .where(
      and(
        inArray(showtimesSeen.movieId, movieIds),
        inArray(showtimesSeen.theatreId, theatreIds),
        gte(showtimesSeen.startsAt, toLocalIso(new Date())),
      ),
    )
    .orderBy(asc(showtimesSeen.startsAt))
    .all();
}

export function allDeadlines() {
  return getDb()
    .select({ deadline: deadlines, theatreName: theatres.name })
    .from(deadlines)
    .leftJoin(theatres, eq(theatres.id, deadlines.theatreId))
    .orderBy(asc(deadlines.deadlineDate))
    .all();
}

export function recentAlerts(limit = 25) {
  return getDb().select().from(alerts).orderBy(desc(alerts.id)).limit(limit).all();
}
