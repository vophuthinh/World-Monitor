import { describe, expect, it } from 'vitest';
import {
  CHOKEPOINT_FEATURES,
  FINANCE_CENTER_FEATURES,
  NUCLEAR_SITE_FEATURES,
  SUBMARINE_CABLE_FEATURES,
  THEATER_PRESETS,
  VIETNAM_ARCHIPELAGO_ZONES,
  VIETNAM_SEA_LABELS,
  VIETNAM_SOVEREIGNTY_FEATURES,
  buildStaticGeoBundle,
} from '../shared/registries/index';

describe('Strategic Static Geo Registries', () => {
  it('includes all 13 canonical maritime chokepoints with valid coordinates', () => {
    expect(CHOKEPOINT_FEATURES).toHaveLength(13);
    const ids = new Set(CHOKEPOINT_FEATURES.map((f) => f.id));
    for (const expectedId of [
      'chokepoint:suez',
      'chokepoint:malacca_strait',
      'chokepoint:hormuz_strait',
      'chokepoint:bab_el_mandeb',
      'chokepoint:panama',
      'chokepoint:taiwan_strait',
      'chokepoint:cape_of_good_hope',
      'chokepoint:gibraltar',
      'chokepoint:bosphorus',
      'chokepoint:korea_strait',
      'chokepoint:dover_strait',
      'chokepoint:kerch_strait',
      'chokepoint:lombok_strait',
    ]) {
      expect(ids.has(expectedId)).toBe(true);
    }

    for (const feature of CHOKEPOINT_FEATURES) {
      expect(feature.layer).toBe('chokepoints');
      expect(feature.lat).toBeGreaterThanOrEqual(-90);
      expect(feature.lat).toBeLessThanOrEqual(90);
      expect(feature.lon).toBeGreaterThanOrEqual(-180);
      expect(feature.lon).toBeLessThanOrEqual(180);
    }
  });

  it('includes Vietnam & East Sea theater preset with exact spec coordinates', () => {
    const vnPreset = THEATER_PRESETS.find((p) => p.id === 'east-sea-vn');
    expect(vnPreset).toBeDefined();
    expect(vnPreset?.lat).toBeCloseTo(14.5, 2);
    expect(vnPreset?.lon).toBeCloseTo(111.0, 2);
    expect(vnPreset?.zoom).toBeCloseTo(4.8, 2);
    expect(THEATER_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it('includes HOSE, HNX, and State Bank of Vietnam (SBV) in finance centers', () => {
    const ids = new Set(FINANCE_CENTER_FEATURES.map((f) => f.id));
    expect(ids.has('finance:hose')).toBe(true);
    expect(ids.has('finance:hnx')).toBe(true);
    expect(ids.has('finance:sbv')).toBe(true);
    expect(ids.has('finance:nyse')).toBe(true);
    expect(ids.has('finance:fed')).toBe(true);
    expect(ids.has('finance:sgx')).toBe(true);
  });

  it('includes major nuclear sites and antimeridian-safe submarine cables with Vietnam landings', () => {
    expect(NUCLEAR_SITE_FEATURES.length).toBeGreaterThanOrEqual(30);
    const nuclearIds = new Set(NUCLEAR_SITE_FEATURES.map((f) => f.id));
    expect(nuclearIds.has('nuclear:zaporizhzhia')).toBe(true);
    expect(nuclearIds.has('nuclear:natanz')).toBe(true);
    expect(nuclearIds.has('nuclear:yongbyon')).toBe(true);

    expect(SUBMARINE_CABLE_FEATURES.length).toBeGreaterThanOrEqual(10);
    const vnCables = SUBMARINE_CABLE_FEATURES.filter((c) => c.vietnamConnected);
    expect(vnCables.length).toBeGreaterThanOrEqual(3);

    for (const cable of SUBMARINE_CABLE_FEATURES) {
      expect(cable.coordinates.length).toBeGreaterThanOrEqual(1);
      for (const segment of cable.coordinates) {
        expect(segment.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < segment.length; i++) {
          const prevLon = segment[i - 1][0];
          const currLon = segment[i][0];
          // Ensure no antimeridian tear (>180 deg jump within a single LineString segment)
          expect(Math.abs(currLon - prevLon)).toBeLessThan(170);
        }
      }
    }
  });

  it('builds complete StaticGeoBundle including Hoàng Sa, Trường Sa, and Biển Đông sovereignty data', () => {
    const bundle = buildStaticGeoBundle();
    expect(bundle.chokepoints.length).toBe(13);
    expect(bundle.financeCenters.length).toBeGreaterThanOrEqual(25);
    expect(bundle.nuclear.length).toBeGreaterThanOrEqual(30);
    expect(bundle.cables.length).toBeGreaterThanOrEqual(10);

    expect(VIETNAM_ARCHIPELAGO_ZONES).toHaveLength(2);
    const zoneIds = VIETNAM_ARCHIPELAGO_ZONES.map((z) => z.id);
    expect(zoneIds).toContain('vn-zone:hoang-sa');
    expect(zoneIds).toContain('vn-zone:truong-sa');

    const islandIds = new Set(VIETNAM_SOVEREIGNTY_FEATURES.map((f) => f.id));
    expect(islandIds.has('vn-island:hoang-sa-archipelago')).toBe(true);
    expect(islandIds.has('vn-island:truong-sa-archipelago')).toBe(true);
    expect(islandIds.has('vn-island:truong-sa-lon')).toBe(true);
    expect(islandIds.has('vn-island:song-tu-tay')).toBe(true);
    expect(islandIds.has('vn-island:sinh-ton')).toBe(true);
    expect(islandIds.has('vn-island:phu-lam')).toBe(true);
    expect(islandIds.has('vn-island:dk1')).toBe(true);

    expect(VIETNAM_SEA_LABELS.some((l) => l.name === 'BIỂN ĐÔNG')).toBe(true);
    expect(bundle.vietnamSovereignty.length).toBeGreaterThanOrEqual(15);
  });
});
