import type { GeoPointFeature, SeverityLevel } from './types';

export interface CyberAttackArc {
  id: string;
  attackerLabel: string;
  targetLabel: string;
  severity: SeverityLevel;
  isApt: boolean;
  /** Antimeridian-safe curved polyline segments: [lon, lat][][] */
  coordinates: [number, number][][];
  /** Flattened unwrapped points along the trajectory for smooth packet animation */
  pathPoints: [number, number][];
}

export interface CyberArcPacketPoint {
  id: string;
  lon: number;
  lat: number;
  severity: SeverityLevel;
  isApt: boolean;
  label: string;
}

interface CyberTargetHub {
  name: string;
  lat: number;
  lon: number;
}

const TARGET_HUBS: readonly CyberTargetHub[] = [
  { name: 'Hà Nội · Hạ tầng Số VN', lat: 21.0285, lon: 105.8542 },
  { name: 'TP.HCM · Tài chính & Viễn thông', lat: 10.7769, lon: 106.7009 },
  { name: 'Singapore · ASEAN Cloud IX', lat: 1.3521, lon: 103.8198 },
  { name: 'Đài Bắc · TSMC Semiconductor', lat: 25.033, lon: 121.5654 },
  { name: 'Tokyo · JPNAP IX', lat: 35.6762, lon: 139.6503 },
  { name: 'Frankfurt · DE-CIX', lat: 50.1109, lon: 8.6821 },
  { name: 'Kyiv · Power & Gov Grid', lat: 50.4501, lon: 30.5234 },
  { name: 'Ashburn · US-East Cloud', lat: 39.0438, lon: -77.4874 },
  { name: 'New York · SWIFT / Wall St', lat: 40.7128, lon: -74.006 },
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function selectTargetForThreat(threat: GeoPointFeature, index: number): CyberTargetHub {
  const text = `${threat.id} ${threat.title} ${threat.subtitle ?? ''} ${String(threat.meta.targets ?? '')}`.toLowerCase();

  if (text.includes('mustang-panda') || text.includes('asean') || text.includes('biển đông')) {
    return index % 2 === 0 ? TARGET_HUBS[0] : TARGET_HUBS[1];
  }
  if (text.includes('apt41') || text.includes('semiconductor')) {
    return TARGET_HUBS[3]; // Taipei Fab
  }
  if (text.includes('volt-typhoon')) {
    return TARGET_HUBS[7]; // Ashburn US Infra
  }
  if (text.includes('lazarus') || text.includes('swift') || text.includes('crypto')) {
    return TARGET_HUBS[8]; // New York Financial
  }
  if (text.includes('sandworm') || text.includes('apt28')) {
    return index % 2 === 0 ? TARGET_HUBS[6] : TARGET_HUBS[5]; // Kyiv / Frankfurt
  }
  if (text.includes('kimsuky')) {
    return TARGET_HUBS[4]; // Tokyo
  }

  const pickIdx = hashString(threat.id) % TARGET_HUBS.length;
  const candidate = TARGET_HUBS[pickIdx];
  // Avoid zero-length self-arcs if attacker is right on top of the selected hub
  if (Math.hypot(candidate.lat - threat.lat, candidate.lon - threat.lon) < 4.5) {
    return TARGET_HUBS[(pickIdx + 3) % TARGET_HUBS.length];
  }
  return candidate;
}

function wrapLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/**
 * Builds an antimeridian-safe curved trajectory between (lon1, lat1) and (lon2, lat2)
 * using shortest-longitude path + quadratic arch lift so attack trajectories look crisp
 * in both 2D Mercator and 3D Globe projections without ±180° wrap artifacts.
 */
function buildCurvedSegments(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  steps = 28,
): { segments: [number, number][][]; pathPoints: [number, number][] } {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;

  const dLat = lat2 - lat1;
  const dist = Math.hypot(dLon, dLat);
  const archSign = lat1 + lat2 >= 0 ? 1 : -1;
  const archLift = Math.min(16, dist * 0.14) * archSign;

  const unwrapped: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const uLon = lon1 + dLon * t;
    const bell = 4 * t * (1 - t);
    const uLat = Math.max(-82, Math.min(82, lat1 + dLat * t + archLift * bell));
    unwrapped.push([uLon, uLat]);
  }

  const segments: [number, number][][] = [];
  let currentSeg: [number, number][] = [];

  for (let i = 0; i < unwrapped.length; i++) {
    const [uLon, uLat] = unwrapped[i];
    const wLon = wrapLon(uLon);

    if (currentSeg.length > 0) {
      const [prevWLon, prevLat] = currentSeg[currentSeg.length - 1];
      if (Math.abs(wLon - prevWLon) > 180) {
        // Crossed antimeridian: split cleanly at ±180° boundary
        const borderLon = prevWLon > 0 ? 180 : -180;
        const oppositeLon = -borderLon;
        const span = 360 - Math.abs(wLon - prevWLon);
        const frac = span > 0 ? (180 - Math.abs(prevWLon)) / span : 0.5;
        const borderLat = prevLat + (uLat - prevLat) * frac;
        currentSeg.push([borderLon, borderLat]);
        segments.push(currentSeg);
        currentSeg = [[oppositeLon, borderLat]];
      }
    }
    currentSeg.push([wLon, uLat]);
  }

  if (currentSeg.length >= 2) {
    segments.push(currentSeg);
  }

  const pathPoints: [number, number][] = unwrapped.map(([uLon, uLat]) => [wrapLon(uLon), uLat]);
  return { segments, pathPoints };
}

