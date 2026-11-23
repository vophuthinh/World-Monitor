// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { WorldMapProps } from '../client/src/components/WorldMap';

const mocks = vi.hoisted(() => {
  class MockMap {
    static current: MockMap;
    sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    layers = new Set<string>();
    listeners = new Map<string, Set<() => void>>();
    moving = false;
    styleLoaded = true;
    projection = 'mercator';
    setProjection = vi.fn(({ type }: { type: string }) => { this.projection = type; });
    setStyle = vi.fn(() => {
      this.sources.clear();
      this.layers.clear();
      this.projection = 'mercator';
      this.emit('style.load');
    });
    constructor() { MockMap.current = this; }
    isStyleLoaded() { return this.styleLoaded; }
    isMoving() { return this.moving; }
    getProjection() { return { type: this.projection }; }
    hasImage() { return true; }
    addControl() {}
    getSource(id: string) { return this.sources.get(id); }
    addSource(id: string) { this.sources.set(id, { setData: vi.fn() }); }
    getLayer(id: string) { return this.layers.has(id); }
    addLayer(layer: { id: string }) { this.layers.add(layer.id); }
    setLayoutProperty() {}
    setPaintProperty() {}
    on(name: string, callback: () => void) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name)!.add(callback);
    }
    once(name: string, callback: () => void) { this.on(name, callback); }
    off(name: string, callback: () => void) { this.listeners.get(name)?.delete(callback); }
    emit(name: string) {
      for (const callback of [...(this.listeners.get(name) ?? [])]) {
        if (name === 'moveend' || name === 'idle') this.off(name, callback);
        callback();
      }
    }
    remove() {}
  }
  return { MockMap };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: mocks.MockMap,
    NavigationControl: class {},
    Popup: class { remove() {} },
  },
}));

import { WorldMap } from '../client/src/components/WorldMap';

it('avoids redundant source updates and applies the latest data after movement', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const activeLayers = {
    military: true, vessels: true, cyberThreats: false, cyberArcs: false, gpsOutages: false,
    earthquakes: true, natural: false, geopolitics: true, militaryBases: false, aiDatacenters: false,
    chokepoints: true, nuclear: false, financeCenters: false, cables: false, weatherRadar: false,
  };
  const props: WorldMapProps = {
    isGlobe: false, basemap: 'dark-matter', activeLayers, radarOpacity: 0.5, weatherRadar: null,
    military: [], vessels: [], cyberThreats: [], cyberArcs: [], gpsOutages: [], militaryAnchorMs: 1,
    vesselsAnchorMs: 1, deadReckoning: true, earthquakes: [], natural: [], geopolitics: [],
    militaryBases: [], aiDatacenters: [], chokepoints: [], nuclear: [], financeCenters: [], cables: [],
    vietnamSovereignty: [], vietnamZones: [], vietnamSeaLabels: [], cameraTarget: null, onSelectFeature: vi.fn(),
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WorldMap {...props} />));
    const map = mocks.MockMap.current;
    const military = map.sources.get('military-src')!.setData;
    const vessels = map.sources.get('vessels-src')!.setData;
    const islands = map.sources.get('vn-islands-src')!.setData;
    const earthquakes = map.sources.get('earthquakes-src')!.setData;

    await act(async () => root.render(<WorldMap {...props} radarOpacity={0.7} />));
    expect(military).not.toHaveBeenCalled();
    expect(vessels).not.toHaveBeenCalled();
    expect(islands).not.toHaveBeenCalled();
    expect(map.setProjection).not.toHaveBeenCalled();

    map.moving = true;
    const quake = { id: 'one', layer: 'earthquakes' as const, title: 'Quake', category: 'quake', severity: 'low' as const, lat: 1, lon: 2, timestamp: 1, source: 'test', meta: {} };
    await act(async () => root.render(<WorldMap {...props} earthquakes={[quake]} />));
    await act(async () => root.render(<WorldMap {...props} earthquakes={[{ ...quake, id: 'latest' }]} militaryAnchorMs={2} />));
    expect(earthquakes).not.toHaveBeenCalled();
    expect(map.listeners.get('moveend')?.size).toBe(1);
    map.moving = false;
    await act(async () => map.emit('moveend'));
    expect(earthquakes).toHaveBeenCalledOnce();
    expect(earthquakes.mock.calls[0][0].features[0].properties.featureId).toBe('latest');
    expect(military).toHaveBeenCalledOnce();
    expect(vessels).not.toHaveBeenCalled();
    expect(islands).not.toHaveBeenCalled();

    map.styleLoaded = false;
    await act(async () => root.render(<WorldMap {...props} earthquakes={[{ ...quake, id: 'after-load' }]} />));
    expect(earthquakes).toHaveBeenCalledOnce();
    expect(map.listeners.get('idle')?.size).toBe(1);
    map.styleLoaded = true;
    await act(async () => map.emit('idle'));
    expect(earthquakes).toHaveBeenCalledTimes(2);
    expect(earthquakes.mock.calls[1][0].features[0].properties.featureId).toBe('after-load');

    await act(async () => root.render(<WorldMap {...props} deadReckoning={false} isGlobe />));
    expect(military).toHaveBeenCalledTimes(3);
    expect(vessels).toHaveBeenCalledOnce();
    expect(map.setProjection).toHaveBeenCalledWith({ type: 'globe' });
    await act(async () => root.render(<WorldMap {...props} isGlobe basemap="voyager" />));
    expect(map.getProjection().type).toBe('globe');
    expect(map.sources.has('military-src')).toBe(true);

    map.moving = true;
    await act(async () => root.render(<WorldMap {...props} isGlobe basemap="voyager" radarOpacity={0.9} />));
    expect(map.listeners.get('moveend')?.size).toBe(1);
  } finally {
    await act(async () => root.unmount());
    expect(mocks.MockMap.current.listeners.get('moveend')?.size ?? 0).toBe(0);
    container.remove();
  }
});
