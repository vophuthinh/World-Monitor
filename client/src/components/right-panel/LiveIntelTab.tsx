import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Translate } from '@phosphor-icons/react';
import {
  type IntelTopicId,
  classifyLiveIntelTopics,
  computeCountryInstabilityScores,
  computeGlobalThreatLevel,
  computeTheaterPostures,
  detectTrendingSpikes,
  selectTopHotPolymarket,
} from '@shared/intelligence';
import type {
  AiAskResponse,
  AiSitrepSnapshot,
  CollectorId,
  GeoPointFeature,
  GoogleTrendGeo,
  GoogleTrendsSnapshot,
  NewsItem,
  PolicyLegalSnapshot,
  PredictionItem,
  TechCyberSnapshot,
  RegionalWarningsSnapshot,
  VietnamEnvSnapshot,
} from '@shared/types';
import { ThreatSummaryBar } from './ThreatSummaryBar';
import { AiSitrepCopilotSection } from './AiSitrepCopilotSection';
import { TheaterPostureSection } from './TheaterPostureSection';
import { WatchlistSection } from './WatchlistSection';
import { TrendingSpikesSection } from './TrendingSpikesSection';
import { InstabilityIndexSection } from './InstabilityIndexSection';
import { GoogleTrendsSection } from './GoogleTrendsSection';
import { IntelFeedsSection } from './IntelFeedsSection';
import { PolymarketSection } from './PolymarketSection';
import { RegionalWarningsSection } from './RegionalWarningsSection';
import { VietnamEnvSection } from './VietnamEnvSection';
import type { FlashDirection } from '../../hooks/useMonitorData';

export interface LiveIntelTabProps {
  predictions: PredictionItem[];
  googleTrends?: GoogleTrendsSnapshot;
  news: NewsItem[];
  techCyber?: TechCyberSnapshot;
  policyLegal?: PolicyLegalSnapshot;
  vietnamEnv?: VietnamEnvSnapshot;
  regionalWarnings?: RegionalWarningsSnapshot;
  aiSitrep?: AiSitrepSnapshot;
  military: GeoPointFeature[];
  vessels: GeoPointFeature[];
  earthquakes: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  cyberThreats: GeoPointFeature[];
  predictionFlashes: Record<string, FlashDirection>;
  refreshingIds?: ReadonlySet<string>;
  onForceRefresh?: (collectorId: CollectorId | 'polymarket-news') => void;
  streamConnected: boolean;
  onFlyToLocation: (lat: number, lon: number, zoom?: number) => void;
  onOpenWindy?: () => void;
  translateVi: boolean;
  onToggleTranslateVi: () => void;
  onJumpToTechCyber: (opts: { query?: string; scanIoc?: string }) => void;
  onJumpToNews: (query: string) => void;
}

