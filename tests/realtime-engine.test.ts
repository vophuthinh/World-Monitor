import { describe, expect, it, vi } from 'vitest';
import { advanceDeadReckoning } from '../shared/dead-reckoning';
import { createApp } from '../server/app';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';
import {
  classifyMmsiCountry,
  extractWsPayloadText,
  MaritimeVesselStreamManager,
  normalizeDigitrafficVessels,
  parseAisStreamMessage,
} from '../server/collectors/maritime-vessels';
import { BinanceRealtimeStream, parseBinanceCombinedTick } from '../server/realtime/binance-stream';
import { getRetainedMarketSnapshot } from '../server/collectors/markets-crypto';
import { RealtimeHub } from '../server/realtime/hub';
import type { MarketSnapshot } from '../shared/types';

describe('Realtime Streaming Engine (SSE Hub, Binance WS, AIS Vessels & Dead-Reckoning)', () => {
  it('alerts when a previously ineligible aircraft enters the monitored region', () => {
    const hub = new RealtimeHub();
    const alerts: string[] = [];
    hub.subscribe((event) => { if (event.type === 'breaking_alert') alerts.push(event.alert.id); });
    const plane = {
      id: 'air:1', layer: 'military' as const, title: 'Aircraft', category: 'recon',
      severity: 'high' as const, lat: 0, lon: 20, timestamp: 1, source: 'test',
      meta: { speedKt: 300 },
    };
    hub.ingestForAlerts('military-flights', [plane], 1);
    hub.ingestForAlerts('military-flights', [{ ...plane, lat: 15, lon: 110 }], 2);
    hub.ingestForAlerts('military-flights', [{ ...plane, lat: 15, lon: 110 }], 3);
    expect(alerts).toEqual(['air:1']);
  });

  it('publishes events to RealtimeHub subscribers and cleans up on unsubscribe', () => {
    const hub = new RealtimeHub();
    const received: string[] = [];

    const unsub = hub.subscribe((ev) => {
      received.push(ev.type);
    });

    expect(hub.subscriberCount()).toBe(1);
    hub.publish({
      type: 'price_tick',
      ticks: [{ symbol: 'BTC', price: 60500, changePercent24h: 2.1 }],
      ts: 1_700_000_000_000,
    });
    expect(received).toEqual(['price_tick']);

    unsub();
    expect(hub.subscriberCount()).toBe(0);
    hub.publish({
      type: 'price_tick',
      ticks: [{ symbol: 'BTC', price: 60600, changePercent24h: 2.2 }],
      ts: 1_700_000_001_000,
    });
    expect(received).toEqual(['price_tick']);
  });

  it('parses Binance combined miniTicker frames for Crypto and PAXG Gold', () => {
    const btcTick = parseBinanceCombinedTick(
      JSON.stringify({
        stream: 'btcusdt@miniTicker',
        data: { s: 'BTCUSDT', c: '61200.50', o: '60000.00', q: '1850000000' },
      }),
    );
    expect(btcTick?.symbol).toBe('BTC');
    expect(btcTick?.price).toBe(61200.5);
    expect(btcTick?.changePercent24h).toBeCloseTo(2.0, 2);

    const goldTick = parseBinanceCombinedTick(
      JSON.stringify({
        stream: 'paxgusdt@miniTicker',
        data: { s: 'PAXGUSDT', c: '3554.20', o: '3520.00', q: '42000000' },
      }),
    );
    expect(goldTick?.symbol).toBe('PAXG');
    expect(goldTick?.price).toBe(3554.2);
  });

  it('updates PAXG without overwriting the COMEX gold quote', () => {
    vi.useFakeTimers();
    let socket!: { onmessage: ((event: { data: string }) => void) | null };
    class MockWebSocket {
      onopen = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror = null;
      onclose = null;
      constructor() { socket = this; }
      close() {}
    }
    vi.stubGlobal('WebSocket', MockWebSocket);
    const now = Date.now();
    const store = new SnapshotStore('/tmp/wm-binance-unused');
    store.set<MarketSnapshot>('markets-crypto', {
      quotes: [{ symbol: 'Gold', name: 'COMEX', group: 'commodity', price: 2500, changePercent24h: 0, updatedAt: now, source: 'Yahoo' }],
      crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: 10, volume24hUsd: 5, updatedAt: now - 60_000 }],
      fearGreed: null, macro: [], updatedAt: now,
    }, 8 * 3_600_000);
    const stream = new BinanceRealtimeStream(new RealtimeHub(), store);
    try {
      stream.start();
      socket.onmessage?.({ data: JSON.stringify({ data: { s: 'PAXGUSDT', c: '2450', o: '2400' } }) });
      socket.onmessage?.({ data: JSON.stringify({ data: { s: 'BTCUSDT', c: '110', o: '100' } }) });
      vi.advanceTimersByTime(1500);
      const quotes = store.get<MarketSnapshot>('markets-crypto')!.quotes;
      expect(quotes.find((q) => q.symbol === 'Gold')).toMatchObject({ price: 2500, source: 'Yahoo' });
      expect(quotes.find((q) => q.symbol === 'PAXG')).toMatchObject({ price: 2450, source: 'Binance PAXG/USDT Realtime' });
      expect(store.get<MarketSnapshot>('markets-crypto')!.crypto[0]).toMatchObject({
        priceUsd: 110, marketDataFetchedAt: now - 60_000,
      });
      expect(getRetainedMarketSnapshot(store, now + 6 * 3_600_000)?.crypto[0]).toMatchObject({
        priceUsd: 110, marketCapUsd: null, volume24hUsd: null,
      });
    } finally {
      stream.stop();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('resolves MMSI maritime flags (including Vietnam 574) and normalizes Digitraffic + AISStream vessels', () => {
    expect(classifyMmsiCountry(574001230)).toBe('Vietnam');
    expect(classifyMmsiCountry(412345678)).toBe('China');
    expect(classifyMmsiCountry(563111222)).toBe('Singapore');

    const now = Date.parse('2026-11-22T01:30:01Z');
    const digitraffic = normalizeDigitrafficVessels(
      {
        features: [
          {
            mmsi: 230123456,
            geometry: { type: 'Point', coordinates: [24.95, 60.12] },
            properties: { mmsi: 230123456, sog: 14.6, cog: 85.2, heading: 86, navStat: 0, timestampExternal: now - 2_000 },
          },
          // Stationary moored vessel with sog 0 is lower priority than moving traffic when capped, but valid
          {
            mmsi: 574999111,
            geometry: { type: 'Point', coordinates: [107.08, 10.34] },
            properties: { mmsi: 574999111, sog: 12.4, cog: 42.0, heading: 42, navStat: 0, timestampExternal: now - 1_000 },
          },
        ],
      },
      now,
    );

    expect(digitraffic).toHaveLength(2);
    const vnShip = digitraffic.find((v) => v.id === 'ais:574999111');
    expect(vnShip?.meta.country).toBe('Vietnam');
    expect(vnShip?.meta.speedKt).toBe(12.4);
    expect(vnShip?.heading).toBe(42);

    const aisWsShip = parseAisStreamMessage(
      JSON.stringify({
        MessageType: 'PositionReport',
        MetaData: {
          MMSI: 574123888,
          ShipName: 'VIETNAM COAST GUARD 8001',
          latitude: 15.42,
          longitude: 111.85,
          time_utc: '2026-11-22 01:30:00.000000000 +0000 UTC',
        },
        Message: {
          PositionReport: {
            Sog: 16.5,
            Cog: 128.0,
            TrueHeading: 129,
            NavigationalStatus: 0,
          },
        },
      }),
      now,
    );
    expect(aisWsShip?.id).toBe('ais:574123888');
    expect(aisWsShip?.category).toBe('naval_patrol');
    expect(aisWsShip?.severity).toBe('high');
    expect(aisWsShip?.lat).toBeCloseTo(15.42, 2);

    // Static messages enrich an existing position, but cannot establish a fresh position.
    const staticMsgJson = JSON.stringify({
      MessageType: 'ShipStaticData',
      MetaData: {
        MMSI: 466012000,
        ShipName: 'SIDRA QATAR   ',
        latitude: 10.22,
        longitude: 107.15,
      },
      Message: {
        ShipStaticData: {
          Type: 84, // LNG Tanker (80-89)
        },
      },
    });
    const blobFrame = new Blob([staticMsgJson]);
    return extractWsPayloadText(blobFrame).then((decoded) => {
      const cache = new Map();
      expect(parseAisStreamMessage(decoded, now, cache)).toBeNull();
      expect(cache.get(466012000)).toMatchObject({ shipType: 84 });
      const existing = { ...aisWsShip!, id: 'ais:466012000', lat: 10, lon: 107, timestamp: now - 600_000 };
      const tanker = parseAisStreamMessage(decoded, now, undefined, existing);
      expect(tanker?.id).toBe('ais:466012000');
      expect(tanker?.category).toBe('tanker');
      expect(tanker?.title).toContain('SIDRA QATAR');
      expect(tanker).toMatchObject({ lat: 10, lon: 107, timestamp: now - 600_000, heading: existing.heading });
    });
  });

  it('expires Digitraffic vessels and reports a failed fetch even with cached or streamed ships', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    let available = true;
    vi.stubGlobal('fetch', vi.fn(async () => available
      ? new Response(JSON.stringify({ features: [{ mmsi: 230123456, geometry: { coordinates: [24, 60] }, properties: { timestampExternal: now } }] }))
      : new Response('unavailable', { status: 404 })));
    const manager = new MaritimeVesselStreamManager(new RealtimeHub());
    try {
      expect(await manager.fetchSnapshot()).toHaveLength(1);
      available = false;
      await expect(manager.fetchSnapshot()).rejects.toThrow('HTTP 404');
      expect(manager.getCombinedVessels()).toHaveLength(1);
      vi.mocked(Date.now).mockReturnValue(now + 2 * 3_600_000);
      await expect(manager.fetchSnapshot()).rejects.toThrow('HTTP 404');
      expect(manager.getCombinedVessels()).toEqual([]);
      available = true;
      await expect(manager.fetchSnapshot()).rejects.toThrow('no valid fresh positions');
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('uses AISStream send time, rejects missing, future, stale and out-of-order positions', () => {
    const now = Date.parse('2026-11-22T01:30:01Z');
    const frame = (time_utc?: string) => JSON.stringify({
      MetaData: { MMSI: 574123888, latitude: 10, longitude: 107, time_utc },
      Message: { PositionReport: { Sog: 10, Cog: 90, TrueHeading: 0 } },
    });
    const ship = parseAisStreamMessage(frame('2026-11-22 01:30:00.000000000 +0000 UTC'), now)!;
    expect(ship.timestamp).toBe(now - 1000);
    expect(ship.meta.positionTimeBasis).toBe('source-message-time');
    for (const timestamp of [undefined, 'not a date', new Date(now + 1000).toISOString(), new Date(now - 26 * 60_000).toISOString()]) {
      expect(parseAisStreamMessage(frame(timestamp), now)).toBeNull();
    }
    expect(parseAisStreamMessage(frame(new Date(now - 2000).toISOString()), now, undefined, ship)).toBeNull();
  });

  it('uses vessel course rather than heading and does not extrapolate or alert with unavailable AIS speed', () => {
    const now = Date.now();
    const parse = (Sog: number, Cog?: number) => parseAisStreamMessage(JSON.stringify({
      MetaData: { MMSI: 574123888, ShipName: 'COAST GUARD', latitude: 10, longitude: 107, time_utc: new Date(now).toISOString() },
      Message: { PositionReport: { Sog, Cog, TrueHeading: 0 } },
    }), now)!;
    const moving = parse(10, 90);
    const moved = advanceDeadReckoning([moving], now + 10_000)[0];
    expect(moved.lat).toBeCloseTo(moving.lat, 8);
    expect(moved.lon).toBeGreaterThan(moving.lon);
    const unknownCourse = parse(10, 360);
    expect(advanceDeadReckoning([unknownCourse], now + 10_000)[0]).toEqual(unknownCourse);
    const unknownSpeed = parse(102.3, 90);
    expect(unknownSpeed.meta.speedKt).toBeNull();
    expect(advanceDeadReckoning([unknownSpeed], now + 10_000)[0]).toEqual(unknownSpeed);
    const hub = new RealtimeHub();
    const alerts: string[] = [];
    hub.subscribe((event) => { if (event.type === 'breaking_alert') alerts.push(event.alert.id); });
    hub.ingestForAlerts('maritime-vessels', [], now);
    hub.ingestForAlerts('maritime-vessels', [unknownSpeed], now + 1000);
    expect(alerts).toEqual([]);
    const [digitraffic] = normalizeDigitrafficVessels({
      features: [{ mmsi: 574123888, geometry: { coordinates: [107, 10] }, properties: {
        sog: 102.3, cog: 90, heading: 0, timestampExternal: now,
      } }],
    }, now);
    expect(digitraffic.meta).toMatchObject({ speedKt: null, courseDeg: 90 });
    expect(advanceDeadReckoning([digitraffic], now + 10_000)[0]).toEqual(digitraffic);
  });

  it('extrapolates spherical dead-reckoning positions accurately and clamps max drift', () => {
    const t0 = 1_700_000_000_000;
    const jet = {
      id: 'mil:AE1234',
      layer: 'military' as const,
      title: 'FORTE12',
      category: 'drone',
      severity: 'high' as const,
      lat: 15.0,
      lon: 112.0,
      timestamp: t0,
      source: 'adsb.lol',
      heading: 0, // Due North
      meta: { speedKt: 360, onGround: false },
    };

    // 10 seconds at 360 knots (= 185.2 m/s -> 1,852 m = 1 nautical mile = 1/60 deg lat ~= 0.01665 deg)
    const moved = advanceDeadReckoning([jet], t0 + 10_000, 25)[0];
    expect(moved.lat).toBeGreaterThan(15.015);
    expect(moved.lat).toBeLessThan(15.018);
    expect(moved.lon).toBeCloseTo(112.0, 4);

    // Clamped at 25s even if 120s elapsed without new packet
    const clamped = advanceDeadReckoning([jet], t0 + 120_000, 25)[0];
    const at25s = advanceDeadReckoning([jet], t0 + 25_000, 25)[0];
    expect(clamped.lat).toBeCloseTo(at25s.lat, 5);
    expect(advanceDeadReckoning([{ ...jet }], t0 + 180_000, 25)[0]).toEqual(clamped);
  });

  it('streams SSE frames from GET /api/stream without gzip buffering', async () => {
    const store = new SnapshotStore('/tmp/wm-sse-test-unused');
    const scheduler = new CollectorScheduler(store);
    const hub = new RealtimeHub();
    const app = createApp(scheduler, hub);

    const controller = new AbortController();
    const res = await app.request('/api/stream', { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const firstChunk = await reader.read();
    const firstText = decoder.decode(firstChunk.value);
    expect(firstText).toContain('"type":"connected"');

    hub.publish({
      type: 'price_tick',
      ticks: [{ symbol: 'ETH', price: 1690, changePercent24h: 3.1 }],
      ts: Date.now(),
    });

    const secondChunk = await reader.read();
    const secondText = decoder.decode(secondChunk.value);
    expect(secondText).toContain('"type":"price_tick"');
    expect(secondText).toContain('"ETH"');

    controller.abort();
    await reader.cancel().catch(() => {});
  });

  it('filters breaking tactical alerts so 0-knot moored ships & distant US ports are suppressed while underway Biển Đông naval vessels & major earthquakes trigger', () => {
    const hub = new RealtimeHub();
    const alerts: Array<{ id: string; badge: string; title: string }> = [];
    hub.subscribe((ev) => {
      if (ev.type === 'breaking_alert') {
        alerts.push({ id: ev.alert.id, badge: ev.alert.badge, title: ev.alert.title });
      }
    });

    const t0 = 1_700_000_000_000;
    // Initial cold-start pass seeds silently
    hub.ingestForAlerts('maritime-vessels', [], t0);
    hub.ingestForAlerts('earthquakes', [], t0);

    // 1) Moored US warship at 0 kn in San Diego + moored warship at 0 kn in Biển Đông -> BOTH suppressed
    hub.ingestForAlerts(
      'maritime-vessels',
      [
        {
          id: 'ais:us-parked',
          layer: 'vessels',
          title: 'WARSHIP 114 (USA)',
          subtitle: 'Hải quân / Tuần duyên · 0 kn · Hướng 0°',
          category: 'naval_patrol',
          severity: 'high',
          lat: 32.68,
          lon: -117.13,
          timestamp: t0 + 10_000,
          source: 'AIS',
          meta: { speedKt: 0, onGround: true },
        },
        {
          id: 'ais:scs-moored',
          layer: 'vessels',
          title: 'COAST GUARD 8002',
          subtitle: 'Hải quân / Tuần duyên · 0.4 kn · Hướng 90°',
          category: 'naval_patrol',
          severity: 'high',
          lat: 16.05,
          lon: 108.22,
          timestamp: t0 + 10_000,
          source: 'AIS',
          meta: { speedKt: 0.4, onGround: true },
        },
      ],
      t0 + 10_000,
    );
    expect(alerts).toHaveLength(0);

    // 2) Same Biển Đông vessel now gets underway at 14.5 kn -> triggers NAVAL AIS · CHÂU Á!
    hub.ingestForAlerts(
      'maritime-vessels',
      [
        {
          id: 'ais:scs-moored',
          layer: 'vessels',
          title: 'COAST GUARD 8002',
          subtitle: 'Hải quân / Tuần duyên · 14.5 kn · Hướng 115°',
          category: 'naval_patrol',
          severity: 'high',
          lat: 15.88,
          lon: 111.45,
          timestamp: t0 + 30_000,
          source: 'AIS',
          meta: { speedKt: 14.5, onGround: false, corridor: 'Biển Đông / Việt Nam' },
        },
      ],
      t0 + 30_000,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 'ais:scs-moored',
      badge: 'NAVAL AIS · CHÂU Á',
      title: 'COAST GUARD 8002',
    });

    // 3) Major M6.1 earthquake globally -> triggers SEISMIC ALERT
    hub.ingestForAlerts(
      'earthquakes',
      [
        {
          id: 'eq:61',
          layer: 'earthquakes',
          title: 'M 6.1 - Mindanao, Philippines',
          category: 'earthquake',
          severity: 'high',
          magnitude: 6.1,
          lat: 6.8,
          lon: 126.2,
          timestamp: t0 + 35_000,
          source: 'USGS',
          meta: { depthKm: 32 },
        },
      ],
      t0 + 35_000,
    );
    expect(alerts).toHaveLength(2);
    expect(alerts[1].badge).toBe('SEISMIC ALERT');
  });
});
