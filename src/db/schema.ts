import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const theatres = sqliteTable("theatres", {
  id: integer("id").primaryKey(), // AMC theatre id
  name: text("name").notNull(),
  slug: text("slug"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
});

export const movies = sqliteTable("movies", {
  id: integer("id").primaryKey(), // AMC movie id
  name: text("name").notNull(),
  slug: text("slug"),
  releaseDate: text("release_date"),
  posterUrl: text("poster_url"),
  runTime: integer("run_time"),
  rating: text("rating"),
});

export const watchlist = sqliteTable("watchlist", {
  movieId: integer("movie_id")
    .primaryKey()
    .references(() => movies.id, { onDelete: "cascade" }),
  notes: text("notes"),
  addedAt: createdAt(),
});

/**
 * Records which (movie, theatre) pairs have been polled at least once. The first poll of
 * a pair seeds showtimes_seen without alerting, so newly added items don't spam alerts.
 */
export const pollCoverage = sqliteTable(
  "poll_coverage",
  {
    movieId: integer("movie_id").notNull(),
    theatreId: integer("theatre_id").notNull(),
    firstPolledAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.movieId, t.theatreId] })],
);

export const showtimesSeen = sqliteTable(
  "showtimes_seen",
  {
    id: integer("id").primaryKey(), // AMC showtime id
    movieId: integer("movie_id").notNull(),
    theatreId: integer("theatre_id").notNull(),
    startsAt: text("starts_at").notNull(), // local wall-clock ISO
    format: text("format"),
    isSoldOut: integer("is_sold_out", { mode: "boolean" }).notNull().default(false),
    purchaseUrl: text("purchase_url"),
    firstSeenAt: createdAt(),
    /** Last poll that returned this showtime. Rows that stop appearing are treated as removed. */
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (t) => [index("showtimes_movie_theatre_idx").on(t.movieId, t.theatreId, t.startsAt)],
);

export type DeadlineStatus = "pending" | "met" | "missed";

export const deadlines = sqliteTable("deadlines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  movieId: integer("movie_id")
    .notNull()
    .references(() => movies.id, { onDelete: "cascade" }),
  /** Null means "any favorite theatre". */
  theatreId: integer("theatre_id").references(() => theatres.id, { onDelete: "cascade" }),
  deadlineDate: text("deadline_date").notNull(), // YYYY-MM-DD
  status: text("status").$type<DeadlineStatus>().notNull().default("pending"),
  resolvedAt: text("resolved_at"),
  createdAt: createdAt(),
});

export type AlertKind = "new_showtimes" | "deadline_met" | "deadline_missed" | "test";

export interface AlertPayload {
  title: string;
  lines: string[];
  url?: string;
  movieId?: number;
  theatreId?: number;
}

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").$type<AlertKind>().notNull(),
  payload: text("payload", { mode: "json" }).$type<AlertPayload>().notNull(),
  createdAt: createdAt(),
  deliveredAt: text("delivered_at"),
  deliveryError: text("delivery_error"),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(), // always 1
  webhookUrl: text("webhook_url"),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(30),
  daysAhead: integer("days_ahead").notNull().default(14),
  mockStep: integer("mock_step").notNull().default(0),
  lastPollAt: text("last_poll_at"),
  lastPollError: text("last_poll_error"),
  lastPollSummary: text("last_poll_summary"),
});

export type Settings = typeof settings.$inferSelect;
