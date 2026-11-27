import { ArrowsClockwise, Fire } from '@phosphor-icons/react';
import { formatCompactUsd } from './shared';
import type { CollectorId, PredictionItem } from '@shared/types';
import type { FlashDirection } from '../../hooks/useMonitorData';
import { safeHref } from '../../lib/safe-href';

export function PolymarketSection({ top5HotPolymarket, predictionFlashes, streamConnected, translateVi, onForceRefresh, refreshingIds }: {
  top5HotPolymarket: PredictionItem[];
  predictionFlashes: Record<string, FlashDirection>;
  streamConnected: boolean;
  translateVi: boolean;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  refreshingIds?: ReadonlySet<string>;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-slate-200">
          <Fire size={13} className="text-amber-400" weight="fill" />
          <span>POLYMARKET · TOP 5 HOT NHẤT</span>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.2 font-mono text-xs font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {streamConnected ? 'LIVE WS' : '45S LIVE'}
          </span>
        </h2>

        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400">
          <span>24h Vol</span>
          {onForceRefresh && (
            <button
              type="button"
              onClick={() => onForceRefresh('polymarket')}
              title="Làm mới Polymarket ngay lập tức"
              className="inline-flex items-center gap-0.5 rounded border border-slate-700/90 bg-slate-900 px-1.5 py-0.5 text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
            >
              <ArrowsClockwise
                size={10}
                className={refreshingIds?.has('polymarket') ? 'animate-spin text-cyan-300' : ''}
              />
            </button>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Kỳ vọng hàm ý từ dòng tiền giao dịch trên Polymarket, không phải dự báo của hệ thống.
      </p>

      {top5HotPolymarket.length === 0 ? (
        <div className="mt-1.5 rounded border border-slate-800/95 bg-[#0d1524] py-4 text-center text-[13px] text-slate-400">
          Đang đồng bộ Top 5 Polymarket sôi động nhất 24h...
        </div>
      ) : (
        <div className="mt-1.5 divide-y divide-slate-800/85 rounded border border-amber-500/25 bg-[#0d1524]">
          {top5HotPolymarket.map((item, idx) => {
            const label = translateVi ? item.titleVi || item.title : item.title;
            const flash = predictionFlashes[item.id];
            const vol24 = item.volume24hUsd ?? item.volumeUsd;
            return (
              <a
                key={item.id}
                href={safeHref(item.url)}
                target="_blank"
                rel="noreferrer"
                className={`block px-2.5 py-2 transition hover:bg-[#121e33] ${
                  flash === 'up'
                    ? 'bg-emerald-500/15'
                    : flash === 'down'
                      ? 'bg-rose-500/15'
                      : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.2 font-mono text-xs font-bold ${
                          idx === 0
                            ? 'border border-amber-400/50 bg-amber-500/20 text-amber-200'
                            : idx < 3
                              ? 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                              : 'border border-slate-700 bg-slate-800 text-slate-300'
                        }`}
                      >
                        #{idx + 1} HOT
                      </span>
                      {item.outcomeLabel && (
                        <span className="truncate rounded border border-fuchsia-500/35 bg-fuchsia-500/15 px-1.5 py-0.2 font-mono text-xs font-semibold text-fuchsia-200">
                          {item.outcomeLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[13px] font-medium leading-snug text-slate-100">
                      {label}
                    </div>
                  </div>

                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div
                      className={`text-sm font-bold transition-colors ${
                        flash === 'up'
                          ? 'text-emerald-300'
                          : flash === 'down'
                            ? 'text-rose-300'
                            : 'text-cyan-300'
                      }`}
                    >
                      {item.yesPercent}%
                    </div>
                    {item.change24hPct !== undefined && (
                      <div
                        className={`text-xs font-semibold ${
                          item.change24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.change24hPct >= 0 ? '+' : ''}
                        {item.change24hPct.toFixed(1)}% 24h
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500"
                      style={{ width: `${Math.max(3, Math.min(98, item.yesPercent))}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-amber-300 tabular-nums">
                    24h {formatCompactUsd(vol24)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums">
                    Tổng {formatCompactUsd(item.volumeUsd)}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
