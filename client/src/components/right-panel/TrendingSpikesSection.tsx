import { Fire } from '@phosphor-icons/react';
import type { detectTrendingSpikes } from '@shared/intelligence';

export function TrendingSpikesSection({ trendingSpikes, onJumpToNews, onJumpToTechCyber }: {
  trendingSpikes: ReturnType<typeof detectTrendingSpikes>;
  onJumpToNews: (query: string) => void;
  onJumpToTechCyber: (opts: { query?: string; scanIoc?: string }) => void;
}) {
  if (!(trendingSpikes.length > 0)) return null;
  return (
    <section>
      <h2 className="flex items-center gap-1 font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
        <Fire size={12} className="text-amber-400" weight="fill" />
        <span>TRENDING THREAT &amp; KEYWORD SPIKES</span>
      </h2>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {trendingSpikes.map((sp) => (
          <button
            key={sp.term}
            type="button"
            onClick={() => {
              const keyword = sp.term.split(' / ')[0];
              if (sp.kind === 'cve' || sp.kind === 'tech_ai') {
                onJumpToTechCyber({ query: keyword });
              } else {
                onJumpToNews(keyword);
              }
            }}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] transition hover:brightness-125 ${
              sp.kind === 'cve'
                ? 'border-rose-500/45 bg-rose-500/15 text-rose-200'
                : sp.kind === 'tech_ai'
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                  : 'border-amber-500/40 bg-amber-500/12 text-amber-200'
            }`}
          >
            <span className="font-semibold">{sp.term}</span>
            <span className="opacity-75">×{sp.mentions}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
