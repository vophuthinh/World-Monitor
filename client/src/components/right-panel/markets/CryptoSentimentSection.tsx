import { Gauge } from '@phosphor-icons/react';
import { formatCompactUsd } from '../shared';
import type { CryptoQuote, MarketSnapshot } from '@shared/types';
import type { FlashDirection } from '../../../hooks/useMonitorData';

export function CryptoSentimentSection({ markets, priceFlashes, volatileCrypto }: {
  markets: MarketSnapshot;
  priceFlashes: Record<string, FlashDirection>;
  volatileCrypto: CryptoQuote[];
}) {
  const now = Date.now();
  const sentimentIsStale = markets.fearGreed && (
    markets.fearGreed.retained || !Number.isFinite(markets.fearGreed.updatedAt) ||
    markets.fearGreed.updatedAt <= 0 || markets.fearGreed.updatedAt > now ||
    now - markets.fearGreed.updatedAt > 7 * 86_400_000
  );
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-slate-300">
          <span>TIỀN SỐ</span>
        </h2>
        {markets.fearGreed && (
          <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-cyan-300 tabular-nums">
            <Gauge size={13} />
            F&amp;G: {markets.fearGreed.value}/100 ({markets.fearGreed.classification}){sentimentIsStale ? ' · dữ liệu cũ' : ''}
          </span>
        )}
      </div>

      {markets.fearGreed && (
        <div className="mt-1.5 rounded border border-slate-800/90 bg-[#0d1524] p-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${markets.fearGreed.value}%`,
                backgroundColor:
                  markets.fearGreed.value >= 60
                    ? '#10b981'
                    : markets.fearGreed.value <= 35
                      ? '#f43f5e'
                      : '#f59e0b',
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
        {volatileCrypto.map((coin) => {
          const up = coin.changePercent24h !== null && coin.changePercent24h >= 0;
          const flash = priceFlashes[coin.symbol];
          return (
            <div
              key={coin.id}
              className={`flex items-center justify-between px-2.5 py-1.5 transition-colors duration-300 ${
                flash === 'up'
                  ? 'bg-emerald-500/22'
                  : flash === 'down'
                    ? 'bg-rose-500/22'
                    : ''
              }`}
            >
              <div>
                <span className="font-mono text-xs font-semibold text-slate-100">
                  {coin.symbol}
                </span>
                <span className="ml-1.5 text-[11px] text-slate-400">{coin.name}</span>
                {coin.retained && <span className="ml-1 text-[10px] text-amber-300">dữ liệu cũ</span>}
              </div>
              <div className="text-right font-mono tabular-nums">
                <div
                  className={`text-xs font-semibold ${
                    flash === 'up'
                      ? 'text-emerald-200'
                      : flash === 'down'
                        ? 'text-rose-200'
                        : 'text-slate-100'
                  }`}
                >
                  $
                  {coin.priceUsd.toLocaleString('en-US', {
                    maximumFractionDigits: coin.priceUsd >= 10 ? 2 : 4,
                  })}
                </div>
                <div className="text-[10px]">
                  <span className={coin.changePercent24h === null ? 'text-slate-400' : up ? 'text-emerald-400' : 'text-rose-400'}>
                    {coin.changePercent24h === null ? 'không rõ' : `${up ? '+' : ''}${coin.changePercent24h.toFixed(2)}%`}
                  </span>
                  <span className="ml-1.5 text-slate-500">
                    MCap {formatCompactUsd(coin.marketCapUsd)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
