import { ArrowsClockwise, Gauge } from '@phosphor-icons/react';
import type { CollectorId, EconomyHealthReport, ExpiredMacroMetricNotice } from '@shared/types';

export function ExpiredMacroNotices({ notices }: { notices: readonly ExpiredMacroMetricNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="mt-1.5 rounded border border-rose-500/45 bg-rose-950/35 px-2 py-1.5 font-mono text-xs text-rose-200">
      <div className="font-semibold">
        ⚠️ Không dùng {notices.length} chỉ báo trong điểm số (quá hạn hoặc không rõ kỳ/thời điểm lấy):
      </div>
      <ul className="mt-0.5 space-y-0.5 text-xs text-rose-200">
        {notices.map((ex) => (
          <li key={ex.id}>
            • {ex.label} ({ex.sourceLabel}
            {ex.periodLabel ? ` · Kỳ ${ex.periodLabel}` : ''}
            {ex.lastValueLabel ? ` · số cuối ${ex.lastValueLabel}` : ''})
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MacroHealthSection({
  activeMacroReport,
  macroHealth,
  setMacroRegion,
  onForceRefresh,
  refreshingIds,
}: {
  activeMacroReport: EconomyHealthReport;
  macroHealth: { vn: EconomyHealthReport | null; us: EconomyHealthReport | null };
  setMacroRegion: (region: 'VN' | 'US') => void;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  refreshingIds?: ReadonlySet<string>;
}) {
  const retainedCount = activeMacroReport.pillars.reduce(
    (sum, p) => sum + p.metrics.filter((m) => m.retained).length,
    0,
  );
  const importantFlags = activeMacroReport.warningFlags.filter((flag) => flag.severity !== 'good');
  const otherFlags = activeMacroReport.warningFlags.filter((flag) => flag.severity === 'good');

  return (
      <section className="rounded-md border border-cyan-500/35 bg-[#0a1322] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h2 className="flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider text-cyan-300">
            <Gauge size={14} weight="fill" className="text-cyan-400" />
            <span>SỨC KHỎE &amp; CHẾ ĐỘ VĨ MÔ</span>
          </h2>
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
            {macroHealth.vn && (
              <button
                type="button"
                onClick={() => setMacroRegion('VN')}
                aria-pressed={activeMacroReport.id === 'VN'}
                className={`min-h-11 rounded border px-2 py-1 font-semibold transition ${
                  activeMacroReport.id === 'VN'
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                🇻🇳 Việt Nam ({macroHealth.vn.compositeScore})
              </button>
            )}
            {macroHealth.us && (
              <button
                type="button"
                onClick={() => setMacroRegion('US')}
                aria-pressed={activeMacroReport.id === 'US'}
                className={`min-h-11 rounded border px-2 py-1 font-semibold transition ${
                  activeMacroReport.id === 'US'
                    ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                🇺🇸 Mỹ · FRED ({macroHealth.us.compositeScore})
              </button>
            )}
            {onForceRefresh && (
              <button
                type="button"
                onClick={() => {
                  onForceRefresh('markets-crypto');
                  onForceRefresh('macro-worldbank');
                  onForceRefresh('polymarket-news');
                }}
                title="Làm mới dữ liệu FRED & World Bank"
                aria-label="Làm mới dữ liệu FRED và World Bank"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
              >
                <ArrowsClockwise
                  size={10}
                  className={
                    refreshingIds?.has('markets-crypto') || refreshingIds?.has('macro-worldbank')
                      ? 'animate-spin text-cyan-300'
                      : ''
                  }
                />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 rounded border border-slate-800/95 bg-[#070d18] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-xs text-slate-300">{activeMacroReport.subtitle}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                    !activeMacroReport.regime
                      ? 'border-slate-500/40 bg-slate-500/10 text-slate-300'
                      : activeMacroReport.regime === 'soft_landing'
                      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                      : activeMacroReport.regime === 'overheating'
                        ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                        : activeMacroReport.regime === 'early_slowdown'
                          ? 'border-orange-500/50 bg-orange-500/20 text-orange-200'
                          : 'border-rose-500/55 bg-rose-500/20 text-rose-200'
                  }`}
                >
                  {activeMacroReport.regimeLabel}
                </span>
                {activeMacroReport.recessionProb12m !== undefined && (
                  <span
                    title="Tín hiệu xác suất suy thoái 12 tháng riêng theo công thức NY Fed (độ dốc lợi suất 10Y–3M), không phải dự báo GDP/CPI của hệ thống"
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tabular-nums ${
                      activeMacroReport.recessionProb12m >= 40
                        ? 'border-rose-500/45 bg-rose-500/15 text-rose-200'
                        : activeMacroReport.recessionProb12m >= 28
                          ? 'border-amber-500/45 bg-amber-500/15 text-amber-200'
                          : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                    }`}
                  >
                    Tín hiệu NY Fed (10Y–3M): {activeMacroReport.recessionProb12m.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right font-mono tabular-nums">
              <div className="text-lg font-extrabold leading-none text-slate-100">
                {activeMacroReport.compositeScore}
                <span className="text-[11px] font-normal text-slate-400">/100</span>
              </div>
              <div className="mt-0.5 text-[9px] text-slate-400">ĐIỂM CHẾ ĐỘ VĨ MÔ</div>
            </div>
          </div>

          {activeMacroReport.quadrant && (
            <details className="mt-2 rounded border border-slate-800/90 bg-[#0b1322] p-2 font-mono">
              <summary className="cursor-pointer text-xs text-sky-300">Xem ma trận 4 pha vĩ mô</summary>
              <div className="mb-1 mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-300">
                <span className="font-semibold text-sky-300">
                  MA TRẬN 4 PHA VĨ MÔ (GIP / ALL-WEATHER)
                </span>
                <span className="tabular-nums text-slate-300">
                  Growth Z{' '}
                  {activeMacroReport.growthZ !== undefined && activeMacroReport.growthZ >= 0
                    ? '+'
                    : ''}
                  {activeMacroReport.growthZ?.toFixed(2) ?? '0.00'}σ · Infl Z{' '}
                  {activeMacroReport.inflationZ !== undefined && activeMacroReport.inflationZ >= 0
                    ? '+'
                    : ''}
                  {activeMacroReport.inflationZ?.toFixed(2) ?? '0.00'}σ
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {(
                  [
                    {
                      id: 'Q1_GOLDILOCKS',
                      short: 'Q1 · GOLDILOCKS',
                      desc: 'Tăng trưởng ↑ · Lạm phát ↓',
                      activeCls: 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200',
                    },
                    {
                      id: 'Q2_REFLATION',
                      short: 'Q2 · REFLATION / NÓNG',
                      desc: 'Tăng trưởng ↑ · Lạm phát ↑',
                      activeCls: 'border-amber-400/70 bg-amber-500/20 text-amber-200',
                    },
                    {
                      id: 'Q4_DEFLATION',
                      short: 'Q4 · GIẢM TỐC',
                      desc: 'Tăng trưởng ↓ · Lạm phát ↓',
                      activeCls: 'border-sky-400/65 bg-sky-500/20 text-sky-200',
                    },
                    {
                      id: 'Q3_STAGFLATION',
                      short: 'Q3 · ĐÌNH LẠM',
                      desc: 'Tăng trưởng ↓ · Lạm phát ↑',
                      activeCls: 'border-rose-400/70 bg-rose-500/22 text-rose-200',
                    },
                  ] as const
                ).map((q) => {
                  const isCurrent = activeMacroReport.quadrant === q.id;
                  return (
                    <div
                      key={q.id}
                      className={`rounded border px-1.5 py-1 transition ${
                        isCurrent
                          ? `${q.activeCls} font-bold shadow-sm`
                          : 'border-slate-800/80 bg-[#070d17] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{q.short}</span>
                        {isCurrent && <span className="text-[10px]">● HIỆN TẠI</span>}
                      </div>
                      <div className={`text-[11px] ${isCurrent ? 'opacity-95' : 'text-slate-400'}`}>
                        {q.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${activeMacroReport.compositeScore}%`,
                backgroundColor:
                  activeMacroReport.compositeScore >= 70
                    ? '#10b981'
                    : activeMacroReport.compositeScore >= 52
                      ? '#f59e0b'
                      : '#f43f5e',
              }}
            />
          </div>

          <p className="mt-1.5 text-xs leading-snug text-slate-200">
            {activeMacroReport.regimeSummary}
          </p>
          <p className="mt-1 font-mono text-xs leading-snug text-slate-300">
            Điểm tổng hợp phản ánh trạng thái sức khỏe &amp; chế độ vĩ mô từ dữ liệu đã công bố, không phải dự báo con số GDP/CPI.
          </p>
          {retainedCount > 0 && (
            <div className="mt-1.5 rounded border border-amber-500/45 bg-amber-950/35 px-2 py-1 font-mono text-xs text-amber-200">
              ⟳ Có {retainedCount} chỉ báo đang giữ lại số phiên trước (dưới 7 ngày) do nguồn tạm lỗi ở lần quét gần nhất.
            </div>
          )}
          <ExpiredMacroNotices notices={activeMacroReport.expiredMetrics ?? []} />

          {importantFlags.length > 0 && (
            <div className="mt-2 space-y-1">
              {importantFlags.map((flag, idx) => (
                <div
                  key={idx}
                  className={`rounded border px-2 py-1 text-xs leading-snug ${
                    flag.severity === 'critical'
                      ? 'border-rose-500/45 bg-rose-950/40 text-rose-200'
                      : flag.severity === 'warn'
                        ? 'border-amber-500/40 bg-amber-950/35 text-amber-200'
                        : 'border-emerald-500/35 bg-emerald-950/25 text-emerald-200'
                  }`}
                >
                  {flag.severity === 'critical'
                    ? '🚨 '
                    : flag.severity === 'warn'
                      ? '⚠️ '
                      : '✓ '}
                  {flag.text}
                </div>
              ))}
            </div>
          )}
          {otherFlags.length > 0 && (
            <details className="mt-2 rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200">
              <summary className="cursor-pointer">Xem {otherFlags.length} tín hiệu bổ sung</summary>
              <ul className="mt-2 space-y-1">
                {otherFlags.map((flag, idx) => (
                  <li key={idx} className="rounded border border-emerald-500/35 bg-emerald-950/25 px-2 py-1 text-emerald-200">
                    ✓ {flag.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <details className="mt-2 rounded border border-slate-700 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-200">Xem chi tiết các chỉ báo vĩ mô</summary>
        <div className="mt-2 space-y-2">
          {activeMacroReport.pillars.map((pillar) => (
            <div
              key={pillar.id}
              className="rounded border border-slate-800/90 bg-[#0d1524] px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-slate-200">{pillar.title}</span>
                <span
                  className={`rounded px-1.5 py-0.2 font-bold tabular-nums ${
                    pillar.score >= 70
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : pillar.score >= 52
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {pillar.score}/100
                </span>
              </div>

              <div className="divide-y divide-slate-800/75">
                {pillar.metrics.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            m.status === 'good'
                              ? 'bg-emerald-400'
                              : m.status === 'watch'
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-xs font-medium text-slate-100">
                          {m.name}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[11px] text-slate-300">
                        {m.sourceLabel && (
                          <span className="rounded border border-slate-700/80 bg-slate-900/90 px-1 py-0.1 text-slate-300">
                            {m.sourceLabel}
                          </span>
                        )}
                        <span className="rounded border border-cyan-500/25 bg-cyan-950/30 px-1 py-0.1 text-cyan-200/90">
                          Kỳ: {m.periodLabel}
                        </span>
                        {m.retained ? (
                          <span
                            title="Nguồn không trả dữ liệu mới ở lần quét gần nhất; đang hiển thị số giữ lại từ phiên thành công trước đó"
                            className="rounded border border-amber-500/50 bg-amber-500/15 px-1 py-0.1 font-semibold text-amber-200"
                          >
                            ⟳ Giữ lại
                          </span>
                        ) : (
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.1 text-emerald-300">
                            Lấy thành công
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-300">
                        <span>
                          {m.benchmarkLabel}: {m.benchmarkValue.toLocaleString('en-US')}
                          {m.unit.startsWith('%') ? m.unit : m.unit === '₫' ? '₫' : ` ${m.unit}`}
                        </span>
                        {m.trendLabel && (
                          <span className="rounded bg-slate-800/90 px-1 py-0.1 text-slate-300">
                            {m.trendLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div className="text-xs font-bold text-cyan-200">
                        {m.unit === '₫'
                          ? `${m.actual.toLocaleString('en-US')}₫`
                          : `${m.actual.toFixed(2)}${m.unit.startsWith('%') ? m.unit : ` ${m.unit}`}`}
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          m.status === 'good'
                            ? 'text-emerald-400'
                            : m.status === 'watch'
                              ? 'text-amber-300'
                              : 'text-rose-400'
                        }`}
                      >
                        Δ {m.deltaVsBenchmark >= 0 ? '+' : ''}
                        {m.deltaVsBenchmark.toFixed(2)}
                        {m.unit.includes('%') || m.unit === '₫' ? '%' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </details>
      </section>
  );
}
