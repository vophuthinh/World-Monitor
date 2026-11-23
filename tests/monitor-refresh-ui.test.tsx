// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useMonitorData } from '../client/src/hooks/useMonitorData';
import type { BootstrapResponse } from '../shared/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('counts and flashes price changes when multiple ticks are batched', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let stream!: { onmessage: ((event: MessageEvent) => void) | null };
  class MockEventSource {
    onopen = null;
    onerror = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { stream = this; }
    close() {}
  }
  const now = Date.now();
  const bootstrap: BootstrapResponse = {
    serverTime: now,
    layers: { military: [], vessels: [], cyberThreats: [], gpsOutages: [], earthquakes: [], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: null,
    markets: { quotes: [], crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: null, volume24hUsd: null, updatedAt: now }], fearGreed: null, macro: [], updatedAt: now },
    predictions: [], news: [], theaters: [], health: [],
  };
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => bootstrap })));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() { state = useMonitorData(); return null; }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      for (const price of [101, 102]) stream.onmessage?.({
        data: JSON.stringify({ type: 'price_tick', ticks: [{ symbol: 'BTC', price, changePercent24h: 0 }], ts: now + price }),
      } as MessageEvent);
    });
    expect(state.data?.markets.crypto[0].priceUsd).toBe(102);
    expect(state.priceFlashes.BTC).toBe('up');
    expect(state.liveTickCount).toBe(2);
  } finally {
    await act(async () => root.unmount());
  }
});

it('surfaces refresh HTTP failures and clears them after a successful retry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let refreshOk = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/refresh/')) return { ok: refreshOk, status: refreshOk ? 200 : 429 };
    return { ok: false, status: 503 };
  }));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() {
    state = useMonitorData();
    return <div>{state.refreshErrors['markets-crypto']}</div>;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Harness />));
  await act(async () => { await state.forceRefresh('markets-crypto'); });
  expect(container.textContent).toContain('HTTP 429');
  refreshOk = true;
  await act(async () => { await state.forceRefresh('markets-crypto'); });
  expect(container.textContent).toBe('');
  expect(state.error).toContain('503');
  await act(async () => root.unmount());
  container.remove();
});

it('reports a failed fast poll and clears the warning after recovery', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let fastOk = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/live-fast') return fastOk
      ? { ok: true, json: async () => ({}) }
      : { ok: false, status: 502 };
    return { ok: false, status: 503 };
  }));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() {
    state = useMonitorData();
    return <div>{state.fastError}</div>;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(container.textContent).toContain('HTTP 502');
    fastOk = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(container.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});

it('preserves unchanged map layer references when realtime data changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let stream!: { onmessage: ((event: MessageEvent) => void) | null };
  class MockEventSource {
    onopen = null;
    onerror = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { stream = this; }
    close() {}
  }
  const now = Date.now();
  const earthquake = { id: 'eq', layer: 'earthquakes' as const, title: 'EQ', category: 'quake', severity: 'low' as const, lat: 0, lon: 0, timestamp: now, source: 'test', meta: {} };
  const bootstrap: BootstrapResponse = {
    serverTime: now,
    layers: { military: [], vessels: [], cyberThreats: [], gpsOutages: [], earthquakes: [earthquake], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: null,
    markets: { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now },
    predictions: [], news: [], theaters: [], health: [],
  };
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/live-fast'
    ? { ok: false, status: 503 }
    : { ok: true, json: async () => bootstrap }));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() { state = useMonitorData(); return null; }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    const before = state.filteredData;
    await act(async () => stream.onmessage?.({ data: JSON.stringify({ type: 'polymarket_update', predictions: [], ts: now }) } as MessageEvent));
    expect(state.filteredData.earthquakes).toBe(before.earthquakes);
    expect(state.filteredData.geopolitics).toBe(before.geopolitics);
    await act(async () => stream.onmessage?.({ data: JSON.stringify({ type: 'military_update', military: [], ts: now }) } as MessageEvent));
    expect(state.filteredData.earthquakes).toBe(before.earthquakes);
    await act(async () => state.setTimeWindow('6h'));
    expect(state.filteredData.earthquakes).not.toBe(before.earthquakes);
    expect(state.filteredData.earthquakes).toEqual([earthquake]);
    vi.setSystemTime(now + 6 * 3_600_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(state.filteredData.earthquakes).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});

