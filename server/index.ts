import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { MarketSnapshot } from '@shared/types';
import { createApp } from './app';
import { CollectorScheduler } from './cache/scheduler';
import { SnapshotStore } from './cache/snapshot-store';
import { fetchEarthquakes } from './collectors/earthquakes';
import { fetchGeopoliticsGdelt } from './collectors/geopolitics-gdelt';
import { fetchWorldBankMacro } from './collectors/macro-worldbank';
import { fetchMarketsAndCrypto } from './collectors/markets-crypto';
import { fetchMilitaryFlights } from './collectors/military-flights';
import { fetchNaturalEvents } from './collectors/natural-events';
import { fetchCuratedRssNews, fetchPolymarketPredictions } from './collectors/polymarket-news';
import { fetchWeatherRadar } from './collectors/weather-radar';

const PORT = Number(process.env.PORT ?? 8787);
const CACHE_DIR = resolve(process.cwd(), '.cache');

export function buildProductionScheduler(cacheDir = CACHE_DIR): CollectorScheduler {
  const store = new SnapshotStore(cacheDir);
  const scheduler = new CollectorScheduler(store);

  scheduler.registerCollector({
    id: 'military-flights',
    label: 'Quân sự ADS-B (adsb.lol)',
    intervalMs: 30_000,
    retainMs: 30 * 60_000,
    countItems: (items) => items.length,
    fetcher: () => fetchMilitaryFlights(),
  });

  scheduler.registerCollector({
    id: 'earthquakes',
    label: 'Động đất Toàn cầu (USGS)',
    intervalMs: 180_000,
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
    label: 'Địa chính trị (GDELT Geo 2.0)',
    intervalMs: 900_000,
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
    label: 'Tài chính, FX & Crypto',
    intervalMs: 120_000,
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
    intervalMs: 180_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchPolymarketPredictions(),
  });

  scheduler.registerCollector({
    id: 'rss-news',
    label: 'Tin nóng Quốc tế / Tài chính / VN (RSS)',
    intervalMs: 300_000,
    retainMs: 6 * 3_600_000,
    countItems: (items) => items.length,
    fetcher: () => fetchCuratedRssNews(),
  });

  return scheduler;
}

async function main(): Promise<void> {
  const scheduler = buildProductionScheduler();
  await scheduler.getStore().hydrateFromDisk();
  scheduler.startAll({ runImmediately: true });

  const app = createApp(scheduler);

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
        `[worldmonitor-api] Listening on http://localhost:${info.port} (cache: ${CACHE_DIR})`,
      );
    },
  );

  const shutdown = () => {
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
