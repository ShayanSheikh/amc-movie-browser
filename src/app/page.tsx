import Link from "next/link";
import { getDb, getSettings } from "@/db";
import { formatDay, formatTime } from "@/lib/dates";
import { allDeadlines, favoriteTheatres, recentAlerts, upcomingShowtimes, watchedMovies } from "@/lib/queries";
import { clearAlerts, pollNowAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";

const DAYS_SHOWN = 7;

export default function Dashboard() {
  const cfg = getSettings(getDb());
  const favorites = favoriteTheatres();
  const watched = watchedMovies();
  const shows = upcomingShowtimes(
    watched.map((w) => w.movie.id),
    favorites.map((t) => t.id),
  );
  const deadlineRows = allDeadlines();
  const feed = recentAlerts();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Your watchlist</h1>
          <form action={pollNowAction} className="flex items-center gap-3 text-sm text-zinc-500">
            <span>
              {cfg.lastPollAt ? `Last checked ${new Date(cfg.lastPollAt).toLocaleString()}` : "Not checked yet"}
            </span>
            <SubmitButton pendingText="Checking…">Check now</SubmitButton>
          </form>
        </div>
        {cfg.lastPollError && (
          <pre className="overflow-x-auto rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {cfg.lastPollError}
          </pre>
        )}

        {(!favorites.length || !watched.length) && (
          <div className="card text-sm">
            <p className="mb-2 font-medium">Getting started</p>
            <ol className="list-decimal space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
              <li className={favorites.length ? "line-through" : ""}>
                Star your local AMCs on <Link className="underline" href="/theatres">Theatres</Link>
              </li>
              <li className={watched.length ? "line-through" : ""}>
                Add movies to your watchlist on <Link className="underline" href="/movies">Movies</Link>
              </li>
              <li>
                Paste a Discord or Slack webhook on <Link className="underline" href="/settings">Settings</Link>
              </li>
            </ol>
          </div>
        )}

        {watched.map(({ movie, notes }) => {
          const movieShows = shows.filter((s) => s.movieId === movie.id);
          const movieDeadlines = deadlineRows.filter((d) => d.deadline.movieId === movie.id);
          return (
            <article key={movie.id} className="card">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold">{movie.name}</h2>
                <span className="text-sm text-zinc-500">
                  {[movie.rating, movie.runTime && `${movie.runTime} min`, movie.releaseDate && `Release ${formatDay(movie.releaseDate)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {notes && <p className="mb-2 text-sm text-zinc-500 italic">{notes}</p>}
              {movieDeadlines.map(({ deadline: d, theatreName }) => (
                <div key={d.id} className="mb-2 flex items-center gap-2 text-sm">
                  <StatusPill status={d.status} />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    by {formatDay(d.deadlineDate)} at {theatreName ?? "any favorite"}
                  </span>
                </div>
              ))}
              {favorites.length === 0 ? (
                <p className="text-sm text-zinc-500">No favorite theatres yet.</p>
              ) : (
                <div className="space-y-3">
                  {favorites.map((t) => {
                    const ts = movieShows.filter((s) => s.theatreId === t.id);
                    const byDay = new Map<string, typeof ts>();
                    for (const s of ts) {
                      const d = s.startsAt.slice(0, 10);
                      byDay.set(d, [...(byDay.get(d) ?? []), s]);
                    }
                    const days = [...byDay].slice(0, DAYS_SHOWN);
                    return (
                      <div key={t.id}>
                        <p className="text-sm font-medium">
                          {t.name}
                          <span className="ml-2 font-normal text-zinc-500">
                            {ts.length ? `${ts.length} showtimes${byDay.size > DAYS_SHOWN ? ` over ${byDay.size} days` : ""}` : "No showtimes posted"}
                          </span>
                        </p>
                        {days.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {days.map(([day, list]) => (
                              <div key={day} className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="w-24 shrink-0 text-zinc-500">{formatDay(day)}</span>
                                {list.map((s) => {
                                  const chip = (
                                    <>
                                      {formatTime(s.startsAt)}
                                      {s.format && <span className="ml-1 font-semibold text-red-600">{s.format}</span>}
                                    </>
                                  );
                                  const cls = `rounded border px-1.5 py-0.5 ${s.isSoldOut ? "line-through opacity-50" : ""} border-zinc-300 dark:border-zinc-700`;
                                  return s.purchaseUrl ? (
                                    <a key={s.id} href={s.purchaseUrl} target="_blank" rel="noreferrer" className={`${cls} hover:bg-zinc-100 dark:hover:bg-zinc-800`}>
                                      {chip}
                                    </a>
                                  ) : (
                                    <span key={s.id} className={cls}>
                                      {chip}
                                    </span>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Alerts</h2>
          {feed.length > 0 && (
            <form action={clearAlerts}>
              <SubmitButton variant="ghost" className="text-xs">
                Clear
              </SubmitButton>
            </form>
          )}
        </div>
        {feed.length === 0 && <p className="text-sm text-zinc-500">No alerts yet. New showtimes will show up here.</p>}
        {feed.map((a) => (
          <div key={a.id} className="card p-3 text-sm">
            <p className="font-medium">{a.payload.title}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {a.payload.lines.slice(0, 6).map((l, i) => (
                <li key={i}>{l.replace(/\*\*/g, "")}</li>
              ))}
              {a.payload.lines.length > 6 && <li>…</li>}
            </ul>
            <p className="mt-2 text-[11px] text-zinc-400">
              {new Date(a.createdAt).toLocaleString()}
              {a.deliveredAt ? " · sent" : a.deliveryError ? ` · send failed: ${a.deliveryError}` : ""}
            </p>
          </div>
        ))}
      </aside>
    </div>
  );
}