it('preserves realtime events received while bootstrap or fast polling is in flight', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let stream!: { onmessage: ((event: MessageEvent) => void) | null };
  class MockEventSource {
    onopen = null;
    onerror = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { stream = this; }
    close() {}
  }
  const now = Date.now();
  const bootstrap: BootstrapResponse = {
    serverTime: now,
    layers: { military: [], vessels: [], cyberThreats: [], gpsOutages: [], earthquakes: [], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: { host: 'test', path: '/test', tileUrlTemplate: 'test', frameTime: 1, generatedAt: now, pastFrames: [] },
    markets: {
      quotes: [], crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 100, changePercent24h: 0, marketCapUsd: 0, volume24hUsd: 0, updatedAt: now }],
      vn30: [{ symbol: 'VCB', name: 'VCB', sector: 'bank', priceThousandVnd: 80, changePercent: 0, volume: 1, sparkline: [], updatedAt: now }],
      vnGold: [{ code: 'SJC', name: 'SJC', buyPerLuongMillionVnd: 80, sellPerLuongMillionVnd: 81, spreadMillionVnd: 1, changeBuyPercent: 0, changeSellPercent: 0, updatedAt: now, source: 'test' }],
      fearGreed: null, macro: [], updatedAt: now,
    },
    predictions: [{ id: 'old', title: 'old', category: 'finance', yesPercent: 50, volumeUsd: 1, liquidityUsd: 1, endDate: null, url: 'https://example.com' }], news: [], theaters: [], health: [],
    googleTrends: { vn: [], global: [], updatedAt: now },
  };
  let resolveBootstrap!: (value: { ok: boolean; json: () => Promise<BootstrapResponse> }) => void;
  let resolveFast!: (value: { ok: boolean; json: () => Promise<object> }) => void;
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/bootstrap'
    ? new Promise((resolve) => { resolveBootstrap = resolve; })
    : new Promise((resolve) => { resolveFast = resolve; })));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() { state = useMonitorData(); return null; }
  const container = document.createElement('div');
  const root = createRoot(container);
  const send = (id: string) => stream.onmessage?.({
    data: JSON.stringify({ type: 'military_update', military: [{ id }], ts: Date.now() }),
  } as MessageEvent);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => send('during-bootstrap'));
    await act(async () => stream.onmessage?.({
      data: JSON.stringify({ type: 'price_tick', ticks: [{ symbol: 'BTC', price: 110, changePercent24h: 2 }], ts: now + 1 }),
    } as MessageEvent));
    await act(async () => resolveBootstrap({ ok: true, json: async () => bootstrap }));
    expect(state.data?.layers.military[0]?.id).toBe('during-bootstrap');
    expect(state.data?.markets.crypto[0]?.priceUsd).toBe(110);
    expect(state.data?.markets.crypto[0]?.updatedAt).toBe(now + 1);
    expect(state.data?.markets.updatedAt).toBe(now);
    await act(async () => stream.onmessage?.({
      data: JSON.stringify({ type: 'price_tick', ticks: [{ symbol: 'BTC', price: 115, changePercent24h: 2 }], ts: now + 2 }),
    } as MessageEvent));
    expect(state.data?.markets.crypto[0]).toMatchObject({ priceUsd: 115, updatedAt: now + 2 });
    expect(state.data?.markets.updatedAt).toBe(now);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => send('during-fast'));
    await act(async () => stream.onmessage?.({
      data: JSON.stringify({ type: 'price_tick', ticks: [{ symbol: 'PAXG', price: 2450, changePercent24h: 1 }], ts: now + 60_001 }),
    } as MessageEvent));
    await act(async () => resolveFast({ ok: true, json: async () => ({
      serverTime: now + 60_000, military: [], vessels: [], earthquakes: [], weatherRadar: null,
      quotes: [], crypto: [], vn30: [], vnGold: [], fred: [], health: [{ id: 'markets-crypto', status: 'ok' }], predictions: [], fearGreed: null, googleTrends: null,
    }) }));
    expect(state.data?.layers.military[0]?.id).toBe('during-fast');
    expect(state.data?.markets.crypto).toEqual([]);
    expect(state.data?.markets.quotes.find((q) => q.symbol === 'PAXG')?.price).toBe(2450);
    expect(state.data?.markets.vn30).toEqual([]);
    expect(state.data?.markets.vnGold).toEqual([]);
    expect(state.data?.predictions).toEqual([]);
    expect(state.data?.googleTrends).toBeUndefined();
    expect(state.data?.weatherRadar).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});

