// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { App } from '../client/src/App';
import type { BootstrapResponse } from '../shared/types';

const { mapRender, topRender } = vi.hoisted(() => ({ mapRender: vi.fn(), topRender: vi.fn() }));
vi.mock('../client/src/components/WorldMap', () => ({ WorldMap: (props: unknown) => { mapRender(props); return null; } }));
vi.mock('../client/src/components/TopCommandBar', () => ({ TopCommandBar: (props: unknown) => { topRender(props); return null; } }));
vi.mock('../client/src/components/LayerControlDock', () => ({ LayerControlDock: () => null }));
vi.mock('../client/src/components/FeatureInspector', () => ({ FeatureInspector: () => null }));
vi.mock('../client/src/components/LiveOverlays', () => ({
  LiveAlertStack: () => null, LiveTvPipWindow: () => null, WindyWeatherWindow: () => null,
}));
vi.mock('../client/src/components/right-panel/LiveIntelTab', () => ({ LiveIntelTab: () => null }));

it('shows static theater presets while bootstrap is still pending', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  topRender.mockClear();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<App />));
    expect(topRender.mock.lastCall?.[0].theaters.map((preset: { id: string }) => preset.id)).toContain('east-sea-vn');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it('opens and closes the mobile drawer with Escape and restores focus', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<App />));
    const open = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Bảng Intel'));
    expect(open).toBeDefined();
    await act(async () => open?.click());
    expect(open?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#mobile-intel-panel')).not.toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('#mobile-intel-panel')).toBeNull();
    expect(open?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(open);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps the active radar snapshot stable across unrelated UI changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const frame = { time: 123, path: '/frame', tileUrlTemplate: '/tile' };
  const bootstrap: BootstrapResponse = {
    serverTime: 123,
    layers: { military: [], vessels: [], cyberThreats: [], earthquakes: [], natural: [], geopolitics: [] },
    staticGeo: { chokepoints: [], nuclear: [], financeCenters: [], militaryBases: [], aiDatacenters: [], cables: [], vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [] },
    weatherRadar: { ...frame, frameTime: frame.time, host: '', generatedAt: 123, pastFrames: [frame] },
    markets: { quotes: [], crypto: [], fearGreed: null, macro: [], updatedAt: 123 },
    predictions: [], news: [], theaters: [], health: [],
  };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => bootstrap })));
  mapRender.mockClear();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<App />));
    const before = mapRender.mock.lastCall?.[0].weatherRadar;
    expect(before?.path).toBe('/frame');
    expect(topRender.mock.lastCall?.[0].theaters).toEqual(bootstrap.theaters);
    const open = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Bảng Intel'));
    await act(async () => open?.click());
    expect(mapRender.mock.lastCall?.[0].weatherRadar).toBe(before);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
