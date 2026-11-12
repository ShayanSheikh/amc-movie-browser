import type { AmcClient } from "./client";
import { HttpAmcClient } from "./httpClient";
import { MockAmcClient } from "./mockClient";
import { getDb, getSettings } from "../../db";

export type { AmcClient, MovieList } from "./client";
export type { Movie, Showtime, Theatre } from "./types";

/**
 * AMC_MODE=live uses the real API (requires AMC_API_KEY).
 * AMC_MODE=mock, or no key set, uses fixture data.
 */
export function amcMode(): "mock" | "live" {
  if (process.env.AMC_MODE === "live" && process.env.AMC_API_KEY) return "live";
  if (process.env.AMC_MODE === "mock") return "mock";
  return process.env.AMC_API_KEY ? "live" : "mock";
}

const g = globalThis as unknown as { __amcClient?: AmcClient };

export function getAmcClient(): AmcClient {
  if (!g.__amcClient) {
    g.__amcClient =
      amcMode() === "live"
        ? new HttpAmcClient({ apiKey: process.env.AMC_API_KEY! })
        : new MockAmcClient(() => getSettings(getDb()).mockStep);
  }
  return g.__amcClient;
}
