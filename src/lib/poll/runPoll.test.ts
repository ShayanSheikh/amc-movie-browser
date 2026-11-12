import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../db";
import { alerts, deadlines, movies, settings, showtimesSeen, theatres, watchlist } from "../../db/schema";
import { MockAmcClient, MOCK_THEATRES } from "../amc/mockClient";
import type { AmcClient } from "../amc/client";
import { runPoll } from "./runPoll";
import { addDays, toLocalDate } from "../dates";

const NOW = new Date(2026, 10, 11, 9, 0, 0); // Nov 11 2026, 9:00 local
const STARFALL = 71001;
const GLASS_MERIDIAN = 72001; // shows only appear from mock step 1
const PAPER_COMETS = 72002; // only ever at theatre 9003
const RIVERSIDE = 9001;

let db: Db;
let step: number;
let client: MockAmcClient;
let send: ReturnType<typeof vi.fn>;

async function seedMovie(id: number) {
  const all = [...(await client.listMovies("now-playing")), ...(await client.listMovies("coming-soon"))];
  const m = all.find((x) => x.id === id)!;
  db.insert(movies).values(m).onConflictDoNothing().run();
}

function favorite(id: number) {
  const t = MOCK_THEATRES.find((x) => x.id === id)!;
  db.insert(theatres).values({ ...t, isFavorite: true }).onConflictDoNothing().run();
}

const poll = (now = NOW, c: AmcClient = client) => runPoll({ db, client: c, now, send });
const allAlerts = () => db.select().from(alerts).all();

beforeEach(() => {
  db = createDb(":memory:");
  step = 0;
  client = new MockAmcClient(() => step, () => NOW);
  send = vi.fn().mockResolvedValue(undefined);
  db.update(settings).set({ daysAhead: 14 }).run();
});

describe("runPoll", () => {
  it("seeds silently on first poll, then alerts only on new showtimes", async () => {
    favorite(RIVERSIDE);
    await seedMovie(STARFALL);
    db.insert(watchlist).values({ movieId: STARFALL }).run();

    const first = await poll();
    expect(first.newShowtimes).toBe(0);
    expect(allAlerts()).toHaveLength(0);
    const seeded = db.select().from(showtimesSeen).all().length;
    expect(seeded).toBeGreaterThan(0);

    // Same data, so nothing new.
    await poll();
    expect(allAlerts()).toHaveLength(0);

    // AMC posts 4 more days.
    step = 1;
    const third = await poll();
    expect(third.newShowtimes).toBeGreaterThan(0);
    const [a] = allAlerts();
    expect(a.kind).toBe("new_showtimes");
    expect(a.payload.title).toContain("Starfall @ AMC Riverside 16");
    expect(db.select().from(showtimesSeen).all().length).toBe(seeded + third.newShowtimes);
  });

  it("titles the first showtimes for a coming-soon movie as 'Tickets are up'", async () => {
    favorite(RIVERSIDE);
    await seedMovie(GLASS_MERIDIAN);
    db.insert(watchlist).values({ movieId: GLASS_MERIDIAN }).run();

    await poll(); // step 0: nothing yet, but the pair is now covered
    expect(allAlerts()).toHaveLength(0);

    step = 2;
    await poll();
    const [a] = allAlerts();
    expect(a.payload.title).toMatch(/^Tickets are up: Glass Meridian/);
  });

  it("does not seed coverage when a fetch fails, so nothing is lost", async () => {
    favorite(RIVERSIDE);
    await seedMovie(STARFALL);
    db.insert(watchlist).values({ movieId: STARFALL }).run();
    const flaky: AmcClient = {
      ...client,
      mode: "mock",
      searchTheatres: client.searchTheatres.bind(client),
      listMovies: client.listMovies.bind(client),
      getShowtimes: async (t, d) => {
        if (d === addDays(toLocalDate(NOW), 1)) throw new Error("boom");
        return client.getShowtimes(t, d);
      },
    };
    const s = await poll(NOW, flaky);
    expect(s.errors).toHaveLength(1);
    // The next good poll is still the silent seed.
    await poll();
    expect(allAlerts()).toHaveLength(0);
  });

  it("delivers alerts to the webhook and marks them delivered", async () => {
    db.update(settings).set({ webhookUrl: "https://discord.com/api/webhooks/x/y" }).run();
    favorite(RIVERSIDE);
    await seedMovie(STARFALL);
    db.insert(watchlist).values({ movieId: STARFALL }).run();
    await poll();
    step = 1;
    const s = await poll();
    expect(s.alertsDelivered).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(allAlerts()[0].deliveredAt).not.toBeNull();

    // A failed delivery is kept and retried on the next poll.
    send.mockRejectedValueOnce(new Error("down"));
    step = 2;
    await poll();
    expect(allAlerts()[1].deliveryError).toBe("down");
    await poll();
    expect(allAlerts()[1].deliveredAt).not.toBeNull();
  });

  describe("deadlines", () => {
    it("marks met when showtimes appear before the deadline", async () => {
      favorite(RIVERSIDE);
      await seedMovie(GLASS_MERIDIAN);
      db.insert(deadlines).values({ movieId: GLASS_MERIDIAN, theatreId: RIVERSIDE, deadlineDate: "2026-11-20" }).run();

      await poll();
      expect(db.select().from(deadlines).get()!.status).toBe("pending");

      step = 2;
      await poll();
      expect(db.select().from(deadlines).get()!.status).toBe("met");
      expect(allAlerts().map((a) => a.kind)).toContain("deadline_met");
    });

    it("marks missed once the date passes with no showtimes", async () => {
      favorite(RIVERSIDE);
      await seedMovie(PAPER_COMETS);
      db.insert(deadlines).values({ movieId: PAPER_COMETS, theatreId: RIVERSIDE, deadlineDate: "2026-11-15" }).run();

      await poll(new Date(2026, 10, 15, 12)); // on the deadline day: still pending
      expect(db.select().from(deadlines).get()!.status).toBe("pending");

      await poll(new Date(2026, 10, 16, 9));
      const d = db.select().from(deadlines).get()!;
      expect(d.status).toBe("missed");
      const missed = allAlerts().find((a) => a.kind === "deadline_missed")!;
      expect(missed.payload.title).toContain("Paper Comets");
      expect(missed.payload.title).toContain("AMC Riverside 16");
    });

    it("'any favorite' deadlines are met by any favorite theatre", async () => {
      favorite(RIVERSIDE);
      favorite(9003);
      await seedMovie(PAPER_COMETS);
      db.insert(deadlines).values({ movieId: PAPER_COMETS, theatreId: null, deadlineDate: "2026-11-30" }).run();
      step = 2; // Paper Comets opens Nov 16, which is past the step-0 horizon
      await poll();
      expect(db.select().from(deadlines).where(eq(deadlines.movieId, PAPER_COMETS)).get()!.status).toBe("met");
    });
  });
});
