import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type {
  AiSitrepSnapshot,
  GeoPointFeature,
  GoogleTrendsSnapshot,
  HptCompanyIntelSnapshot,
  MacroCountryIndicator,
  MarketSnapshot,
  NewsItem,
  PolicyLegalSnapshot,
  PredictionItem,
  TechCyberSnapshot,
  VietnamEnvSnapshot,
} from '@shared/types';
import { createApp } from './app';
import { CollectorScheduler } from './cache/scheduler';
import { SnapshotStore } from './cache/snapshot-store';
import { fetchCyberThreats } from './collectors/cyber-threats';
import { fetchEarthquakes } from './collectors/earthquakes';
import { fetchGeopoliticsGdelt } from './collectors/geopolitics-gdelt';
import { fetchGoogleTrendsRealtime } from './collectors/google-trends';
import { fetchHptCompanyIntelligence } from './collectors/hpt-company-intel';
import { fetchWorldBankMacro } from './collectors/macro-worldbank';
import { MaritimeVesselStreamManager } from './collectors/maritime-vessels';
import { fetchMarketsAndCrypto } from './collectors/markets-crypto';
import { fetchMilitaryFlights } from './collectors/military-flights';
import { fetchNaturalEvents } from './collectors/natural-events';
import { fetchCuratedRssNews, fetchPolymarketPredictions } from './collectors/polymarket-news';
import { fetchTechCyberIntelligence } from './collectors/tech-cyber-intel';
import { fetchGpsAndBgpOutages, fetchVietnamEnvironment } from './collectors/vietnam-env-outages';
import { fetchVietnamPolicyLegal } from './collectors/vietnam-policy-legal';
import { fetchWeatherRadar } from './collectors/weather-radar';
import { generateAiSitrep } from './lib/groq-intel';
import { RegimeHistoryLedger } from './lib/regime-ledger';
import { TelegramAlertEngine } from './lib/telegram-alerter';
import { BinanceRealtimeStream } from './realtime/binance-stream';
import { RealtimeHub } from './realtime/hub';
import { UnifiedNewsStreamService } from './realtime/news-stream';
import { PolymarketRealtimeStream } from './realtime/polymarket-stream';

for (const envName of ['.env.local', '.env']) {
  const full = resolve(process.cwd(), envName);
  if (existsSync(full) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(full);
    } catch {
      // Ignore optional env load errors
    }
  }
}

const PORT = Number(process.env.PORT ?? 8787);
const CACHE_DIR = resolve(process.cwd(), '.cache');

