import { CrossCheckNotice } from './CrossCheckNotice';
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Crosshair,
  FilePdf,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import type {
  CollectorId,
  HptCompanyIntelSnapshot,
  HptItemCategory,
  HptSentiment,
} from '@shared/types';
import { MiniSparkline, formatRelativeTime, renderInlineMarkdown } from './shared';
import { safeHref } from '../../lib/safe-href';

export interface HptCorporateTabProps {
  hptIntel?: HptCompanyIntelSnapshot;
  sourceStale?: boolean;
  sentimentStats: { pos: number; neg: number; neu: number; total: number };
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
}

const HptCorporateTab = memo(function HptCorporateTab({
  hptIntel,
  sourceStale,
  sentimentStats,
  refreshingIds,
  onForceRefresh,
  onFlyToLocation,
}: HptCorporateTabProps) {
  const [hptFilter, setHptFilter] = useState<'all' | 'filings' | 'negative' | HptItemCategory>('all');
  const [hptQuery, setHptQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);

  const deferredHptQuery = useDeferredValue(hptQuery);

  useEffect(() => {
    setVisibleLimit(25);
  }, [hptFilter, deferredHptQuery]);

  const filteredHptItems = useMemo(() => {
    const list = hptIntel?.items ?? [];
    const q = deferredHptQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (hptFilter === 'filings' && item.category !== 'exchange_filing') return false;
      if (hptFilter === 'negative' && item.sentiment !== 'negative') return false;
      if (
        hptFilter !== 'all' &&
        hptFilter !== 'filings' &&
        hptFilter !== 'negative' &&
        item.category !== hptFilter
      ) {
        return false;
      }
      if (
        q &&
        !`${item.title} ${item.aiSummary ?? ''} ${item.source} ${item.badge}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [hptIntel?.items, hptFilter, deferredHptQuery]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-slate-800/90 bg-[#08101d] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="rounded border border-emerald-400/55 bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-200">
              HPT · UPCoM
            </span>
            <h2 className="truncate text-xs font-semibold tracking-wide text-slate-100">
              Tin về HPT
            </h2>
            <span className="hidden font-mono text-[11px] text-slate-500 sm:inline">
              MST 0301447436
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {hptIntel?.stock && (
              <button
                type="button"
                onClick={() => onFlyToLocation(hptIntel.stock!.hqLat, hptIntel.stock!.hqLon, 12.5)}
                title="Bay tới Trụ sở HPT tại Khu Công nghệ cao TP.HCM (SHTP)"
                className="inline-flex items-center gap-0.5 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-300 hover:bg-cyan-500/20"
              >
                <Crosshair size={10} />
                SHTP
              </button>
            )}
            {onForceRefresh && (
              <button
                type="button"
                onClick={() => onForceRefresh('hpt-intel')}
                title="Quét mới Đấu thầu, CBTT HNX/UBCKNN, Simplize, Báo chí & Diễn đàn về HPT"
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
              >
                <ArrowsClockwise
                  size={10}
                  className={refreshingIds?.has('hpt-intel') ? 'animate-spin text-emerald-300' : ''}
                />
                <span>Làm mới</span>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5 rounded border border-slate-800/90 bg-[#0d1729] px-2.5 py-2 font-mono">
          {(sourceStale || hptIntel?.stockRetained || hptIntel?.itemsRetained) && (
            <div className="text-[11px] text-amber-300" role="status">
              {sourceStale ? '⟳ Nguồn HPT lỗi; dữ liệu có thể đã cũ' : `⟳ Giữ lại dữ liệu cũ: ${[
                hptIntel?.stockRetained && 'giá HPT',
                hptIntel?.itemsRetained && 'tin HPT',
              ].filter(Boolean).join(', ')}`}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {hptIntel?.stock ? (
              <div className="flex items-center gap-2.5">
                <div>
                  <div className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-sm font-bold text-slate-100">
                      {(hptIntel.stock.priceThousandVnd * 1000).toLocaleString('en-US')}₫
                    </span>
                    {hptIntel.stock.priceKind === 'reference' && <span className="text-amber-300">Giá tham chiếu</span>}
                    <span
                      className={`text-[11px] font-semibold ${
                        (hptIntel.stock.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {hptIntel.stock.changePercent === undefined ? '—' : `${hptIntel.stock.changePercent >= 0 ? '+' : ''}${hptIntel.stock.changePercent.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    KL: {hptIntel.stock.volume === undefined ? '—' : `${(hptIntel.stock.volume * 100).toLocaleString('en-US')} cp`}
                    {hptIntel.stock.fundamentals?.ceilingThousandVnd
                      ? ` · Trần ${hptIntel.stock.fundamentals.ceilingThousandVnd} / Sàn ${hptIntel.stock.fundamentals.floorThousandVnd}`
                      : ' · Sàn HNX/UPCoM'}
                  </div>
                </div>
                <MiniSparkline
                  values={hptIntel.stock.sparkline}
                  positive={(hptIntel.stock.changePercent ?? 0) >= 0}
                />
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">Mã HPT (UPCoM)</span>
            )}

            <div className="text-right text-[11px]">
              <div className="font-semibold text-emerald-300">
                {hptIntel?.aiSentimentEnabled ? '🤖 AI PHÂN TÍCH TÍN HIỆU' : 'TỔNG HỢP ĐA NGUỒN'}
              </div>
              <div className="mt-0.5 text-slate-400 tabular-nums">
                🟢 {sentimentStats.pos} · ⚪ {sentimentStats.neu} · 🔴 {sentimentStats.neg}
              </div>
            </div>
          </div>

          {hptIntel?.stock?.fundamentals && (
            <div className="grid grid-cols-4 gap-1 border-t border-slate-800/85 pt-1.5 text-[11px] tabular-nums">
              <div>
                <span className="text-slate-500">P/E </span>
                <strong className="text-cyan-300">
                  {hptIntel.stock.fundamentals.peRatio?.toFixed(2) ?? '—'}x
                </strong>
              </div>
              <div>
                <span className="text-slate-500">P/B </span>
                <strong className="text-emerald-300">
                  {hptIntel.stock.fundamentals.pbRatio?.toFixed(2) ?? '—'}x
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Vốn hóa </span>
                <strong className="text-slate-200">
                  {hptIntel.stock.fundamentals.marketCapBillionVnd
                    ? `${hptIntel.stock.fundamentals.marketCapBillionVnd}tỷ`
                    : '—'}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500">YTD </span>
                <strong
                  className={
                    hptIntel.stock.fundamentals.ytdChangePct === undefined
                      ? 'text-slate-400'
                      : hptIntel.stock.fundamentals.ytdChangePct >= 0
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                  }
                >
                  {hptIntel.stock.fundamentals.ytdChangePct === undefined
                    ? '—'
                    : `${hptIntel.stock.fundamentals.ytdChangePct >= 0 ? '+' : ''}${hptIntel.stock.fundamentals.ytdChangePct}%`}
                </strong>
              </div>
            </div>
          )}

          {hptIntel?.stock?.fundamentals && (
            <div>
              <p className="text-[11px] text-slate-400">P/E, P/B, vốn hóa, YTD: nguồn Simplize.</p>
              <CrossCheckNotice checks={hptIntel.stock.crossChecks} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 border-t border-slate-800/80 pt-1.5 text-[11px]">
            <span className="text-slate-500">Tra cứu gốc:</span>
            {[
              { label: 'MuaSắmCông (Thầu)', href: 'https://muasamcong.mpi.gov.vn/' },
              { label: 'Simplize HPT', href: 'https://simplize.vn/co-phieu/HPT' },
              { label: 'Thuế GDT', href: 'https://tracuunnt.gdt.gov.vn/' },
              { label: 'ĐKKD', href: 'https://dangkykinhdoanh.gov.vn/' },
              { label: 'Bản án Tòa án', href: 'https://congbobanan.toaan.gov.vn/' },
              { label: 'SHTT WIPO', href: 'http://wipopublish.ipvietnam.gov.vn/' },
            ].map((ext) => (
              <a
                key={ext.label}
                href={safeHref(ext.href)}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-700/90 bg-slate-900/90 px-1.5 py-0.2 text-slate-300 transition hover:border-emerald-400/50 hover:text-emerald-200"
              >
                {ext.label} ↗
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'all', label: `Tất cả (${hptIntel?.items.length ?? 0})` },
              { id: 'filings', label: '📜 CBTT & Cổ đông' },
              { id: 'bidding_project', label: '🏗️ Đấu thầu & Dự án' },
              { id: 'it_press_partner', label: '🤝 Báo CNTT · Đối tác' },
              { id: 'press_social', label: '🌐 Báo Mới · Reddit · YT · Diễn đàn' },
              ...(sentimentStats.neg > 0
                ? [{ id: 'negative' as const, label: `🚨 Tiêu cực (${sentimentStats.neg})` }]
                : []),
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHptFilter(tab.id)}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                hptFilter === tab.id
                  ? 'border-emerald-400/55 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
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
            value={hptQuery}
            onChange={(e) => setHptQuery(e.target.value)}
            placeholder="Tìm nhanh cổ tức, đấu thầu, đối tác Microsoft, HSOC, Reddit..."
            aria-label="Tìm tin tức về HPT"
            className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto bg-[#080f1c]">
        {filteredHptItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            {!hptIntel || hptIntel.items.length === 0
              ? 'Đang thu thập thông tin CBTT, đấu thầu, báo chí & diễn đàn về HPT...'
              : 'Không có bài viết nào khớp điều kiện lọc.'}
          </div>
        ) : (
          <>
            {filteredHptItems.slice(0, visibleLimit).map((item) => {
              const sentBadge: Record<HptSentiment, { text: string; cls: string }> = {
                positive: {
                  text: 'TÍCH CỰC',
                  cls: 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300',
                },
                neutral: {
                  text: 'TRUNG LẬP',
                  cls: 'border-slate-700 bg-slate-800/90 text-slate-300',
                },
                negative: {
                  text: 'TIÊU CỰC',
                  cls: 'border-rose-500/45 bg-rose-500/15 text-rose-300',
                },
              };
              const sb = sentBadge[item.sentiment];
              return (
                <article
                  key={item.id}
                  className="perf-card px-3 py-2.5 transition hover:bg-[#0f1a2e]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[11px]">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded border px-1.5 py-0.2 font-bold ${
                          item.category === 'exchange_filing'
                            ? 'border-amber-400/50 bg-amber-500/18 text-amber-200'
                            : item.category === 'bidding_project'
                              ? 'border-emerald-400/50 bg-emerald-500/18 text-emerald-200'
                              : item.category === 'it_press_partner'
                                ? 'border-violet-500/45 bg-violet-500/15 text-violet-200'
                                : 'border-slate-700 bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                      <span className={`rounded border px-1 py-0.2 font-semibold ${sb.cls}`}>
                        {sb.text}
                      </span>
                    </div>
                    <span className="text-slate-500 tabular-nums">
                      {item.dateLabel ?? formatRelativeTime(item.publishedAt)}
                    </span>
                  </div>

                  <a
                    href={safeHref(item.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 block text-xs font-semibold leading-relaxed text-slate-100 hover:text-emerald-300"
                  >
                    {item.title}
                  </a>

                  {item.aiSummary && (
                    <p className="mt-1.5 rounded border border-slate-800/80 bg-[#0b1424] px-2.5 py-1.5 text-[11px] leading-snug text-emerald-200/90">
                      🤖 {renderInlineMarkdown(item.aiSummary)}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px]">
                    <span className="truncate text-slate-400">{item.source}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.pdfUrl && (
                        <a
                          href={safeHref(item.pdfUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 rounded border border-rose-500/45 bg-rose-600/20 px-1.5 py-0.2 font-semibold text-rose-200 hover:bg-rose-600/35"
                        >
                          <FilePdf size={11} weight="fill" />
                          PDF gốc
                        </a>
                      )}
                      <a
                        href={safeHref(item.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-slate-400 hover:text-emerald-200"
                      >
                        Chi tiết <ArrowSquareOut size={10} />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
            {filteredHptItems.length > visibleLimit && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((v) => v + 40)}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-300 transition hover:border-emerald-400 hover:text-emerald-200"
                >
                  Xem thêm ({filteredHptItems.length - visibleLimit} bài còn lại)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default HptCorporateTab;
