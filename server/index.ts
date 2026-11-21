import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { GeoPointFeature, MarketSnapshot, NewsItem, TechCyberSnapshot } from '@shared/types';
import { createApp } from './app';
import { CollectorScheduler } from './cache/scheduler';
import { SnapshotStore } from './cache/snapshot-store';
import { fetchEarthquakes } from './collectors/earthquakes';
import { fetchGeopoliticsGdelt } from './collectors/geopolitics-gdelt';
import { fetchWorldBankMacro } from './collectors/macro-worldbank';
import { MaritimeVesselStreamManager } from './collectors/maritime-vessels';
import { fetchMarketsAndCrypto } from './collectors/markets-crypto';
import { fetchMilitaryFlights } from './collectors/military-flights';
import { fetchNaturalEvents } from './collectors/natural-events';
import { fetchCuratedRssNews, fetchPolymarketPredictions } from './collectors/polymarket-news';
import { fetchTechCyberIntelligence } from './collectors/tech-cyber-intel';
import { fetchWeatherRadar } from './collectors/weather-radar';
import { BinanceRealtimeStream } from './realtime/binance-stream';
import { RealtimeHub } from './realtime/hub';
import { UnifiedNewsStreamService } from './realtime/news-stream';

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
  const vesselManager = new MaritimeVesselStreamManager(hub, process.env.AISSTREAM_API_KEY);
  const newsStream = new UnifiedNewsStreamService(hub, store);

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
    }

    hub.publish({
      type: 'collector_sync',
      collectorId: id,
      health: store.getAllHealth(now),
      ts: now,
    });
  });

  // 10s high-frequency ADS-B military aircraft polling + SSE push
  scheduler.registerCollector({
    id: 'military-flights',
    label: 'Quân sự ADS-B (adsb.lol · 10s)',
    intervalMs: 10_000,
    retainMs: 30 * 60_000,
    countItems: (items) => items.length,
    fetcher: () => fetchMilitaryFlights(),
  });

  // 20s Open AIS + optional real-time AISStream Biển Đông/Hormuz WebSocket
  scheduler.registerCollector({
    id: 'maritime-vessels',
    label: vesselManager.isAisStreamConfigured()
      ? 'Tàu biển AIS (AISStream WS + Open AIS)'
      : 'Tàu biển AIS (Open Maritime Live)',
    intervalMs: 20_000,
    retainMs: 60 * 60_000,
    countItems: (items) => items.length,
    fetcher: () => vesselManager.fetchSnapshot(),
  });

  scheduler.registerCollector({
    id: 'earthquakes',
    label: 'Động đất Toàn cầu (USGS)',
    intervalMs: 120_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchEarthquakes(),
  });

  scheduler.registerCollector({
    id: 'natural-events',
    label: 'Thiên tai (NASA EONET + GDACS)',
    intervalMs: 600_000,
    retainMs: 18 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchNaturalEvents(),
  });

  scheduler.registerCollector({
    id: 'geopolitics-gdelt',
    label: 'Địa chính trị (GDELT v2 Live)',
    intervalMs: 600_000,
    retainMs: 12 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchGeopoliticsGdelt(),
  });

  scheduler.registerCollector({
    id: 'weather-radar',
    label: 'Radar Mưa/Bão (RainViewer)',
    intervalMs: 300_000,
    retainMs: 2 * 3_600_000,
    countItems: (radar) => (radar ? radar.pastFrames.length : 0),
    fetcher: () => fetchWeatherRadar(),
  });

  scheduler.registerCollector<MarketSnapshot>({
    id: 'markets-crypto',
    label: 'Tài chính, FX & Crypto (+ Binance WS)',
    intervalMs: 90_000,
    retainMs: 6 * 3_600_000,
    countItems: (snap) => snap.quotes.length + snap.crypto.length,
    fetcher: (prev) => fetchMarketsAndCrypto(prev),
  });

  scheduler.registerCollector({
    id: 'macro-worldbank',
    label: 'Vĩ mô 8 nền kinh tế (World Bank)',
    intervalMs: 21_600_000,
    retainMs: 7 * 86_400_000,
    countItems: (rows) => rows.length,
    fetcher: () => fetchWorldBankMacro(),
  });

  scheduler.registerCollector({
    id: 'polymarket',
    label: 'Thị trường Dự đoán (Polymarket)',
    intervalMs: 120_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchPolymarketPredictions(),
  });

  scheduler.registerCollector({
    id: 'rss-news',
    label: 'News Stream (27 RSS + Bluesky WS + Wiki SSE + HN + GDELT)',
    intervalMs: 180_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => Math.max(items.length, newsStream.getUnifiedNews().length),
    fetcher: () => fetchCuratedRssNews(),
  });

  scheduler.registerCollector<TechCyberSnapshot>({
    id: 'tech-cyber',
    label: 'AI · Công nghệ · An ninh mạng (53 nguồn Koala73 + VN)',
    intervalMs: 240_000,
    retainMs: 8 * 3_600_000,
    countItems: (snap) => snap.items.length,
    fetcher: () => fetchTechCyberIntelligence(),
  });

  const binanceStream = new BinanceRealtimeStream(hub, store);

  return {
    store,
    hub,
    scheduler,
    binanceStream,
    vesselManager,
    newsStream,
  };
}

async function main(): Promise<void> {
  const { store, hub, scheduler, binanceStream, vesselManager, newsStream } = buildProductionRuntime();
  await store.hydrateFromDisk();
  scheduler.startAll({ runImmediately: true });
  binanceStream.start();
  vesselManager.start();
  newsStream.start();

  const app = createApp(scheduler, hub, {
    aisStreamConfigured: vesselManager.isAisStreamConfigured(),
    getLiveVessels: () => vesselManager.getCombinedVessels(),
    getUnifiedNews: () => newsStream.getUnifiedNews(),
    getNewsStreamStats: () => newsStream.getStats(),
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
