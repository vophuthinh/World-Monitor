import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type {
  BasemapTheme,
  GeoLineFeature,
  GeoPointFeature,
  InspectableFeature,
  MapLayerId,
  WeatherRadarSnapshot,
} from '@shared/types';
import type { CameraTarget } from '../hooks/useMonitorData';

const CARTO_STYLE_URLS: Record<BasemapTheme, string> = {
  'dark-matter': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const JET_PALETTE: Record<string, string> = {
  'jet-bomber': '#f43f5e',
  'jet-vip': '#facc15',
  'jet-awacs': '#22d3ee',
  'jet-recon': '#fb923c',
  'jet-fighter': '#38bdf8',
  'jet-tanker': '#34d399',
  'jet-default': '#94a3b8',
};

function createJetSprite(fillColor: string): { width: number; height: number; data: Uint8Array } {
  const size = 44;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  // Tactical swept-wing aircraft pointing North (0 deg)
  ctx.moveTo(22, 3);
  ctx.lineTo(25.5, 14);
  ctx.lineTo(40, 25);
  ctx.lineTo(40, 29.5);
  ctx.lineTo(25.5, 24.5);
  ctx.lineTo(25, 35);
  ctx.lineTo(32, 39.5);
  ctx.lineTo(32, 42);
  ctx.lineTo(22, 39.5);
  ctx.lineTo(12, 42);
  ctx.lineTo(12, 39.5);
  ctx.lineTo(19, 35);
  ctx.lineTo(18.5, 24.5);
  ctx.lineTo(4, 29.5);
  ctx.lineTo(4, 25);
  ctx.lineTo(18.5, 14);
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#05080f';
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  return {
    width: size,
    height: size,
    data: new Uint8Array(imageData.data.buffer),
  };
}

function pointsToFeatureCollection(points: GeoPointFeature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((pt) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [pt.lon, pt.lat],
      },
      properties: {
        featureId: pt.id,
        title: pt.title,
        subtitle: pt.subtitle ?? '',
        category: pt.category,
        severity: pt.severity,
        heading: pt.heading ?? 0,
        magnitude: pt.magnitude ?? 1,
        shortLabel:
          (pt.meta.shortName as string | undefined) ??
          (pt.meta.callsign as string | undefined) ??
          pt.title.split('(')[0].trim(),
        isVietnam:
          pt.meta.country === 'VN' || pt.meta.tier === 'vietnam' ? 1 : 0,
      },
    })),
  };
}

function cablesToFeatureCollection(cables: GeoLineFeature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cables.map((cb) => ({
      type: 'Feature',
      geometry: {
        type: 'MultiLineString',
        coordinates: cb.coordinates,
      },
      properties: {
        featureId: cb.id,
        title: cb.name,
        subtitle: cb.landingPoints.map((l) => l.city).join(' · '),
        vietnamConnected: cb.vietnamConnected ? 1 : 0,
      },
    })),
  };
}

export interface WorldMapProps {
  isGlobe: boolean;
  basemap: BasemapTheme;
  activeLayers: Record<MapLayerId, boolean>;
  radarOpacity: number;
  weatherRadar: WeatherRadarSnapshot | null;
  military: GeoPointFeature[];
  earthquakes: GeoPointFeature[];
  natural: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  chokepoints: GeoPointFeature[];
  nuclear: GeoPointFeature[];
  financeCenters: GeoPointFeature[];
  cables: GeoLineFeature[];
  cameraTarget: CameraTarget | null;
  onSelectFeature: (item: InspectableFeature) => void;
}

const CLICKABLE_LAYERS = [
  'military-layer',
  'earthquakes-circle',
  'natural-circle',
  'geopolitics-circle',
  'chokepoints-circle',
  'nuclear-circle',
  'finance-circle',
  'cables-hit-layer',
] as const;

