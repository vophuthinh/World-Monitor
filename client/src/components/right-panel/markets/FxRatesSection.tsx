import type { MarketQuote } from '@shared/types';

export function FxRatesSection({ fxQuotes }: {
  fxQuotes: MarketQuote[];
}) {
  return (
    <section>
      <h2 className="font-mono text-xs font-semibold tracking-wider text-slate-300">
        TỶ GIÁ NGOẠI HỐI
      </h2>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {fxQuotes.map((fx) => {
          const isVnd = fx.symbol === 'USD/VND';
          return (
            <div
              key={fx.symbol}
              className={`rounded border px-2.5 py-2 ${
                isVnd
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-800/90 bg-[#0d1524]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-mono text-xs font-semibold ${
                    isVnd ? 'text-emerald-300' : 'text-slate-300'
                  }`}
                >
                  {fx.symbol}
                </span>
                {isVnd && (
                  <span className="rounded bg-emerald-500/20 px-1 py-0.2 font-mono text-xs text-emerald-300">
                    VN
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-slate-100 tabular-nums">
                {fx.price.toLocaleString('en-US', {
                  maximumFractionDigits: isVnd ? 0 : 4,
                })}
              </div>
              <div className="truncate text-xs text-slate-400">{fx.name}{fx.retained ? ' · dữ liệu cũ' : ''}</div>
              <div className="text-xs text-slate-400">
                Giá lúc: {fx.observedAt ? new Date(fx.observedAt).toLocaleString('vi-VN') : 'không rõ'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
