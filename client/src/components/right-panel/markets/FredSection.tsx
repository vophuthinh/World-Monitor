import { MiniSparkline } from '../shared';
import type { MarketSnapshot } from '@shared/types';

export function FredSection({ markets }: {
  markets: MarketSnapshot;
}) {
  if (!(markets.fred && markets.fred.length > 0)) return null;
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-sky-300">
          LÃI SUẤT FED · LỢI SUẤT TRÁI PHIẾU MỸ &amp; VIX (FRED LIVE)
        </h2>
        <span className="font-mono text-[9.5px] text-slate-500">St. Louis Fed</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {markets.fred
          .filter((fm) => fm.pillar === 'market' || fm.id === 'FEDFUNDS' || fm.id === 'T10Y2Y')
          .map((fm) => {
            const up = fm.change >= 0;
            return (
              <div
                key={fm.id}
                className={`rounded border px-2.5 py-2 ${
                  fm.alertBadge
                    ? 'border-rose-500/45 bg-rose-950/25'
                    : 'border-slate-800/95 bg-[#0d1524]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-mono text-[10.5px] font-bold text-slate-200">
                    {fm.label}
                  </span>
                  <span className="font-mono text-xs font-bold text-cyan-300 tabular-nums">
                    {fm.value.toFixed(2)}
                    {fm.unit === '%' ? '%' : ''}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-400">{fm.subtitle}</div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <MiniSparkline values={fm.sparkline} positive={up} />
                  <span
                    className={`font-mono text-[9.5px] font-semibold tabular-nums ${
                      up ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {up ? '+' : ''}
                    {fm.change.toFixed(2)}
                  </span>
                </div>
                {fm.alertBadge && (
                  <div className="mt-1 rounded border border-rose-500/45 bg-rose-500/20 px-1.5 py-0.2 text-center font-mono text-[8.5px] font-bold text-rose-200">
                    {fm.alertBadge}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}
