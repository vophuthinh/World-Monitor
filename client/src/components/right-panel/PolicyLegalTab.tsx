import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  FilePdf,
  MagnifyingGlass,
  Sparkle,
} from '@phosphor-icons/react';
import type {
  CollectorId,
  LegalDocType,
  PolicyLegalItem,
  PolicyLegalSnapshot,
} from '@shared/types';
import { formatRelativeTime, legalBadgeStyle, renderInlineMarkdown } from './shared';
import { safeHref } from '../../lib/safe-href';

export interface PolicyLegalTabProps {
  policyLegal?: PolicyLegalSnapshot;
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
}

const PolicyLegalTab = memo(function PolicyLegalTab({
  policyLegal,
  refreshingIds,
  onForceRefresh,
}: PolicyLegalTabProps) {
  const [legalFilter, setLegalFilter] = useState<'all' | 'most' | 'ai_only' | LegalDocType>('all');
  const [legalPillar, setLegalPillar] = useState<'57' | '59' | '66' | '68' | null>(null);
  const [legalQuery, setLegalQuery] = useState('');
  const [onDemandPolicyAi, setOnDemandPolicyAi] = useState<Record<string, string[]>>({});
  const [policyAiLoadingIds, setPolicyAiLoadingIds] = useState<Set<string>>(new Set());
  const [visibleLimit, setVisibleLimit] = useState(25);

  const deferredLegalQuery = useDeferredValue(legalQuery);

  useEffect(() => {
    setVisibleLimit(25);
  }, [legalFilter, legalPillar, deferredLegalQuery]);

  const requestPolicyAiSummary = useCallback(async (doc: PolicyLegalItem) => {
    setPolicyAiLoadingIds((prev) => new Set(prev).add(doc.id));
    try {
      const resp = await fetch('/api/policy-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: doc.id,
          title: doc.title,
          docCode: doc.docCode,
          sector: doc.sector,
          source: doc.source,
        }),
      });
      if (resp.ok) {
        const j = (await resp.json()) as { highlights?: string[] };
        if (j.highlights && j.highlights.length >= 2) {
          setOnDemandPolicyAi((prev) => ({ ...prev, [doc.id]: j.highlights! }));
        }
      }
    } catch {
      // Ignore transient AI error
    } finally {
      setPolicyAiLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  }, []);

  const policyItems = policyLegal?.items ?? [];

  const mostPolicyCount = useMemo(
    () => policyItems.filter((d) => d.isMost).length,
    [policyItems],
  );

  const pillarCounts = useMemo(() => {
    const counts = { '57': 0, '59': 0, '66': 0, '68': 0 };
    for (const d of policyItems) {
      if (d.pillarResolution) counts[d.pillarResolution] += 1;
    }
    return counts;
  }, [policyItems]);

  const aiSummarizedPolicyCount = useMemo(
    () => policyItems.filter((d) => d.aiSummarized || Boolean(onDemandPolicyAi[d.id])).length,
    [policyItems, onDemandPolicyAi],
  );

  const filteredPolicy = useMemo(() => {
    const q = deferredLegalQuery.trim().toLowerCase();
    return policyItems.filter((doc) => {
      if (legalPillar && doc.pillarResolution !== legalPillar) return false;
      if (legalFilter === 'most') {
        if (!doc.isMost) return false;
      } else if (legalFilter === 'ai_only') {
        if (!doc.aiSummarized && !onDemandPolicyAi[doc.id]) return false;
      } else if (legalFilter !== 'all' && doc.docType !== legalFilter) {
        return false;
      }
      if (
        q &&
        !`${doc.title} ${doc.docCode ?? ''} ${doc.typeBadge} ${doc.sector} ${doc.source}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [policyItems, legalFilter, legalPillar, deferredLegalQuery, onDemandPolicyAi]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-2 border-b border-slate-800/90 p-2.5">
        <div className="flex items-center justify-between gap-2 rounded border border-amber-500/30 bg-[#0d1524] px-2.5 py-1.5 font-mono text-[11px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              POLICY &amp; LEGAL RADAR
            </span>
            <span className="truncate text-slate-400">
              {policyLegal?.activeSourceCount ?? 18} nguồn Chính phủ · Bộ KH&amp;CN · Bộ tứ NQ
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {(aiSummarizedPolicyCount > 0 || legalFilter === 'ai_only') && (
              <button
                type="button"
                onClick={() =>
                  setLegalFilter((prev) => (prev === 'ai_only' ? 'all' : 'ai_only'))
                }
                title="Lọc các văn bản bạn đã bấm tóm tắt AI"
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold transition ${
                  legalFilter === 'ai_only'
                    ? 'border-emerald-400 bg-emerald-500/30 text-emerald-100'
                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                }`}
              >
                <Sparkle size={10} weight="fill" />
                <span>Đã tóm tắt ({aiSummarizedPolicyCount})</span>
              </button>
            )}
            {onForceRefresh && (
              <button
                type="button"
                onClick={() => onForceRefresh('policy-legal')}
                title="Làm mới Chính sách & Văn bản Bộ KH&CN"
                className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-amber-400/50 hover:text-amber-200"
              >
                <ArrowsClockwise
                  size={10}
                  className={refreshingIds?.has('policy-legal') ? 'animate-spin text-amber-300' : ''}
                />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'all', label: `Tất cả (${policyItems.length})` },
              { id: 'most', label: `🔬 Bộ KH&CN (${mostPolicyCount})` },
              { id: 'nq_tw_cp', label: '⭐ Nghị quyết (57·59·66·68)' },
              { id: 'nghi_dinh', label: '📜 Nghị định (NĐ-CP)' },
              { id: 'luat_qh', label: '⚖️ Luật / QH' },
              { id: 'quyet_dinh_tt', label: '📋 QĐ / Thông tư' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setLegalFilter(cat.id);
                if (cat.id === 'all') setLegalPillar(null);
              }}
              className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                legalFilter === cat.id
                  ? cat.id === 'most'
                    ? 'border border-violet-400/55 bg-violet-500/20 text-violet-200'
                    : 'border border-amber-500/50 bg-amber-500/20 text-amber-200'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
          <span className="text-slate-500">Bộ tứ NQ:</span>
          {(
            [
              { id: '57', label: `NQ 57 · KHCN (${pillarCounts['57']})` },
              { id: '59', label: `NQ 59 · Hội nhập (${pillarCounts['59']})` },
              { id: '66', label: `NQ 66 · Pháp luật (${pillarCounts['66']})` },
              { id: '68', label: `NQ 68 · KT tư nhân (${pillarCounts['68']})` },
            ] as const
          ).map((pil) => (
            <button
              key={pil.id}
              type="button"
              onClick={() => {
                setLegalFilter('all');
                setLegalPillar((prev) => (prev === pil.id ? null : pil.id));
              }}
              className={`rounded border px-1.5 py-0.5 font-semibold transition ${
                legalPillar === pil.id
                  ? 'border-amber-400/70 bg-red-600/25 text-amber-200'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-amber-500/40 hover:text-amber-200'
              }`}
            >
              {pil.label}
            </button>
          ))}
          {['TT-BKHCN', 'NĐ-CP', 'Chuyển đổi số', 'Thuế', 'Đất đai'].map((kw) => (
            <button
              key={kw}
              type="button"
              onClick={() => {
                setLegalPillar(null);
                setLegalQuery((prev) => (prev === kw ? '' : kw));
              }}
              className={`rounded border px-1.5 py-0.5 transition ${
                legalQuery === kw
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {kw}
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
            value={legalQuery}
            onChange={(e) => setLegalQuery(e.target.value)}
            placeholder="Tìm NQ 57, NQ 59, NQ 66, NQ 68, TT-BKHCN, Bộ Khoa học & Công nghệ..."
            aria-label="Tìm văn bản pháp luật"
            className="w-full rounded border border-slate-800 bg-[#0d1524] py-1 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
        {filteredPolicy.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            {policyItems.length === 0
              ? 'Đang đồng bộ Công báo điện tử, Bộ KH&CN (mst.gov.vn) & Bộ tứ Nghị quyết 57·59·66·68...'
              : 'Không có văn bản nào khớp điều kiện lọc.'}
          </div>
        ) : (
          <>
            {filteredPolicy.slice(0, visibleLimit).map((doc) => {
              const aiBullets =
                onDemandPolicyAi[doc.id] ?? (doc.aiSummarized ? doc.highlights : null);
              const isSummarizing = policyAiLoadingIds.has(doc.id);

              return (
                <article
                  key={doc.id}
                  className="perf-card px-3 py-2.5 transition hover:bg-slate-900/65"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className={`shrink-0 rounded px-1.5 py-0.2 font-bold ${legalBadgeStyle(doc)}`}>
                        {doc.typeBadge}
                      </span>
                      {doc.docCode && (
                        <span className="shrink-0 rounded border border-cyan-500/40 bg-cyan-500/12 px-1.5 py-0.2 font-semibold text-cyan-200">
                          {doc.docCode}
                        </span>
                      )}
                      {doc.isMost && (
                        <span className="shrink-0 rounded border border-violet-500/45 bg-violet-500/20 px-1.5 py-0.2 font-bold text-violet-200">
                          BỘ KH&amp;CN
                        </span>
                      )}
                      <span className="truncate text-[11px] text-slate-400">{doc.source}</span>
                    </div>
                    <span className="shrink-0 text-slate-500 tabular-nums">
                      {doc.issuedDate ?? formatRelativeTime(doc.publishedAt)}
                    </span>
                  </div>

                  <a
                    href={safeHref(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 block text-xs font-semibold leading-relaxed text-slate-100 hover:text-amber-300"
                  >
                    {doc.title}
                  </a>

                  {aiBullets && aiBullets.length > 0 && (
                    <div className="mt-1.5 rounded border border-emerald-500/35 bg-[#091622] px-2.5 py-1.5 text-[11px] leading-snug text-slate-200">
                      <div className="mb-1 flex items-center gap-1 font-mono text-[11px] font-bold tracking-wider text-emerald-300">
                        <Sparkle size={10} weight="fill" />
                        <span>AI TÓM TẮT 3 Ý TRỌNG TÂM</span>
                      </div>
                      <ul className="space-y-0.5">
                        {aiBullets.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            <span>{renderInlineMarkdown(bullet)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                      {doc.sector}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!aiBullets && (
                        <button
                          type="button"
                          disabled={isSummarizing}
                          onClick={() => void requestPolicyAiSummary(doc)}
                          className="inline-flex items-center gap-1 rounded border border-emerald-500/45 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          <Sparkle size={10} weight="fill" />
                          <span>{isSummarizing ? 'Đang tóm tắt...' : 'AI Tóm tắt 3 ý'}</span>
                        </button>
                      )}
                      {doc.pdfUrl && (
                        <a
                          href={safeHref(doc.pdfUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-rose-500/45 bg-rose-600/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-200 transition hover:bg-rose-600/35"
                        >
                          <FilePdf size={12} weight="fill" />
                          PDF Dấu đỏ
                        </a>
                      )}
                      <a
                        href={safeHref(doc.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        Toàn văn <ArrowSquareOut size={11} />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
            {filteredPolicy.length > visibleLimit && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((v) => v + 40)}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-300 transition hover:border-amber-400 hover:text-amber-200"
                >
                  Xem thêm ({filteredPolicy.length - visibleLimit} văn bản còn lại)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default PolicyLegalTab;
