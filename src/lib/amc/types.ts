import { z } from "zod";

/**
 * Schemas for the AMC vendor API (https://api.amctheatres.com, v2).
 * Field names are written from memory of the public docs. Every field except
 * ids is optional or loose so a slight mismatch doesn't break the app.
 * Run `npm run amc:smoke` once your key is live to check them against real responses.
 */

export const TheatreSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  longName: z.string().optional(),
  slug: z.string().optional(),
  location: z
    .looseObject({
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
});
export type AmcTheatre = z.infer<typeof TheatreSchema>;

export const MovieSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  slug: z.string().optional(),
  releaseDateUtc: z.string().nullish(),
  runTime: z.number().nullish(),
  mpaaRating: z.string().nullish(),
  media: z
    .looseObject({
      posterDynamic: z.string().nullish(),
      posterStandard: z.string().nullish(),
      posterLarge: z.string().nullish(),
    })
    .optional(),
});
export type AmcMovie = z.infer<typeof MovieSchema>;

export const ShowtimeSchema = z.looseObject({
  id: z.number(),
  movieId: z.number(),
  movieName: z.string().optional(),
  theatreId: z.number(),
  /** Local wall-clock time at the theatre, e.g. "2026-11-12T19:30:00" */
  showDateTimeLocal: z.string(),
  showDateTimeUtc: z.string().optional(),
  isSoldOut: z.boolean().optional(),
  purchaseUrl: z.string().optional(),
  attributes: z
    .array(z.looseObject({ code: z.string().optional(), name: z.string().optional() }))
    .optional(),
});
export type AmcShowtime = z.infer<typeof ShowtimeSchema>;

/** AMC list endpoints return HAL-style pages. */
export function pageSchema<T extends z.ZodTypeAny>(key: string, item: T) {
  return z.looseObject({
    pageSize: z.number().optional(),
    pageNumber: z.number().optional(),
    count: z.number().optional(),
    _embedded: z.looseObject({ [key]: z.array(item).optional() }).optional(),
  });
}

/** Normalized shapes the rest of the app uses. */
export interface Theatre {
  id: number;
  name: string;
  slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export interface Movie {
  id: number;
  name: string;
  slug: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  runTime: number | null;
  rating: string | null;
}

export interface Showtime {
  id: number;
  movieId: number;
  movieName: string | null;
  theatreId: number;
  startsAt: string; // local ISO without offset
  format: string | null;
  isSoldOut: boolean;
  purchaseUrl: string | null;
}

/** Attribute codes that mark a premium format, in display priority order. */
const FORMAT_HINTS = ["IMAX", "DOLBY", "PRIME", "70MM", "LASER", "3D", "REALD", "SCREENX", "4DX"];

export function normalizeTheatre(t: AmcTheatre): Theatre {
  return {
    id: t.id,
    name: t.longName || t.name,
    slug: t.slug ?? null,
    address: t.location?.addressLine1 ?? null,
    city: t.location?.city ?? null,
    state: t.location?.state ?? null,
    postalCode: t.location?.postalCode ?? null,
  };
}

export function normalizeMovie(m: AmcMovie): Movie {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug ?? null,
    releaseDate: m.releaseDateUtc ? m.releaseDateUtc.slice(0, 10) : null,
    posterUrl: m.media?.posterDynamic || m.media?.posterStandard || m.media?.posterLarge || null,
    runTime: m.runTime ?? null,
    rating: m.mpaaRating ?? null,
  };
}

export function normalizeShowtime(s: AmcShowtime): Showtime {
  const names = (s.attributes ?? [])
    .map((a) => (a.code || a.name || "").toUpperCase())
    .filter(Boolean);
  const format = FORMAT_HINTS.find((hint) => names.some((n) => n.includes(hint))) ?? null;
  return {
    id: s.id,
    movieId: s.movieId,
    movieName: s.movieName ?? null,
    theatreId: s.theatreId,
    startsAt: s.showDateTimeLocal.slice(0, 19),
    format,
    isSoldOut: s.isSoldOut ?? false,
    purchaseUrl: s.purchaseUrl ?? null,
  };
}
