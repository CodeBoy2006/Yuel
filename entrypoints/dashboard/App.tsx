import { Activity, Boxes, Database, LockKeyhole } from 'lucide-react';

const pillars = [
  { icon: Activity, title: 'Event driven', text: 'Content scripts emit reading behavior events instead of long-running background timers.' },
  { icon: Database, title: 'Local memory', text: 'IndexedDB stores event, chunk, vocabulary, saved item, and aggregate tables.' },
  { icon: Boxes, title: 'Pack ready', text: 'Packs are declarative JSON data: lexicon, phrase, scoring, and template rules.' },
  { icon: LockKeyhole, title: 'Privacy first', text: 'The scaffold stores hashes by default and keeps raw text only for user-saved items.' },
];

export function DashboardApp() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Yuel Reading V0.1</p>
          <h1 className="mt-2 text-3xl font-semibold">Local-first reading analytics scaffold</h1>
          <p className="mt-3 max-w-2xl text-base text-stone-600">
            The first version establishes the MV3 extension framework, local data model, content collection boundary, and pack-safe analysis layer.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-6 md:grid-cols-2">
        {pillars.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-md border border-stone-200 bg-white p-5">
            <Icon className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
