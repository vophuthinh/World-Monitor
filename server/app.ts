import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { compress } from 'hono/compress';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { THEATER_PRESETS, buildStaticGeoBundle } from '@shared/registries/index';
import { collectExpiredMacroNotices } from '@shared/macro-health';
import { resolveFreshVessels } from '@shared/maritime-freshness';
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
  RegionalWarningsSnapshot,
  RealtimeServerEvent,
  TechCyberSnapshot,
  TropicalCycloneSnapshot,
  VietnamEnvSnapshot,
  WeatherRadarSnapshot,
  WeatherSatelliteSnapshot,
} from '@shared/types';
import type { CollectorScheduler } from './cache/scheduler';
import { getRetainedMarketSnapshot, markMarketSnapshotRetained } from './collectors/markets-crypto';
import { searchCountries } from './collectors/countries';
import { summarizeSinglePolicyItemWithAi } from './collectors/vietnam-policy-legal';
import { answerMonitorQuestion, generateAiSitrep } from './lib/groq-intel';
import { lookupLiveIocOrCve } from './lib/ioc-scanner';
import type { RegimeHistoryLedger } from './lib/regime-ledger';
import { RealtimeHub } from './realtime/hub';

const STATIC_GEO_BUNDLE = buildStaticGeoBundle();
/** Cap on simultaneous live (SSE) connections; the API has no login, so anyone on the network can open one. */
export const MAX_SSE_CLIENTS = 200;
/** A client that lets this many frames pile up unread is dropped instead of buffered without bound. */
const SSE_MAX_QUEUED_FRAMES = 64;
const encoder = new TextEncoder();

const DEFAULT_TRUSTED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
]);

function resolveAllowedOrigin(origin: string): string | null {
  if (!origin) return null;
  if (DEFAULT_TRUSTED_ORIGINS.has(origin)) return origin;
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

function allowedHostnames(): Set<string> {
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const o of (process.env.ALLOWED_ORIGINS ?? '').split(',')) {
    try {
      hosts.add(new URL(o.trim()).hostname);
    } catch {
      // ignore malformed entry
    }
  }
  return hosts;
}

/** Socket address by default; X-Forwarded-For only when TRUST_PROXY=1 (header is client-controlled otherwise). */
function clientIpOf(c: Context): string {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip');
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? 'local';
  } catch {
    return 'local';
  }
}

