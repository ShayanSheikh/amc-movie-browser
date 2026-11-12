/**
 * Hits each AMC endpoint the app uses, once, and checks the responses against our zod schemas.
 * Run once your key is active:  AMC_API_KEY=... npm run amc:smoke -- 10001
 * The optional argument is the zip/city to search (default 10001).
 */
import { HttpAmcClient, ENDPOINTS } from "../src/lib/amc/httpClient";
import { toLocalDate } from "../src/lib/dates";

async function main() {
  const apiKey = process.env.AMC_API_KEY;
  if (!apiKey) {
    console.error("Set AMC_API_KEY first.");
    process.exit(1);
  }
  const query = process.argv[2] ?? "10001";
  const client = new HttpAmcClient({ apiKey });
  let failed = false;

  async function step<T>(label: string, path: string, fn: () => Promise<T>, show: (v: T) => string) {
    process.stdout.write(`• ${label}\n    ${path}\n    `);
    try {
      const v = await fn();
      console.log(`✓ ${show(v)}`);
      return v;
    } catch (err) {
      failed = true;
      console.log(`✗ ${(err as Error).message.split("\n").slice(0, 6).join("\n      ")}`);
      return null;
    }
  }

  const theatres = await step(`search theatres "${query}"`, ENDPOINTS.locationSuggestions(query), () => client.searchTheatres(query), (t) =>
    `${t.length} theatres, e.g. ${t.slice(0, 3).map((x) => `${x.name} (#${x.id})`).join(", ")}`,
  );
  await step("now playing", ENDPOINTS.movies("now-playing"), () => client.listMovies("now-playing"), (m) => `${m.length} movies`);
  await step("coming soon", ENDPOINTS.movies("coming-soon"), () => client.listMovies("coming-soon"), (m) => `${m.length} movies`);
  const theatre = theatres?.[0];
  if (theatre) {
    const today = toLocalDate(new Date());
    await step(`showtimes at ${theatre.name} today`, ENDPOINTS.showtimes(theatre.id, today), () => client.getShowtimes(theatre.id, today), (s) =>
      `${s.length} showtimes, e.g. ${s.slice(0, 3).map((x) => `${x.movieName} ${x.startsAt.slice(11, 16)}${x.format ? " " + x.format : ""}`).join("; ")}`,
    );
  }

  console.log(failed ? "\nSome endpoints failed. Fix ENDPOINTS / schemas in src/lib/amc/." : "\nAll good.");
  process.exit(failed ? 1 : 0);
}

main();
