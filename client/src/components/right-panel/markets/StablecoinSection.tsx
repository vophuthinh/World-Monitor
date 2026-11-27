import type { CryptoQuote } from '@shared/types';

export function StablecoinSection({ stablecoins }: {
  stablecoins: CryptoQuote[];
}) {
  if (!(stablecoins.length > 0)) return null;
  return (
    <section>
      <h2 className="font-mono text-xs font-semibold tracking-wider text-slate-300">
        STABLECOIN PEG MONITOR
      </h2>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {stablecoins.map((sc) => {
          const dev = Math.abs(sc.priceUsd - 1.0);
          const onPeg = dev < 0.005;
          return (
            <div
              key={sc.id}
              className="flex items-center justify-between rounded border border-slate-800/95 bg-[#0d1524] px-2.5 py-1.5 font-mono"
            >
              <div>
                <div className="text-[13px] font-bold text-slate-100">{sc.symbol}</div>
                <div className="text-xs text-slate-400">${sc.priceUsd.toFixed(4)}</div>
                {sc.retained && <div className="text-xs text-amber-300">dữ liệu cũ</div>}
              </div>
              <span
                className={`rounded border px-1.5 py-0.5 text-xs font-bold ${
                  onPeg
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                }`}
              >
                {onPeg ? 'ON PEG' : 'DEPEG WARN'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
