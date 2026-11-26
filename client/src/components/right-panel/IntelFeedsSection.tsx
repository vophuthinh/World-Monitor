import { ArrowSquareOut, Crosshair, MagnifyingGlass } from '@phosphor-icons/react';
import { INTEL_TOPIC_TABS, formatRelativeTime } from './shared';
import type { GeoPointFeature } from '@shared/types';
import type { IntelTopicId, classifyLiveIntelTopics } from '@shared/intelligence';
import { safeHref } from '../../lib/safe-href';

export function IntelFeedsSection({ cyberThreats, intelTopic, setIntelTopic, intelTopicBuckets, translateVi, onFlyToLocation, onJumpToTechCyber }: {
  cyberThreats: GeoPointFeature[];
  intelTopic: IntelTopicId | 'c2_ioc';
  setIntelTopic: (topic: IntelTopicId | 'c2_ioc') => void;
  intelTopicBuckets: ReturnType<typeof classifyLiveIntelTopics>;
  translateVi: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  onJumpToTechCyber: (opts: { query?: string; scanIoc?: string }) => void;
}) {
  return (
    <section>
      <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
        LIVE INTELLIGENCE STREAMS &amp; CYBER IOCs
      </h2>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {INTEL_TOPIC_TABS.map((tab) => {
          const count =
            tab.id === 'c2_ioc' ? cyberThreats.length : intelTopicBuckets[tab.id].length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setIntelTopic(tab.id)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                intelTopic === tab.id
                  ? 'border border-fuchsia-500/50 bg-fuchsia-500/20 text-fuchsia-200'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="mt-2 max-h-[300px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-slate-800/95 bg-[#0d1524]">
        {intelTopic === 'c2_ioc' ? (
          cyberThreats.slice(0, 35).map((ioc) => (
            <div key={ioc.id} className="px-2.5 py-2 transition hover:bg-slate-900/70">
              <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span
                  className={`rounded border px-1.5 py-0.2 font-semibold ${
                    ioc.category === 'apt_group'
                      ? 'border-rose-500/45 bg-rose-500/20 text-rose-200'
                      : 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300'
                  }`}
                >
                  {ioc.category === 'apt_group' ? 'APT ACTOR' : ioc.source}
                </span>
                <span className="text-slate-400">{String(ioc.meta.country ?? '')}</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-100">{ioc.title}</div>
              {ioc.subtitle && (
                <div className="mt-0.5 text-[11px] text-slate-400">{ioc.subtitle}</div>
              )}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onFlyToLocation(ioc.lat, ioc.lon, 6.0)}
                    className="inline-flex items-center gap-1 rounded border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-0.5 font-mono text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/20"
                  >
                    <Crosshair size={10} />
                    Định vị C2
                  </button>
                  {typeof ioc.meta.ipAddress === 'string' && (
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToTechCyber({ scanIoc: String(ioc.meta.ipAddress) })
                      }
                      className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                    >
                      <MagnifyingGlass size={10} />
                      Quét Shodan
                    </button>
                  )}
                </div>
                {ioc.url && (
                  <a
                    href={safeHref(ioc.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    Hồ sơ IOC <ArrowSquareOut size={10} />
                  </a>
                )}
              </div>
            </div>
          ))
        ) : intelTopicBuckets[intelTopic].length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Đang quét tín hiệu OSINT cho chủ đề này...
          </div>
        ) : (
          intelTopicBuckets[intelTopic].slice(0, 18).map((item) => {
            const headline = translateVi ? item.titleVi || item.title : item.title;
            return (
              <div key={item.id} className="px-2.5 py-2 transition hover:bg-slate-900/70">
                <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate rounded bg-slate-800 px-1.5 py-0.2 font-semibold text-slate-300">
                      {item.source}
                    </span>
                    {item.cveId && (
                      <span className="shrink-0 rounded border border-rose-500/45 bg-rose-500/20 px-1 py-0.2 font-bold text-rose-200">
                        {item.cveId}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-slate-500">
                    {formatRelativeTime(item.publishedAt)}
                  </span>
                </div>
                <a
                  href={safeHref(item.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-xs font-medium leading-snug text-slate-100 hover:text-fuchsia-300"
                >
                  {headline}
                </a>
                {item.matchedLat !== undefined && item.matchedLon !== undefined && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => onFlyToLocation(item.matchedLat!, item.matchedLon!, 5.5)}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-300 hover:underline"
                    >
                      <Crosshair size={10} />
                      Bay tới: {item.matchedLocation}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
