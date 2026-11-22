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
import { InvestmentCompassSection } from './InvestmentCompassSection';
import { MacroHealthSection } from './MacroHealthSection';
import type { FlashDirection } from '../../hooks/useMonitorData';
import { MiniSparkline, formatCompactUsd } from './shared';

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
        <MacroHealthSection
          activeMacroReport={activeMacroReport}
          macroHealth={macroHealth}
          setMacroRegion={setMacroRegion}
          onForceRefresh={onForceRefresh}
          refreshingIds={refreshingIds}
        />
      )}

      {/* Forward-Looking Investment Compass & Leading Indicators */}
      {investmentCompass && (
        <InvestmentCompassSection investmentCompass={investmentCompass} regimeHistory={regimeHistory} />
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
