import {
  ArrowsClockwise,
  ArrowSquareOut,
  Crosshair,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { formatRelativeTime } from './shared';
import type { CollectorId, GoogleTrendGeo, GoogleTrendsSnapshot } from '@shared/types';
import { safeHref } from '../../lib/safe-href';

export function GoogleTrendsSection({ activeGoogleTrends, googleTrends, trendGeo, setTrendGeo, translateVi, onFlyToLocation, onForceRefresh, refreshingIds }: {
  activeGoogleTrends: GoogleTrendsSnapshot['global'];
  googleTrends?: GoogleTrendsSnapshot;
  trendGeo: GoogleTrendGeo;
  setTrendGeo: (geo: GoogleTrendGeo) => void;
  translateVi: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  refreshingIds?: ReadonlySet<string>;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-slate-200">
          <MagnifyingGlass size={13} className="text-cyan-400" weight="bold" />
          <span>GOOGLE TRENDS REALTIME</span>
          <span className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/12 px-1.5 py-0.2 font-mono text-xs font-bold text-cyan-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            LIVE 60S
          </span>
        </h2>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTrendGeo('VN')}
            className={`rounded px-2 py-0.5 font-mono text-xs font-semibold transition ${
              trendGeo === 'VN'
                ? 'border border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            🇻🇳 Việt Nam ({googleTrends?.vn.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTrendGeo('GLOBAL')}
            className={`rounded px-2 py-0.5 font-mono text-xs font-semibold transition ${
              trendGeo === 'GLOBAL'
                ? 'border border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
                : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            🌍 Thế giới ({googleTrends?.global.length ?? 0})
          </button>
          {onForceRefresh && (
            <button
              type="button"
              onClick={() => onForceRefresh('google-trends')}
              title="Làm mới Google Trends ngay lập tức"
              className="inline-flex items-center rounded border border-slate-700/90 bg-slate-900 px-1.5 py-0.5 text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
            >
              <ArrowsClockwise
                size={10}
                className={refreshingIds?.has('google-trends') ? 'animate-spin text-cyan-300' : ''}
              />
            </button>
          )}
        </div>
      </div>

      <div className="mt-0.5 flex items-center justify-between font-mono text-xs text-slate-500">
        <span>Từ khóa người dùng tìm kiếm đột biến nhiều nhất trên Google</span>
        {googleTrends?.updatedAt ? (
          <span>Cập nhật {formatRelativeTime(googleTrends.updatedAt)}</span>
        ) : null}
      </div>

      {activeGoogleTrends.length === 0 ? (
        <div className="mt-1.5 rounded border border-slate-800/95 bg-[#0d1524] py-4 text-center text-[13px] text-slate-400">
          Đang kéo luồng xu hướng tìm kiếm trực tiếp từ Google Trends...
        </div>
      ) : (
        <div className="mt-1.5 max-h-[295px] divide-y divide-slate-800/80 overflow-y-auto rounded border border-cyan-500/25 bg-[#0d1524]">
          {activeGoogleTrends.slice(0, 10).map((tr, idx) => {
            const newsHeadline = translateVi
              ? tr.topNewsTitleVi || tr.topNewsTitle
              : tr.topNewsTitle;
            return (
              <div key={tr.id} className="px-2.5 py-2 transition hover:bg-[#111c30]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`inline-flex h-4 min-w-[20px] shrink-0 items-center justify-center rounded px-1 font-mono text-xs font-bold ${
                        idx === 0
                          ? 'border border-amber-400/50 bg-amber-500/25 text-amber-200'
                          : idx < 3
                            ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      #{tr.rank}
                    </span>
                    <a
                      href={safeHref(tr.topNewsUrl ?? tr.trendUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[13px] font-semibold text-slate-100 hover:text-cyan-300"
                    >
                      {tr.query}
                    </a>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
                    <span className="rounded border border-amber-500/35 bg-amber-500/12 px-1.5 py-0.2 font-semibold text-amber-300 tabular-nums">
                      🔥 {tr.approxTraffic}
                    </span>
                    <span className="text-slate-500">{formatRelativeTime(tr.publishedAt)}</span>
                  </div>
                </div>

                {newsHeadline && (
                  <a
                    href={safeHref(tr.topNewsUrl ?? tr.trendUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs leading-snug text-slate-300 hover:text-slate-100"
                  >
                    {tr.topNewsSource && (
                      <span className="mr-1.5 rounded bg-slate-800 px-1 py-0.2 font-mono text-xs text-slate-400">
                        {tr.topNewsSource}
                      </span>
                    )}
                    <span>{newsHeadline}</span>
                  </a>
                )}

                <div className="mt-1 flex items-center justify-between font-mono text-xs">
                  <a
                    href={safeHref(tr.trendUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-slate-400 hover:text-cyan-300"
                  >
                    Google Trends <ArrowSquareOut size={10} />
                  </a>
                  {tr.matchedLat !== undefined && tr.matchedLon !== undefined && (
                    <button
                      type="button"
                      onClick={() => onFlyToLocation(tr.matchedLat!, tr.matchedLon!, 5.5)}
                      className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                    >
                      <Crosshair size={10} />
                      Bay tới: {tr.matchedLocation}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
