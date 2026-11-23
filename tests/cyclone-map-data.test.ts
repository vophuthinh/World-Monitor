import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CYCLONE_ALERT_COLORS,
  CYCLONE_TRACK_COLORS,
  cyclonesToFeatureCollections,
} from '../client/src/components/map/map-utils';
import { normalizeGdacsTropicalCyclone } from '../server/collectors/tropical-cyclones';

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'));
const list = fx('gdacs-tc-list.json');
const feature = (name: string) => list.features.find((f: { properties: { name: string } }) => f.properties.name.includes(name));
const akvan = normalizeGdacsTropicalCyclone(feature('AKVAN'), fx('gdacs-tc-geometry-akvan.json'))!;
const champi = normalizeGdacsTropicalCyclone(feature('CHAMPI'), fx('gdacs-tc-geometry-champi.json'))!;

describe('cyclonesToFeatureCollections', () => {
  it('builds one position point per cyclone with a readable label and an alert colour', () => {
    const { positions } = cyclonesToFeatureCollections([akvan, champi]);
    expect(positions.features).toHaveLength(2);
    const p = positions.features[0];
    expect(p.geometry).toEqual({ type: 'Point', coordinates: [akvan.lon, akvan.lat] });
    expect(p.properties).toMatchObject({ id: 'tc:1001351', name: 'AKVAN-26', alert: 'Green', color: CYCLONE_ALERT_COLORS.Green });
    expect(String(p.properties!.label)).toContain('AKVAN-26');
    expect(String(p.properties!.label)).toContain('83');
    expect(positions.features[1].properties!.color).toBe(CYCLONE_ALERT_COLORS.Red);
  });

  it('turns every track segment into a coloured LineString by intensity category', () => {
    const { tracks } = cyclonesToFeatureCollections([champi]);
    expect(tracks.features).toHaveLength(champi.track.length);
    const colours = new Set(tracks.features.map((f) => f.properties!.color));
    expect(colours.has(CYCLONE_TRACK_COLORS.HU)).toBe(true);
    for (const f of tracks.features) {
      expect(f.geometry.type).toBe('LineString');
      expect(f.properties!.cycloneId).toBe('tc:1001338');
    }
  });

  it('emits the forecast cone as polygons and omits cyclones that have none', () => {
    const noCone = { ...akvan, id: 'tc:1', cone: null, track: [] };
    const { cones, tracks } = cyclonesToFeatureCollections([akvan, noCone]);
    expect(cones.features).toHaveLength(1);
    expect(cones.features[0].geometry.type).toBe('Polygon');
    expect(tracks.features.every((f) => f.properties!.cycloneId === 'tc:1001351')).toBe(true);
  });

  it('returns empty collections for no cyclones', () => {
    const r = cyclonesToFeatureCollections([]);
    expect(r.tracks.features).toEqual([]);
    expect(r.cones.features).toEqual([]);
    expect(r.positions.features).toEqual([]);
  });
});
