import { Target } from '@phosphor-icons/react';
import { RegimeHistoryTimelineChart } from './shared';
import type { InvestmentCompassReport, RegimeHistoryPoint } from '@shared/types';

export function InvestmentCompassSection({
  investmentCompass,
  regimeHistory,
}: {
  investmentCompass: InvestmentCompassReport;
  regimeHistory: RegimeHistoryPoint[];
}) {
  return (
      <section className="rounded-md border border-emerald-500/35 bg-[#091420] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-emerald-300">
            <Target size={14} weight="fill" className="text-emerald-400" />
            <span>LA BÀN ĐẦU TƯ &amp; CHỈ BÁO</span>
          </h2>
          <span className="shrink-0 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-200 tabular-nums">
            Khẩu vị: {investmentCompass.riskAppetiteScore}/100
          </span>
        </div>

        <div className="mt-2 rounded border border-slate-800/95 bg-[#070d17] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                investmentCompass.stance === 'risk_on' ||
                investmentCompass.stance === 'selective_growth'
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                  : investmentCompass.stance === 'cautious'
                    ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                    : 'border-rose-500/55 bg-rose-500/20 text-rose-200'
              }`}
            >
              {investmentCompass.stanceLabel}
            </span>
            {investmentCompass.netLiquidityBillions !== undefined && (
              <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-cyan-200 tabular-nums">
                Fed Liq: ${(investmentCompass.netLiquidityBillions / 1000).toFixed(2)}T
              </span>
            )}
          </div>
          {investmentCompass.dualConfirmationLabel && (
            <div
              className={`mt-1.5 rounded border px-2 py-1 font-mono text-[9.5px] font-semibold ${
                investmentCompass.dualConfirmation === 'confirmed_bull'
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : investmentCompass.dualConfirmation === 'confirmed_bear'
                    ? 'border-rose-500/45 bg-rose-950/35 text-rose-200'
                    : 'border-amber-500/40 bg-amber-950/30 text-amber-200'
              }`}
            >
              ⚡ {investmentCompass.dualConfirmationLabel}
            </div>
          )}
          {investmentCompass.capitulationSignal && investmentCompass.capitulationLabel && (
            <div className="mt-1 rounded border border-cyan-500/45 bg-cyan-950/35 px-2 py-1 font-mono text-[9.5px] font-semibold text-cyan-200">
              🎯 {investmentCompass.capitulationLabel}
            </div>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
            {investmentCompass.summary}
          </p>

          {regimeHistory.length >= 2 && <RegimeHistoryTimelineChart history={regimeHistory} />}

          {investmentCompass.factorPillars && investmentCompass.factorPillars.length > 0 && (
            <div className="mt-2 rounded border border-slate-800/90 bg-[#0a1220] p-2 font-mono">
              <div className="mb-1 flex items-center justify-between text-[9px]">
                <span className="font-bold text-sky-300">ĐIỂM 5 NHÂN TỐ ĐỊNH LƯỢNG LIÊN TỤC</span>
                <span className="text-slate-400">Trọng số 100%</span>
              </div>
              <div className="space-y-1">
                {investmentCompass.factorPillars.map((fp) => {
                  const barColor =
                    fp.score >= 65 ? '#10b981' : fp.score >= 46 ? '#f59e0b' : '#f43f5e';
                  return (
                    <div
                      key={fp.id}
                      className="grid grid-cols-[1fr_72px_36px] items-center gap-1.5 text-[9px]"
                    >
                      <span className="truncate text-slate-300">
                        {fp.label} <span className="text-slate-500">({fp.weightPct}%)</span>
                      </span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${fp.score}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <span
                        className={`text-right font-bold tabular-nums ${
                          fp.score >= 65
                            ? 'text-emerald-300'
                            : fp.score >= 46
                              ? 'text-amber-300'
                              : 'text-rose-300'
                        }`}
                      >
                        {fp.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {investmentCompass.allocations.length > 0 && (
            <div className="mt-2 rounded border border-slate-800/90 bg-[#0b1322] p-2">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px]">
                <span className="font-bold text-emerald-300">
                  TỶ TRỌNG PHÂN BỔ DANH MỤC KHUYẾN NGHỊ
                </span>
                <span className="text-slate-400 tabular-nums">Tổng 100%</span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-900">
                {investmentCompass.allocations.map((slice) => (
                  <div
                    key={slice.id}
                    style={{
                      width: `${slice.weightPct}%`,
                      backgroundColor: slice.colorHex,
                    }}
                    title={`${slice.label}: ${slice.weightPct}% — ${slice.note}`}
                    className="h-full transition-all duration-500"
                  />
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {investmentCompass.allocations.map((slice) => (
                  <div
                    key={slice.id}
                    className="flex items-center justify-between gap-1 rounded border border-slate-800/80 bg-[#070d17] px-1.5 py-1"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: slice.colorHex }}
                        />
                        <span className="truncate text-[10px] font-semibold text-slate-200">
                          {slice.label}
                        </span>
                      </div>
                      <div className="truncate pl-3 text-[9px] text-slate-400" title={slice.note}>
                        {slice.note}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-slate-100 tabular-nums">
                      {slice.weightPct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 space-y-1.5 text-[10.5px] leading-snug">
            <div className="rounded border border-emerald-500/35 bg-emerald-950/25 px-2 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[9.5px] font-bold text-emerald-300">
                <span>🟢 LUÂN CHUYỂN NGÀNH &amp; KÊNH ƯU TIÊN</span>
                {investmentCompass.sectorRotation && (
                  <span className="text-[8.5px] font-normal text-emerald-200/80">
                    {investmentCompass.sectorRotation.phaseTitle.split('(')[0].trim()}
                  </span>
                )}
              </div>
              <ul className="mt-0.5 space-y-0.5 text-slate-200">
                {investmentCompass.favoredAssets.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>

            {investmentCompass.watchAssets.length > 0 && (
              <div className="rounded border border-amber-500/35 bg-amber-950/20 px-2 py-1.5">
                <div className="font-mono text-[9.5px] font-bold text-amber-300">
                  🟡 QUAN SÁT · GIẢI NGÂN TỪNG PHẦN KHI CHỈNH
                </div>
                <ul className="mt-0.5 space-y-0.5 text-slate-200">
                  {investmentCompass.watchAssets.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}

            {investmentCompass.avoidAssets.length > 0 && (
              <div className="rounded border border-rose-500/35 bg-rose-950/25 px-2 py-1.5">
                <div className="font-mono text-[9.5px] font-bold text-rose-300">
                  🔴 CẨN TRỌNG · HẠN CHẾ MUA ĐUỔI / ĐÒN BẨY
                </div>
                <ul className="mt-0.5 space-y-0.5 text-slate-200">
                  {investmentCompass.avoidAssets.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {investmentCompass.signals.map((sig) => (
            <div
              key={sig.id}
              className="flex flex-col justify-between rounded border border-slate-800/95 bg-[#0d1524] px-2 py-1.5"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-medium text-slate-300">
                    {sig.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-cyan-200 tabular-nums">
                    {sig.valueDisplay}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-1 text-[9.5px] text-slate-400" title={sig.subtext}>
                  {sig.subtext}
                </div>
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block rounded border px-1.5 py-0.1 font-mono text-[8.5px] font-bold ${
                    sig.tone === 'bullish'
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : sig.tone === 'bearish'
                        ? 'border-rose-500/45 bg-rose-500/18 text-rose-200'
                        : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                  }`}
                >
                  {sig.signalBadge.trim()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
  );
}