export function buildCyberAttackArcs(
  cyberThreats: readonly GeoPointFeature[],
  maxArcs = 34,
): CyberAttackArc[] {
  if (!cyberThreats || cyberThreats.length === 0) return [];

  // Include all APT groups + top critical/high live C2 / FireHOL / SSH attackers
  const apts = cyberThreats.filter((c) => c.category === 'apt_group');
  const iocs = cyberThreats
    .filter((c) => c.category !== 'apt_group')
    .slice(0, Math.max(0, maxArcs - apts.length));

  const selected = [...apts, ...iocs].slice(0, maxArcs);
  const arcs: CyberAttackArc[] = [];

  selected.forEach((threat, idx) => {
    const target = selectTargetForThreat(threat, idx);
    const { segments, pathPoints } = buildCurvedSegments(
      threat.lon,
      threat.lat,
      target.lon,
      target.lat,
    );
    if (segments.length === 0) return;

    const shortAttacker = String(threat.meta.shortName ?? threat.title).slice(0, 32);
    arcs.push({
      id: `arc:${threat.id}`,
      attackerLabel: shortAttacker,
      targetLabel: target.name,
      severity: threat.severity,
      isApt: threat.category === 'apt_group',
      coordinates: segments,
      pathPoints,
    });
  });

  return arcs;
}

export function advanceCyberArcPackets(
  arcs: readonly CyberAttackArc[],
  nowMs = Date.now(),
): CyberArcPacketPoint[] {
  const cycleMs = 9_000;
  return arcs.map((arc, idx) => {
    const phaseOffset = ((idx * 1_373) % cycleMs) / cycleMs;
    const progress = ((nowMs % cycleMs) / cycleMs + phaseOffset) % 1;
    const ptIdx = Math.min(
      arc.pathPoints.length - 1,
      Math.max(0, Math.floor(progress * arc.pathPoints.length)),
    );
    const [lon, lat] = arc.pathPoints[ptIdx] ?? [0, 0];
    return {
      id: `pkt:${arc.id}`,
      lon,
      lat,
      severity: arc.severity,
      isApt: arc.isApt,
      label: `${arc.attackerLabel} → ${arc.targetLabel}`,
    };
  });
}
