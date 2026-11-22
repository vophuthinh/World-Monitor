import { POSTURE_BADGE } from './shared';
import type { computeTheaterPostures } from '@shared/intelligence';

export function TheaterPostureSection({ theaterPostures, onFlyToLocation }: {
  theaterPostures: ReturnType<typeof computeTheaterPostures>;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-300">
          STRATEGIC THEATER POSTURE (TÁC CHIẾN TRỰC TIẾP)
        </h2>
        <span className="font-mono text-[9.5px] text-slate-500">Bấm để bay tới</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {theaterPostures.map((th) => (
          <button
            key={th.id}
            type="button"
            onClick={() => onFlyToLocation(th.lat, th.lon, th.zoom)}
            className="rounded border border-slate-800/95 bg-[#0d1524] p-2 text-left transition hover:border-cyan-500/45 hover:bg-[#111c30]"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-semibold text-slate-100">{th.name}</span>
              <span
                className={`shrink-0 rounded border px-1 py-0.2 font-mono text-[8.5px] font-bold ${POSTURE_BADGE[th.posture]}`}
              >
                {th.posture}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-slate-400 tabular-nums">
              <span>AIR {th.airCount}</span>
              <span>SEA {th.seaCount}</span>
              <span>GEO {th.conflictCount}</span>
              <span className="text-fuchsia-300">CYB {th.cyberCount}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
