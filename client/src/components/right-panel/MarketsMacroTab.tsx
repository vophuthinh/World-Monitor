import { memo, useEffect, useMemo, useState } from 'react';
import {
  buildMarketCatalystCalendar,
  evaluateChokepointMarketImpacts,
} from '@shared/catalysts-and-chokepoints';
import {
  collectExpiredMacroNotices,
  evaluateInvestmentCompass,
  evaluateMacroHealth,
} from '@shared/macro-health';
import { collectObservationWarnings } from '@shared/macro/observation-freshness';
import type {
  CollectorId,
  GeoPointFeature,
  MarketSnapshot,
  PredictionItem,
  RegimeHistoryPoint,
} from '@shared/types';
import { InvestmentCompassSection } from './InvestmentCompassSection';
import { ExpiredMacroNotices, MacroHealthSection } from './MacroHealthSection';
import { CatalystCalendarSection } from './markets/CatalystCalendarSection';
import { ChokepointImpactSection } from './markets/ChokepointImpactSection';
import { VnGoldSection } from './markets/VnGoldSection';
import { Vn30Section } from './markets/Vn30Section';
import { FxRatesSection } from './markets/FxRatesSection';
import { FredSection } from './markets/FredSection';
import { IndicesCommoditiesSection } from './markets/IndicesCommoditiesSection';
import { StablecoinSection } from './markets/StablecoinSection';
import { CryptoSentimentSection } from './markets/CryptoSentimentSection';
import { WorldBankSection } from './markets/WorldBankSection';
import { PredictionOddsSection } from './markets/PredictionOddsSection';
import type { FlashDirection } from '../../hooks/useMonitorData';

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
  onFlyToLocation,
  translateVi,
}: MarketsMacroTabProps) {
  const [macroRegion, setMacroRegion] = useState<'VN' | 'US'>('VN');
  const [calendarNow, setCalendarNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCalendarNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
    [markets.updatedAt, markets.fred, markets.macro, markets.vnMacroPulse, markets.expiredMacroNotices, usdVndPrice, vniQuoteRef, predictions, calendarNow],
  );
  const expiredNotices = useMemo(
    () => collectExpiredMacroNotices(markets),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markets.updatedAt, markets.fred, markets.vnMacroPulse, markets.expiredMacroNotices, usdVndPrice, vniQuoteRef, calendarNow],
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
      calendarNow,
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

  const observationWarnings = useMemo(
    () => collectObservationWarnings(markets, calendarNow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markets.fred, markets.vnMacroPulse, markets.macro, calendarNow],
  );

  const catalystCalendar = useMemo(
    () => buildMarketCatalystCalendar(calendarNow, investmentCompass?.polymarketFedSummary),
    [calendarNow, investmentCompass?.polymarketFedSummary],
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
      {/* Macroeconomic Health & Regime Diagnosis Radar */}
      <p className="mt-1 text-xs text-slate-300">
        Dữ liệu giữ lại quá 7 ngày từ lần lấy thành công không được dùng để chấm điểm.
      </p>
      {(['vn', 'us'] as const).map((region) => observationWarnings[region].length > 0 && (
        <details key={region} className="rounded border border-amber-500/45 bg-amber-950/35 px-2 py-1.5 text-xs text-amber-200">
          <summary className="cursor-pointer">
            ⚠ {region === 'vn' ? 'Việt Nam' : 'Mỹ'}: kỳ quan sát có thể cũ hoặc chưa rõ ({observationWarnings[region].length} chỉ báo)
          </summary>
          <p>Ngưỡng cảnh báo tham khảo theo tần suất, không tự loại khỏi điểm; các quy tắc lọc khác vẫn áp dụng.</p>
          <ul>{observationWarnings[region].map((warning) => <li key={warning}>• {warning}</li>)}</ul>
        </details>
      ))}
      {!macroHealth.vn && expiredNotices.vn.length > 0 && (
        <div className="rounded border border-rose-500/45 bg-rose-950/35 px-2.5 py-1.5 font-mono text-xs text-rose-200">
          ⚠️ Chưa đủ dữ liệu để chấm điểm vĩ mô Việt Nam.
          <ExpiredMacroNotices notices={expiredNotices.vn} />
        </div>
      )}
      {!macroHealth.us && expiredNotices.us.length > 0 && (
        <div className="rounded border border-rose-500/45 bg-rose-950/35 px-2.5 py-1.5 font-mono text-xs text-rose-200">
          ⚠️ Chưa đủ dữ liệu để chấm điểm vĩ mô Mỹ.
          <ExpiredMacroNotices notices={expiredNotices.us} />
        </div>
      )}
      {activeMacroReport && (
        <MacroHealthSection
          activeMacroReport={activeMacroReport}
          macroHealth={macroHealth}
          setMacroRegion={setMacroRegion}
          onForceRefresh={onForceRefresh}
          refreshingIds={refreshingIds}
        />
      )}

      {/* Upcoming Macro & VN30 Derivatives Catalyst Countdown Calendar */}
      <CatalystCalendarSection catalystCalendar={catalystCalendar} />

      {/* Forward-Looking Investment Compass & Leading Indicators */}
      {investmentCompass && (
        <InvestmentCompassSection investmentCompass={investmentCompass} regimeHistory={regimeHistory} />
      )}

      {/* Cross-Domain Maritime Chokepoints <-> Commodity & HOSE Sector Impact Matrix */}
      <ChokepointImpactSection chokepointImpacts={chokepointImpacts} onFlyToLocation={onFlyToLocation} />

      {/* Vietnam Domestic Gold */}
      <VnGoldSection markets={markets} onForceRefresh={onForceRefresh} refreshingIds={refreshingIds} />

      {/* Top 10 VN30 Leading Stocks */}
      <Vn30Section markets={markets} />

      {/* FX Rates */}
      <FxRatesSection fxQuotes={fxQuotes} />

      {/* FRED Live Telemetry */}
      <FredSection markets={markets} />

      {/* Global & Vietnam Indices + Strategic Commodities */}
      <IndicesCommoditiesSection indexAndCommodityQuotes={indexAndCommodityQuotes} priceFlashes={priceFlashes} />

      {/* Stablecoin Peg Monitor */}
      <StablecoinSection stablecoins={stablecoins} />

      {/* Crypto & Fear & Greed Sentiment */}
      <CryptoSentimentSection markets={markets} priceFlashes={priceFlashes} volatileCrypto={volatileCrypto} />

      {/* World Bank Macroeconomic Table */}
      <WorldBankSection markets={markets} />

      {/* Compact Top 5 Macro & Geopolitical Probability Indicators (Polymarket) */}
      <PredictionOddsSection topMacroGeopoliticsPredictions={topMacroGeopoliticsPredictions} translateVi={translateVi} />
    </div>
  );
});

export default MarketsMacroTab;
