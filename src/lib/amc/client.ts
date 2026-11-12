import type { Movie, Showtime, Theatre } from "./types";

export type MovieList = "now-playing" | "coming-soon";

export interface AmcClient {
  readonly mode: "mock" | "live";
  /** Search by zip code or city/theatre name. */
  searchTheatres(query: string): Promise<Theatre[]>;
  listMovies(list: MovieList): Promise<Movie[]>;
  /** Every showtime at a theatre on one local date (YYYY-MM-DD). */
  getShowtimes(theatreId: number, date: string): Promise<Showtime[]>;
}
