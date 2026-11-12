import type { AmcClient, MovieList } from "./client";
import type { Movie, Showtime, Theatre } from "./types";
import { addDays, toLocalDate } from "../dates";

/**
 * Fake AMC data so the whole app runs without an API key.
 *
 * "Release step" simulates AMC adding showtimes over time:
 *  - step 0: showtimes posted 3 days out
 *  - each step posts 4 more days
 *  - "Glass Meridian" (coming soon) gets showtimes only from step 1 on
 *  - "Paper Comets" (coming soon) is only ever programmed at AMC Harborview 8,
 *    which is the case for testing deadline-missed alerts
 * Movie release dates are relative to today, so the fixtures never go stale.
 */

export const MOCK_THEATRES: Theatre[] = [
  { id: 9001, name: "AMC Riverside 16", slug: "amc-riverside-16", address: "100 River Rd", city: "Springfield", state: "IL", postalCode: "62701" },
  { id: 9002, name: "AMC Downtown 20", slug: "amc-downtown-20", address: "1 Main St", city: "Springfield", state: "IL", postalCode: "62702" },
  { id: 9003, name: "AMC Harborview 8", slug: "amc-harborview-8", address: "55 Dock St", city: "Shelbyville", state: "IL", postalCode: "62565" },
  { id: 9004, name: "AMC Northgate 12", slug: "amc-northgate-12", address: "900 North Ave", city: "Capital City", state: "IL", postalCode: "62703" },
  { id: 9005, name: "AMC Lakeshore 24", slug: "amc-lakeshore-24", address: "24 Lake Blvd", city: "Chicago", state: "IL", postalCode: "60601" },
];

interface MockMovie {
  id: number;
  name: string;
  releaseOffsetDays: number;
  list: MovieList;
  rating: string;
  runTime: number;
  /** Theatres showing it. Undefined means all of them. */
  theatres?: number[];
  /** Release step at which showtimes first appear. */
  fromStep?: number;
  formats: (string | null)[];
}

const MOCK_MOVIES: MockMovie[] = [
  { id: 71001, name: "Starfall", releaseOffsetDays: -14, list: "now-playing", rating: "PG-13", runTime: 142, formats: ["IMAX", null, "DOLBY", null] },
  { id: 71002, name: "The Quiet Harbor", releaseOffsetDays: -7, list: "now-playing", rating: "R", runTime: 118, formats: [null, null, null] },
  { id: 71003, name: "Neon Orchard", releaseOffsetDays: -3, list: "now-playing", rating: "PG", runTime: 101, theatres: [9001, 9002, 9004, 9005], formats: [null, "3D", null] },
  { id: 71004, name: "Midnight Cartographers", releaseOffsetDays: -21, list: "now-playing", rating: "PG-13", runTime: 127, theatres: [9002, 9005], formats: ["LASER", null] },
  { id: 72001, name: "Glass Meridian", releaseOffsetDays: 7, list: "coming-soon", rating: "PG-13", runTime: 155, fromStep: 1, formats: ["IMAX", "70MM", null, "DOLBY"] },
  { id: 72002, name: "Paper Comets", releaseOffsetDays: 5, list: "coming-soon", rating: "R", runTime: 109, theatres: [9003], formats: [null, null] },
  { id: 72003, name: "The Long Thaw", releaseOffsetDays: 40, list: "coming-soon", rating: "PG", runTime: 96, formats: [null] },
];

const SLOTS = ["11:00", "14:15", "17:30", "20:45"];

function epochDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export class MockAmcClient implements AmcClient {
  readonly mode = "mock" as const;

  constructor(
    private getStep: () => number | Promise<number>,
    private now: () => Date = () => new Date(),
  ) {}

  async searchTheatres(query: string): Promise<Theatre[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches = MOCK_THEATRES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.city?.toLowerCase().includes(q) ||
        t.postalCode?.startsWith(q.slice(0, 3)),
    );
    return matches;
  }

  async listMovies(list: MovieList): Promise<Movie[]> {
    const today = toLocalDate(this.now());
    return MOCK_MOVIES.filter((m) => m.list === list).map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.name.toLowerCase().replace(/\s+/g, "-"),
      releaseDate: addDays(today, m.releaseOffsetDays),
      posterUrl: null,
      runTime: m.runTime,
      rating: m.rating,
    }));
  }

  async getShowtimes(theatreId: number, date: string): Promise<Showtime[]> {
    const step = await this.getStep();
    const today = toLocalDate(this.now());
    const horizon = addDays(today, 3 + 4 * step);
    if (date < today || date > horizon) return [];

    const theatreIdx = MOCK_THEATRES.findIndex((t) => t.id === theatreId);
    if (theatreIdx < 0) return [];

    const out: Showtime[] = [];
    MOCK_MOVIES.forEach((m, movieIdx) => {
      if (m.theatres && !m.theatres.includes(theatreId)) return;
      if ((m.fromStep ?? 0) > step) return;
      if (date < addDays(today, m.releaseOffsetDays)) return;

      // Theatres run a varying number of shows per movie, so rows differ.
      const count = 2 + ((theatreIdx + movieIdx) % 3);
      for (let slot = 0; slot < count; slot++) {
        const time = SLOTS[(slot + movieIdx) % SLOTS.length];
        out.push({
          id: (theatreIdx * 100 + movieIdx + 1) * 1_000_000 + epochDay(date) * 10 + slot,
          movieId: m.id,
          movieName: m.name,
          theatreId,
          startsAt: `${date}T${time}:00`,
          format: m.formats[slot % m.formats.length],
          isSoldOut: false,
          purchaseUrl: null,
        });
      }
    });
    return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
}
