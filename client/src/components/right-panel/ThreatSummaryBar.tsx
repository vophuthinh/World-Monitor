import { Gauge, Translate } from '@phosphor-icons/react';
import type { GeoPointFeature } from '@shared/types';
import type { computeGlobalThreatLevel } from '@shared/intelligence';

export function ThreatSummaryBar({ globalThreat, military, vessels, cyberThreats, translateVi, onToggleTranslateVi }: {
  globalThreat: ReturnType<typeof computeGlobalThreatLevel>;
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  cyberThreats: GeoPointFeature[];
  translateVi: boolean;
  onToggleTranslateVi: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-fuchsia-500/30 bg-[#0d1524] px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
        <span
          title={globalThreat.summary}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-bold ${
            globalThreat.defcon <= 2
              ? 'border-rose-500/55 bg-rose-500/20 text-rose-200'
              : globalThreat.defcon === 3
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                : 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200'
          }`}
        >
          <Gauge size={11} weight="fill" />
          DEFCON {globalThreat.defcon} · {globalThreat.score}/100
        </span>
        <span className="text-slate-400">
          C2/APT <strong className="text-fuchsia-200">{cyberThreats.length}</strong> · MIL{' '}
          <strong className="text-cyan-300">{military.length}</strong> · AIS{' '}
          <strong className="text-emerald-300">{vessels.length}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={onToggleTranslateVi}
        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs font-semibold transition ${
          translateVi
            ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
            : 'border-slate-700 bg-slate-900 text-slate-400'
        }`}
      >
        <Translate size={11} weight="bold" />
        <span>{translateVi ? 'VI: BẬT' : 'VI: TẮT'}</span>
      </button>
    </div>
  );
}
