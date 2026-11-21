import { useState } from 'react';
import {
  BellSlash,
  Broadcast,
  Crosshair,
  Television,
  WarningOctagon,
  X,
} from '@phosphor-icons/react';
import type { BreakingAlertItem } from '@shared/types';

interface LiveAlertStackProps {
  alerts: BreakingAlertItem[];
  onDismiss: (id: string) => void;
  onMuteAll: () => void;
  onFlyTo: (lat: number, lon: number, zoom?: number) => void;
}

export function LiveAlertStack({ alerts, onDismiss, onMuteAll, onFlyTo }: LiveAlertStackProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-auto flex w-[310px] flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-md border p-2.5 shadow-2xl backdrop-blur-md transition ${
            alert.severity === 'critical'
              ? 'border-rose-500/55 bg-rose-950/90 text-rose-100'
              : 'border-amber-500/50 bg-[#141109]/92 text-amber-100'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider">
              <WarningOctagon size={13} weight="fill" className="animate-pulse" />
              {alert.badge}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onMuteAll}
                title="Tắt thông báo nổi"
                className="rounded p-0.5 opacity-70 hover:bg-black/30 hover:opacity-100"
              >
                <BellSlash size={12} />
              </button>
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                aria-label="Đóng cảnh báo"
                className="rounded p-0.5 opacity-70 hover:bg-black/30 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="mt-1 text-xs font-semibold leading-snug">{alert.title}</div>
          <div className="mt-0.5 truncate text-[10.5px] opacity-80">{alert.subtitle}</div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                onFlyTo(alert.lat, alert.lon, 6.2);
                onDismiss(alert.id);
              }}
              className="inline-flex items-center gap-1 rounded border border-white/25 bg-white/10 px-2 py-0.5 font-mono text-[10px] font-semibold hover:bg-white/20"
            >
              <Crosshair size={11} />
              Bay tới tâm điểm
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface LiveTvChannel {
  id: string;
  label: string;
  embedUrl: string;
}

const LIVE_TV_CHANNELS: readonly LiveTvChannel[] = [
  {
    id: 'sky',
    label: 'Sky News World',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1',
  },
  {
    id: 'dw',
    label: 'DW News Live',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1&mute=1',
  },
  {
    id: 'france24',
    label: 'France 24 EN',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1',
  },
  {
    id: 'aljazeera',
    label: 'Al Jazeera Live',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1',
  },
  {
    id: 'euronews',
    label: 'Euronews Live',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCSrZ3UV4jOidv8ppoVuvW9Q&autoplay=1&mute=1',
  },
];

export function LiveTvPipWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [channelId, setChannelId] = useState<string>('dw');

  if (!open) return null;
  const current = LIVE_TV_CHANNELS.find((c) => c.id === channelId) ?? LIVE_TV_CHANNELS[0];

  return (
    <div className="pointer-events-auto w-[336px] overflow-hidden rounded-md border border-cyan-500/40 bg-[#080d16]/96 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <Broadcast size={14} className="animate-pulse text-rose-400" />
          <span className="font-mono text-[10.5px] font-semibold text-slate-200">LIVE NEWS FEED</span>
        </div>
        <div className="flex items-center gap-1">
          {LIVE_TV_CHANNELS.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => setChannelId(ch.id)}
              className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] transition ${
                channelId === ch.id
                  ? 'bg-cyan-500/25 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {ch.label.split(' ')[0]}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng Live TV"
            className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="relative aspect-video w-full bg-black">
        <iframe
          key={current.id}
          src={current.embedUrl}
          title={current.label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
      <div className="flex items-center justify-between px-2.5 py-1 font-mono text-[9.5px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Television size={11} className="text-cyan-400" />
          {current.label}
        </span>
        <span>24/7 STREAM</span>
      </div>
    </div>
  );
}
