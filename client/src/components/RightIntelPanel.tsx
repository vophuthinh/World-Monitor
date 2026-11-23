import { Suspense, lazy, memo, useCallback, useMemo, useState } from 'react';
import {
  Buildings,
  ChartLineUp,
  Cpu,
  Newspaper,
  Scales,
  Target,
  X,
} from '@phosphor-icons/react';
import type {
  AiSitrepSnapshot,
  CollectorId,
  GeoPointFeature,
  GoogleTrendsSnapshot,
  HptCompanyIntelSnapshot,
  MarketSnapshot,
  NewsItem,
  NewsStreamStats,
  PolicyLegalSnapshot,
  PredictionItem,
  RegimeHistoryPoint,
  TechCyberSnapshot,
  VietnamEnvSnapshot,
} from '@shared/types';
import type { FlashDirection } from '../hooks/useMonitorData';
import { LiveIntelTab } from './right-panel/LiveIntelTab';
import type { NewsJumpPayload } from './right-panel/NewsFirehoseTab';
import type { TechCyberJumpPayload } from './right-panel/TechCyberTab';
import type { RightTabId } from './right-panel/shared';

const TechCyberTab = lazy(() => import('./right-panel/TechCyberTab'));
const NewsFirehoseTab = lazy(() => import('./right-panel/NewsFirehoseTab'));
const PolicyLegalTab = lazy(() => import('./right-panel/PolicyLegalTab'));
const MarketsMacroTab = lazy(() => import('./right-panel/MarketsMacroTab'));
const HptCorporateTab = lazy(() => import('./right-panel/HptCorporateTab'));

export interface RightIntelPanelProps {
  markets: MarketSnapshot;
  predictions: PredictionItem[];
  googleTrends?: GoogleTrendsSnapshot;
  news: NewsItem[];
  techCyber?: TechCyberSnapshot;
  policyLegal?: PolicyLegalSnapshot;
  vietnamEnv?: VietnamEnvSnapshot;
  hptIntel?: HptCompanyIntelSnapshot;
  hptSourceStale?: boolean;
  aiSitrep?: AiSitrepSnapshot;
  regimeHistory?: RegimeHistoryPoint[];
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  earthquakes?: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  cyberThreats: GeoPointFeature[];
  newsStreamStats?: NewsStreamStats;
  freshNewsIds?: ReadonlySet<string>;
  priceFlashes: Record<string, FlashDirection>;
  predictionFlashes?: Record<string, FlashDirection>;
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  streamConnected: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  onOpenWindy?: () => void;
  onClose?: () => void;
}

function TabLoadingFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 font-mono text-xs text-slate-400">
      Đang tải chuyên mục...
    </div>
  );
}

