import type { GeoPointFeature } from './types';

export function filterFreshVessels(vessels: readonly GeoPointFeature[], now: number): GeoPointFeature[] {
  return vessels.filter((v) =>
    Number.isFinite(v.timestamp) && v.timestamp > 0 && v.timestamp <= now && now - v.timestamp <= 30 * 60_000,
  );
}

export function resolveFreshVessels(
  cached: readonly GeoPointFeature[],
  now: number,
  live?: readonly GeoPointFeature[],
): GeoPointFeature[] {
  return filterFreshVessels(live && live.length > 0 ? live : cached, now);
}
