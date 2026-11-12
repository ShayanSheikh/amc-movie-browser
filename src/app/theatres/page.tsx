import { getAmcClient, amcMode, type Theatre } from "@/lib/amc";
import { favoriteTheatres } from "@/lib/queries";
import { toggleFavorite } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

function TheatreRow({ t, isFavorite }: { t: Theatre; isFavorite: boolean }) {
  const theatre: Theatre = {
    id: t.id,
    name: t.name,
    slug: t.slug,
    address: t.address,
    city: t.city,
    state: t.state,
    postalCode: t.postalCode,
  };
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="font-medium">{t.name}</p>
        <p className="text-sm text-zinc-500">{[t.address, t.city, t.state, t.postalCode].filter(Boolean).join(", ")}</p>
      </div>
      <form action={toggleFavorite}>
        <input type="hidden" name="theatre" value={JSON.stringify(theatre)} />
        <SubmitButton variant={isFavorite ? "secondary" : "primary"}>{isFavorite ? "★ Unstar" : "☆ Star"}</SubmitButton>
      </form>
    </li>
  );
}

export default async function TheatresPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const favorites = favoriteTheatres();
  const favIds = new Set(favorites.map((f) => f.id));

  let results: Theatre[] = [];
  let error: string | null = null;
  if (q.trim()) {
    try {
      results = await getAmcClient().searchTheatres(q.trim());
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="mb-3 text-xl font-semibold">Find theatres</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder={amcMode() === "mock" ? "Try 62701, Springfield, or Chicago" : "Zip code or city"}
            className="input flex-1"
          />
          <button className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500">Search</button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {q && !error && results.length === 0 && <p className="mt-3 text-sm text-zinc-500">No theatres found for “{q}”.</p>}
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {results.map((t) => (
              <TheatreRow key={t.id} t={t} isFavorite={favIds.has(t.id)} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Your theatres</h2>
        {favorites.length === 0 ? (
          <p className="text-sm text-zinc-500">Star theatres above to track showtimes there.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {favorites.map((t) => (
              <TheatreRow key={t.id} t={t} isFavorite />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
