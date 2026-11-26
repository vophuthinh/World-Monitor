import { MiniSparkline } from '../shared';
import type { MarketSnapshot, Vn30StockQuote } from '@shared/types';

function renderCard(st: Vn30StockQuote) {
  const up = st.changePercent != null && st.changePercent >= 0;
  return (
    <div
      key={st.symbol}
      className="flex items-center justify-between gap-1.5 rounded border border-slate-800/95 bg-[#0d1524] px-2.5 py-1.5"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-slate-100">{st.symbol}</span>
          <span className="truncate text-[11px] text-slate-400">{st.sector}</span>
        </div>
        <MiniSparkline values={st.sparkline} positive={up} />
        <div className="text-[11px] text-slate-400">
          Lấy: {st.updatedAt > 0 ? new Date(st.updatedAt).toLocaleString('vi-VN') : 'không rõ'}
          {st.retained && <span className="text-amber-300"> · Giữ lại</span>}
        </div>
        <div className="text-[11px] text-slate-400">
          Phiên: {st.observedAt ? new Date(st.observedAt).toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : 'không rõ'}
        </div>
      </div>
      <div className="shrink-0 text-right font-mono tabular-nums">
        <div className="text-xs font-semibold text-slate-100">
          {(st.closeThousandVnd ?? st.priceThousandVnd).toFixed(2)}
        </div>
        <div
          className={`text-[11px] font-semibold ${
            st.changePercent == null ? 'text-slate-400' : up ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {st.changePercent == null ? 'không rõ' : `${up ? '+' : ''}${st.changePercent.toFixed(2)}%`}
        </div>
      </div>
    </div>
  );
}

export function Vn30Section({ markets }: {
  markets: MarketSnapshot;
}) {
  if (!(markets.vn30 && markets.vn30.length > 0)) return null;
  // Live label only while ticks are recent (the feed stops after the close).
  const latest = Math.max(0, ...markets.vn30.map((s) => s.liveAt ?? 0));
  const liveAt = Date.now() - latest < 60_000 ? latest : 0;
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-emerald-300">
          RỔ VN30 (HOSE · NGHÌN ₫)
        </h2>
        <span className="font-mono text-[11px] text-slate-500">{liveAt > 0 ? `● Trong phiên · ${new Date(liveAt).toLocaleTimeString('vi-VN')} (SSI)` : 'Sparkline 10 phiên'}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">{markets.vn30.slice(0, 10).map(renderCard)}</div>
      {markets.vn30.length > 10 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-slate-300">Xem thêm {markets.vn30.length - 10} mã</summary>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">{markets.vn30.slice(10).map(renderCard)}</div>
        </details>
      )}
    </section>
  );
}
