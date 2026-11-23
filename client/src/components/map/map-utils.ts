import type {
  TropicalCyclone,
  TropicalCycloneCategory,
  BasemapTheme,
  GeoLineFeature,
  GeoPointFeature,
  VietnamArchipelagoZone,
  VietnamSeaLabel,
} from '@shared/types';
import type { CyberArcPacketPoint, CyberAttackArc } from '@shared/cyber-arcs';

export const CARTO_STYLE_URLS: Record<BasemapTheme, string> = {
  'dark-matter': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

export const JET_PALETTE: Record<string, string> = {
  'jet-bomber': '#f43f5e',
  'jet-vip': '#facc15',
  'jet-awacs': '#22d3ee',
  'jet-recon': '#fb923c',
  'jet-fighter': '#38bdf8',
  'jet-tanker': '#34d399',
  'jet-default': '#94a3b8',
};

export const VESSEL_PALETTE: Record<string, string> = {
  'ship-naval': '#f43f5e',
  'ship-tanker': '#f59e0b',
  'ship-cargo': '#34d399',
  'ship-default': '#38bdf8',
};

export function createJetSprite(fillColor: string): { width: number; height: number; data: Uint8Array } {
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

export function createVesselSprite(fillColor: string): { width: number; height: number; data: Uint8Array } {
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

export function createVietnamStarSprite(): { width: number; height: number; data: Uint8Array } {
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

export function pointsToFeatureCollection(points: GeoPointFeature[]): GeoJSON.FeatureCollection {
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

export function cablesToFeatureCollection(cables: GeoLineFeature[]): GeoJSON.FeatureCollection {
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

export function zonesToFeatureCollection(zones: VietnamArchipelagoZone[]): GeoJSON.FeatureCollection {
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

export function seaLabelsToFeatureCollection(labels: VietnamSeaLabel[]): GeoJSON.FeatureCollection {
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

export function cyberArcsToFeatureCollection(arcs: CyberAttackArc[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: arcs.map((arc) => ({
      type: 'Feature',
      geometry: {
        type: 'MultiLineString',
        coordinates: arc.coordinates,
      },
      properties: {
        arcId: arc.id,
        title: `${arc.attackerLabel} → ${arc.targetLabel}`,
        severity: arc.severity,
        isApt: arc.isApt ? 1 : 0,
      },
    })),
  };
}

export function cyberPacketsToFeatureCollection(packets: CyberArcPacketPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: packets.map((pkt) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [pkt.lon, pkt.lat],
      },
      properties: {
        pktId: pkt.id,
        title: pkt.label,
        isApt: pkt.isApt ? 1 : 0,
      },
    })),
  };
}

export const CYCLONE_TRACK_COLORS: Record<TropicalCycloneCategory, string> = {
  TD: '#38bdf8',
  TS: '#facc15',
  HU: '#ef4444',
  other: '#94a3b8',
};

export const CYCLONE_ALERT_COLORS: Record<TropicalCyclone['alertLevel'], string> = {
  Green: '#22c55e',
  Orange: '#f59e0b',
  Red: '#ef4444',
};

/** Tracks (coloured by intensity), forecast cones and the current position of each active cyclone. */
export function cyclonesToFeatureCollections(cyclones: readonly TropicalCyclone[]): {
  tracks: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  cones: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  positions: GeoJSON.FeatureCollection<GeoJSON.Point>;
} {
  const tracks: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  const cones: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const positions: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const tc of cyclones) {
    for (const seg of tc.track) {
      tracks.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: seg.coordinates },
        properties: { cycloneId: tc.id, category: seg.category, color: CYCLONE_TRACK_COLORS[seg.category] },
      });
    }
    if (tc.cone) {
      cones.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: tc.cone },
        properties: { cycloneId: tc.id, color: CYCLONE_ALERT_COLORS[tc.alertLevel] },
      });
    }
    positions.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [tc.lon, tc.lat] },
      properties: {
        id: tc.id,
        name: tc.name,
        alert: tc.alertLevel,
        color: CYCLONE_ALERT_COLORS[tc.alertLevel],
        windKmh: tc.windKmh,
        label: tc.windKmh !== null ? `${tc.name} · ${Math.round(tc.windKmh)} km/h` : tc.name,
      },
    });
  }
  return {
    tracks: { type: 'FeatureCollection', features: tracks },
    cones: { type: 'FeatureCollection', features: cones },
    positions: { type: 'FeatureCollection', features: positions },
  };
}
