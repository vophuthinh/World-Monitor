import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { THEATER_PRESETS, buildStaticGeoBundle } from '@shared/registries/index';
import type {
  BootstrapResponse,
  GeoPointFeature,
  LiveFastResponse,
  MacroCountryIndicator,
  MarketSnapshot,
  NewsItem,
  PredictionItem,
  RealtimeServerEvent,
  WeatherRadarSnapshot,
} from '@shared/types';
import type { CollectorScheduler } from './cache/scheduler';
import { RealtimeHub } from './realtime/hub';

const STATIC_GEO_BUNDLE = buildStaticGeoBundle();
const encoder = new TextEncoder();

export function createApp(
  scheduler: CollectorScheduler,
  hub: RealtimeHub = new RealtimeHub(),
  options: { aisStreamConfigured?: boolean } = {},
): Hono {
  const app = new Hono();
  const store = scheduler.getStore();

  app.use('/api/*', cors());

  // Never apply gzip/deflate middleware to /api/stream, as compression buffers small SSE frames
  const gzipMiddleware = compress();
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/stream') {
      await next();
      return;
    }
    return gzipMiddleware(c, next);
  });

  app.get('/api/stream', (c) => {
    const abortSignal = c.req.raw.signal;
    let cleanupFn: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendEvent = (event: RealtimeServerEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // Stream closed
          }
        };

        sendEvent({
          type: 'connected',
          serverTime: Date.now(),
          aisStreamConfigured: Boolean(options.aisStreamConfigured),
        });

        const unsubscribe = hub.subscribe(sendEvent);
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
          } catch {
            // Closed
          }
        }, 15_000);
        if (typeof heartbeat.unref === 'function') {
          heartbeat.unref();
        }

        cleanupFn = () => {
          unsubscribe();
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        };

        abortSignal.addEventListener('abort', cleanupFn, { once: true });
      },
      cancel() {
        cleanupFn?.();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  app.get('/api/health', (c) => {
    return c.json(store.getAllHealth());
  });

  app.get('/api/bootstrap', (c) => {
    const now = Date.now();
    const rawMarkets = store.get<MarketSnapshot>('markets-crypto', now);
    const macro = store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? rawMarkets?.macro ?? [];

    const payload: BootstrapResponse = {
      serverTime: now,
      layers: {
        military: store.get<GeoPointFeature[]>('military-flights', now) ?? [],
        vessels: store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [],
        earthquakes: store.get<GeoPointFeature[]>('earthquakes', now) ?? [],
        natural: store.get<GeoPointFeature[]>('natural-events', now) ?? [],
        geopolitics: store.get<GeoPointFeature[]>('geopolitics-gdelt', now) ?? [],
      },
      staticGeo: STATIC_GEO_BUNDLE,
      weatherRadar: store.get<WeatherRadarSnapshot>('weather-radar', now),
      markets: {
        quotes: rawMarkets?.quotes ?? [],
        crypto: rawMarkets?.crypto ?? [],
        fearGreed: rawMarkets?.fearGreed ?? null,
        macro,
        updatedAt: rawMarkets?.updatedAt ?? now,
      },
      predictions: store.get<PredictionItem[]>('polymarket', now) ?? [],
      news: store.get<NewsItem[]>('rss-news', now) ?? [],
      theaters: [...THEATER_PRESETS],
      health: store.getAllHealth(now),
      aisStreamConfigured: Boolean(options.aisStreamConfigured),
    };

    return c.json(payload);
  });

  app.get('/api/live-fast', (c) => {
    const now = Date.now();
    const rawMarkets = store.get<MarketSnapshot>('markets-crypto', now);

    const payload: LiveFastResponse = {
      serverTime: now,
      military: store.get<GeoPointFeature[]>('military-flights', now) ?? [],
      vessels: store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [],
      earthquakes: store.get<GeoPointFeature[]>('earthquakes', now) ?? [],
      weatherRadar: store.get<WeatherRadarSnapshot>('weather-radar', now),
      quotes: rawMarkets?.quotes ?? [],
      crypto: rawMarkets?.crypto ?? [],
      fearGreed: rawMarkets?.fearGreed ?? null,
      health: store.getAllHealth(now),
    };

    return c.json(payload);
  });

  app.post('/api/refresh/:collectorName', async (c) => {
    const name = c.req.param('collectorName');

    if (name === 'polymarket-news') {
      const targets = (['polymarket', 'rss-news'] as const).filter((id) => scheduler.hasCollector(id));
      if (targets.length === 0) {
        return c.json({ error: 'Unknown collector' }, 404);
      }
      for (const id of targets) {
        const claim = store.tryClaimForceRefresh(id);
        if (!claim.allowed) {
          return c.json(
            {
              error: 'Rate limit active for collector refresh',
              retryAfterMs: claim.retryAfterMs,
            },
            429,
          );
        }
      }
      await Promise.all(targets.map((id) => scheduler.refreshCollector(id)));
      return c.json({ ok: true, refreshed: targets, health: store.getAllHealth() });
    }

    if (!scheduler.hasCollector(name)) {
      return c.json({ error: `Unknown collector "${name}"` }, 404);
    }

    const claim = store.tryClaimForceRefresh(name);
    if (!claim.allowed) {
      return c.json(
        {
          error: 'Force refresh cooldown active (minimum 10s interval)',
          retryAfterMs: claim.retryAfterMs,
        },
        429,
      );
    }

    await scheduler.refreshCollector(name);
    return c.json({
      ok: true,
      collector: name,
      health: store.getHealth(name),
    });
  });

  return app;
}
