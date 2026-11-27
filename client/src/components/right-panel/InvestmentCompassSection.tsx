import { scoreLevel } from '@shared/macro/core';
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
  const missingPillarCount = (investmentCompass.factorPillars ?? []).filter(
    (fp) => fp.hasData === false,
  ).length;

  return (
      <section className="rounded-md border border-emerald-500/35 bg-[#091420] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider text-emerald-300">
            <Target size={14} weight="fill" className="text-emerald-400" />
            <span>KHẨU VỊ RỦI RO &amp; TÍN HIỆU THỊ TRƯỜNG</span>
          </h2>
          <span className="shrink-0 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-200 tabular-nums">
            Khẩu vị rủi ro: {investmentCompass.riskAppetiteScore}/100
          </span>
        </div>

        <div className="mt-2 rounded border border-slate-800/95 bg-[#070d17] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs font-bold ${
                scoreLevel(investmentCompass.riskAppetiteScore) === 'high'
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200'
                  : scoreLevel(investmentCompass.riskAppetiteScore) === 'medium'
                    ? 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                    : 'border-rose-500/55 bg-rose-500/20 text-rose-200'
              }`}
            >
              {investmentCompass.stanceLabel}
            </span>
            {investmentCompass.netLiquidityBillions !== undefined && (
              <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-cyan-200 tabular-nums">
                Fed Liq: ${(investmentCompass.netLiquidityBillions / 1000).toFixed(2)}T
              </span>
            )}
          </div>
          {investmentCompass.dualConfirmationLabel && (
            <div
              className={`mt-1.5 rounded border px-2 py-1 font-mono text-xs font-semibold ${
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
          {investmentCompass.marketConfirmations && (
            <ul className="mt-1 space-y-0.5 font-mono text-xs text-slate-300">
              {investmentCompass.marketConfirmations.map((m) => (
                <li key={m.market}>• {m.label}</li>
              ))}
            </ul>
          )}
          {investmentCompass.capitulationSignal && investmentCompass.capitulationLabel && (
            <div className="mt-1 rounded border border-cyan-500/45 bg-cyan-950/35 px-2 py-1 font-mono text-xs font-semibold text-cyan-200">
              🎯 {investmentCompass.capitulationLabel}
            </div>
          )}
          <ul aria-label="Số liệu chính" className="mt-2 grid grid-cols-2 gap-x-3 text-[13px] text-slate-100">
            {investmentCompass.summary
              .split(' · ')
              // Distances to MA200 already appear in the per-market lines above.
              .filter((fact) => !(investmentCompass.marketConfirmations && fact.endsWith('so MA200')))
              .map((fact) => (
              <li key={fact} className="border-b border-slate-800 py-1 tabular-nums">
                {fact}
              </li>
            ))}
          </ul>
          <p className="mt-2 rounded border border-amber-500/45 bg-amber-950/35 px-2 py-1 text-xs leading-snug text-amber-200">
            ⚠️ Chỉ mô tả trạng thái, không phải khuyến nghị đầu tư: kiểm định 2019–2026 (thiếu một số đầu vào) cho thấy <strong>điểm cao không báo trước lợi nhuận cao hơn</strong>.
          </p>

          {investmentCompass.factorPillars && investmentCompass.factorPillars.length > 0 && (
            <div className="mt-2 rounded border border-slate-800/90 bg-[#0a1220] p-2 font-mono">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-bold text-sky-300">ĐIỂM 5 NHÂN TỐ TRẠNG THÁI &amp; RỦI RO</span>
                <span className="text-slate-400">
                  {missingPillarCount > 0
                    ? `${missingPillarCount}/5 thiếu dữ liệu (tạm tính 52)`
                    : 'Trọng số 100%'}
                </span>
              </div>
              <div className="space-y-1">
                {investmentCompass.factorPillars.map((fp) => {
                  const noData = fp.hasData === false;
                  const barColor =
                    fp.score >= 65 ? '#10b981' : fp.score >= 46 ? '#f59e0b' : '#f43f5e';
                  return (
                    <div
                      key={fp.id}
                      title={
                        noData
                          ? 'Chưa có chỉ báo đầu vào khả dụng cho nhân tố này; hệ thống giữ mức trung tính 52 khi tính điểm tổng'
                          : `${fp.label}: ${fp.score}/100 (trọng số ${fp.weightPct}%)`
                      }
                      className="grid grid-cols-[1fr_72px_42px] items-center gap-1.5 text-xs"
                    >
                      <span className={`truncate ${noData ? 'text-slate-500' : 'text-slate-300'}`}>
                        {fp.label} <span className="text-slate-500">({fp.weightPct}%)</span>
                      </span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        {!noData && (
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${fp.score}%`, backgroundColor: barColor }}
                          />
                        )}
                      </div>
                      {noData ? (
                        <span className="text-right font-semibold text-slate-500">Thiếu</span>
                      ) : (
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <details className="mt-2 rounded border border-slate-700 px-2 py-1.5">
            <summary className="cursor-pointer text-[13px] text-slate-200">Xem lịch sử điểm theo ngày</summary>
            <RegimeHistoryTimelineChart history={regimeHistory} />
          </details>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {investmentCompass.signals.map((sig) => (
            <div
              key={sig.id}
              className="flex flex-col justify-between rounded border border-slate-800/95 bg-[#0d1524] px-2 py-1.5"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="leading-tight text-xs font-medium text-slate-300">
                    {sig.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-bold text-cyan-200 tabular-nums">
                    {sig.valueDisplay}
                  </span>
                </div>
                <div className="mt-0.5 text-xs leading-snug text-slate-400">
                  {sig.subtext}
                </div>
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block rounded border px-1.5 py-0.1 font-mono text-xs font-bold ${
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
