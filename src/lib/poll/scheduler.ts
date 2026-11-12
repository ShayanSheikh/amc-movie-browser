import cron from "node-cron";
import { pollIsDue, pollNow } from "./service";

const g = globalThis as unknown as { __amcScheduler?: boolean };

/**
 * In-process scheduler for local/home-server use. Ticks every minute and polls once the
 * interval set on /settings has passed, so changing the interval needs no restart.
 * Set DISABLE_SCHEDULER=1 when hosting somewhere that calls /api/cron/poll instead.
 */
export function startScheduler() {
  if (g.__amcScheduler || process.env.DISABLE_SCHEDULER === "1") return;
  g.__amcScheduler = true;
  cron.schedule("* * * * *", async () => {
    try {
      if (!pollIsDue()) return;
      const s = await pollNow();
      console.log(
        `[poll] ${s.requests} requests, ${s.newShowtimes} new showtimes, ${s.alertsCreated} alerts` +
          (s.errors.length ? `, ${s.errors.length} errors` : ""),
      );
    } catch (err) {
      console.error("[poll] failed:", err);
    }
  });
  console.log("[poll] scheduler started");
}
