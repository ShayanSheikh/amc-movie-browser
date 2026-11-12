"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, getSettings, schema } from "@/db";
import type { Movie, Theatre } from "@/lib/amc";
import { pollNow } from "@/lib/poll/service";
import { sendWebhook } from "@/lib/notify/webhook";

const { theatres, movies, watchlist, deadlines, settings, alerts } = schema;

function refreshAll() {
  revalidatePath("/", "layout");
}

export async function toggleFavorite(formData: FormData) {
  const t = JSON.parse(String(formData.get("theatre"))) as Theatre;
  const db = getDb();
  const existing = db.select().from(theatres).where(eq(theatres.id, t.id)).get();
  const isFavorite = !existing?.isFavorite;
  db.insert(theatres)
    .values({ ...t, isFavorite })
    .onConflictDoUpdate({ target: theatres.id, set: { ...t, isFavorite } })
    .run();
  refreshAll();
}

function upsertMovie(m: Movie) {
  getDb().insert(movies).values(m).onConflictDoUpdate({ target: movies.id, set: m }).run();
}

export async function toggleWatch(formData: FormData) {
  const m = JSON.parse(String(formData.get("movie"))) as Movie;
  const db = getDb();
  upsertMovie(m);
  const existing = db.select().from(watchlist).where(eq(watchlist.movieId, m.id)).get();
  if (existing) db.delete(watchlist).where(eq(watchlist.movieId, m.id)).run();
  else db.insert(watchlist).values({ movieId: m.id }).run();
  refreshAll();
}

export async function addDeadline(formData: FormData) {
  const movieId = Number(formData.get("movieId"));
  const theatreRaw = String(formData.get("theatreId") ?? "any");
  const deadlineDate = String(formData.get("deadlineDate") ?? "");
  if (!movieId || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) return;
  const db = getDb();
  db.insert(deadlines)
    .values({ movieId, theatreId: theatreRaw === "any" ? null : Number(theatreRaw), deadlineDate })
    .run();
  db.insert(watchlist).values({ movieId }).onConflictDoNothing().run();
  refreshAll();
}

export async function deleteDeadline(formData: FormData) {
  getDb().delete(deadlines).where(eq(deadlines.id, Number(formData.get("id")))).run();
  refreshAll();
}

export async function saveSettings(formData: FormData) {
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim() || null;
  const pollIntervalMinutes = clamp(Number(formData.get("pollIntervalMinutes")), 5, 24 * 60, 30);
  const daysAhead = clamp(Number(formData.get("daysAhead")), 1, 60, 14);
  getDb().update(settings).set({ webhookUrl, pollIntervalMinutes, daysAhead }).where(eq(settings.id, 1)).run();
  refreshAll();
}

export async function sendTestWebhook(): Promise<{ ok: boolean; message: string }> {
  const cfg = getSettings(getDb());
  if (!cfg.webhookUrl) return { ok: false, message: "Save a webhook URL first." };
  try {
    await sendWebhook(cfg.webhookUrl, "test", {
      title: "Test alert from AMC Showtimes",
      lines: ["If you can read this, alerts are wired up."],
    });
    return { ok: true, message: "Sent! Check your channel." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function pollNowAction() {
  await pollNow();
  refreshAll();
}

export async function setMockStep(formData: FormData) {
  const step = Math.max(0, Number(formData.get("step")) || 0);
  getDb().update(settings).set({ mockStep: step }).where(eq(settings.id, 1)).run();
  refreshAll();
}

export async function clearAlerts() {
  getDb().delete(alerts).run();
  refreshAll();
}

export async function updateNotes(formData: FormData) {
  const movieId = Number(formData.get("movieId"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  getDb().update(watchlist).set({ notes }).where(and(eq(watchlist.movieId, movieId))).run();
  refreshAll();
}

function clamp(n: number, min: number, max: number, fallback: number) {
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
