import { Broadcast } from '@phosphor-icons/react';
import { safeHref } from '../../lib/safe-href';
import type { Dispatch, SetStateAction } from 'react';

export function WatchlistSection({ watchlistTerms, setWatchlistTerms, newWatchTerm, setNewWatchTerm, selectedWatchTerm, setSelectedWatchTerm, watchlistHitsMap }: {
  watchlistTerms: string[];
  setWatchlistTerms: Dispatch<SetStateAction<string[]>>;
  newWatchTerm: string;
  setNewWatchTerm: (value: string) => void;
  selectedWatchTerm: string | null;
  setSelectedWatchTerm: Dispatch<SetStateAction<string | null>>;
  watchlistHitsMap: Map<string, Array<{ id: string; title: string; source: string; url: string; publishedAt: number }>>;
}) {
  return (
    <section className="rounded border border-slate-800/95 bg-[#0d1524] p-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wider text-amber-200">
          <Broadcast size={12} className="text-amber-400" weight="fill" />
          <span>WATCHLIST TỪ KHÓA (CẢNH BÁO TỰ ĐỘNG)</span>
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const clean = newWatchTerm.trim();
            if (!clean) return;
            if (!watchlistTerms.some((t) => t.toLowerCase() === clean.toLowerCase())) {
              setWatchlistTerms((prev) => [...prev.slice(-8), clean]);
            }
            setNewWatchTerm('');
          }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            value={newWatchTerm}
            onChange={(e) => setNewWatchTerm(e.target.value)}
            placeholder="+ Thêm từ khóa..."
            className="w-28 rounded border border-slate-700/90 bg-[#070b12] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </form>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {watchlistTerms.map((term) => {
          const count = watchlistHitsMap.get(term)?.length ?? 0;
          const active = selectedWatchTerm === term;
          return (
            <span
              key={term}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9.5px] transition ${
                active
                  ? 'border-amber-400/70 bg-amber-500/25 text-amber-100'
                  : count > 0
                    ? 'border-amber-500/40 bg-amber-500/12 text-amber-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedWatchTerm((prev) => (prev === term ? null : term))}
                className="inline-flex items-center gap-1 font-semibold"
              >
                <span>{term}</span>
                <span className="rounded bg-black/30 px-1 text-[8.5px]">{count}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWatchlistTerms((prev) => prev.filter((x) => x !== term));
                  if (selectedWatchTerm === term) setSelectedWatchTerm(null);
                }}
                title={`Xóa ${term}`}
                className="ml-0.5 text-slate-500 hover:text-rose-300"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {selectedWatchTerm && (
        <div className="mt-2 max-h-[155px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-amber-500/30 bg-[#090f1a] px-2 py-1">
          {(watchlistHitsMap.get(selectedWatchTerm) ?? []).length === 0 ? (
            <div className="py-2 text-center text-[10.5px] text-slate-400">
              Chưa có tín hiệu mới khớp từ khóa &ldquo;{selectedWatchTerm}&rdquo;.
            </div>
          ) : (
            (watchlistHitsMap.get(selectedWatchTerm) ?? []).map((hit) => (
              <a
                key={hit.id}
                href={safeHref(hit.url)}
                target="_blank"
                rel="noreferrer"
                className="block py-1.5 text-[11px] leading-snug text-slate-200 hover:text-amber-200"
              >
                <span className="mr-1.5 rounded bg-slate-800 px-1 py-0.2 font-mono text-[9px] text-amber-300">
                  {hit.source}
                </span>
                <span>{hit.title}</span>
              </a>
            ))
          )}
        </div>
      )}
    </section>
  );
}
