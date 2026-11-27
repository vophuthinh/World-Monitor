import { CII_BAND_STYLE } from './shared';
import type { computeCountryInstabilityScores } from '@shared/intelligence';

export function InstabilityIndexSection({ ciiScores, onFlyToLocation }: {
  ciiScores: ReturnType<typeof computeCountryInstabilityScores>;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs font-semibold tracking-wider text-slate-300">
          COUNTRY INSTABILITY INDEX (CII REALTIME)
        </h2>
        <span className="font-mono text-xs text-slate-500">
          0 = Ổn định · 100 = Xung đột
        </span>
      </div>
      <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
        {ciiScores.map((row) => {
          const style = CII_BAND_STYLE[row.band];
          return (
            <button
              key={row.code}
              type="button"
              onClick={() => onFlyToLocation(row.lat, row.lon, 5.2)}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition hover:bg-slate-900/75 ${
                row.isVietnam ? 'bg-emerald-500/8' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-100">{row.name}</span>
                  <span className="font-mono text-xs text-slate-500">{row.code}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${row.score}%`, backgroundColor: style.bar }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <div className="text-[13px] font-bold text-slate-100">{row.score}/100</div>
                <span
                  className={`inline-block rounded border px-1 py-0.2 text-xs font-semibold ${style.badge}`}
                >
                  {row.isVietnam && row.band === 'LOW' ? 'STABLE · LOW' : row.band}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
