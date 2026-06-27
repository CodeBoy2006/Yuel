import { BookMarked, Database, Layers3 } from 'lucide-react';

const pipeline = [
  { label: 'Observe', detail: 'Visible text blocks' },
  { label: 'Analyze', detail: 'English tokens and pack rules' },
  { label: 'Remember', detail: 'IndexedDB exposure data' },
];

export function SidePanelApp() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h1 className="text-base font-semibold">Reading companion</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-600">The first scaffold tracks supported English reading sites locally.</p>
      </header>

      <section className="grid gap-3 px-4 py-4">
        {pipeline.map((item, index) => (
          <div key={item.label} className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2">
              {index === 0 ? <Layers3 className="h-4 w-4" /> : <Database className="h-4 w-4" />}
              <p className="text-sm font-semibold">{item.label}</p>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