export function createApp(
  scheduler: CollectorScheduler,
  hub: RealtimeHub = new RealtimeHub(),
  options: {
    aisStreamConfigured?: boolean;
    getLiveVessels?: () => GeoPointFeature[];
    getUnifiedNews?: () => NewsItem[];
    getNewsStreamStats?: () => NewsStreamStats;
    regimeLedger?: RegimeHistoryLedger;
  } = {},
): Hono {
  const app = new Hono();
  const store = scheduler.getStore();
  let lastSitrepRefreshMs = 0;
  const policySummaryBuckets = new Map<string, number[]>();
  const SITREP_COOLDOWN_MS = 20_000;
  /** One shared cooldown for every path that triggers an AI sitrep call. */
  const claimSitrep = (): { ok: boolean; retryAfterMs: number } => {
    const now = Date.now();
    if (now - lastSitrepRefreshMs < SITREP_COOLDOWN_MS) {
      return { ok: false, retryAfterMs: SITREP_COOLDOWN_MS - (now - lastSitrepRefreshMs) };
    }
    lastSitrepRefreshMs = now;
    return { ok: true, retryAfterMs: 0 };
  };

  // Anti DNS-rebinding: only answer for known Host names.
  app.use('/api/*', async (c, next) => {
    if (!allowedHostnames().has(new URL(c.req.url).hostname)) {
      return c.json({ error: 'Host not allowed' }, 403);
    }
    await next();
  });

  // Anti CSRF: browsers always send Origin on cross-origin writes. CORS only hides responses,
  // it does not stop a simple POST from executing, so reject untrusted write origins here.
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin && !resolveAllowedOrigin(origin)) {
        return c.json({ error: 'Origin not allowed' }, 403);
      }
      if (c.req.header('sec-fetch-site') === 'cross-site') {
        return c.json({ error: 'Cross-site request blocked' }, 403);
      }
    }
    await next();
  });

  // All JSON bodies here are tiny (question <= 400 chars, a doc id).
  app.use('/api/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'Payload too large' }, 413) }));

  app.use(
    '/api/*',
    cors({
      origin: (origin) => resolveAllowedOrigin(origin),
    }),
  );

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
    if (hub.subscriberCount() >= MAX_SSE_CLIENTS) {
      return c.json({ error: 'Too many live connections, retry shortly' }, 503, { 'Retry-After': '30' });
    }
    const abortSignal = c.req.raw.signal;
    let cleanupFn: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const pushFrame = (frame: string) => {
          // desiredSize <= 0 means the client is not reading: stop buffering for it.
          if ((controller.desiredSize ?? 1) <= 0) {
            cleanupFn?.();
            return;
          }
          try {
            controller.enqueue(encoder.encode(frame));
          } catch {
            // Stream closed
          }
        };
        const sendEvent = (event: RealtimeServerEvent) => {
          pushFrame(`data: ${JSON.stringify(event)}\n\n`);
        };

        sendEvent({
          type: 'connected',
          serverTime: Date.now(),
          aisStreamConfigured: Boolean(options.aisStreamConfigured),
        });

        const unsubscribe = hub.subscribe(sendEvent);
        const heartbeat = setInterval(() => {
          pushFrame(`: ping ${Date.now()}\n\n`);
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
    }, new CountQueuingStrategy({ highWaterMark: SSE_MAX_QUEUED_FRAMES }));

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
    const sitrep = await generateAiSitrep(store, false, options.getLiveVessels);
    store.set('ai-sitrep', sitrep, 2 * 3_600_000, sitrep.bullets.length);
    return c.json(sitrep);
  });

  app.post('/api/ai-sitrep/refresh', async (c) => {
    const claim = claimSitrep();
    if (!claim.ok) {
      return c.json(
        {
          error: 'Bản tin AI Sitrep vừa mới cập nhật, vui lòng đợi ít giây.',
          retryAfterMs: claim.retryAfterMs,
        },
        429,
      );
    }
    const sitrep = await generateAiSitrep(store, true, options.getLiveVessels);
    store.set('ai-sitrep', sitrep, 2 * 3_600_000, sitrep.bullets.length);
    return c.json(sitrep);
  });

  app.get('/api/countries', async (c) => {
    const query = (c.req.query('q') ?? '').trim();
    if (query.length < 2 || query.length > 80) return c.json({ error: 'Nhập tên quốc gia từ 2 đến 80 ký tự.' }, 400);
    try {
      return c.json({ countries: await searchCountries(query) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tra cứu quốc gia.';
      if (message.startsWith('Chưa cấu hình') || message.startsWith('Đã đạt giới hạn')) return c.json({ error: message }, 503);
      console.error('[countries] lookup failed');
      return c.json({ error: 'Không thể lấy dữ liệu REST Countries; vui lòng thử lại sau.' }, 502);
    }
  });

  app.post('/api/ai-ask', async (c) => {
    try {
      const body = (await c.req.json()) as { question?: string };
      const clientIp = clientIpOf(c);
      const res = await answerMonitorQuestion(String(body?.question ?? ''), store, clientIp, options.getLiveVessels);
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
      const body = (await c.req.json()) as { id?: string };
      if (typeof body?.id !== 'string' || !body.id || body.id.length > 200) {
        return c.json({ error: 'Thiếu mã văn bản cần tóm tắt' }, 400);
      }

      const now = Date.now();
      const clientIp = clientIpOf(c);
      const windowMs = 60_000;
      const recent = (policySummaryBuckets.get(clientIp) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= 6) {
        policySummaryBuckets.set(clientIp, recent);
        return c.json(
          {
            error: 'Đang đạt giới hạn tóm tắt AI (tối đa 6 văn bản/phút), vui lòng thử lại sau ít giây.',
            retryAfterMs: windowMs - (now - recent[0]),
          },
          429,
        );
      }
      recent.push(now);
      policySummaryBuckets.set(clientIp, recent);
      if (policySummaryBuckets.size > 200) {
        const firstKey = policySummaryBuckets.keys().next().value;
        if (firstKey) policySummaryBuckets.delete(firstKey);
      }

      // Never trust client-supplied title/docCode: they feed the AI prompt and the result is
      // persisted on the item, so take them from the server-side snapshot by id.
      const currentPolicy = store.get<PolicyLegalSnapshot>('policy-legal');
      const target = currentPolicy?.items.find((item) => item.id === body.id);
      if (!currentPolicy || !target) {
        return c.json({ error: 'Không tìm thấy văn bản' }, 404);
      }

      const summary = await summarizeSinglePolicyItemWithAi({
        id: target.id,
        title: target.title,
        docCode: target.docCode,
        sector: target.sector,
        source: target.source,
      });

      const latestPolicy = store.get<PolicyLegalSnapshot>('policy-legal') ?? currentPolicy;
      const updatedPolicy: PolicyLegalSnapshot = {
        ...latestPolicy,
        items: latestPolicy.items.map((item) =>
          item.id === summary.id ? { ...item, highlights: summary.highlights, aiSummarized: true } : item,
        ),
      };
      store.set('policy-legal', updatedPolicy, 12 * 3_600_000, updatedPolicy.items.length);

      return c.json(summary);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Không thể tóm tắt văn bản bằng AI' },
        400,
      );
    }
  });

  app.get('/api/bootstrap', (c) => {
    const now = Date.now();
    const rawMarkets = getRetainedMarketSnapshot(store, now);
    const diagnosticMarkets = rawMarkets ? null : store.getDiagnosticSnapshot<MarketSnapshot>('markets-crypto');
    const expiredMacroNotices = diagnosticMarkets
      ? collectExpiredMacroNotices(markMarketSnapshotRetained(diagnosticMarkets, now), now)
      : undefined;
    const wbHealth = store.getHealth('macro-worldbank', now);
    const wbRaw = store.get<MacroCountryIndicator[]>('macro-worldbank', now) ?? rawMarkets?.macro ?? [];
    const wbRetained = wbHealth?.status === 'stale' || wbHealth?.status === 'error';
    const macro = wbRetained ? wbRaw.map((row) => ({ ...row, retained: true })) : wbRaw;
    const predictionsPayload = store.get<PredictionItem[]>('polymarket', now) ?? [];

    const liveWsVessels = options.getLiveVessels?.();
    const resolvedVessels = resolveFreshVessels(
      store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [], now, liveWsVessels,
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
      tropicalCyclones: store.get<TropicalCycloneSnapshot>('tropical-cyclones', now) ?? undefined,
      weatherSatellite: store.get<WeatherSatelliteSnapshot>('weather-satellite', now) ?? undefined,
      regionalWarnings: store.get<RegionalWarningsSnapshot>('regional-warnings', now) ?? undefined,
      markets: {
        quotes: rawMarkets?.quotes ?? [],
        crypto: rawMarkets?.crypto ?? [],
        fearGreed: rawMarkets?.fearGreed ?? null,
        macro,
        vnGold: rawMarkets?.vnGold ?? [],
        vn30: rawMarkets?.vn30 ?? [],
        fred: rawMarkets?.fred ?? [],
        ...(rawMarkets?.vnMacroPulse ? { vnMacroPulse: rawMarkets.vnMacroPulse } : {}),
        ...(expiredMacroNotices ? { expiredMacroNotices } : {}),
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
        ? options.regimeLedger.getHistory()
        : undefined,
    };

    return c.json(payload);
  });

  app.get('/api/live-fast', (c) => {
    const now = Date.now();
    const rawMarkets = getRetainedMarketSnapshot(store, now);
    const diagnosticMarkets = rawMarkets ? null : store.getDiagnosticSnapshot<MarketSnapshot>('markets-crypto');
    const expiredMacroNotices = diagnosticMarkets
      ? collectExpiredMacroNotices(markMarketSnapshotRetained(diagnosticMarkets, now), now)
      : undefined;

    const liveWsVessels = options.getLiveVessels?.();
    const resolvedVessels = resolveFreshVessels(
      store.get<GeoPointFeature[]>('maritime-vessels', now) ?? [], now, liveWsVessels,
    );

    const payload: LiveFastResponse = {
      serverTime: now,
      military: store.get<GeoPointFeature[]>('military-flights', now) ?? [],
      vessels: resolvedVessels,
      earthquakes: store.get<GeoPointFeature[]>('earthquakes', now) ?? [],
      weatherRadar: store.get<WeatherRadarSnapshot>('weather-radar', now),
      tropicalCyclones: store.get<TropicalCycloneSnapshot>('tropical-cyclones', now) ?? undefined,
      weatherSatellite: store.get<WeatherSatelliteSnapshot>('weather-satellite', now) ?? undefined,
      regionalWarnings: store.get<RegionalWarningsSnapshot>('regional-warnings', now) ?? undefined,
      quotes: rawMarkets?.quotes ?? [],
      crypto: rawMarkets?.crypto ?? [],
      fearGreed: rawMarkets?.fearGreed ?? null,
      vnGold: rawMarkets?.vnGold ?? [],
      vn30: rawMarkets?.vn30 ?? [],
      fred: rawMarkets?.fred ?? [],
      ...(rawMarkets?.vnMacroPulse ? { vnMacroPulse: rawMarkets.vnMacroPulse } : {}),
      ...(expiredMacroNotices ? { expiredMacroNotices } : {}),
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

    if (name === 'ai-sitrep') {
      const sitrepClaim = claimSitrep();
      if (!sitrepClaim.ok) {
        return c.json(
          { error: 'AI sitrep cooldown active', retryAfterMs: sitrepClaim.retryAfterMs },
          429,
        );
      }
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
