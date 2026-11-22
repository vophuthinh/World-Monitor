import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { THEATER_PRESETS, buildStaticGeoBundle } from '@shared/registries/index';
import type {
  AiSitrepSnapshot,
  BootstrapResponse,
  GeoPointFeature,
  GoogleTrendsSnapshot,
  HptCompanyIntelSnapshot,
  LiveFastResponse,
  MacroCountryIndicator,
  MarketSnapshot,
  NewsItem,
  NewsStreamStats,
  PolicyLegalSnapshot,
  PredictionItem,
  RealtimeServerEvent,
  TechCyberSnapshot,
  VietnamEnvSnapshot,
  WeatherRadarSnapshot,
} from '@shared/types';
import type { CollectorScheduler } from './cache/scheduler';
import { summarizeSinglePolicyItemWithAi } from './collectors/vietnam-policy-legal';
import { answerMonitorQuestion, generateAiSitrep } from './lib/groq-intel';
import { lookupLiveIocOrCve } from './lib/ioc-scanner';
import type { RegimeHistoryLedger } from './lib/regime-ledger';
import type { TelegramAlertEngine } from './lib/telegram-alerter';
import { RealtimeHub } from './realtime/hub';

const STATIC_GEO_BUNDLE = buildStaticGeoBundle();
const encoder = new TextEncoder();

