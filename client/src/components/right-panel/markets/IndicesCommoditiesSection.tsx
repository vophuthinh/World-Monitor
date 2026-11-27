import { TrendDown, TrendUp } from '@phosphor-icons/react';
import { MiniSparkline } from '../shared';
import type { MarketQuote } from '@shared/types';
import type { FlashDirection } from '../../../hooks/useMonitorData';

export function IndicesCommoditiesSection({ indexAndCommodityQuotes, priceFlashes }: {
  indexAndCommodityQuotes: MarketQuote[];
  priceFlashes: Record<string, FlashDirection>;
}) {
  return (
    <section>
      <h2 className="font-mono text-xs font-semibold tracking-wider text-slate-300">
        CHỈ SỐ CHỨNG KHOÁN &amp; HÀNG HÓA CHIẾN LƯỢC
      </h2>
      <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
        {indexAndCommodityQuotes.map((q) => {
          const up = q.changePercent24h != null && q.changePercent24h >= 0;
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
                  <span className="font-mono text-[13px] font-semibold text-slate-100">
                    {q.symbol}
                  </span>
                  <span className="rounded bg-slate-800 px-1 py-0.2 font-mono text-xs uppercase text-slate-400">
                    {q.group}
                  </span>
                  {q.retained && <span className="text-xs text-amber-300">dữ liệu cũ</span>}
                </div>
                <div className="truncate text-xs text-slate-400">{q.name}</div>
                {(q.source === 'Yahoo Finance Chart v8' || q.source === 'HOSE / VNDirect Feed' || q.source === 'HOSE / Stooq Feed') && (
                  <div className="text-xs text-slate-400">
                    {q.symbol === 'VN-Index' ? 'Phiên' : 'Giá lúc'}: {q.observedAt
                      ? q.symbol === 'VN-Index' ? new Date(q.observedAt).toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : new Date(q.observedAt).toLocaleString('vi-VN')
                      : 'không rõ'}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <MiniSparkline values={q.sparkline} positive={up} />
                <div className="text-right font-mono tabular-nums">
                  <div className="text-[13px] font-semibold text-slate-100">
                    {q.unit?.startsWith('USD') ? '$' : ''}
                    {q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`inline-flex items-center gap-0.5 text-xs ${
                      q.changePercent24h == null ? 'text-slate-400' : up ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {q.changePercent24h == null ? 'không rõ' : (
                      <>{up ? <TrendUp size={11} /> : <TrendDown size={11} />}
                        {up ? '+' : ''}{q.changePercent24h.toFixed(2)}%</>
                    )}
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
