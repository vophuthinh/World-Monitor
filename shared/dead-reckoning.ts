import type { GeoPointFeature } from './types';

const KNOTS_TO_METERS_PER_SEC = 0.514444;
const METERS_PER_DEGREE_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Extrapolates live positions of moving aircraft or vessels along their true track/course
 * using spherical dead-reckoning, clamped to `maxDriftSec` so stale transponders never drift indefinitely.
 */
export function advanceDeadReckoning(
  features: readonly GeoPointFeature[],
  nowMs: number,
  maxDriftSec = 25,
): GeoPointFeature[] {
  return features.map((f) => {
    const onGround = Boolean(f.meta.onGround);
    const speedKt = typeof f.meta.speedKt === 'number' ? f.meta.speedKt : NaN;
    const headingDeg = f.layer === 'vessels'
      ? (typeof f.meta.courseDeg === 'number' ? f.meta.courseDeg : NaN)
      : Number(f.heading ?? 0);

    // Collectors default a missing heading to 0; do not extrapolate those towards north.
    if (f.meta.headingKnown === false) return f;

    if (onGround || !Number.isFinite(speedKt) || speedKt < 1.5 || !Number.isFinite(headingDeg)) {
      return f;
    }

    const baseTs = f.timestamp;
    if (!Number.isFinite(baseTs) || baseTs <= 0) {
      return f;
    }

    const elapsedSec = Math.max(0, Math.min(maxDriftSec, (nowMs - baseTs) / 1000));
    if (elapsedSec <= 0.05) {
      return f;
    }

    const distanceMeters = speedKt * KNOTS_TO_METERS_PER_SEC * elapsedSec;
    const headingRad = headingDeg * DEG_TO_RAD;
    const latRad = f.lat * DEG_TO_RAD;

    const dLat = (distanceMeters * Math.cos(headingRad)) / METERS_PER_DEGREE_LAT;
    const cosLat = Math.max(0.18, Math.cos(latRad));
    const dLon = (distanceMeters * Math.sin(headingRad)) / (METERS_PER_DEGREE_LAT * cosLat);

    const nextLat = Math.max(-85, Math.min(85, f.lat + dLat));
    let nextLon = f.lon + dLon;
    if (nextLon > 180) nextLon -= 360;
    if (nextLon < -180) nextLon += 360;

    return {
      ...f,
      lat: nextLat,
      lon: nextLon,
    };
  });
}
