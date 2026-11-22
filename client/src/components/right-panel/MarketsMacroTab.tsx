import { memo, useMemo, useState } from 'react';
import {
  Anchor,
  ArrowsClockwise,
  Broadcast,
  CalendarBlank,
  ChartBar,
  Coins,
  Crosshair,
  Gauge,
  Target,
  TrendDown,
  TrendUp,
} from '@phosphor-icons/react';
import {
  buildMarketCatalystCalendar,
  evaluateChokepointMarketImpacts,
} from '@shared/catalysts-and-chokepoints';
import { evaluateInvestmentCompass, evaluateMacroHealth } from '@shared/macro-health';
import type {
  CollectorId,
  GeoPointFeature,
  MarketSnapshot,
  PredictionItem,
  RegimeHistoryPoint,
} from '@shared/types';
import type { FlashDirection } from '../../hooks/useMonitorData';
import {
  MiniSparkline,
  RegimeHistoryTimelineChart,
  formatCompactUsd,
} from './shared';

export interface MarketsMacroTabProps {
  markets: MarketSnapshot;
  predictions: PredictionItem[];
  regimeHistory: RegimeHistoryPoint[];
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  priceFlashes: Record<string, FlashDirection>;
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  streamConnected: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  translateVi: boolean;
}

const MarketsMacroTab = memo(function MarketsMacroTab({
  markets,
  predictions,
  regimeHistory,
  military,
  vessels,
  geopolitics,
  priceFlashes,
  refreshingIds,
  onForceRefresh,
  streamConnected,
  onFlyToLocation,
  translateVi,
}: MarketsMacroTabProps) {
  const [macroRegion, setMacroRegion] = useState<'VN' | 'US'>('VN');

  const fxQuotes = useMemo(() => markets.quotes.filter((q) => q.group === 'fx'), [markets.quotes]);
  const indexAndCommodityQuotes = useMemo(
    () => markets.quotes.filter((q) => q.group !== 'fx' && q.symbol !== 'VIX 3M'),
    [markets.quotes],
  );
  const usdVndPrice = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'USD/VND')?.price,
    [markets.quotes],
  );
  const copperPrice = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'Copper')?.price,
    [markets.quotes],
  );
  const soxPrice = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'SOX Semi')?.price,
    [markets.quotes],
  );
  const vniQuoteRef = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'VN-Index'),
    [markets.quotes],
  );
  const spxPrice = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'S&P 500')?.price,
    [markets.quotes],
  );
  const vix3mPrice = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'VIX 3M')?.price,
    [markets.quotes],
  );
  const audJpyPrice = useMemo(
    () => markets.quotes.find((q) => q.symbol === 'AUD/JPY')?.price,
    [markets.quotes],
  );

  // Ignore 1.5s BTC/ETH ticks so streaming prices never re-run macro math
  const macroHealth = useMemo(
    () => evaluateMacroHealth(markets, predictions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markets.updatedAt, markets.fred, markets.macro, markets.vnMacroPulse, usdVndPrice, vniQuoteRef, predictions],
  );
  const investmentCompass = useMemo(
    () => evaluateInvestmentCompass(markets, predictions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      markets.updatedAt,
      markets.fred,
      markets.macro,
      markets.vnMacroPulse,
      markets.vn30,
      markets.fearGreed?.value,
      predictions,
      usdVndPrice,
      copperPrice,
      soxPrice,
      vniQuoteRef,
      spxPrice,
      vix3mPrice,
      audJpyPrice,
    ],
  );

  const activeMacroReport =
    macroRegion === 'VN'
      ? macroHealth.vn ?? macroHealth.us
      : macroHealth.us ?? macroHealth.vn;

  const catalystCalendar = useMemo(
    () => buildMarketCatalystCalendar(Date.now(), investmentCompass?.polymarketFedSummary),
    [investmentCompass?.polymarketFedSummary],
  );

  const chokepointImpacts = useMemo(
    () =>
      evaluateChokepointMarketImpacts({
        military,
        vessels,
        geopolitics,
        predictions,
        quotes: markets.quotes,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [military, vessels, geopolitics, predictions, markets.updatedAt],
  );

  const stablecoins = useMemo(
    () => markets.crypto.filter((c) => c.symbol === 'USDT' || c.symbol === 'USDC'),
    [markets.crypto],
  );

  const volatileCrypto = useMemo(
    () => markets.crypto.filter((c) => c.symbol !== 'USDT' && c.symbol !== 'USDC'),
    [markets.crypto],
  );

  const topMacroGeopoliticsPredictions = useMemo(() => {
    const macroGeo = predictions.filter(
      (p) => p.category === 'finance' || p.category === 'geopolitics',
    );
    return (macroGeo.length >= 5 ? macroGeo : predictions).slice(0, 5);
  }, [predictions]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      {/* Upcoming Macro & VN30 Derivatives Catalyst Countdown Calendar */}
      {catalystCalendar.length > 0 && (
        <section className="rounded-md border border-amber-500/30 bg-[#0b1322] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold tracking-wider text-amber-300">
              <CalendarBlank size={13} weight="fill" className="text-amber-400" />
              <span>LỊCH SỰ KIỆN XÚC TÁC &amp; ĐÁO HẠN SẮP TỚI</span>
            </h2>
            <span className="font-mono text-[9px] text-slate-400">Giờ VN</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {catalystCalendar.slice(0, 5).map((ev) => {
              const badgeCls =
                ev.urgency === 'imminent'
                  ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                  : ev.urgency === 'soon'
                    ? 'border-amber-500/45 bg-amber-500/18 text-amber-200'
                    : 'border-slate-700 bg-slate-800/90 text-slate-300';
              return (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800/85 bg-[#070d18] px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">{ev.region === 'VN' ? '🇻🇳' : '🇺🇸'}</span>
                      <span className="truncate text-[10.5px] font-semibold text-slate-100">
                        {ev.title}
                      </span>
                    </div>
                    <div className="truncate text-[9.5px] text-slate-400" title={ev.impactNote}>
                      {ev.impactNote}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.2 text-[9px] font-bold ${badgeCls}`}
                    >
                      {ev.daysUntil === 0 ? 'HÔM NAY' : `Còn ${ev.daysUntil} ngày`}
                    </span>
                    <div className="mt-0.5 text-[9px] text-slate-500">{ev.dateLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Macroeconomic Health & Regime Diagnosis Radar */}
      {activeMacroReport && (
        <section className="rounded-md border border-cyan-500/35 bg-[#0a1322] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-cyan-300">
              <Gauge size={14} weight="fill" className="text-cyan-400" />
              <span>CHẨN ĐOÁN SỨC KHỎE VĨ MÔ</span>
            </h2>
            <div className="flex items-center gap-1 font-mono text-[9.5px]">
              {macroHealth.vn && (
                <button
                  type="button"
                  onClick={() => setMacroRegion('VN')}
                  className={`rounded border px-2 py-0.5 font-semibold transition ${
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
                  className={`rounded border px-2 py-0.5 font-semibold transition ${
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
                  className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
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
                <div className="font-mono text-[10px] text-slate-400">{activeMacroReport.subtitle}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                      activeMacroReport.regime === 'soft_landing'
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
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tabular-nums ${
                        activeMacroReport.recessionProb12m >= 40
                          ? 'border-rose-500/45 bg-rose-500/15 text-rose-200'
                          : activeMacroReport.recessionProb12m >= 28
                            ? 'border-amber-500/45 bg-amber-500/15 text-amber-200'
                            : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      }`}
                    >
                      XS Suy thoái 12T: {activeMacroReport.recessionProb12m.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <div className="text-lg font-extrabold leading-none text-slate-100">
                  {activeMacroReport.compositeScore}
                  <span className="text-[11px] font-normal text-slate-400">/100</span>
                </div>
                <div className="mt-0.5 text-[9px] text-slate-400">ĐIỂM SỨC KHỎE</div>
              </div>
            </div>

            {activeMacroReport.quadrant && (
              <div className="mt-2 rounded border border-slate-800/90 bg-[#0b1322] p-1.5 font-mono">
                <div className="mb-1 flex items-center justify-between text-[9px] text-slate-400">
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
                <div className="grid grid-cols-2 gap-1 text-[9px]">
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
                            : 'border-slate-800/80 bg-[#070d17] text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{q.short}</span>
                          {isCurrent && <span className="text-[8px]">● HIỆN TẠI</span>}
                        </div>
                        <div className={`text-[8.5px] ${isCurrent ? 'opacity-95' : 'text-slate-600'}`}>
                          {q.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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

            <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
              {activeMacroReport.regimeSummary}
            </p>

            {activeMacroReport.warningFlags.length > 0 && (
              <div className="mt-2 space-y-1">
                {activeMacroReport.warningFlags.map((flag, idx) => (
                  <div
                    key={idx}
                    className={`rounded border px-2 py-1 text-[10.5px] leading-snug ${
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
          </div>

          <div className="mt-2 space-y-2">
            {activeMacroReport.pillars.map((pillar) => (
              <div
                key={pillar.id}
                className="rounded border border-slate-800/90 bg-[#0d1524] px-2.5 py-2"
              >
                <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px]">
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
                          <span className="truncate text-[11px] font-medium text-slate-100">
                            {m.name}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-slate-400">
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
                          className={`text-[9.5px] font-semibold ${
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
        </section>
      )}

      {/* Forward-Looking Investment Compass & Leading Indicators */}
      {investmentCompass && (
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
      )}

      {/* Cross-Domain Maritime Chokepoints <-> Commodity & HOSE Sector Impact Matrix */}
      {chokepointImpacts.length > 0 && (
        <section className="rounded-md border border-sky-500/35 bg-[#091321] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold tracking-wider text-sky-300">
              <Anchor size={13} weight="fill" className="text-sky-400" />
              <span>ĐIỂM NGHẼN EO BIỂN ↔ HÀNG HÓA &amp; CỔ PHIẾU</span>
            </h2>
            <span className="font-mono text-[9px] text-slate-400">AIS · ADS-B · Polymarket</span>
          </div>

          <div className="mt-2 space-y-1.5">
            {chokepointImpacts.slice(0, 4).map((cp) => {
              const statusCls =
                cp.status === 'critical'
                  ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                  : cp.status === 'elevated'
                    ? 'border-amber-500/45 bg-amber-500/18 text-amber-200'
                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
              return (
                <div
                  key={cp.id}
                  className="rounded border border-slate-800/95 bg-[#070d17] px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11px] font-bold text-slate-100">
                        {cp.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => onFlyToLocation(cp.lat, cp.lon, cp.zoom)}
                        title={`Bay tới ${cp.name} trên bản đồ`}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.1 font-mono text-[8.5px] text-sky-300 hover:bg-sky-500/25"
                      >
                        <Crosshair size={9} />
                        Bản đồ
                      </button>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.2 font-mono text-[8.5px] font-bold tabular-nums ${statusCls}`}
                    >
                      {cp.statusLabel} · {cp.disruptionScore}
                    </span>
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[9px] text-slate-400 tabular-nums">
                    <span>✈️ Quân sự: {cp.airCount}</span>
                    <span>🚢 Tàu AIS: {cp.seaCount}</span>
                    <span>🔥 Xung đột: {cp.conflictCount}</span>
                    {cp.polymarketNote && (
                      <span className="font-semibold text-amber-300">{cp.polymarketNote}</span>
                    )}
                  </div>

                  <div className="mt-1 text-[10px] leading-snug text-slate-300">
                    • {cp.commodityImpact}
                  </div>
                  <div className="mt-0.5 font-mono text-[9.5px] font-medium text-emerald-300">
                    → {cp.vnStockImpact}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Vietnam Domestic Gold */}
      {markets.vnGold && markets.vnGold.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-amber-200">
              <Coins size={13} className="text-amber-400" weight="fill" />
              <span>GIÁ VÀNG TRONG NƯỚC (TRIỆU ₫ / LƯỢNG)</span>
            </h2>
            {onForceRefresh && (
              <button
                type="button"
                onClick={() => onForceRefresh('markets-crypto')}
                title="Làm mới Giá vàng SJC, VN30 & Thị trường"
                className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:border-amber-400/50 hover:text-amber-200"
              >
                <ArrowsClockwise
                  size={10}
                  className={refreshingIds?.has('markets-crypto') ? 'animate-spin text-amber-300' : ''}
                />
              </button>
            )}
          </div>

          <div className="mt-1.5 divide-y divide-slate-800/85 rounded border border-amber-500/35 bg-[#0d1524]">
            {markets.vnGold.map((g) => (
              <div key={g.code} className="px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.1 font-mono text-[10px] font-bold text-amber-200">
                        {g.code}
                      </span>
                      <span className="truncate text-xs font-semibold text-slate-100">{g.name}</span>
                    </div>
                    {g.worldParityPerLuongMillionVnd !== undefined &&
                      g.premiumVsWorldMillionVnd !== undefined && (
                        <div className="mt-0.5 font-mono text-[9.5px] text-slate-400 tabular-nums">
                          Quy đổi TG: {g.worldParityPerLuongMillionVnd.toFixed(2)} tr · Chênh{' '}
                          <span
                            className={
                              g.premiumVsWorldMillionVnd >= 0 ? 'text-amber-300' : 'text-emerald-300'
                            }
                          >
                            {g.premiumVsWorldMillionVnd >= 0 ? '+' : ''}
                            {g.premiumVsWorldMillionVnd.toFixed(2)} tr/lượng
                          </span>
                        </div>
                      )}
                  </div>

                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs">
                      <span className="text-[10px] text-slate-400">Mua </span>
                      <strong className="text-emerald-300">
                        {g.buyPerLuongMillionVnd.toFixed(2)}
                      </strong>
                      <span className="mx-1 text-slate-600">|</span>
                      <span className="text-[10px] text-slate-400">Bán </span>
                      <strong className="text-amber-300">
                        {g.sellPerLuongMillionVnd.toFixed(2)}
                      </strong>
                    </div>
                    <div className="text-[9.5px] text-slate-500">
                      Biên độ {g.spreadMillionVnd.toFixed(2)} tr
                      {g.updatedLabel ? ` · ${g.updatedLabel.split(' ')[1] ?? g.updatedLabel}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top 10 VN30 Leading Stocks */}
      {markets.vn30 && markets.vn30.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] font-semibold tracking-wider text-emerald-300">
              RỔ CỔ PHIẾU DẪN DẮT VN30 (HOSE · NGHÌN ₫)
            </h2>
            <span className="font-mono text-[9.5px] text-slate-500">Sparkline 10 phiên</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {markets.vn30.map((st) => {
              const up = st.changePercent >= 0;
              return (
                <div
                  key={st.symbol}
                  className="flex items-center justify-between gap-1.5 rounded border border-slate-800/95 bg-[#0d1524] px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-100">{st.symbol}</span>
                      <span className="truncate text-[9.5px] text-slate-400">{st.sector}</span>
                    </div>
                    <MiniSparkline values={st.sparkline} positive={up} />
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs font-semibold text-slate-100">
                      {st.priceThousandVnd.toFixed(2)}
                    </div>
                    <div
                      className={`text-[10px] font-semibold ${
                        up ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {up ? '+' : ''}
                      {st.changePercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FX Rates */}
      <section>
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
          TỶ GIÁ NGOẠI HỐI TRỰC TIẾP
        </h2>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {fxQuotes.map((fx) => {
            const isVnd = fx.symbol === 'USD/VND';
            return (
              <div
                key={fx.symbol}
                className={`rounded border px-2.5 py-2 ${
                  isVnd
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-slate-800/90 bg-[#0d1524]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      isVnd ? 'text-emerald-300' : 'text-slate-300'
                    }`}
                  >
                    {fx.symbol}
                  </span>
                  {isVnd && (
                    <span className="rounded bg-emerald-500/20 px-1 py-0.2 font-mono text-[9px] text-emerald-300">
                      VN
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-100 tabular-nums">
                  {fx.price.toLocaleString('en-US', {
                    maximumFractionDigits: isVnd ? 0 : 4,
                  })}
                </div>
                <div className="truncate text-[10px] text-slate-400">{fx.name}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FRED Live Telemetry */}
      {markets.fred && markets.fred.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] font-semibold tracking-wider text-sky-300">
              LÃI SUẤT FED · LỢI SUẤT TRÁI PHIẾU MỸ &amp; VIX (FRED LIVE)
            </h2>
            <span className="font-mono text-[9.5px] text-slate-500">St. Louis Fed</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {markets.fred
              .filter((fm) => fm.pillar === 'market' || fm.id === 'FEDFUNDS' || fm.id === 'T10Y2Y')
              .map((fm) => {
                const up = fm.change >= 0;
                return (
                  <div
                    key={fm.id}
                    className={`rounded border px-2.5 py-2 ${
                      fm.alertBadge
                        ? 'border-rose-500/45 bg-rose-950/25'
                        : 'border-slate-800/95 bg-[#0d1524]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-mono text-[10.5px] font-bold text-slate-200">
                        {fm.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-cyan-300 tabular-nums">
                        {fm.value.toFixed(2)}
                        {fm.unit === '%' ? '%' : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-400">{fm.subtitle}</div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <MiniSparkline values={fm.sparkline} positive={up} />
                      <span
                        className={`font-mono text-[9.5px] font-semibold tabular-nums ${
                          up ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {up ? '+' : ''}
                        {fm.change.toFixed(2)}
                      </span>
                    </div>
                    {fm.alertBadge && (
                      <div className="mt-1 rounded border border-rose-500/45 bg-rose-500/20 px-1.5 py-0.2 text-center font-mono text-[8.5px] font-bold text-rose-200">
                        {fm.alertBadge}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Global & Vietnam Indices + Strategic Commodities */}
      <section>
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
          CHỈ SỐ CHỨNG KHOÁN &amp; HÀNG HÓA CHIẾN LƯỢC
        </h2>
        <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
          {indexAndCommodityQuotes.map((q) => {
            const up = q.changePercent24h >= 0;
            const isVn = q.symbol.includes('VN');
            const flash = priceFlashes[q.symbol];
            return (
              <div
                key={q.symbol}
                className={`flex items-center justify-between px-2.5 py-2 transition-colors duration-300 ${
                  flash === 'up'
                    ? 'bg-emerald-500/25'
                    : flash === 'down'
                      ? 'bg-rose-500/25'
                      : isVn
                        ? 'bg-emerald-500/8'
                        : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-slate-100">
                      {q.symbol}
                    </span>
                    <span className="rounded bg-slate-800 px-1 py-0.2 font-mono text-[9.5px] uppercase text-slate-400">
                      {q.group}
                    </span>
                    {q.symbol === 'Gold' && streamConnected && (
                      <span className="font-mono text-[9px] text-emerald-400">LIVE 1S</span>
                    )}
                  </div>
                  <div className="truncate text-[10.5px] text-slate-400">{q.name}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <MiniSparkline values={q.sparkline} positive={up} />
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xs font-semibold text-slate-100">
                      {q.unit?.startsWith('USD') ? '$' : ''}
                      {q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                    <div
                      className={`inline-flex items-center gap-0.5 text-[10.5px] ${
                        up ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {up ? <TrendUp size={11} /> : <TrendDown size={11} />}
                      {up ? '+' : ''}
                      {q.changePercent24h.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Stablecoin Peg Monitor */}
      {stablecoins.length > 0 && (
        <section>
          <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
            STABLECOIN PEG MONITOR
          </h2>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {stablecoins.map((sc) => {
              const dev = Math.abs(sc.priceUsd - 1.0);
              const onPeg = dev < 0.005;
              return (
                <div
                  key={sc.id}
                  className="flex items-center justify-between rounded border border-slate-800/95 bg-[#0d1524] px-2.5 py-1.5 font-mono"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-100">{sc.symbol}</div>
                    <div className="text-[10px] text-slate-400">${sc.priceUsd.toFixed(4)}</div>
                  </div>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                      onPeg
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                    }`}
                  >
                    {onPeg ? 'ON PEG' : 'DEPEG WARN'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Crypto & Fear & Greed Sentiment */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-slate-300">
            <span>TIỀN SỐ REALTIME</span>
            {streamConnected && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.2 text-[9.5px] text-emerald-300">
                <Broadcast size={10} className="animate-pulse" />
                WS 1S
              </span>
            )}
          </h2>
          {markets.fearGreed && (
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-cyan-300 tabular-nums">
              <Gauge size={13} />
              F&amp;G: {markets.fearGreed.value}/100 ({markets.fearGreed.classification})
            </span>
          )}
        </div>

        {markets.fearGreed && (
          <div className="mt-1.5 rounded border border-slate-800/90 bg-[#0d1524] p-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${markets.fearGreed.value}%`,
                  backgroundColor:
                    markets.fearGreed.value >= 60
                      ? '#10b981'
                      : markets.fearGreed.value <= 35
                        ? '#f43f5e'
                        : '#f59e0b',
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
          {volatileCrypto.map((coin) => {
            const up = coin.changePercent24h >= 0;
            const flash = priceFlashes[coin.symbol];
            return (
              <div
                key={coin.id}
                className={`flex items-center justify-between px-2.5 py-1.5 transition-colors duration-300 ${
                  flash === 'up'
                    ? 'bg-emerald-500/22'
                    : flash === 'down'
                      ? 'bg-rose-500/22'
                      : ''
                }`}
              >
                <div>
                  <span className="font-mono text-xs font-semibold text-slate-100">
                    {coin.symbol}
                  </span>
                  <span className="ml-1.5 text-[11px] text-slate-400">{coin.name}</span>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div
                    className={`text-xs font-semibold ${
                      flash === 'up'
                        ? 'text-emerald-200'
                        : flash === 'down'
                          ? 'text-rose-200'
                          : 'text-slate-100'
                    }`}
                  >
                    $
                    {coin.priceUsd.toLocaleString('en-US', {
                      maximumFractionDigits: coin.priceUsd >= 10 ? 2 : 4,
                    })}
                  </div>
                  <div className="text-[10px]">
                    <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                      {up ? '+' : ''}
                      {coin.changePercent24h.toFixed(2)}%
                    </span>
                    <span className="ml-1.5 text-slate-500">
                      MCap {formatCompactUsd(coin.marketCapUsd)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* World Bank Macroeconomic Table */}
      <section>
        <h2 className="font-mono text-[11px] font-semibold tracking-wider text-slate-300">
          VĨ MÔ 8 NỀN KINH TẾ (WORLD BANK OPEN DATA)
        </h2>
        <div className="mt-1.5 overflow-x-auto rounded border border-slate-800/95 bg-[#0d1524]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 font-mono text-[10px] text-slate-400">
                <th className="px-2.5 py-1.5">QUỐC GIA</th>
                <th className="px-1.5 py-1.5 text-right">GDP %</th>
                <th className="px-1.5 py-1.5 text-right">CPI %</th>
                <th className="px-1.5 py-1.5 text-right">TN %</th>
                <th className="px-2.5 py-1.5 text-right">QUY MÔ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/75 font-mono text-[11px] tabular-nums">
              {markets.macro.map((row) => (
                <tr
                  key={row.countryCode}
                  className={row.isVietnam ? 'bg-emerald-500/12 text-emerald-200' : 'text-slate-200'}
                >
                  <td className="px-2.5 py-1.5 font-sans">
                    <div>
                      <span className="font-semibold">{row.countryName}</span>
                      <span className="ml-1 font-mono text-[9.5px] text-slate-400">
                        {row.countryCode}
                      </span>
                    </div>
                    {row.manufacturingGrowthPct !== null &&
                      row.manufacturingGrowthPct !== undefined && (
                        <div className="font-mono text-[9px] text-slate-400">
                          Chế tạo: {row.manufacturingGrowthPct >= 0 ? '+' : ''}
                          {row.manufacturingGrowthPct.toFixed(1)}%
                          {row.fdiPctGdp !== null && row.fdiPctGdp !== undefined
                            ? ` · FDI ${row.fdiPctGdp.toFixed(1)}%`
                            : ''}
                        </div>
                      )}
                  </td>
                  <td
                    className={`px-1.5 py-1.5 text-right font-semibold ${
                      (row.gdpGrowthPct ?? 0) >= 5
                        ? 'text-emerald-400'
                        : (row.gdpGrowthPct ?? 0) < 0
                          ? 'text-rose-400'
                          : 'text-slate-100'
                    }`}
                  >
                    {row.gdpGrowthPct !== null ? `${row.gdpGrowthPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-1.5 py-1.5 text-right text-amber-300">
                    {row.cpiInflationPct !== null ? `${row.cpiInflationPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-1.5 py-1.5 text-right text-slate-300">
                    {row.unemploymentPct !== null && row.unemploymentPct !== undefined
                      ? `${row.unemploymentPct.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-slate-300">
                    {formatCompactUsd(row.gdpCurrentUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Compact Top 5 Macro & Geopolitical Probability Indicators (Polymarket) */}
      {topMacroGeopoliticsPredictions.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-slate-300">
              <ChartBar size={13} className="text-cyan-400" />
              <span>CHỈ BÁO XÁC SUẤT VĨ MÔ &amp; ĐỊA CHÍNH TRỊ (TOP 5)</span>
            </h2>
            <span className="font-mono text-[9.5px] text-slate-500">Polymarket</span>
          </div>

          <div className="mt-1.5 divide-y divide-slate-800/80 rounded border border-slate-800/95 bg-[#0d1524]">
            {topMacroGeopoliticsPredictions.map((item) => {
              const label = translateVi ? item.titleVi || item.title : item.title;
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-2.5 py-2 transition hover:bg-[#111c30]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium leading-snug text-slate-100">
                        {label}
                      </span>
                      {item.outcomeLabel && (
                        <span className="ml-1.5 inline-block rounded border border-cyan-500/35 bg-cyan-500/12 px-1 py-0.2 font-mono text-[9px] text-cyan-200">
                          {item.outcomeLabel}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xs font-bold text-cyan-300 tabular-nums">
                      {item.yesPercent}%
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${Math.max(2, Math.min(98, item.yesPercent))}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[9.5px] text-slate-400 tabular-nums">
                      Vol {formatCompactUsd(item.volumeUsd)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
});

export default MarketsMacroTab;
