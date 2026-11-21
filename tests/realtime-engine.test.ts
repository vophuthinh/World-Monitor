import { describe, expect, it } from 'vitest';
import { advanceDeadReckoning } from '../shared/dead-reckoning';
import { createApp } from '../server/app';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';
import {
  classifyMmsiCountry,
  extractWsPayloadText,
  normalizeDigitrafficVessels,
  parseAisStreamMessage,
} from '../server/collectors/maritime-vessels';
import { parseBinanceCombinedTick } from '../server/realtime/binance-stream';
import { RealtimeHub } from '../server/realtime/hub';

describe('Realtime Streaming Engine (SSE Hub, Binance WS, AIS Vessels & Dead-Reckoning)', () => {
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
    expect(goldTick?.symbol).toBe('Gold');
    expect(goldTick?.price).toBe(3554.2);
  });

  it('resolves MMSI maritime flags (including Vietnam 574) and normalizes Digitraffic + AISStream vessels', () => {
    expect(classifyMmsiCountry(574001230)).toBe('Vietnam');
    expect(classifyMmsiCountry(412345678)).toBe('China');
    expect(classifyMmsiCountry(563111222)).toBe('Singapore');

    const now = 1_700_000_000_000;
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

    // Also parses ShipStaticData and decodes binary Blob WebSocket frames from AISStream.io
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
      const tanker = parseAisStreamMessage(decoded, now);
      expect(tanker?.id).toBe('ais:466012000');
      expect(tanker?.category).toBe('tanker');
      expect(tanker?.title).toContain('SIDRA QATAR');
    });
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
});
