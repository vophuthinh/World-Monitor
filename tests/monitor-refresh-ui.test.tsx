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
