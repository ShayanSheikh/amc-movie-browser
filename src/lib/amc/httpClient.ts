import { z } from "zod";
import type { AmcClient, MovieList } from "./client";
import {
  MovieSchema,
  ShowtimeSchema,
  TheatreSchema,
  normalizeMovie,
  normalizeShowtime,
  normalizeTheatre,
  pageSchema,
  type Movie,
  type Showtime,
  type Theatre,
} from "./types";

/**
 * Real AMC vendor API client.
 *
 * Every path below was checked against the live API on 2026-11-13 (`npm run amc:smoke`).
 * They're all in the ENDPOINTS table, so if AMC changes one, the fix is a one-line change.
 */
export const ENDPOINTS = {
  locationSuggestions: (query: string) =>
    `/v2/location-suggestions/?query=${encodeURIComponent(query)}`,
  // Theatres sorted by distance; each item wraps the theatre in `_embedded.theatre`.
  locations: (lat: number, lng: number) => `/v2/locations?latitude=${lat}&longitude=${lng}`,
  movies: (list: MovieList) => `/v2/movies/views/${list}`,
  // AMC expects dates as MM-DD-YY in this path.
  showtimes: (theatreId: number, date: string) =>
    `/v2/theatres/${theatreId}/showtimes/${toAmcDate(date)}`,
};

export function toAmcDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${m}-${d}-${y.slice(2)}`;
}

const LOCATIONS_REL = "https://api.amctheatres.com/rels/v2/locations";

// Suggestions carry no lat/lng fields; the coordinates are only in the locations link's query string.
const LocationSuggestionSchema = z.looseObject({
  title: z.string().optional(),
  type: z.string().optional(), // "zipcode", "city", "theatre", ...
  _links: z.record(z.string(), z.looseObject({ href: z.string() })).optional(),
});

const LocationSchema = z.looseObject({
  rank: z.number().optional(),
  distance: z.number().optional(),
  _embedded: z.looseObject({ theatre: TheatreSchema }),
});

export function suggestionCoords(s: z.infer<typeof LocationSuggestionSchema>): { lat: number; lng: number } | null {
  const href = s._links?.[LOCATIONS_REL]?.href;
  if (!href) return null;
  const params = new URL(href).searchParams;
  const lat = Number(params.get("latitude"));
  const lng = Number(params.get("longitude"));
  return params.has("latitude") && params.has("longitude") && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

/** A city name matches one suggestion per theatre, all in different places, so search near a few of them. */
const MAX_SUGGESTIONS = 3;
const THEATRES_PER_SUGGESTION = 20;

interface Options {
  apiKey: string;
  baseUrl?: string;
  /** Minimum ms between requests. AMC's rate limit is not documented, so stay polite. */
  minIntervalMs?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}

export class AmcHttpError extends Error {
  constructor(
    public status: number,
    public path: string,
    body: string,
  ) {
    super(`AMC API ${status} on ${path}: ${body.slice(0, 200)}`);
  }
}

export class HttpAmcClient implements AmcClient {
  readonly mode = "live" as const;
  private baseUrl: string;
  private lastRequestAt = 0;
  private cache = new Map<string, { at: number; value: unknown }>();
  private minIntervalMs: number;
  private pageSize: number;
  private fetchImpl: typeof fetch;

  constructor(private opts: Options) {
    this.baseUrl = opts.baseUrl ?? "https://api.amctheatres.com";
    this.minIntervalMs = opts.minIntervalMs ?? 250;
    this.pageSize = opts.pageSize ?? 100;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async searchTheatres(query: string): Promise<Theatre[]> {
    return this.cached(`theatres:${query}`, 60 * 60_000, async () => {
      const suggestions = await this.getAllPages(
        ENDPOINTS.locationSuggestions(query),
        "suggestions",
        LocationSuggestionSchema,
      );
      const coords = new Map<string, { lat: number; lng: number }>();
      for (const s of suggestions) {
        const c = suggestionCoords(s);
        if (c) coords.set(`${c.lat},${c.lng}`, c);
        if (coords.size >= MAX_SUGGESTIONS) break;
      }
      const byId = new Map<number, Theatre>();
      for (const { lat, lng } of coords.values()) {
        const locations = await this.getAllPages(
          ENDPOINTS.locations(lat, lng),
          "locations",
          LocationSchema,
          1, // already sorted by distance, so the first page is enough
          THEATRES_PER_SUGGESTION,
        );
        for (const l of locations) {
          const t = normalizeTheatre(l._embedded.theatre);
          if (!byId.has(t.id)) byId.set(t.id, t);
        }
      }
      return [...byId.values()];
    });
  }

  async listMovies(list: MovieList): Promise<Movie[]> {
    return this.cached(`movies:${list}`, 30 * 60_000, async () => {
      const movies = await this.getAllPages(ENDPOINTS.movies(list), "movies", MovieSchema);
      return movies.map(normalizeMovie);
    });
  }

  async getShowtimes(theatreId: number, date: string): Promise<Showtime[]> {
    // Not cached: the poller needs fresh data.
    const showtimes = await this.getAllPages(
      ENDPOINTS.showtimes(theatreId, date),
      "showtimes",
      ShowtimeSchema,
    );
    return showtimes.map(normalizeShowtime);
  }

  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async getAllPages<T extends z.ZodTypeAny>(
    path: string,
    key: string,
    item: T,
    maxPages = 20,
    pageSize = this.pageSize,
  ): Promise<z.infer<T>[]> {
    const schema = pageSchema(key, item);
    const out: z.infer<T>[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const json = await this.request(`${path}${sep}page-number=${page}&page-size=${pageSize}`);
      const parsed = schema.parse(json);
      const items = (parsed._embedded?.[key] ?? []) as z.infer<T>[];
      out.push(...items);
      const total = parsed.count ?? items.length;
      if (items.length === 0 || out.length >= total || items.length < pageSize) break;
    }
    return out;
  }

  private async request(path: string, attempt = 0): Promise<unknown> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();

    const res = await this.fetchImpl(this.baseUrl + path, {
      headers: { "X-AMC-Vendor-Key": this.opts.apiKey, Accept: "application/json" },
      cache: "no-store",
    });

    // 404 on showtimes usually just means nothing is scheduled that day.
    if (res.status === 404) return { _embedded: {} };
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      return this.request(path, attempt + 1);
    }
    if (!res.ok) throw new AmcHttpError(res.status, path, await res.text());
    return res.json();
  }
}
