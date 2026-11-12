import { getAmcClient, type Movie, type MovieList } from "@/lib/amc";
import { formatDay, toLocalDate, addDays } from "@/lib/dates";
import { allDeadlines, favoriteTheatres, watchedMovies } from "@/lib/queries";
import { addDeadline, deleteDeadline, toggleWatch, updateNotes } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";

async function loadList(list: MovieList): Promise<{ movies: Movie[]; error: string | null }> {
  try {
    return { movies: await getAmcClient().listMovies(list), error: null };
  } catch (err) {
    return { movies: [], error: (err as Error).message };
  }
}

function WatchButton({ movie, watching }: { movie: Movie; watching: boolean }) {
  return (
    <form action={toggleWatch}>
      <input type="hidden" name="movie" value={JSON.stringify(movie)} />
      <SubmitButton variant={watching ? "secondary" : "primary"}>{watching ? "Watching ✓" : "+ Watch"}</SubmitButton>
    </form>
  );
}

export default async function MoviesPage() {
  const [nowPlaying, comingSoon] = await Promise.all([loadList("now-playing"), loadList("coming-soon")]);
  const watched = watchedMovies();
  const watchedIds = new Set(watched.map((w) => w.movie.id));
  const favorites = favoriteTheatres();
  const deadlineRows = allDeadlines();
  const defaultDeadline = addDays(toLocalDate(new Date()), 14);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="mb-1 text-xl font-semibold">Watchlist</h1>
        <p className="mb-3 text-sm text-zinc-500">
          Set a <strong>programming deadline</strong> to get warned if a movie still has no showtimes at a theatre by that date.
        </p>
        {watched.length === 0 && <p className="text-sm text-zinc-500">Nothing yet. Add movies below.</p>}
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {watched.map(({ movie, notes }) => {
            const ds = deadlineRows.filter((d) => d.deadline.movieId === movie.id);
            return (
              <li key={movie.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{movie.name}</p>
                    {movie.releaseDate && <p className="text-xs text-zinc-500">Release {formatDay(movie.releaseDate)}</p>}
                  </div>
                  <WatchButton movie={movie} watching />
                </div>
                <form action={updateNotes} className="flex gap-2">
                  <input type="hidden" name="movieId" value={movie.id} />
                  <input name="notes" defaultValue={notes ?? ""} placeholder="Notes (e.g. 'IMAX 70mm only')" className="input flex-1 text-xs" />
                  <SubmitButton variant="ghost" className="text-xs">
                    Save
                  </SubmitButton>
                </form>
                {ds.map(({ deadline: d, theatreName }) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <StatusPill status={d.status} />
                    <span className="text-zinc-600 dark:text-zinc-400">
                      by {formatDay(d.deadlineDate)} at {theatreName ?? "any favorite"}
                    </span>
                    <form action={deleteDeadline} className="ml-auto">
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton variant="danger" className="text-xs">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                ))}
                <form action={addDeadline} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="movieId" value={movie.id} />
                  <span className="text-zinc-500">Expect showtimes by</span>
                  <input type="date" name="deadlineDate" defaultValue={defaultDeadline} className="input" required />
                  <span className="text-zinc-500">at</span>
                  <select name="theatreId" className="input">
                    <option value="any">any favorite theatre</option>
                    {favorites.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton variant="secondary">Add deadline</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      {[
        { title: "Now playing", ...nowPlaying },
        { title: "Coming soon", ...comingSoon },
      ].map((section) => (
        <section key={section.title} className="card">
          <h2 className="mb-2 font-semibold">{section.title}</h2>
          {section.error && <p className="text-sm text-red-600">{section.error}</p>}
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {section.movies.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-zinc-500">
                    {[m.rating, m.runTime && `${m.runTime} min`, m.releaseDate && formatDay(m.releaseDate)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <WatchButton movie={m} watching={watchedIds.has(m.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
