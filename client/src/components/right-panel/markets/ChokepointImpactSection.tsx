import { Anchor, Crosshair } from '@phosphor-icons/react';
import type { evaluateChokepointMarketImpacts } from '@shared/catalysts-and-chokepoints';

export function ChokepointImpactSection({ chokepointImpacts, onFlyToLocation }: {
  chokepointImpacts: ReturnType<typeof evaluateChokepointMarketImpacts>;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
}) {
  if (!(chokepointImpacts.length > 0)) return null;
  return (
    <section className="rounded-md border border-sky-500/35 bg-[#091321] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-sky-300">
          <Anchor size={13} weight="fill" className="text-sky-400" />
          <span>ĐIỂM NGHẼN EO BIỂN ↔ HÀNG HÓA &amp; CỔ PHIẾU</span>
        </h2>
        <span className="font-mono text-[11px] text-slate-400">AIS · ADS-B · Polymarket</span>
      </div>

      <div className="mt-2 space-y-1.5">
        {chokepointImpacts.slice(0, 4).map((cp) => {
          const statusCls =
            cp.status === 'critical'
              ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
              : cp.status === 'elevated'
                ? 'border-amber-500/45 bg-amber-500/18 text-amber-200'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
          return (
            <div
              key={cp.id}
              className="rounded border border-slate-800/95 bg-[#070d17] px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[11px] font-bold text-slate-100">
                    {cp.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onFlyToLocation(cp.lat, cp.lon, cp.zoom)}
                    title={`Bay tới ${cp.name} trên bản đồ`}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.1 font-mono text-[11px] text-sky-300 hover:bg-sky-500/25"
                  >
                    <Crosshair size={9} />
                    Bản đồ
                  </button>
                </div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.2 font-mono text-[11px] font-bold tabular-nums ${statusCls}`}
                >
                  {cp.statusLabel} · {cp.disruptionScore}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400 tabular-nums">
                <span>✈️ Quân sự: {cp.airCount}</span>
                <span>🚢 Tàu AIS: {cp.seaCount}</span>
                <span>🔥 Xung đột: {cp.conflictCount}</span>
                {cp.polymarketNote && (
                  <span className="font-semibold text-amber-300">{cp.polymarketNote}</span>
                )}
              </div>

              <div className="mt-1 text-[11px] leading-snug text-slate-300">
                • {cp.commodityImpact}
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-medium text-emerald-300">
                → {cp.vnStockImpact}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
