import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  Crosshair,
  Lightning,
  MagnifyingGlass,
  Translate,
} from '@phosphor-icons/react';
import type { NewsItem, NewsStreamStats } from '@shared/types';
import { type NewsFilterId, formatRelativeTime, sourceBadgeStyle } from './shared';
import { safeHref } from '../../lib/safe-href';

export interface NewsJumpPayload {
  seq: number;
  query: string;
}

export interface NewsFirehoseTabProps {
  news: NewsItem[];
  newsStreamStats?: NewsStreamStats;
  freshNewsIds?: ReadonlySet<string>;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  translateVi: boolean;
  onToggleTranslateVi: () => void;
  jumpPayload: NewsJumpPayload | null;
}

const NewsFirehoseTab = memo(function NewsFirehoseTab({
  news,
  newsStreamStats,
  freshNewsIds,
  onFlyToLocation,
  translateVi,
  onToggleTranslateVi,
  jumpPayload,
}: NewsFirehoseTabProps) {
  const [newsFilter, setNewsFilter] = useState<NewsFilterId>('all');
  const [newsQuery, setNewsQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);

  const deferredNewsQuery = useDeferredValue(newsQuery);

  useEffect(() => {
    setVisibleLimit(25);
  }, [newsFilter, deferredNewsQuery]);

  useEffect(() => {
    if (!jumpPayload) return;
    setNewsFilter('all');
    setNewsQuery(jumpPayload.query);
  }, [jumpPayload?.seq, jumpPayload]);

  const bbcCount = useMemo(
    () => news.filter((n) => n.source.startsWith('BBC ')).length,
    [news],
  );

  const financeNewsCount = useMemo(
    () => news.filter((n) => n.category === 'finance').length,
    [news],
  );

  const filteredNews = useMemo(() => {
    const q = deferredNewsQuery.trim().toLowerCase();
    return news.filter((item) => {
      if (newsFilter === 'bbc') {
        if (!item.source.startsWith('BBC ')) return false;
      } else if (newsFilter !== 'all' && item.category !== newsFilter) {
        return false;
      }
      if (
        q &&
        !`${item.title} ${item.titleVi ?? ''} ${item.source} ${item.matchedLocation ?? ''}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [news, newsFilter, deferredNewsQuery]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-2 border-b border-slate-800/90 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-slate-800/90 bg-[#0d1524] px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                newsStreamStats?.wikimediaConnected
                  ? 'bg-purple-500/15 text-purple-300'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  newsStreamStats?.wikimediaConnected ? 'animate-pulse bg-purple-400' : 'bg-slate-500'
                }`}
              />
              Wiki {newsStreamStats?.wikimediaCount ?? 0}
            </span>

            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">
              GDELT {newsStreamStats?.gdeltCount ?? 0}
            </span>

            <span className="rounded bg-orange-600/20 px-1.5 py-0.5 text-orange-200">
              Reddit {newsStreamStats?.redditCount ?? 0}
            </span>

            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-200">
              Space {newsStreamStats?.snapiCount ?? 0}
            </span>

            <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-red-200">
              BBC {bbcCount}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleTranslateVi}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold transition ${
              translateVi
                ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Translate size={12} weight="bold" />
            <span>{translateVi ? 'Dịch VI: BẬT' : 'Dịch VI: TẮT'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'all', label: `Tất cả (${news.length})` },
              { id: 'bbc', label: `🔴 BBC World (${bbcCount})` },
              { id: 'osint_live', label: '⚡ Live OSINT' },
              { id: 'vietnam', label: 'Việt Nam' },
              { id: 'world', label: 'Thế giới & Quốc phòng' },
              { id: 'finance', label: `💹 Kinh tế & Tài chính (${financeNewsCount})` },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setNewsFilter(cat.id)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                newsFilter === cat.id
                  ? cat.id === 'bbc'
                    ? 'border border-red-500/55 bg-red-600/25 text-red-100'
                    : 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <MagnifyingGlass
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={newsQuery}
            onChange={(e) => setNewsQuery(e.target.value)}
            placeholder="Tìm BBC World, tin Tiếng Việt, OSINT hoặc địa danh..."
            aria-label="Tìm tin tức"
            className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
        {filteredNews.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Không có bản tin nào khớp điều kiện lọc.
          </div>
        ) : (
          <>
            {filteredNews.slice(0, visibleLimit).map((item) => {
              const isTranslated =
                Boolean(item.titleVi) && item.titleVi !== item.title && item.category !== 'vietnam';
              const headline = translateVi ? item.titleVi || item.title : item.title;
              const isFresh = freshNewsIds?.has(item.id) ?? false;

              return (
                <article
                  key={item.id}
                  className={`px-3 py-2.5 transition-colors duration-500 hover:bg-slate-900/65 ${
                    isFresh ? 'bg-cyan-500/12' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`truncate rounded px-1.5 py-0.2 font-semibold ${sourceBadgeStyle(item)}`}>
                        {item.source}
                      </span>
                      {item.isLiveStream && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-cyan-500/15 px-1 py-0.2 text-[11px] font-semibold text-cyan-300">
                          <Lightning size={9} weight="fill" />
                          LIVE
                        </span>
                      )}
                      {translateVi && isTranslated && (
                        <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.2 text-[11px] text-emerald-300">
                          VI
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-slate-500 tabular-nums">
                      {formatRelativeTime(item.publishedAt)}
                    </span>
                  </div>

                  <a
                    href={safeHref(item.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs font-medium leading-relaxed text-slate-100 hover:text-cyan-300"
                  >
                    {headline}
                  </a>

                  {translateVi && isTranslated && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500" title={item.title}>
                      Gốc: {item.title}
                    </p>
                  )}

                  <div className="mt-1.5 flex items-center justify-between">
                    {item.matchedLat !== undefined && item.matchedLon !== undefined ? (
                      <button
                        type="button"
                        onClick={() => onFlyToLocation(item.matchedLat!, item.matchedLon!, 5.5)}
                        className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-cyan-300 transition hover:bg-cyan-500/20 active:scale-[0.98]"
                      >
                        <Crosshair size={11} />
                        Bay tới: {item.matchedLocation}
                      </button>
                    ) : (
                      <span />
                    )}
                    <a
                      href={safeHref(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      Mở nguồn <ArrowSquareOut size={11} />
                    </a>
                  </div>
                </article>
              );
            })}
            {filteredNews.length > visibleLimit && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((v) => v + 40)}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  Xem thêm ({filteredNews.length - visibleLimit} tin còn lại)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default NewsFirehoseTab;