export function createApp(
  scheduler: CollectorScheduler,
  hub: RealtimeHub = new RealtimeHub(),
  options: {
    aisStreamConfigured?: boolean;
    getLiveVessels?: () => GeoPointFeature[];
    getUnifiedNews?: () => NewsItem[];
    getNewsStreamStats?: () => NewsStreamStats;
    regimeLedger?: RegimeHistoryLedger;
    telegramAlerter?: TelegramAlertEngine;
  } = {},
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

  app.get('/api/ioc-lookup', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (!q) {
      return c.json({ error: 'Thiếu tham số q (IP hoặc mã CVE)' }, 400);
    }
    try {
      const result = await lookupLiveIocOrCve(q);
      return c.json(result);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Không thể tra cứu IOC/CVE' },
        400,
      );
    }
  });

  app.get('/api/ai-sitrep', async (c) => {
    const sitrep = await generateAiSitrep(store, false);
    store.set('ai-sitrep', sitrep, 2 * 3_600_000, sitrep.bullets.length);
    return c.json(sitrep);
  });

  app.post('/api/ai-sitrep/refresh', async (c) => {
    const sitrep = await generateAiSitrep(store, true);
    store.set('ai-sitrep', sitrep, 2 * 3_600_000, sitrep.bullets.length);
    return c.json(sitrep);
  });

  app.post('/api/ai-ask', async (c) => {
    try {
      const body = (await c.req.json()) as { question?: string };
      const clientIp =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        'local';
      const res = await answerMonitorQuestion(String(body?.question ?? ''), store, clientIp);
      return c.json(res);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Không thể xử lý câu hỏi AI' },
        400,
      );
    }
  });

  app.post('/api/policy-summarize', async (c) => {
    try {
      const body = (await c.req.json()) as {
        id?: string;
        title?: string;
        docCode?: string;
        sector?: string;
        source?: string;
      };
      if (!body?.id || !body?.title) {
        return c.json({ error: 'Thiếu thông tin văn bản cần tóm tắt' }, 400);
      }
      const summary = await summarizeSinglePolicyItemWithAi({
        id: body.id,
        title: body.title,
        docCode: body.docCode,
        sector: body.sector,
        source: body.source,
      });

      const currentPolicy = store.get<PolicyLegalSnapshot>('policy-legal');
      if (currentPolicy) {
        const updatedPolicy: PolicyLegalSnapshot = {
          ...currentPolicy,
          items: currentPolicy.items.map((item) =>
            item.id === summary.id
              ? { ...item, highlights: summary.highlights, aiSummarized: true }
              : item,
          ),
        };
        store.set('policy-legal', updatedPolicy, 12 * 3_600_000, updatedPolicy.items.length);
      }

      return c.json(summary);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Không thể tóm tắt văn bản bằng AI' },
        400,
      );
    }
  });

  app.get('/api/telegram/status', (c) => {
    if (!options.telegramAlerter) {
      return c.json({
        configured: false,
        enabled: false,
        source: 'none',
        preferences: { macroCompass: true, hptIntel: true, policyLegal: true, eastSeaWeather: true },
        sentCount: 0,
      });
    }
    return c.json(options.telegramAlerter.getSummary());
  });

  app.post('/api/telegram/config', async (c) => {
    if (!options.telegramAlerter) {
      return c.json({ error: 'Telegram engine chưa khởi tạo' }, 503);
    }
    try {
      const body = (await c.req.json()) as {
        botToken?: string;
        chatId?: string;
        enabled?: boolean;
        preferences?: Record<string, boolean>;
      };
      const summary = options.telegramAlerter.updateConfig(body);
      return c.json(summary);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Cấu hình Telegram không hợp lệ' },
        400,
      );
    }
  });

  app.post('/api/telegram/detect-chat', async (c) => {
    if (!options.telegramAlerter) {
      return c.json({ error: 'Telegram engine chưa khởi tạo' }, 503);
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as { botToken?: string };
      const detected = await options.telegramAlerter.detectChatIdFromBot(body.botToken);
      return c.json({
        ...detected,
        status: options.telegramAlerter.getSummary(),
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Không thể dò Chat ID từ Bot' },
        400,
      );
    }
  });

  app.post('/api/telegram/test', async (c) => {
    if (!options.telegramAlerter) {
      return c.json({ error: 'Telegram engine chưa khởi tạo' }, 503);
    }
    try {
      const summary = await options.telegramAlerter.sendLiveTestBriefing(store);
      return c.json({ ok: true, status: summary });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Gửi tin thử Telegram thất bại' },
        400,
      );
    }
  });

  app.get('/api/bootstrap', (c) => {
    const now = Date.now();
    const rawMarkets = store.get<MarketSnapshot>('markets-crypto', now);
    const macro = store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? rawMarkets?.macro ?? [];
    const predictionsPayload = store.get<PredictionItem[]>('polymarket', now) ?? [];

    const liveWsVessels = options.getLiveVessels?.();
    const resolvedVessels = (
      liveWsVessels && liveWsVessels.length > 0
        ? liveWsVessels
        : store.get<GeoPointFeature[]>('maritime-vessels', now) ?? []
    ).slice(0, 500);

    const liveUnifiedNews = options.getUnifiedNews?.();
    const resolvedNews = (
      liveUnifiedNews && liveUnifiedNews.length > 0
        ? liveUnifiedNews
        : store.get<NewsItem[]>('rss-news', now) ?? []
    ).slice(0, 140);

    const payload: BootstrapResponse = {
      serverTime: now,
      layers: {
        military: store.get<GeoPointFeature[]>('military-flights', now) ?? [],
        vessels: resolvedVessels,
        cyberThreats: store.get<GeoPointFeature[]>('cyber-threats', now) ?? [],
        gpsOutages: store.get<GeoPointFeature[]>('gps-outages', now) ?? [],
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
        vnGold: rawMarkets?.vnGold ?? [],
        vn30: rawMarkets?.vn30 ?? [],
        fred: rawMarkets?.fred ?? [],
        ...(rawMarkets?.vnMacroPulse ? { vnMacroPulse: rawMarkets.vnMacroPulse } : {}),
        updatedAt: rawMarkets?.updatedAt ?? now,
      },
      predictions: predictionsPayload,
      news: resolvedNews,
      theaters: [...THEATER_PRESETS],
      health: store.getAllHealth(now),
      aisStreamConfigured: Boolean(options.aisStreamConfigured),
      newsStreamStats: options.getNewsStreamStats?.(),
      techCyber: store.get<TechCyberSnapshot>('tech-cyber', now) ?? undefined,
      policyLegal: store.get<PolicyLegalSnapshot>('policy-legal', now) ?? undefined,
      googleTrends: store.get<GoogleTrendsSnapshot>('google-trends', now) ?? undefined,
      vietnamEnv: store.get<VietnamEnvSnapshot>('vietnam-env', now) ?? undefined,
      hptIntel: store.get<HptCompanyIntelSnapshot>('hpt-intel', now) ?? undefined,
      aiSitrep: store.get<AiSitrepSnapshot>('ai-sitrep', now) ?? undefined,
      regimeHistory: options.regimeLedger
        ? options.regimeLedger.recordSnapshot(rawMarkets, macro, predictionsPayload, now)
        : undefined,
      telegramStatus: options.telegramAlerter?.getSummary(),
    };

    return c.json(payload);
  });

  app.get('/api/live-fast', (c) => {
    const now = Date.now();
    const rawMarkets = store.get<MarketSnapshot>('markets-crypto', now);

    const liveWsVessels = options.getLiveVessels?.();
    const resolvedVessels =
      liveWsVessels && liveWsVessels.length > 0
        ? liveWsVessels
        : store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [];

    const payload: LiveFastResponse = {
      serverTime: now,
      military: store.get<GeoPointFeature[]>('military-flights', now) ?? [],
      vessels: resolvedVessels,
      earthquakes: store.get<GeoPointFeature[]>('earthquakes', now) ?? [],
      weatherRadar: store.get<WeatherRadarSnapshot>('weather-radar', now),
      quotes: rawMarkets?.quotes ?? [],
      crypto: rawMarkets?.crypto ?? [],
      fearGreed: rawMarkets?.fearGreed ?? null,
      predictions: store.get<PredictionItem[]>('polymarket', now) ?? [],
      googleTrends: store.get<GoogleTrendsSnapshot>('google-trends', now),
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
