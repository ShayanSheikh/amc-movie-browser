/** Local-date helpers. All dates are plain "YYYY-MM-DD" strings in the server's timezone. */

export function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local wall-clock ISO string without offset, e.g. "2026-11-12T19:30:00". */
export function toLocalIso(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${toLocalDate(d)}T${hh}:${mm}:${ss}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toLocalDate(new Date(y, m - 1, d + days));
}

export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function formatShowtime(localIso: string): string {
  const [date, time] = localIso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  return dt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(localIso: string): string {
  const [hh, mm] = localIso.slice(11, 16).split(":").map(Number);
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, "0")}${hh < 12 ? "am" : "pm"}`;
}