export const RightIntelPanel = memo(function RightIntelPanel({
  markets,
  predictions,
  googleTrends,
  news,
  techCyber,
  policyLegal,
  vietnamEnv,
  hptIntel,
  hptSourceStale,
  aiSitrep,
  regimeHistory = [],
  military,
  vessels,
  earthquakes = [],
  geopolitics,
  cyberThreats,
  newsStreamStats,
  freshNewsIds,
  priceFlashes,
  predictionFlashes = {},
  refreshingIds,
  onForceRefresh,
  streamConnected,
  onFlyToLocation,
  onOpenWindy,
  onClose,
}: RightIntelPanelProps) {
  const [activeTab, setActiveTab] = useState<RightTabId>('intel');
  const [translateVi, setTranslateVi] = useState<boolean>(true);
  const [techJumpPayload, setTechJumpPayload] = useState<TechCyberJumpPayload | null>(null);
  const [newsJumpPayload, setNewsJumpPayload] = useState<NewsJumpPayload | null>(null);

  const toggleTranslateVi = useCallback(() => {
    setTranslateVi((v) => !v);
  }, []);

  const handleJumpToTechCyber = useCallback((opts: { query?: string; scanIoc?: string }) => {
    setActiveTab('techCyber');
    setTechJumpPayload((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      ...opts,
    }));
  }, []);

  const handleJumpToNews = useCallback((query: string) => {
    setActiveTab('news');
    setNewsJumpPayload((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      query,
    }));
  }, []);

  const hptSentimentStats = useMemo(() => {
    const list = hptIntel?.items ?? [];
    let pos = 0;
    let neg = 0;
    let neu = 0;
    for (const it of list) {
      if (it.sentiment === 'positive') pos += 1;
      else if (it.sentiment === 'negative') neg += 1;
      else neu += 1;
    }
    return { pos, neg, neu, total: list.length };
  }, [hptIntel?.items]);

  const hptHasRecent24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return (hptIntel?.items ?? []).some((it) => it.publishedAt >= cutoff);
  }, [hptIntel?.items]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-800/95 bg-[#090e18] lg:w-[454px] xl:w-[494px] 2xl:w-[548px]">
      {/* Command Header: Live Intel · AI & ML · Tin nóng · Chính sách · Thị trường · HPT */}
      <div className="flex shrink-0 items-stretch border-b border-slate-800/95 bg-[#070b12]">
        <nav aria-label="Chuyên mục bảng Intel" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('intel')}
          aria-pressed={activeTab === 'intel'}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-semibold transition lg:flex-1 lg:px-1 lg:text-[10.5px] xl:text-[11px] ${
            activeTab === 'intel'
              ? 'border-fuchsia-400 bg-fuchsia-500/12 text-fuchsia-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Target size={13} className="shrink-0" />
          <span>Live Intel</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('techCyber')}
          aria-pressed={activeTab === 'techCyber'}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-semibold transition lg:flex-1 lg:px-1 lg:text-[10.5px] xl:text-[11px] ${
            activeTab === 'techCyber'
              ? 'border-violet-400 bg-violet-500/12 text-violet-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu size={13} className="shrink-0" />
          <span>AI &amp; ML</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('news')}
          aria-pressed={activeTab === 'news'}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-semibold transition lg:flex-1 lg:px-1 lg:text-[10.5px] xl:text-[11px] ${
            activeTab === 'news'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Newspaper size={13} className="shrink-0" />
          <span>Tin nóng</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('policy')}
          aria-pressed={activeTab === 'policy'}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-semibold transition lg:flex-1 lg:px-1 lg:text-[10.5px] xl:text-[11px] ${
            activeTab === 'policy'
              ? 'border-amber-400 bg-amber-500/12 text-amber-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scales size={13} className="shrink-0" />
          <span>Chính sách</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('markets')}
          aria-pressed={activeTab === 'markets'}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-semibold transition lg:flex-1 lg:px-1 lg:text-[10.5px] xl:text-[11px] ${
            activeTab === 'markets'
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ChartLineUp size={13} className="shrink-0" />
          <span>Thị trường</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('hpt')}
          aria-pressed={activeTab === 'hpt'}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-xs font-semibold transition lg:flex-1 lg:px-1 lg:text-[10.5px] xl:text-[11px] ${
            activeTab === 'hpt'
              ? 'border-emerald-400 bg-emerald-500/12 text-emerald-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Buildings size={13} className="shrink-0" />
          <span>HPT</span>
          {hptSentimentStats.neg > 0 ? (
            <span
              title={`${hptSentimentStats.neg} bài mang sắc thái tiêu cực cần chú ý`}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.9)]"
            />
          ) : hptHasRecent24h ? (
            <span
              title="Có bài viết mới về HPT trong 24 giờ qua"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]"
            />
          ) : null}
        </button>
        </nav>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng Intel"
            autoFocus
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border-l border-slate-800 text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {activeTab === 'intel' && (
        <LiveIntelTab
          predictions={predictions}
          googleTrends={googleTrends}
          news={news}
          techCyber={techCyber}
          policyLegal={policyLegal}
          vietnamEnv={vietnamEnv}
          aiSitrep={aiSitrep}
          military={military}
          vessels={vessels}
          earthquakes={earthquakes}
          geopolitics={geopolitics}
          cyberThreats={cyberThreats}
          predictionFlashes={predictionFlashes}
          refreshingIds={refreshingIds}
          onForceRefresh={onForceRefresh}
          streamConnected={streamConnected}
          onFlyToLocation={onFlyToLocation}
          onOpenWindy={onOpenWindy}
          translateVi={translateVi}
          onToggleTranslateVi={toggleTranslateVi}
          onJumpToTechCyber={handleJumpToTechCyber}
          onJumpToNews={handleJumpToNews}
        />
      )}

      {activeTab !== 'intel' && (
        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'techCyber' && (
            <TechCyberTab
              techCyber={techCyber}
              cyberThreats={cyberThreats}
              refreshingIds={refreshingIds}
              onForceRefresh={onForceRefresh}
              onFlyToLocation={onFlyToLocation}
              translateVi={translateVi}
              onToggleTranslateVi={toggleTranslateVi}
              jumpPayload={techJumpPayload}
            />
          )}
          {activeTab === 'news' && (
            <NewsFirehoseTab
              news={news}
              newsStreamStats={newsStreamStats}
              freshNewsIds={freshNewsIds}
              onFlyToLocation={onFlyToLocation}
              translateVi={translateVi}
              onToggleTranslateVi={toggleTranslateVi}
              jumpPayload={newsJumpPayload}
            />
          )}
          {activeTab === 'policy' && (
            <PolicyLegalTab
              policyLegal={policyLegal}
              refreshingIds={refreshingIds}
              onForceRefresh={onForceRefresh}
            />
          )}
          {activeTab === 'markets' && (
            <MarketsMacroTab
              markets={markets}
              predictions={predictions}
              regimeHistory={regimeHistory}
              military={military}
              vessels={vessels}
              geopolitics={geopolitics}
              priceFlashes={priceFlashes}
              refreshingIds={refreshingIds}
              onForceRefresh={onForceRefresh}
              streamConnected={streamConnected}
              onFlyToLocation={onFlyToLocation}
              translateVi={translateVi}
            />
          )}
          {activeTab === 'hpt' && (
            <HptCorporateTab
              hptIntel={hptIntel}
              sourceStale={hptSourceStale}
              sentimentStats={hptSentimentStats}
              refreshingIds={refreshingIds}
              onForceRefresh={onForceRefresh}
              onFlyToLocation={onFlyToLocation}
            />
          )}
        </Suspense>
      )}
    </aside>
  );
});
