import { TrendDown, TrendUp } from '@phosphor-icons/react';
import { MiniSparkline } from '../shared';
import type { MarketQuote } from '@shared/types';
import type { FlashDirection } from '../../../hooks/useMonitorData';

export function IndicesCommoditiesSection({ indexAndCommodityQuotes, priceFlashes, streamConnected }: {
  indexAndCommodityQuotes: MarketQuote[];
  priceFlashes: Record<string, FlashDirection>;
  streamConnected: boolean;
}) {
  return (
    <section>
      <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
        CHỈ SỐ CHỨNG KHOÁN &amp; HÀNG HÓA CHIẾN LƯỢC
      </h2>
      <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
        {indexAndCommodityQuotes.map((q) => {
          const up = q.changePercent24h >= 0;
          const isVn = q.symbol.includes('VN');
          const flash = priceFlashes[q.symbol];
          return (
            <div
              key={q.symbol}
              className={`flex items-center justify-between px-2.5 py-2 transition-colors duration-300 ${
                flash === 'up'
                  ? 'bg-emerald-500/25'
                  : flash === 'down'
                    ? 'bg-rose-500/25'
                    : isVn
                      ? 'bg-emerald-500/8'
                      : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold text-slate-100">
                    {q.symbol}
                  </span>
                  <span className="rounded bg-slate-800 px-1 py-0.2 font-mono text-[9.5px] uppercase text-slate-400">
                    {q.group}
                  </span>
                  {q.symbol === 'Gold' && streamConnected && (
                    <span className="font-mono text-[9px] text-emerald-400">LIVE 1S</span>
                  )}
                </div>
                <div className="truncate text-[10.5px] text-slate-400">{q.name}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <MiniSparkline values={q.sparkline} positive={up} />
                <div className="text-right font-mono tabular-nums">
                  <div className="text-xs font-semibold text-slate-100">
                    {q.unit?.startsWith('USD') ? '$' : ''}
                    {q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`inline-flex items-center gap-0.5 text-[10.5px] ${
                      up ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {up ? <TrendUp size={11} /> : <TrendDown size={11} />}
                    {up ? '+' : ''}
                    {q.changePercent24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
