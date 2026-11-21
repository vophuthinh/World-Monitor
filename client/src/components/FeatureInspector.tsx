import {
  ArrowSquareOut,
  Crosshair,
  GlobeHemisphereEast,
  ShareNetwork,
  WarningDiamond,
  X,
} from '@phosphor-icons/react';
import type { InspectableFeature, SeverityLevel } from '@shared/types';

interface FeatureInspectorProps {
  selected: InspectableFeature | null;
  onClose: () => void;
  onFlyTo: (lat: number, lon: number, zoom?: number) => void;
}

const SEVERITY_BADGE: Record<SeverityLevel, { label: string; className: string }> = {
  critical: {
    label: 'CRITICAL',
    className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  high: {
    label: 'HIGH',
    className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  medium: {
    label: 'ELEVATED',
    className: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  low: {
    label: 'LOW / ROUTINE',
    className: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  },
  info: {
    label: 'STRATEGIC',
    className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35',
  },
};

const LAYER_LABELS: Record<string, string> = {
  military: 'MÁY BAY QUÂN SỰ',
  vessels: 'TÀU BIỂN HÀNG HẢI AIS',
  earthquakes: 'ĐỘNG ĐẤT ĐỊA CHẤN',
  natural: 'THIÊN TAI / KHÍ TƯỢNG',
  geopolitics: 'ĐỊA CHÍNH TRỊ GDELT',
  chokepoints: 'EO BIỂN CHIẾN LƯỢC',
  nuclear: 'CƠ SỞ HẠT NHÂN',
  financeCenters: 'TRUNG TÂM TÀI CHÍNH',
  cables: 'CÁP QUANG BIỂN',
};

function formatMetaLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
}

function formatMetaValue(val: string | number | boolean | null): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'CÓ' : 'KHÔNG';
  if (typeof val === 'number') return val.toLocaleString('en-US');
  return String(val);
}

export function FeatureInspector({ selected, onClose, onFlyTo }: FeatureInspectorProps) {
  if (!selected) return null;

  if (selected.kind === 'cable') {
    const cable = selected.feature;
    const anchor = cable.landingPoints[0];
    const sev = SEVERITY_BADGE[cable.severity];

    return (
      <aside className="pointer-events-auto w-[340px] max-w-[calc(100vw-24px)] rounded-md border border-cyan-500/30 bg-[#090f1a]/95 p-3.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-2 border-b border-slate-800/90 pb-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                <ShareNetwork size={12} weight="bold" />
                {LAYER_LABELS.cables}
              </span>
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${sev.className}`}>
                {cable.vietnamConnected ? 'KẾT NỐI VN' : sev.label}
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-semibold leading-snug text-slate-100">{cable.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-2.5 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 rounded border border-slate-800/80 bg-[#0d1524] p-2 font-mono">
            <div>
              <div className="text-[10px] text-slate-400">NĂM VẬN HÀNH</div>
              <div className="mt-0.5 font-semibold text-slate-100 tabular-nums">{cable.rfsYear ?? '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">TRẠM CẬP BỜ</div>
              <div className="mt-0.5 font-semibold text-slate-100 tabular-nums">{cable.landingPoints.length} trạm</div>
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">CÁC ĐIỂM CẬP BỜ CHÍNH</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {cable.landingPoints.map((lp) => (
                <button
                  key={`${lp.city}-${lp.country}`}
                  type="button"
                  onClick={() => onFlyTo(lp.lat, lp.lon, 6.2)}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[11px] transition ${
                    lp.country === 'VN'
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      : 'border-slate-700/80 bg-slate-800/70 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200'
                  }`}
                >
                  {lp.city} ({lp.country})
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">ĐƠN VỊ SỞ HỮU / KHAI THÁC</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{cable.owners.join(', ')}</p>
          </div>
        </div>

        {anchor && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/90 pt-2.5">
            <span className="font-mono text-[10px] text-slate-400">{cable.source}</span>
            <button
              type="button"
              onClick={() => onFlyTo(anchor.lat, anchor.lon, 5.2)}
              className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25 active:scale-[0.98]"
            >
              <Crosshair size={13} />
              Phóng tới tuyến
            </button>
          </div>
        )}
      </aside>
    );
  }

  const pt = selected.feature;
  const sev = SEVERITY_BADGE[pt.severity];
  const entries = Object.entries(pt.meta).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <aside className="pointer-events-auto w-[350px] max-w-[calc(100vw-24px)] rounded-md border border-cyan-500/30 bg-[#090f1a]/95 p-3.5 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800/90 pb-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-200">
              <GlobeHemisphereEast size={12} />
              {LAYER_LABELS[pt.layer] ?? pt.layer.toUpperCase()}
            </span>
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${sev.className}`}>
              {pt.severity === 'critical' && <WarningDiamond size={11} weight="fill" />}
              {sev.label}
            </span>
          </div>
          <h3 className="mt-1.5 break-words text-sm font-semibold leading-snug text-slate-100">{pt.title}</h3>
          {pt.subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{pt.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng chi tiết"
          className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-between rounded border border-slate-800/90 bg-[#0d1524] px-2.5 py-1.5 font-mono text-[11px] tabular-nums">
        <span className="text-slate-400">
          LAT <strong className="text-cyan-300">{pt.lat.toFixed(4)}°</strong> · LON{' '}
          <strong className="text-cyan-300">{pt.lon.toFixed(4)}°</strong>
        </span>
        {pt.timestamp > 0 && (
          <span className="text-slate-400">
            {new Date(pt.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {entries.length > 0 && (
        <dl className="mt-2.5 grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="rounded border border-slate-800/70 bg-slate-900/65 px-2 py-1.5">
              <dt className="truncate font-mono text-[9.5px] text-slate-400">{formatMetaLabel(k)}</dt>
              <dd className="mt-0.5 break-words font-mono text-[11px] font-medium text-slate-100 tabular-nums">
                {formatMetaValue(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/90 pt-2.5">
        <span className="truncate font-mono text-[10px] text-slate-400" title={pt.source}>
          {pt.source}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onFlyTo(pt.lat, pt.lon, 6.8)}
            className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25 active:scale-[0.98]"
          >
            <Crosshair size={13} />
            Tâm điểm
          </button>
          {pt.url && (
            <a
              href={pt.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Nguồn
              <ArrowSquareOut size={13} />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
