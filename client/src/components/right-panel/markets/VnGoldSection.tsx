import { ArrowsClockwise, Coins } from '@phosphor-icons/react';
import type { CollectorId, MarketSnapshot } from '@shared/types';
import { isFreshGoldComparison, isFreshMarketObservation } from '@shared/macro/core';

export function VnGoldSection({ markets, onForceRefresh, refreshingIds }: {
  markets: MarketSnapshot;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  refreshingIds?: ReadonlySet<string>;
}) {
  if (!(markets.vnGold && markets.vnGold.length > 0)) return null;
  const now = Date.now();
  const gold = markets.quotes.find((quote) => quote.symbol === 'Gold');
  const fx = markets.quotes.find((quote) => quote.symbol === 'USD/VND');
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-amber-200">
          <Coins size={13} className="text-amber-400" weight="fill" />
          <span>GIÁ VÀNG TRONG NƯỚC (TRIỆU ₫ / LƯỢNG)</span>
        </h2>
        {onForceRefresh && (
          <button
            type="button"
            onClick={() => onForceRefresh('markets-crypto')}
            title="Làm mới Giá vàng SJC, VN30 & Thị trường"
            className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-amber-400/50 hover:text-amber-200"
          >
            <ArrowsClockwise
              size={10}
              className={refreshingIds?.has('markets-crypto') ? 'animate-spin text-amber-300' : ''}
            />
          </button>
        )}
      </div>

      <div className="mt-1.5 divide-y divide-slate-800/85 rounded border border-amber-500/35 bg-[#0d1524]">
        {markets.vnGold.map((g) => (
          <div key={g.code} className="px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.1 font-mono text-xs font-bold text-amber-200">
                    {g.code}
                  </span>
                  <span className="text-[13px] leading-tight font-semibold text-slate-100">{g.name}</span>
                  {(g.retained || !isFreshMarketObservation(g.observedAt, now)) && <span className="text-xs text-amber-300">dữ liệu cũ hoặc chưa rõ</span>}
                </div>
                {g.worldParityPerLuongMillionVnd !== undefined &&
                  g.premiumVsWorldMillionVnd !== undefined && (
                    <div className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums">
                      Quy đổi TG{!isFreshGoldComparison(g, gold, fx, now) ? ' (tham chiếu cũ hoặc chưa rõ)' : ''}: {g.worldParityPerLuongMillionVnd.toFixed(2)} tr · Chênh{' '}
                      <span
                        className={
                          g.premiumVsWorldMillionVnd >= 0 ? 'text-amber-300' : 'text-emerald-300'
                        }
                      >
                        {g.premiumVsWorldMillionVnd >= 0 ? '+' : ''}
                        {g.premiumVsWorldMillionVnd.toFixed(2)} tr/lượng
                      </span>
                    </div>
                  )}
              </div>

              <div className="shrink-0 text-right font-mono tabular-nums">
                <div className="text-[13px]">
                  <span className="text-xs text-slate-400">Mua </span>
                  <strong className="text-emerald-300">
                    {g.buyPerLuongMillionVnd.toFixed(2)}
                  </strong>
                  <span className="mx-1 text-slate-600">|</span>
                  <span className="text-xs text-slate-400">Bán </span>
                  <strong className="text-amber-300">
                    {g.sellPerLuongMillionVnd.toFixed(2)}
                  </strong>
                </div>
                <div className="text-xs text-slate-500">
                  Biên độ {g.spreadMillionVnd.toFixed(2)} tr
                  {g.updatedLabel ? ` · ${g.updatedLabel}` : ' · không rõ thời điểm nguồn'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
