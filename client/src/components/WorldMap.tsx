import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { advanceDeadReckoning } from '@shared/dead-reckoning';
import type {
  BasemapTheme,
  GeoLineFeature,
  GeoPointFeature,
  InspectableFeature,
  MapLayerId,
  VietnamArchipelagoZone,
  VietnamSeaLabel,
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

const VESSEL_PALETTE: Record<string, string> = {
  'ship-naval': '#f43f5e',
  'ship-tanker': '#f59e0b',
  'ship-cargo': '#34d399',
  'ship-default': '#38bdf8',
};

function createJetSprite(fillColor: string): { width: number; height: number; data: Uint8Array } {
  const size = 44;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
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

function createVesselSprite(fillColor: string): { width: number; height: number; data: Uint8Array } {
  const size = 36;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(18, 4);
  ctx.lineTo(26, 15);
  ctx.lineTo(25, 31);
  ctx.lineTo(11, 31);
  ctx.lineTo(10, 15);
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#040812';
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  return {
    width: size,
    height: size,
    data: new Uint8Array(imageData.data.buffer),
  };
}

function createVietnamStarSprite(): { width: number; height: number; data: Uint8Array } {
  const size = 44;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Red sovereign circular badge with gold ring
  ctx.beginPath();
  ctx.arc(cx, cy, 17, 0, Math.PI * 2);
  ctx.fillStyle = '#da251d';
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#ffcd00';
  ctx.stroke();

  // Five-pointed gold star
  const spikes = 5;
  const outerRadius = 10.2;
  const innerRadius = 4.1;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = '#ffcd00';
  ctx.fill();

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
          pt.meta.country === 'VN' || pt.meta.country === 'Vietnam' || pt.meta.tier === 'vietnam' ? 1 : 0,
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

function zonesToFeatureCollection(zones: VietnamArchipelagoZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [z.polygon],
      },
      properties: {
        zoneId: z.id,
        name: z.name,
        province: z.province,
      },
    })),
  };
}

