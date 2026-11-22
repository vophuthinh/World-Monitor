import { memo, useState } from 'react';
import {
  AirplaneTilt,
  Anchor,
  Atom,
  Bank,
  Boat,
  Broadcast,
  CaretLeft,
  CaretRight,
  CloudRain,
  Cpu,
  Fire,
  Pulse,
  RocketLaunch,
  ShareNetwork,
  ShieldWarning,
  SlidersHorizontal,
  Target,
} from '@phosphor-icons/react';
import type { MapLayerId, WeatherRadarSnapshot } from '@shared/types';
import type { LayerPresetId } from '../hooks/useMonitorData';

interface LayerControlDockProps {
  activeLayers: Record<MapLayerId, boolean>;
  layerCounts: Record<MapLayerId, number>;
  onToggleLayer: (id: MapLayerId) => void;
  onSetAllLayers: (enabled: boolean) => void;
  onApplyPreset?: (preset: LayerPresetId) => void;
  radarOpacity: number;
  onChangeRadarOpacity: (val: number) => void;
  weatherRadar: WeatherRadarSnapshot | null;
  aisStreamConfigured?: boolean;
}

const LAYER_META: ReadonlyArray<{
  id: MapLayerId;
  label: string;
  dotColor: string;
  Icon: typeof AirplaneTilt;
}> = [
  { id: 'military', label: 'Máy bay Quân sự', dotColor: 'bg-cyan-400', Icon: AirplaneTilt },
  { id: 'vessels', label: 'Tàu biển AIS Live', dotColor: 'bg-emerald-400', Icon: Boat },
  { id: 'cyberThreats', label: 'Đe dọa Mạng C2/APT', dotColor: 'bg-fuchsia-400', Icon: ShieldWarning },
  { id: 'cyberArcs', label: 'Tuyến Tấn công Mạng', dotColor: 'bg-pink-400', Icon: ShareNetwork },
  { id: 'gpsOutages', label: 'Nhiễu GPS & Sự cố BGP', dotColor: 'bg-amber-300', Icon: Broadcast },
  { id: 'earthquakes', label: 'Động đất USGS', dotColor: 'bg-rose-500', Icon: Pulse },
  { id: 'natural', label: 'Thiên tai & Điểm nhiệt', dotColor: 'bg-amber-400', Icon: Fire },
  { id: 'geopolitics', label: 'Điểm nóng GDELT', dotColor: 'bg-orange-500', Icon: Target },
  { id: 'militaryBases', label: 'Căn cứ QS & Vũ trụ', dotColor: 'bg-indigo-400', Icon: RocketLaunch },
  { id: 'aiDatacenters', label: 'AI DC · Fab · Đất hiếm', dotColor: 'bg-violet-400', Icon: Cpu },
  { id: 'chokepoints', label: 'Eo biển Chiến lược', dotColor: 'bg-sky-400', Icon: Anchor },
  { id: 'nuclear', label: 'Cơ sở Hạt nhân', dotColor: 'bg-yellow-400', Icon: Atom },
  { id: 'financeCenters', label: 'Sàn & Ngân hàng TW', dotColor: 'bg-emerald-400', Icon: Bank },
  { id: 'cables', label: 'Cáp quang Biển', dotColor: 'bg-teal-400', Icon: ShareNetwork },
  { id: 'weatherRadar', label: 'Radar Mưa/Bão', dotColor: 'bg-blue-400', Icon: CloudRain },
];

const MILITARY_ROLE_LEGEND = [
  { label: 'Bomber', color: '#f43f5e' },
  { label: 'VIP / Cmd', color: '#facc15' },
  { label: 'AWACS', color: '#22d3ee' },
  { label: 'Recon/UAV', color: '#fb923c' },
  { label: 'Fighter', color: '#38bdf8' },
  { label: 'Vessel AIS', color: '#34d399' },
];