it('preserves news received between an older bootstrap and a newer fast snapshot', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let stream!: { onmessage: ((event: MessageEvent) => void) | null };
  class MockEventSource {
    onopen = null;
    onerror = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { stream = this; }
    close() {}
  }
  const now = Date.now();
  const snapshot: BootstrapResponse = {
    serverTime: now,
    layers: { military: [], vessels: [], cyberThreats: [], gpsOutages: [], earthquakes: [], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: null, markets: { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now },
    predictions: [], news: [], theaters: [], health: [],
  };
  let resolveBootstrap!: (value: object) => void;
  let bootCount = 0;
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/refresh/')) return Promise.resolve({ ok: true });
    if (url === '/api/bootstrap') {
      if (++bootCount === 1) return Promise.resolve({ ok: true, json: async () => snapshot });
      return new Promise((resolve) => { resolveBootstrap = resolve; });
    }
    return Promise.resolve({ ok: true, json: async () => ({
      serverTime: now + 60_000, military: [], vessels: [], earthquakes: [], weatherRadar: null,
      quotes: [], crypto: [], vn30: [], vnGold: [], fred: [], health: [], predictions: [], fearGreed: null,
    }) });
  }));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() { state = useMonitorData(); return null; }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    let refresh!: Promise<void>;
    await act(async () => { refresh = state.forceRefresh('rss-news'); await Promise.resolve(); });
    await act(async () => stream.onmessage?.({ data: JSON.stringify({
      type: 'news_prepend', ts: now + 1,
      items: [{ id: 'live', title: 'Live', source: 'test', category: 'world', publishedAt: now + 1, url: 'https://example.com' }],
      stats: {},
    }) } as MessageEvent));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await act(async () => { resolveBootstrap({ ok: true, json: async () => ({ ...snapshot, serverTime: now }) }); await refresh; });
    expect(state.data?.news.map((item) => item.id)).toContain('live');
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});

it('retries a coalesced collector refresh after an in-flight bootstrap completes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  let stream!: { onmessage: ((event: MessageEvent) => void) | null };
  class MockEventSource {
    onopen = null;
    onerror = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { stream = this; }
    close() {}
  }
  const now = Date.now();
  const snapshot: BootstrapResponse = {
    serverTime: now,
    layers: { military: [], vessels: [], cyberThreats: [], gpsOutages: [], earthquakes: [], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: null, markets: { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: now },
    predictions: [], news: [], theaters: [], health: [],
  };
  let resolveFirst!: (value: { ok: boolean; json: () => Promise<BootstrapResponse> }) => void;
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockResolvedValue({ ok: true, json: async () => snapshot });
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', fetchMock);
  const root = createRoot(document.createElement('div'));
  try {
    function Harness() { useMonitorData(); return null; }
    await act(async () => root.render(<Harness />));
    await act(async () => stream.onmessage?.({
      data: JSON.stringify({ type: 'collector_sync', collectorId: 'tech-cyber', health: [], ts: now }),
    } as MessageEvent));
    await act(async () => { vi.advanceTimersByTime(1_200); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst({ ok: true, json: async () => snapshot }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});

it('does not replay a pre-snapshot tick over newer data and keeps PAXG separate from COMEX', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let stream!: { onmessage: ((event: MessageEvent) => void) | null };
  class MockEventSource {
    onopen = null;
    onerror = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() { stream = this; }
    close() {}
  }
  const now = Date.now();
  const snapshot: BootstrapResponse = {
    serverTime: now + 200,
    layers: { military: [], vessels: [], cyberThreats: [], gpsOutages: [], earthquakes: [], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: null,
    markets: {
      quotes: [
        { symbol: 'Gold', name: 'COMEX', group: 'commodity', price: 2500, changePercent24h: 0, updatedAt: now + 190, source: 'Yahoo' },
        { symbol: 'PAXG', name: 'PAX Gold / USDT', group: 'commodity', price: 2450, changePercent24h: 1, updatedAt: now + 190, source: 'Binance PAXG/USDT Realtime', retained: true },
      ],
      crypto: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', priceUsd: 200, changePercent24h: 0, marketCapUsd: 0, volume24hUsd: 0, updatedAt: now + 190 }],
      fearGreed: null, macro: [], updatedAt: now + 190,
    },
    predictions: [], news: [], theaters: [], health: [],
  };
  let resolve!: (value: { ok: boolean; json: () => Promise<BootstrapResponse> }) => void;
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolve = r; })));
  let state!: ReturnType<typeof useMonitorData>;
  function Harness() { state = useMonitorData(); return null; }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => stream.onmessage?.({ data: JSON.stringify({
      type: 'price_tick', ts: now + 100, ticks: [{ symbol: 'BTC', price: 100, changePercent24h: 0 }],
    }) } as MessageEvent));
    await act(async () => resolve({ ok: true, json: async () => snapshot }));
    expect(state.data?.markets.crypto[0].priceUsd).toBe(200);
    await act(async () => stream.onmessage?.({ data: JSON.stringify({
      type: 'price_tick', ts: now + 300, ticks: [
        { symbol: 'PAXG', price: 2450, changePercent24h: 1 },
        { symbol: 'BTC', price: 200, changePercent24h: 2 },
      ],
    }) } as MessageEvent));
    expect(state.data?.markets.quotes.find((q) => q.symbol === 'Gold')?.price).toBe(2500);
    expect(state.data?.markets.quotes.find((q) => q.symbol === 'PAXG')).toMatchObject({
      price: 2450, source: 'Binance PAXG/USDT Realtime', retained: false,
    });
    expect(state.data?.markets.crypto[0].changePercent24h).toBe(2);
  } finally {
    await act(async () => root.unmount());
  }
});