function seaLabelsToFeatureCollection(labels: VietnamSeaLabel[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: labels.map((l) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [l.lon, l.lat],
      },
      properties: {
        labelId: l.id,
        name: l.name,
        subtitle: l.subtitle ?? '',
        minZoom: l.minZoom,
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
  vessels: GeoPointFeature[];
  militaryAnchorMs: number;
  vesselsAnchorMs: number;
  deadReckoning: boolean;
  earthquakes: GeoPointFeature[];
  natural: GeoPointFeature[];
  geopolitics: GeoPointFeature[];
  chokepoints: GeoPointFeature[];
  nuclear: GeoPointFeature[];
  financeCenters: GeoPointFeature[];
  cables: GeoLineFeature[];
  vietnamSovereignty: GeoPointFeature[];
  vietnamZones: VietnamArchipelagoZone[];
  vietnamSeaLabels: VietnamSeaLabel[];
  cameraTarget: CameraTarget | null;
  onSelectFeature: (item: InspectableFeature) => void;
}

const CLICKABLE_LAYERS = [
  'military-layer',
  'vessels-layer',
  'vn-archipelago-symbol',
  'vn-islands-circle',
  'vn-islands-label',
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
  vessels,
  militaryAnchorMs,
  vesselsAnchorMs,
  deadReckoning,
  earthquakes,
  natural,
  geopolitics,
  chokepoints,
  nuclear,
  financeCenters,
  cables,
  vietnamSovereignty,
  vietnamZones,
  vietnamSeaLabels,
  cameraTarget,
  onSelectFeature,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const appliedRadarPathRef = useRef<string | null>(null);
  const currentBasemapRef = useRef<BasemapTheme>(basemap);

  const pointLookupRef = useRef<Map<string, GeoPointFeature>>(new Map());
  const cableLookupRef = useRef<Map<string, GeoLineFeature>>(new Map());
  const latestPropsRef = useRef({
    isGlobe,
    basemap,
    activeLayers,
    radarOpacity,
    weatherRadar,
    military,
    vessels,
    militaryAnchorMs,
    vesselsAnchorMs,
    deadReckoning,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
    vietnamSovereignty,
    vietnamZones,
    vietnamSeaLabels,
  });

  latestPropsRef.current = {
    isGlobe,
    basemap,
    activeLayers,
    radarOpacity,
    weatherRadar,
    military,
    vessels,
    militaryAnchorMs,
    vesselsAnchorMs,
    deadReckoning,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
    vietnamSovereignty,
    vietnamZones,
    vietnamSeaLabels,
  };

  useEffect(() => {
    const ptMap = new Map<string, GeoPointFeature>();
    for (const list of [
      vietnamSovereignty,
      military,
      vessels,
      earthquakes,
      natural,
      geopolitics,
      chokepoints,
      nuclear,
      financeCenters,
    ]) {
      for (const item of list) ptMap.set(item.id, item);
    }
    pointLookupRef.current = ptMap;

    const cbMap = new Map<string, GeoLineFeature>();
    for (const cb of cables) cbMap.set(cb.id, cb);
    cableLookupRef.current = cbMap;
  }, [
    vietnamSovereignty,
    military,
    vessels,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
  ]);

  const ensureLayersAndData = (map: maplibregl.Map) => {
    if (!map.isStyleLoaded()) return;
    const state = latestPropsRef.current;
    const isLight = state.basemap !== 'dark-matter';

    try {
      map.setProjection({ type: state.isGlobe ? 'globe' : 'mercator' });
    } catch {
      // Safe fallback
    }

    for (const [iconName, color] of Object.entries(JET_PALETTE)) {
      if (!map.hasImage(iconName)) {
        map.addImage(iconName, createJetSprite(color), { pixelRatio: 2 });
      }
    }
    for (const [iconName, color] of Object.entries(VESSEL_PALETTE)) {
      if (!map.hasImage(iconName)) {
        map.addImage(iconName, createVesselSprite(color), { pixelRatio: 2 });
      }
    }
    if (!map.hasImage('vn-star-badge')) {
      map.addImage('vn-star-badge', createVietnamStarSprite(), { pixelRatio: 2 });
    }

    // 1. Weather Radar Raster Overlay — maxzoom: 7 prevents RainViewer z>=8 "Zoom Level Not Supported" watermark tiles
    const desiredTile = state.weatherRadar?.tileUrlTemplate ?? null;
    if (desiredTile && appliedRadarPathRef.current !== desiredTile) {
      if (map.getLayer('radar-layer')) map.removeLayer('radar-layer');
      if (map.getSource('radar-src')) map.removeSource('radar-src');
      map.addSource('radar-src', {
        type: 'raster',
        tiles: [desiredTile],
        tileSize: 256,
        maxzoom: 7,
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
          'raster-resampling': 'linear',
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

    // 2. Permanent Vietnam Maritime Sovereignty Zones & Cartography (Hoàng Sa, Trường Sa, Biển Đông)
    const vnZonesGeo = zonesToFeatureCollection(state.vietnamZones);
    const existingVnZones = map.getSource('vn-zones-src') as GeoJSONSource | undefined;
    if (!existingVnZones) {
      map.addSource('vn-zones-src', { type: 'geojson', data: vnZonesGeo });
      map.addLayer({
        id: 'vn-zones-fill',
        type: 'fill',
        source: 'vn-zones-src',
        paint: {
          'fill-color': isLight ? '#dc2626' : '#f59e0b',
          'fill-opacity': isLight ? 0.06 : 0.05,
        },
      });
      map.addLayer({
        id: 'vn-zones-outline',
        type: 'line',
        source: 'vn-zones-src',
        paint: {
          'line-color': isLight ? '#dc2626' : '#fbbf24',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.0, 5, 1.55, 9, 2.1],
          'line-opacity': isLight ? 0.65 : 0.68,
          'line-dasharray': [3, 2],
        },
      });
    } else {
      existingVnZones.setData(vnZonesGeo);
    }

    const vnSeaGeo = seaLabelsToFeatureCollection(state.vietnamSeaLabels);
    const existingVnSea = map.getSource('vn-sea-src') as GeoJSONSource | undefined;
    if (!existingVnSea) {
      map.addSource('vn-sea-src', { type: 'geojson', data: vnSeaGeo });
      map.addLayer({
        id: 'vn-sea-label',
        type: 'symbol',
        source: 'vn-sea-src',
        filter: ['>=', ['zoom'], ['get', 'minZoom']],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2.4, 10.5, 5, 14.5, 8, 18],
          'text-letter-spacing': 0.28,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isLight ? '#0369a1' : '#38bdf8',
          'text-halo-color': isLight ? '#f8fafc' : '#05080f',
          'text-halo-width': 1.9,
          'text-opacity': 0.88,
        },
      });
    } else {
      existingVnSea.setData(vnSeaGeo);
    }

    // 3. Submarine Cables
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
          'line-color': ['case', ['==', ['get', 'vietnamConnected'], 1], '#2dd4bf', '#0284c7'],
          'line-width': ['case', ['==', ['get', 'vietnamConnected'], 1], 2.1, 1.25],
          'line-opacity': ['case', ['==', ['get', 'vietnamConnected'], 1], 0.85, 0.48],
          'line-dasharray': [2, 1.5],
        },
      });
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

    // 3b. Vietnam Sovereignty Archipelago Anchors & Individual Islands (Hoàng Sa, Trường Sa, DK1, Lý Sơn, Côn Đảo, Phú Quốc...)
    const archipelagoAnchors = state.vietnamSovereignty.filter((f) => f.category === 'archipelago');
    const individualIslands = state.vietnamSovereignty.filter((f) => f.category !== 'archipelago');

    if (upsertPointSource('vn-islands-src', individualIslands)) {
      map.addLayer({
        id: 'vn-islands-circle',
        type: 'circle',
        source: 'vn-islands-src',
        minzoom: 4.1,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4.1, 3.3, 6.5, 5.0, 9.5, 6.8],
          'circle-color': '#da251d',
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#ffcd00',
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'vn-islands-label',
        type: 'symbol',
        source: 'vn-islands-src',
        minzoom: 4.8,
        layout: {
          'text-field': ['get', 'shortLabel'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4.8, 9.5, 7, 11.2, 10, 13],
          'text-offset': [0, 0.95],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': isLight ? '#991b1b' : '#fef08a',
          'text-halo-color': isLight ? '#ffffff' : '#05080f',
          'text-halo-width': 1.6,
        },
      });
    }

    if (upsertPointSource('vn-archipelago-src', archipelagoAnchors)) {
      map.addLayer({
        id: 'vn-archipelago-symbol',
        type: 'symbol',
        source: 'vn-archipelago-src',
        minzoom: 2.0,
        layout: {
          'icon-image': 'vn-star-badge',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 5, 0.78, 8, 0.92],
          'icon-allow-overlap': true,
          'text-field': ['concat', ['get', 'shortLabel'], '\n(VIỆT NAM)'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2.2, 9.5, 4.8, 12, 8, 14],
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isLight ? '#b91c1c' : '#fde047',
          'text-halo-color': isLight ? '#ffffff' : '#05080f',
          'text-halo-width': 2.0,
        },
      });
    }

    // 4. Chokepoints
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

    // 5. Finance Centers
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

    // 6. Nuclear Sites
    if (upsertPointSource('nuclear-src', state.nuclear)) {
      map.addLayer({
        id: 'nuclear-circle',
        type: 'circle',
        source: 'nuclear-src',
        paint: {
          'circle-radius': ['match', ['get', 'severity'], 'critical', 7.5, 'high', 6, 4.8],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#ef4444', 'high', '#eab308', '#fde047'],
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#090d16',
          'circle-opacity': 0.9,
        },
      });
    }
    if (map.getLayer('nuclear-circle')) {
      map.setLayoutProperty('nuclear-circle', 'visibility', state.activeLayers.nuclear ? 'visible' : 'none');
    }

    // 7. Geopolitics GDELT
    if (upsertPointSource('geopolitics-src', state.geopolitics)) {
      map.addLayer({
        id: 'geopolitics-circle',
        type: 'circle',
        source: 'geopolitics-src',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 1, 4.5, 30, 9.5],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#f97316', 'high', '#fb923c', '#fdba74'],
          'circle-opacity': 0.76,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#431407',
        },
      });
    }
    if (map.getLayer('geopolitics-circle')) {
      map.setLayoutProperty('geopolitics-circle', 'visibility', state.activeLayers.geopolitics ? 'visible' : 'none');
    }

    // 8. Natural Events
    if (upsertPointSource('natural-src', state.natural)) {
      map.addLayer({
        id: 'natural-circle',
        type: 'circle',
        source: 'natural-src',
        paint: {
          'circle-radius': ['match', ['get', 'severity'], 'critical', 8.5, 'high', 6.8, 5.2],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#ec4899', 'high', '#f59e0b', '#a855f7'],
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.88,
        },
      });
    }
    if (map.getLayer('natural-circle')) {
      map.setLayoutProperty('natural-circle', 'visibility', state.activeLayers.natural ? 'visible' : 'none');
    }

    // 9. Earthquakes
    if (upsertPointSource('earthquakes-src', state.earthquakes)) {
      map.addLayer({
        id: 'earthquakes-halo',
        type: 'circle',
        source: 'earthquakes-src',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2.5, 6, 5.0, 14, 7.0, 26],
          'circle-color': ['match', ['get', 'severity'], 'critical', '#f43f5e', 'high', '#fb7185', '#f97316'],
          'circle-opacity': 0.22,
        },
      });
      map.addLayer({
        id: 'earthquakes-circle',
        type: 'circle',
        source: 'earthquakes-src',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2.5, 3.5, 5.0, 7.5, 7.0, 13],
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

    // 10. Maritime AIS Live Vessels
    const initialVessels = state.deadReckoning
      ? advanceDeadReckoning(state.vessels, Date.now(), 30, state.vesselsAnchorMs)
      : state.vessels;
    if (upsertPointSource('vessels-src', initialVessels)) {
      map.addLayer({
        id: 'vessels-layer',
        type: 'symbol',
        source: 'vessels-src',
        layout: {
          'icon-image': [
            'match',
            ['get', 'category'],
            'naval_patrol',
            'ship-naval',
            'tanker',
            'ship-tanker',
            'cargo',
            'ship-cargo',
            'ship-default',
          ],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 1.5, 0.5, 5, 0.72, 9, 0.9],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
    if (map.getLayer('vessels-layer')) {
      map.setLayoutProperty('vessels-layer', 'visibility', state.activeLayers.vessels ? 'visible' : 'none');
    }

    // 11. Military Aircraft (Topmost directional tactical layer)
    const initialMilitary = state.deadReckoning
      ? advanceDeadReckoning(state.military, Date.now(), 22, state.militaryAnchorMs)
      : state.military;
    if (upsertPointSource('military-src', initialMilitary)) {
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
          'icon-size': ['interpolate', ['linear'], ['zoom'], 1.5, 0.55, 5, 0.78, 8, 0.95],
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_STYLE_URLS[basemap],
      center: [109.5, 14.8],
      zoom: 4.5,
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

  // Continuous Dead-Reckoning interpolation loop (smooth real-time gliding of aircraft & ships)
  useEffect(() => {
    if (!deadReckoning) return;
    const timer = setInterval(() => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const state = latestPropsRef.current;
      const now = Date.now();

      if (state.activeLayers.military && state.military.length > 0) {
        const milSrc = map.getSource('military-src') as GeoJSONSource | undefined;
        if (milSrc) {
          const advanced = advanceDeadReckoning(state.military, now, 22, state.militaryAnchorMs);
          milSrc.setData(pointsToFeatureCollection(advanced));
        }
      }

      if (state.activeLayers.vessels && state.vessels.length > 0) {
        const vslSrc = map.getSource('vessels-src') as GeoJSONSource | undefined;
        if (vslSrc) {
          const advancedVessels = advanceDeadReckoning(state.vessels, now, 30, state.vesselsAnchorMs);
          vslSrc.setData(pointsToFeatureCollection(advancedVessels));
        }
      }
    }, 1_000);

    return () => clearInterval(timer);
  }, [deadReckoning]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentBasemapRef.current === basemap) return;
    currentBasemapRef.current = basemap;
    appliedRadarPathRef.current = null;
    map.setStyle(CARTO_STYLE_URLS[basemap]);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      ensureLayersAndData(map);
    }
  }, [
    isGlobe,
    basemap,
    activeLayers,
    radarOpacity,
    weatherRadar,
    military,
    vessels,
    deadReckoning,
    earthquakes,
    natural,
    geopolitics,
    chokepoints,
    nuclear,
    financeCenters,
    cables,
    vietnamSovereignty,
    vietnamZones,
    vietnamSeaLabels,
  ]);

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