export const LayerControlDock = memo(function LayerControlDock({
  activeLayers,
  layerCounts,
  onToggleLayer,
  onSetAllLayers,
  onApplyPreset,
  radarOpacity,
  onChangeRadarOpacity,
  weatherRadar,
  aisStreamConfigured,
}: LayerControlDockProps) {
  const [collapsed, setCollapsed] = useState(false);

  const totalCount = LAYER_META.length;
  const enabledCount = Object.values(activeLayers).filter(Boolean).length;

  if (collapsed) {
    return (
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#090f1a]/92 px-2.5 py-2 text-xs font-medium text-slate-200 shadow-xl backdrop-blur-md transition hover:border-cyan-500/40 hover:text-cyan-200"
        >
          <SlidersHorizontal size={15} className="text-cyan-400" />
          <span>
            Lớp bản đồ ({enabledCount}/{totalCount})
          </span>
          <CaretRight size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-[252px] rounded-md border border-slate-800/95 bg-[#090f1a]/92 p-2.5 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800/90 pb-2">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={14} className="text-cyan-400" />
          <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-200">
            TACTICAL LAYERS
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSetAllLayers(enabledCount < totalCount)}
            className="rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
          >
            {enabledCount < totalCount ? 'Tất cả' : 'Ẩn hết'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Thu gọn bảng lớp"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <CaretLeft size={13} />
          </button>
        </div>
      </div>

      {onApplyPreset && (
        <div className="mt-2 grid grid-cols-4 gap-1 border-b border-slate-800/80 pb-2 font-mono text-[9.5px]">
          <button
            type="button"
            onClick={() => onApplyPreset('clean')}
            title="Chế độ Tinh gọn (6 lớp cốt lõi — nhẹ & dễ quan sát)"
            className="rounded border border-emerald-500/40 bg-emerald-500/12 py-1 font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
          >
            Tinh gọn
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset('cyber')}
            title="Chế độ An ninh mạng (C2/APT + Tuyến Tấn công + Cáp quang + AI DC)"
            className="rounded border border-fuchsia-500/40 bg-fuchsia-500/12 py-1 font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/25"
          >
            Mạng
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset('military')}
            title="Chế độ Quân sự & Biển (Máy bay + Tàu AIS + Căn cứ + Hạt nhân)"
            className="rounded border border-cyan-500/40 bg-cyan-500/12 py-1 font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
          >
            Quân sự
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset('all')}
            title="Bật toàn bộ 14 lớp dữ liệu"
            className="rounded border border-slate-700 bg-slate-900 py-1 font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Tất cả
          </button>
        </div>
      )}

      <div className="mt-1.5 space-y-0.5">
        {LAYER_META.map(({ id, label, dotColor, Icon }) => {
          const active = activeLayers[id];
          const count = layerCounts[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggleLayer(id)}
              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition ${
                active
                  ? 'bg-slate-800/75 text-slate-100'
                  : 'text-slate-500 hover:bg-slate-900/70 hover:text-slate-300'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full transition ${
                    active ? dotColor : 'bg-slate-700'
                  }`}
                />
                <Icon size={14} className={active ? 'shrink-0 text-slate-300' : 'shrink-0 text-slate-600'} />
                <span className="truncate">{label}</span>
              </span>
              <span
                className={`ml-1.5 rounded px-1.5 py-0.2 font-mono text-[10px] tabular-nums ${
                  active ? 'bg-slate-900/90 text-slate-300' : 'text-slate-600'
                }`}
              >
                {id === 'weatherRadar' ? (weatherRadar ? 'LIVE' : '—') : count}
              </span>
            </button>
          );
        })}
      </div>

      {activeLayers.vessels &&
        (aisStreamConfigured ? (
          <div className="mt-1.5 flex items-center justify-between rounded border border-emerald-500/35 bg-emerald-950/35 px-2 py-1 font-mono text-[9.5px] text-emerald-300">
            <span>AISStream Biển Đông / Malacca</span>
            <span className="font-semibold text-emerald-200">LIVE WS</span>
          </div>
        ) : (
          <div className="mt-1.5 rounded border border-emerald-500/25 bg-emerald-950/30 px-2 py-1 font-mono text-[9.5px] text-emerald-300/90">
            Open AIS đang bật · Thêm <code className="text-emerald-200">AISSTREAM_API_KEY</code> vào{' '}
            <code className="text-emerald-200">.env</code> để mở thêm AIS Biển Đông/Hormuz.
          </div>
        ))}

      {activeLayers.weatherRadar && (
        <div className="mt-2 rounded border border-slate-800/80 bg-[#0d1524] px-2.5 py-2">
          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
            <span>ĐỘ ĐẬM RADAR MƯA</span>
            <span className="text-cyan-300 tabular-nums">{Math.round(radarOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.15}
            max={0.9}
            step={0.05}
            value={radarOpacity}
            onChange={(e) => onChangeRadarOpacity(Number(e.target.value))}
            className="mt-1.5 h-1 w-full cursor-pointer accent-cyan-400"
          />
          {weatherRadar && (
            <div className="mt-1 font-mono text-[9.5px] text-slate-500 tabular-nums">
              Frame RainViewer:{' '}
              {new Date(weatherRadar.frameTime * 1000).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
        </div>
      )}

      {activeLayers.military && (
        <div className="mt-2 border-t border-slate-800/90 pt-2">
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-slate-500">
            PHÂN NHÓM QUÂN SỰ &amp; HÀNG HẢI
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
            {MILITARY_ROLE_LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-[10.5px] text-slate-300">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
