import { getDb, getSettings } from "../../db";
import { getAmcClient } from "../amc";
import { runPollExclusive, type PollSummary } from "./runPoll";

/** Runs a poll with the app's real DB and AMC client. */
export function pollNow(): Promise<PollSummary> {
  return runPollExclusive({ db: getDb(), client: getAmcClient() });
}

/** True when the configured interval has passed since the last poll. */
export function pollIsDue(now = new Date()): boolean {
  const cfg = getSettings(getDb());
  if (!cfg.lastPollAt) return true;
  return now.getTime() - new Date(cfg.lastPollAt).getTime() >= cfg.pollIntervalMinutes * 60_000;
}