export const LiveIntelTab = memo(function LiveIntelTab({
  predictions,
  googleTrends,
  news,
  techCyber,
  policyLegal,
  vietnamEnv,
  regionalWarnings,
  aiSitrep,
  military,
  vessels,
  earthquakes,
  geopolitics,
  cyberThreats,
  predictionFlashes,
  refreshingIds,
  onForceRefresh,
  streamConnected,
  onFlyToLocation,
  onOpenWindy,
  translateVi,
  onToggleTranslateVi,
  onJumpToTechCyber,
  onJumpToNews,
}: LiveIntelTabProps) {
  const [intelTopic, setIntelTopic] = useState<IntelTopicId | 'c2_ioc'>('cyber');
  const [trendGeo, setTrendGeo] = useState<GoogleTrendGeo>('VN');

  const [localSitrep, setLocalSitrep] = useState<AiSitrepSnapshot | null>(null);
  const [sitrepRefreshing, setSitrepRefreshing] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askReply, setAskReply] = useState<AiAskResponse | null>(null);

  const effectiveSitrep = localSitrep ?? aiSitrep ?? null;

  const refreshAiSitrep = useCallback(async () => {
    setSitrepRefreshing(true);
    try {
      const resp = await fetch('/api/ai-sitrep/refresh', { method: 'POST' });
      if (resp.ok) {
        const snap = (await resp.json()) as AiSitrepSnapshot;
        setLocalSitrep(snap);
      }
    } catch {
      // Keep current sitrep
    } finally {
      setSitrepRefreshing(false);
    }
  }, []);

  const submitAiQuestion = useCallback(
    async (overridePrompt?: string) => {
      const q = (overridePrompt ?? askInput).trim();
      if (!q) return;
      if (overridePrompt) setAskInput(overridePrompt);
      setAskLoading(true);
      setAskError(null);
      try {
        const resp = await fetch('/api/ai-ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        });
        const body = (await resp.json()) as AiAskResponse & { error?: string };
        if (!resp.ok || body.error) {
          throw new Error(body.error || `HTTP ${resp.status}`);
        }
        setAskReply(body);
      } catch (err) {
        setAskError(err instanceof Error ? err.message : 'Không thể kết nối Trợ lý AI');
      } finally {
        setAskLoading(false);
      }
    },
    [askInput],
  );

  const [watchlistTerms, setWatchlistTerms] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('wm_watchlist_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 10);
      }
    } catch {
      // Ignore storage errors
    }
    return ['Biển Đông', 'Nghị quyết 57', 'Zero-Day', 'TSMC'];
  });
  const [newWatchTerm, setNewWatchTerm] = useState('');
  const [selectedWatchTerm, setSelectedWatchTerm] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('wm_watchlist_v1', JSON.stringify(watchlistTerms));
    } catch {
      // Ignore storage errors
    }
  }, [watchlistTerms]);

  const techItems = techCyber?.items ?? [];

  const theaterPostures = useMemo(
    () => computeTheaterPostures({ military, vessels, geopolitics, cyberThreats }),
    [military, vessels, geopolitics, cyberThreats],
  );

  const globalThreat = useMemo(
    () =>
      computeGlobalThreatLevel({
        theaterPostures,
        cyberCount: cyberThreats.length,
        earthquakeMajorCount: earthquakes.filter((e) => (e.magnitude ?? 0) >= 5.0).length,
        geopoliticsCriticalCount: geopolitics.filter((g) => g.severity === 'critical').length,
      }),
    [theaterPostures, cyberThreats.length, earthquakes, geopolitics],
  );

  const ciiScores = useMemo(
    () => computeCountryInstabilityScores({ geopolitics, military, cyberThreats, news }),
    [geopolitics, military, cyberThreats, news],
  );

  const intelTopicBuckets = useMemo(
    () => classifyLiveIntelTopics(news, techItems),
    [news, techItems],
  );

  const trendingSpikes = useMemo(
    () => detectTrendingSpikes(news, techItems),
    [news, techItems],
  );

  const watchlistHitsMap = useMemo(() => {
    const out = new Map<
      string,
      Array<{ id: string; title: string; source: string; url: string; publishedAt: number }>
    >();
    for (const term of watchlistTerms) {
      const q = term.trim().toLowerCase();
      if (!q) continue;
      const matches: Array<{ id: string; title: string; source: string; url: string; publishedAt: number }> = [];
      for (const n of news) {
        if (`${n.title} ${n.titleVi ?? ''} ${n.matchedLocation ?? ''}`.toLowerCase().includes(q)) {
          matches.push({
            id: `wl-n:${n.id}`,
            title: translateVi ? n.titleVi || n.title : n.title,
            source: n.source,
            url: n.url,
            publishedAt: n.publishedAt,
          });
        }
      }
      for (const t of techItems) {
        if (`${t.title} ${t.titleVi ?? ''} ${t.cveId ?? ''}`.toLowerCase().includes(q)) {
          matches.push({
            id: `wl-t:${t.id}`,
            title: translateVi ? t.titleVi || t.title : t.title,
            source: t.source,
            url: t.url,
            publishedAt: t.publishedAt,
          });
        }
      }
      for (const p of policyLegal?.items ?? []) {
        if (`${p.title} ${p.docCode ?? ''} ${p.sector}`.toLowerCase().includes(q)) {
          matches.push({
            id: `wl-p:${p.id}`,
            title: p.title,
            source: p.source,
            url: p.pdfUrl ?? p.url,
            publishedAt: p.publishedAt,
          });
        }
      }
      out.set(term, matches.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 8));
    }
    return out;
  }, [watchlistTerms, news, techItems, policyLegal?.items, translateVi]);

  const top5HotPolymarket = useMemo(() => selectTopHotPolymarket(predictions, 5), [predictions]);

  const activeGoogleTrends = useMemo(
    () => (trendGeo === 'VN' ? googleTrends?.vn ?? [] : googleTrends?.global ?? []),
    [googleTrends, trendGeo],
  );

  return (
    <div className="flex-1 space-y-3.5 overflow-y-auto p-2.5">
      {/* Top Bar: Global Threat DEFCON + Live Telemetry Summary + Translate Toggle */}
      <ThreatSummaryBar globalThreat={globalThreat} military={military} vessels={vessels} cyberThreats={cyberThreats} translateVi={translateVi} onToggleTranslateVi={onToggleTranslateVi} />

      {/* 0. Groq LPU AI Executive Sitrep & Interactive "Ask Monitor" Copilot */}
      <AiSitrepCopilotSection effectiveSitrep={effectiveSitrep} sitrepRefreshing={sitrepRefreshing} refreshAiSitrep={refreshAiSitrep} askInput={askInput} setAskInput={setAskInput} askLoading={askLoading} askError={askError} askReply={askReply} setAskReply={setAskReply} submitAiQuestion={submitAiQuestion} />

      {/* 1. AI Strategic Theater Posture (6 Operational Theaters) */}
      <TheaterPostureSection theaterPostures={theaterPostures} onFlyToLocation={onFlyToLocation} />

      {/* 1b. Vietnam Marine Weather, UV/Rain, AQI & NCHMF Storm Alerts */}
      {vietnamEnv && vietnamEnv.locations.length > 0 && (
        <VietnamEnvSection
          vietnamEnv={vietnamEnv}
          onFlyToLocation={onFlyToLocation}
          onForceRefresh={onForceRefresh}
          onOpenWindy={onOpenWindy}
          refreshingIds={refreshingIds}
        />
      )}

      {/* 1c. Official warnings from neighbouring agencies (BMKG Indonesia, HKO Hong Kong) */}
      <RegionalWarningsSection regionalWarnings={regionalWarnings} />

      {/* 2. Polymarket Top 5 Hottest Realtime */}
      <PolymarketSection
        top5HotPolymarket={top5HotPolymarket}
        predictionFlashes={predictionFlashes}
        streamConnected={streamConnected}
        translateVi={translateVi}
        onForceRefresh={onForceRefresh}
        refreshingIds={refreshingIds}
      />

      {/* 3. Google Trends Realtime */}
      <GoogleTrendsSection
        activeGoogleTrends={activeGoogleTrends}
        googleTrends={googleTrends}
        trendGeo={trendGeo}
        setTrendGeo={setTrendGeo}
        translateVi={translateVi}
        onFlyToLocation={onFlyToLocation}
        onForceRefresh={onForceRefresh}
        refreshingIds={refreshingIds}
      />

      {/* 4. Custom Watchlist Keyword Alerts */}
      <WatchlistSection watchlistTerms={watchlistTerms} setWatchlistTerms={setWatchlistTerms} newWatchTerm={newWatchTerm} setNewWatchTerm={setNewWatchTerm} selectedWatchTerm={selectedWatchTerm} setSelectedWatchTerm={setSelectedWatchTerm} watchlistHitsMap={watchlistHitsMap} />

      {/* 5. Surging Keywords & CVE Spike Detector */}
      <TrendingSpikesSection trendingSpikes={trendingSpikes} onJumpToNews={onJumpToNews} onJumpToTechCyber={onJumpToTechCyber} />

      {/* 6. Live Intelligence Feeds & Cyber IOCs */}
      <IntelFeedsSection
        cyberThreats={cyberThreats}
        intelTopic={intelTopic}
        setIntelTopic={setIntelTopic}
        intelTopicBuckets={intelTopicBuckets}
        translateVi={translateVi}
        onFlyToLocation={onFlyToLocation}
        onJumpToTechCyber={onJumpToTechCyber}
      />

      {/* 7. Country Instability & Strategic Risk Index (CII) */}
      <InstabilityIndexSection ciiScores={ciiScores} onFlyToLocation={onFlyToLocation} />
    </div>
  );
});

export default LiveIntelTab;