export function WorldMap({
  isGlobe,
  basemap,
  activeLayers,
  radarOpacity,
  weatherRadar,
  military,
  earthquakes,
  natural,
  geopolitics,
  chokepoints,
  nuclear,
  financeCenters,
  cables,
  cameraTarget,
  onSelectFeature,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const appliedRadarPathRef = useRef<string | null>(null);
  const currentBasemapRef = useRef<BasemapTheme>(basemap);

  // Latest lookups & state refs so style.load callbacks always read fresh props
  const pointLookupRef = useRef<Map<string, GeoPointFeature>>(new Map());
  const cableLookupRef = useRef<Map<string, GeoLineFeature>>(new Map());
  const latestPropsRef = useRef({
    isGlobe,
    activeLayers,
    radarOpacity,
    weatherRadar,
    military,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
  });

  latestPropsRef.current = {
    isGlobe,
    activeLayers,
    radarOpacity,
    weatherRadar,
    military,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
  };

  useEffect(() => {
    const ptMap = new Map<string, GeoPointFeature>();
    for (const list of [military, earthquakes, natural, geopolitics, chokepoints, nuclear, financeCenters]) {
      for (const item of list) ptMap.set(item.id, item);
    }
    pointLookupRef.current = ptMap;

    const cbMap = new Map<string, GeoLineFeature>();
    for (const cb of cables) cbMap.set(cb.id, cb);
    cableLookupRef.current = cbMap;
  }, [military, earthquakes, natural, geopolitics, chokepoints, nuclear, financeCenters, cables]);

  const ensureLayersAndData = (map: maplibregl.Map) => {
    if (!map.isStyleLoaded()) return;
    const state = latestPropsRef.current;

    try {
      map.setProjection({ type: state.isGlobe ? 'globe' : 'mercator' });
    } catch {
      // Fallback safely if WebGL driver lacks globe support
    }

    for (const [iconName, color] of Object.entries(JET_PALETTE)) {
      if (!map.hasImage(iconName)) {
        map.addImage(iconName, createJetSprite(color), { pixelRatio: 2 });
      }
    }

    // 1. Weather Radar Raster Overlay
    const desiredTile = state.weatherRadar?.tileUrlTemplate ?? null;
    if (desiredTile && appliedRadarPathRef.current !== desiredTile) {
      if (map.getLayer('radar-layer')) map.removeLayer('radar-layer');
      if (map.getSource('radar-src')) map.removeSource('radar-src');
      map.addSource('radar-src', {
        type: 'raster',
        tiles: [desiredTile],
        tileSize: 256,
        attribution: 'RainViewer',
      });
      map.addLayer({
        id: 'radar-layer',
        type: 'raster',
        source: 'radar-src',
        layout: {
          visibility: state.activeLayers.weatherRadar ? 'visible' : 'none',
        },
        paint: {
          'raster-opacity': state.radarOpacity,
          'raster-fade-duration': 200,
        },
      });
      appliedRadarPathRef.current = desiredTile;
    } else if (map.getLayer('radar-layer')) {
      map.setLayoutProperty(
        'radar-layer',
        'visibility',
        state.activeLayers.weatherRadar && desiredTile ? 'visible' : 'none',
      );
      map.setPaintProperty('radar-layer', 'raster-opacity', state.radarOpacity);
    }

    // 2. Submarine Cables
    const cablesGeo = cablesToFeatureCollection(state.cables);
    const existingCables = map.getSource('cables-src') as GeoJSONSource | undefined;
    if (!existingCables) {
      map.addSource('cables-src', { type: 'geojson', data: cablesGeo });
      map.addLayer({
        id: 'cables-line-layer',
        type: 'line',
        source: 'cables-src',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: state.activeLayers.cables ? 'visible' : 'none',
        },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'vietnamConnected'], 1],
            '#2dd4bf',
            '#0284c7',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'vietnamConnected'], 1],
            2.1,
            1.25,
          ],
          'line-opacity': [
            'case',
            ['==', ['get', 'vietnamConnected'], 1],
            0.85,
            0.48,
          ],
          'line-dasharray': [2, 1.5],
        },
      });
      // Invisible wider hit target for easy clicking
      map.addLayer({
        id: 'cables-hit-layer',
        type: 'line',
        source: 'cables-src',
        layout: {
          visibility: state.activeLayers.cables ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#000000',
          'line-width': 10,
          'line-opacity': 0.01,
        },
      });
    } else {
      existingCables.setData(cablesGeo);
      const vis = state.activeLayers.cables ? 'visible' : 'none';
      if (map.getLayer('cables-line-layer')) map.setLayoutProperty('cables-line-layer', 'visibility', vis);
      if (map.getLayer('cables-hit-layer')) map.setLayoutProperty('cables-hit-layer', 'visibility', vis);
    }

    // Helper for point sources
    const upsertPointSource = (id: string, pts: GeoPointFeature[]) => {
      const fc = pointsToFeatureCollection(pts);
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (!src) {
        map.addSource(id, { type: 'geojson', data: fc });
        return true;
      }
      src.setData(fc);
      return false;
    };

    // 3. Chokepoints
    if (upsertPointSource('chokepoints-src', state.chokepoints)) {
      map.addLayer({
        id: 'chokepoints-circle',
        type: 'circle',
        source: 'chokepoints-src',
        paint: {
          'circle-radius': 6.5,
          'circle-color': '#0ea5e9',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#bae6fd',
          'circle-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'chokepoints-label',
        type: 'symbol',
        source: 'chokepoints-src',
        minzoom: 2.2,
        layout: {
          'text-field': ['get', 'shortLabel'],
          'text-size': 10.5,
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#7dd3fc',
          'text-halo-color': '#05080f',
          'text-halo-width': 1.4,
        },
      });
    }
    const chokeVis = state.activeLayers.chokepoints ? 'visible' : 'none';
    if (map.getLayer('chokepoints-circle')) map.setLayoutProperty('chokepoints-circle', 'visibility', chokeVis);
    if (map.getLayer('chokepoints-label')) map.setLayoutProperty('chokepoints-label', 'visibility', chokeVis);

    // 4. Finance Centers (highlighting Vietnam HOSE/HNX/SBV)
    if (upsertPointSource('finance-src', state.financeCenters)) {
      map.addLayer({
        id: 'finance-circle',
        type: 'circle',
        source: 'finance-src',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'isVietnam'], 1], 7, 4.8],
          'circle-color': ['case', ['==', ['get', 'isVietnam'], 1], '#10b981', '#34d399'],
          'circle-stroke-width': ['case', ['==', ['get', 'isVietnam'], 1], 2.2, 1.2],
          'circle-stroke-color': ['case', ['==', ['get', 'isVietnam'], 1], '#fef08a', '#052e16'],
        },
      });
      map.addLayer({
        id: 'finance-label',
        type: 'symbol',
        source: 'finance-src',
        minzoom: 3.2,
        layout: {
          'text-field': ['get', 'shortLabel'],
          'text-size': 10,
          'text-offset': [0, 1.05],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#6ee7b7',
          'text-halo-color': '#05080f',
          'text-halo-width': 1.3,
        },
      });
    }
    const finVis = state.activeLayers.financeCenters ? 'visible' : 'none';
    if (map.getLayer('finance-circle')) map.setLayoutProperty('finance-circle', 'visibility', finVis);
    if (map.getLayer('finance-label')) map.setLayoutProperty('finance-label', 'visibility', finVis);

    // 5. Nuclear Sites
    if (upsertPointSource('nuclear-src', state.nuclear)) {
      map.addLayer({
        id: 'nuclear-circle',
        type: 'circle',
        source: 'nuclear-src',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'severity'],
            'critical',
            7.5,
            'high',
            6,
            4.8,
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#ef4444',
            'high',
            '#eab308',
            '#fde047',
          ],
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#090d16',
          'circle-opacity': 0.9,
        },
      });
    }
    if (map.getLayer('nuclear-circle')) {
      map.setLayoutProperty('nuclear-circle', 'visibility', state.activeLayers.nuclear ? 'visible' : 'none');
    }

    // 6. Geopolitics GDELT
    if (upsertPointSource('geopolitics-src', state.geopolitics)) {
      map.addLayer({
        id: 'geopolitics-circle',
        type: 'circle',
        source: 'geopolitics-src',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'magnitude'],
            1,
            4.5,
            30,
            9.5,
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#f97316',
            'high',
            '#fb923c',
            '#fdba74',
          ],
          'circle-opacity': 0.76,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#431407',
        },
      });
    }
    if (map.getLayer('geopolitics-circle')) {
      map.setLayoutProperty('geopolitics-circle', 'visibility', state.activeLayers.geopolitics ? 'visible' : 'none');
    }

    // 7. Natural Events (NASA EONET + GDACS)
    if (upsertPointSource('natural-src', state.natural)) {
      map.addLayer({
        id: 'natural-circle',
        type: 'circle',
        source: 'natural-src',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'severity'],
            'critical',
            8.5,
            'high',
            6.8,
            5.2,
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#ec4899',
            'high',
            '#f59e0b',
            '#a855f7',
          ],
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.88,
        },
      });
    }
    if (map.getLayer('natural-circle')) {
      map.setLayoutProperty('natural-circle', 'visibility', state.activeLayers.natural ? 'visible' : 'none');
    }

    // 8. Earthquakes (USGS)
    if (upsertPointSource('earthquakes-src', state.earthquakes)) {
      map.addLayer({
        id: 'earthquakes-halo',
        type: 'circle',
        source: 'earthquakes-src',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'magnitude'],
            2.5,
            6,
            5.0,
            14,
            7.0,
            26,
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#f43f5e',
            'high',
            '#fb7185',
            '#f97316',
          ],
          'circle-opacity': 0.22,
        },
      });
      map.addLayer({
        id: 'earthquakes-circle',
        type: 'circle',
        source: 'earthquakes-src',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'magnitude'],
            2.5,
            3.5,
            5.0,
            7.5,
            7.0,
            13,
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            'critical',
            '#e11d48',
            'high',
            '#f43f5e',
            'medium',
            '#fb923c',
            '#fbbf24',
          ],
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#fff1f2',
          'circle-opacity': 0.92,
        },
      });
    }
    const eqVis = state.activeLayers.earthquakes ? 'visible' : 'none';
    if (map.getLayer('earthquakes-halo')) map.setLayoutProperty('earthquakes-halo', 'visibility', eqVis);
    if (map.getLayer('earthquakes-circle')) map.setLayoutProperty('earthquakes-circle', 'visibility', eqVis);

    // 9. Military Aircraft (Topmost directional tactical layer)
    if (upsertPointSource('military-src', state.military)) {
      map.addLayer({
        id: 'military-layer',
        type: 'symbol',
        source: 'military-src',
        layout: {
          'icon-image': [
            'match',
            ['get', 'category'],
            'bomber',
            'jet-bomber',
            'vip',
            'jet-vip',
            'awacs',
            'jet-awacs',
            ['recon', 'drone', 'special_ops'],
            'jet-recon',
            'fighter',
            'jet-fighter',
            'tanker',
            'jet-tanker',
            'jet-default',
          ],
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1.5,
            0.55,
            5,
            0.78,
            8,
            0.95,
          ],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
    if (map.getLayer('military-layer')) {
      map.setLayoutProperty('military-layer', 'visibility', state.activeLayers.military ? 'visible' : 'none');
    }
  };

  // Mount MapLibre GL v5 instance once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_STYLE_URLS[basemap],
      center: [108.5, 16.0], // Start centered near Vietnam & Indo-Pacific / East Sea
      zoom: 3.2,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      maxWidth: '280px',
    });
    popupRef.current = popup;

    map.on('style.load', () => {
      appliedRadarPathRef.current = null;
      ensureLayersAndData(map);
    });

    map.on('mousemove', (e) => {
      const availableLayers = CLICKABLE_LAYERS.filter((id) => Boolean(map.getLayer(id)));
      if (availableLayers.length === 0) return;

      const rendered = map.queryRenderedFeatures(e.point, { layers: [...availableLayers] });
      if (!rendered.length) {
        map.getCanvas().style.cursor = '';
        popup.remove();
        return;
      }

      map.getCanvas().style.cursor = 'pointer';
      const top = rendered[0];
      const title = String(top.properties?.title ?? '');
      const subtitle = String(top.properties?.subtitle ?? '');

      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;font-weight:600;color:#f8fafc;line-height:1.3;">${title.replace(/</g, '&lt;')}</div>` +
            (subtitle
              ? `<div style="font-size:10.5px;color:#94a3b8;margin-top:2px;line-height:1.35;">${subtitle.slice(0, 110).replace(/</g, '&lt;')}</div>`
              : ''),
        )
        .addTo(map);
    });

    map.on('click', (e) => {
      const availableLayers = CLICKABLE_LAYERS.filter((id) => Boolean(map.getLayer(id)));
      if (availableLayers.length === 0) return;
      const rendered = map.queryRenderedFeatures(e.point, { layers: [...availableLayers] });
      if (!rendered.length) return;

      const top = rendered[0];
      const featureId = String(top.properties?.featureId ?? '');
      if (!featureId) return;

      if (top.layer.id === 'cables-hit-layer') {
        const foundCable = cableLookupRef.current.get(featureId);
        if (foundCable) {
          onSelectFeature({ kind: 'cable', feature: foundCable });
        }
        return;
      }

      const foundPoint = pointLookupRef.current.get(featureId);
      if (foundPoint) {
        onSelectFeature({ kind: 'point', feature: foundPoint });
      }
    });

    mapRef.current = map;

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap theme dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentBasemapRef.current === basemap) return;
    currentBasemapRef.current = basemap;
    appliedRadarPathRef.current = null;
    map.setStyle(CARTO_STYLE_URLS[basemap]);
  }, [basemap]);

  // Update projection, visibility, opacity, and GeoJSON data whenever props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      ensureLayersAndData(map);
    }
  }, [
    isGlobe,
    activeLayers,
    radarOpacity,
    weatherRadar,
    military,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
  ]);

  // Smooth camera flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraTarget) return;
    map.flyTo({
      center: [cameraTarget.lon, cameraTarget.lat],
      zoom: cameraTarget.zoom,
      duration: 1350,
      essential: true,
    });
  }, [cameraTarget]);

  return <div ref={containerRef} className="h-full w-full bg-[#070b12]" />;
}