export function buildProductionRuntime(cacheDir = CACHE_DIR) {
  const store = new SnapshotStore(cacheDir);
  const hub = new RealtimeHub();
  const regimeLedger = new RegimeHistoryLedger(cacheDir);
  const telegramAlerter = new TelegramAlertEngine(cacheDir);
  const vesselManager = new MaritimeVesselStreamManager(hub, process.env.AISSTREAM_API_KEY);
  const newsStream = new UnifiedNewsStreamService(hub, store);
  const polymarketStream = new PolymarketRealtimeStream(hub, store);

  hub.subscribe((ev) => {
    if (ev.type === 'breaking_alert') {
      void telegramAlerter.forwardBreakingTacticalAlert(ev.alert);
    }
  });

  const scheduler = new CollectorScheduler(store, (id, data) => {
    const now = Date.now();
    if (id === 'military-flights' && Array.isArray(data)) {
      const flights = data as GeoPointFeature[];
      hub.ingestForAlerts(id, flights);
      hub.publish({ type: 'military_update', military: flights, ts: now });
    } else if (id === 'maritime-vessels' && Array.isArray(data)) {
      const vessels = data as GeoPointFeature[];
      hub.ingestForAlerts(id, vessels);
      hub.publish({ type: 'vessels_update', vessels, ts: now });
    } else if ((id === 'earthquakes' || id === 'natural-events') && Array.isArray(data)) {
      hub.ingestForAlerts(id, data as GeoPointFeature[]);
    } else if (id === 'rss-news' && Array.isArray(data)) {
      newsStream.ingestBatchItems(data as NewsItem[], true);
    } else if (id === 'geopolitics-gdelt' && Array.isArray(data)) {
      void newsStream.ingestGdeltGeoFeatures(data as GeoPointFeature[]);
    } else if (id === 'polymarket' && Array.isArray(data)) {
      const predictions = data as PredictionItem[];
      polymarketStream.syncTokens(predictions);
      hub.publish({ type: 'polymarket_update', predictions, ts: now });
    } else if (id === 'google-trends' && data && typeof data === 'object') {
      hub.publish({
        type: 'google_trends_update',
        googleTrends: data as GoogleTrendsSnapshot,
        ts: now,
      });
    }

    if (id === 'markets-crypto' || id === 'macro-worldbank' || id === 'polymarket') {
      const rawMarkets = store.get<MarketSnapshot>('markets-crypto', now);
      const macro =
        store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? rawMarkets?.macro ?? [];
      const preds = store.get<PredictionItem[]>('polymarket', now) ?? [];
      regimeLedger.recordSnapshot(rawMarkets, macro, preds, now);
    }

    void telegramAlerter.evaluateCollectorUpdate(id, store);

    hub.publish({
      type: 'collector_sync',
      collectorId: id,
      health: store.getAllHealth(now),
      ts: now,
    });
  });

  // 30s multi-provider ADS-B military aircraft polling (adsb.fi + adsb.lol failover) + client Dead-Reckoning
  scheduler.registerCollector({
    id: 'military-flights',
    label: 'Quân sự ADS-B (adsb.fi + adsb.lol · 30s)',
    intervalMs: 30_000,
    retainMs: 30 * 60_000,
    countItems: (items) => items.length,
    fetcher: () => fetchMilitaryFlights(),
  });

  // Real-time AISStream Biển Đông/Malacca WebSocket + 45s Open AIS snapshot
  scheduler.registerCollector({
    id: 'maritime-vessels',
    label: vesselManager.isAisStreamConfigured()
      ? 'Tàu biển AIS (AISStream WS + Open AIS · 45s)'
      : 'Tàu biển AIS (Open Maritime · 45s)',
    intervalMs: 45_000,
    retainMs: 60 * 60_000,
    countItems: (items) => items.length,
    fetcher: () => vesselManager.fetchSnapshot(),
  });

  scheduler.registerCollector({
    id: 'cyber-threats',
    label: 'Đe dọa Mạng C2/APT (Feodo + C2Intel + SANS + FireHOL · 6p)',
    intervalMs: 360_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchCyberThreats(),
  });

  scheduler.registerCollector({
    id: 'gps-outages',
    label: 'Tác chiến Điện tử GPS (NIC≤4) & Định tuyến BGP (6p)',
    intervalMs: 360_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchGpsAndBgpOutages(),
  });

  scheduler.registerCollector({
    id: 'earthquakes',
    label: 'Động đất Toàn cầu (USGS · 3p)',
    intervalMs: 180_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchEarthquakes(),
  });

  scheduler.registerCollector({
    id: 'natural-events',
    label: 'Thiên tai, Bão & Điểm nhiệt (GDACS + EONET + NWS + FIRMS · 10p)',
    intervalMs: 600_000,
    retainMs: 18 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchNaturalEvents(),
  });

  scheduler.registerCollector({
    id: 'geopolitics-gdelt',
    label: 'Địa chính trị (GDELT v2 · 10p)',
    intervalMs: 600_000,
    retainMs: 12 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchGeopoliticsGdelt(),
  });

  scheduler.registerCollector({
    id: 'weather-radar',
    label: 'Radar Mưa/Bão (RainViewer · 5p)',
    intervalMs: 300_000,
    retainMs: 2 * 3_600_000,
    countItems: (radar) => (radar ? radar.pastFrames.length : 0),
    fetcher: () => fetchWeatherRadar(),
  });

  scheduler.registerCollector<VietnamEnvSnapshot>({
    id: 'vietnam-env',
    label: 'Khí tượng, Sóng Biển Đông, NCHMF & AQI VN (5p)',
    intervalMs: 300_000,
    retainMs: 4 * 3_600_000,
    countItems: (snap) => snap.locations.length + (snap.alerts?.length ?? 0),
    fetcher: () => fetchVietnamEnvironment(),
  });

  scheduler.registerCollector<MarketSnapshot>({
    id: 'markets-crypto',
    label: 'Tài chính, Vàng SJC, VN30, FRED & Crypto (+ WS · 2p)',
    intervalMs: 120_000,
    retainMs: 6 * 3_600_000,
    countItems: (snap) =>
      snap.quotes.length + snap.crypto.length + (snap.vnGold?.length ?? 0) + (snap.vn30?.length ?? 0),
    fetcher: (prev) => fetchMarketsAndCrypto(prev),
  });

  scheduler.registerCollector({
    id: 'macro-worldbank',
    label: 'Vĩ mô 8 nền kinh tế (World Bank · 6h)',
    intervalMs: 21_600_000,
    retainMs: 7 * 86_400_000,
    countItems: (rows) => rows.length,
    fetcher: () => fetchWorldBankMacro(),
  });

  scheduler.registerCollector({
    id: 'polymarket',
    label: 'Polymarket Top Hot (+ CLOB Live WS · 90s)',
    intervalMs: 90_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchPolymarketPredictions(),
  });

  scheduler.registerCollector<GoogleTrendsSnapshot>({
    id: 'google-trends',
    label: 'Google Trends Realtime (VN + Thế giới · 3p)',
    intervalMs: 180_000,
    retainMs: 6 * 3_600_000,
    countItems: (snap) => snap.vn.length + snap.global.length,
    fetcher: () => fetchGoogleTrendsRealtime(),
  });

  scheduler.registerCollector({
    id: 'rss-news',
    label: 'News Stream (RSS + Wiki SSE + GDELT + Reddit · 4p)',
    intervalMs: 240_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => Math.max(items.length, newsStream.getUnifiedNews().length),
    fetcher: () => fetchCuratedRssNews(),
  });

  scheduler.registerCollector<TechCyberSnapshot>({
    id: 'tech-cyber',
    label: 'AI · GitHub Trending & Releases · Cyber NVD/KEV (5p)',
    intervalMs: 300_000,
    retainMs: 8 * 3_600_000,
    countItems: (snap) =>
      snap.items.length + (snap.githubTrending?.daily.length ?? 0),
    fetcher: () => fetchTechCyberIntelligence(),
  });

  scheduler.registerCollector<PolicyLegalSnapshot>({
    id: 'policy-legal',
    label: 'Policy Radar VN (Bộ tứ NQ · Bộ KH&CN · Công báo · 5p)',
    intervalMs: 300_000,
    retainMs: 12 * 3_600_000,
    countItems: (snap) => snap.items.length,
    fetcher: () => fetchVietnamPolicyLegal(),
  });

  scheduler.registerCollector<HptCompanyIntelSnapshot>({
    id: 'hpt-intel',
    label: 'Tin về HPT (HNX/UBCK + Đấu thầu + Simplize · 5p)',
    intervalMs: 300_000,
    retainMs: 12 * 3_600_000,
    countItems: (snap) => snap.items.length + (snap.stock ? 1 : 0),
    fetcher: (prev) => fetchHptCompanyIntelligence(prev),
  });

  scheduler.registerCollector<AiSitrepSnapshot>({
    id: 'ai-sitrep',
    label: 'Bản tin Tình báo AI Sitrep (Groq LPU · 15p)',
    intervalMs: 900_000,
    retainMs: 6 * 3_600_000,
    countItems: (snap) => snap.bullets.length,
    fetcher: () => generateAiSitrep(store, true),
  });

  const binanceStream = new BinanceRealtimeStream(hub, store);

  return {
    store,
    hub,
    scheduler,
    binanceStream,
    polymarketStream,
    vesselManager,
    newsStream,
    regimeLedger,
    telegramAlerter,
  };
}

async function main(): Promise<void> {
  const {
    store,
    hub,
    scheduler,
    binanceStream,
    polymarketStream,
    vesselManager,
    newsStream,
    regimeLedger,
    telegramAlerter,
  } = buildProductionRuntime();
  await store.hydrateFromDisk();
  scheduler.startAll({ runImmediately: true });
  // Refresh AI Sitrep once at +7.5s after initial upstream collectors populate RAM
  const warmupSitrepTimer = setTimeout(() => {
    void scheduler.refreshCollector('ai-sitrep');
  }, 7_500);
  if (typeof warmupSitrepTimer.unref === 'function') warmupSitrepTimer.unref();
  binanceStream.start();
  polymarketStream.start();
  vesselManager.start();
  newsStream.start();

  const app = createApp(scheduler, hub, {
    aisStreamConfigured: vesselManager.isAisStreamConfigured(),
    getLiveVessels: () => vesselManager.getCombinedVessels(),
    getUnifiedNews: () => newsStream.getUnifiedNews(),
    getNewsStreamStats: () => newsStream.getStats(),
    regimeLedger,
    telegramAlerter,
  });

  const clientDistDir = resolve(process.cwd(), 'dist/client');
  if (process.env.NODE_ENV === 'production' && existsSync(clientDistDir)) {
    app.use('/*', serveStatic({ root: './dist/client' }));
    app.get('*', serveStatic({ path: './dist/client/index.html' }));
  }

  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      console.log(
        `[worldmonitor-api] Realtime Server on http://localhost:${info.port} (SSE /api/stream + Binance WS + 10s ADS-B + Open AIS)`,
      );
    },
  );

  const shutdown = () => {
    binanceStream.stop();
    polymarketStream.stop();
    vesselManager.stop();
    newsStream.stop();
    scheduler.stopAll();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isDirectEntry =
  process.env.VITEST !== 'true' &&
  Boolean(process.argv[1]) &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectEntry) {
  main().catch((err) => {
    console.error('[worldmonitor-api] Fatal startup error:', err);
    process.exit(1);
  });
}
