import { describe, expect, it } from 'vitest';
import {
  classifyMilitaryAircraft,
  identifyCommercialCallsign,
  isKnownMilitaryHex,
  normalizeMilitaryFlights,
} from '../server/collectors/military-flights';

describe('Military ADS-B 3-Layer Classifier & Normalizer', () => {
  it('identifies known USAF, RAF, NATO, and exact PLAAF military hex codes', () => {
    expect(isKnownMilitaryHex('AE5420')?.operator).toBe('usaf');
    expect(isKnownMilitaryHex('AE5420')?.country).toBe('USA');
    expect(isKnownMilitaryHex('43C1A2')?.operator).toBe('raf');
    expect(isKnownMilitaryHex('4D0110')?.operator).toBe('nato');
    // Exact PLA military aircraft without making civil 780000-7BFFFF a military range
    expect(isKnownMilitaryHex('7A4262')?.operator).toBe('plaaf');
    expect(isKnownMilitaryHex('7A4262')?.country).toBe('China');
    expect(isKnownMilitaryHex('781234')).toBeNull();
  });

  it('detects commercial airline callsigns on the blocklist', () => {
    expect(identifyCommercialCallsign('QTR123')).toBe(true);
    expect(identifyCommercialCallsign('UAE45')).toBe(true);
    expect(identifyCommercialCallsign('CCA981')).toBe(true);
    expect(identifyCommercialCallsign('THY19')).toBe(true);
    expect(identifyCommercialCallsign('ELAL315')).toBe(true);
    expect(identifyCommercialCallsign('FORTE12')).toBe(false);
    expect(identifyCommercialCallsign('RCH412')).toBe(false);
  });

  it('classifies tactical roles (drone, bomber, awacs, recon, vip, tanker, fighter, transport)', () => {
    const drone = classifyMilitaryAircraft({
      hex: 'AE5420',
      flight: 'FORTE12 ',
      lat: 43.2,
      lon: 31.5,
      alt_baro: 54000,
      gs: 320,
      track: 115,
      t: 'RQ4',
      desc: 'Northrop Grumman RQ-4B Global Hawk',
    });
    expect(drone?.category).toBe('drone');
    expect(drone?.severity).toBe('high');
    expect(drone?.meta.country).toBe('USA');

    const bomber = classifyMilitaryAircraft({
      hex: 'AE0123',
      flight: 'BONE21',
      lat: 13.5,
      lon: 144.8,
      alt_baro: 31000,
      gs: 470,
      track: 280,
      t: 'B1',
    });
    expect(bomber?.category).toBe('bomber');
    expect(bomber?.severity).toBe('high');

    const awacs = classifyMilitaryAircraft({
      hex: '4D0201',
      flight: 'NATO01',
      lat: 51.2,
      lon: 22.1,
      alt_baro: 30000,
      gs: 390,
      track: 90,
      t: 'E3TF',
    });
    expect(awacs?.category).toBe('awacs');
    expect(awacs?.severity).toBe('high');

    const recon = classifyMilitaryAircraft({
      hex: 'AE01CE',
      flight: 'RIVET14',
      lat: 16.5,
      lon: 114.2,
      alt_baro: 34000,
      gs: 430,
      track: 45,
      t: 'R135',
    });
    expect(recon?.category).toBe('recon');

    const vip = classifyMilitaryAircraft({
      hex: 'ADF801',
      flight: 'SAM45',
      lat: 38.8,
      lon: -76.9,
      alt_baro: 37000,
      gs: 480,
      track: 62,
      t: 'C32',
    });
    expect(vip?.category).toBe('vip');
    expect(vip?.severity).toBe('high');

    const tanker = classifyMilitaryAircraft({
      hex: 'AE0410',
      flight: 'SHELL81',
      lat: 25.1,
      lon: 51.3,
      alt_baro: 26000,
      gs: 410,
      track: 310,
      t: 'K35R',
    });
    expect(tanker?.category).toBe('tanker');
  });

  it('normalizes adsb.lol payload, filters commercial false-positives and invalid coordinates, and deduplicates hex', () => {
    const now = 1_700_000_000_000;
    const features = normalizeMilitaryFlights(
      {
        now: 1_700_000_000,
        ac: [
          // Valid USAF C-17 transport
          { hex: 'ae1234', flight: 'RCH412 ', lat: 15.2, lon: 112.4, alt_baro: 33000, gs: 445, track: 215, t: 'C17', r: '04-4132' },
          // Duplicate hex should be ignored
          { hex: 'AE1234', flight: 'RCH412 ', lat: 15.2, lon: 112.4, alt_baro: 33000 },
          // Commercial Qatar Airways callsign on non-trusted hex -> filtered out
          { hex: '06A111', flight: 'QTR123', lat: 25.2, lon: 51.5, alt_baro: 35000, gs: 480, track: 300 },
          // Commercial Air China callsign -> filtered out
          { hex: '780999', flight: 'CCA981', lat: 39.9, lon: 116.4, alt_baro: 36000 },
          // Missing coordinates -> filtered out
          { hex: 'AE9999', flight: 'VIPER01', alt_baro: 20000 },
          // Exact PLA Y-8G reconnaissance in East Sea / Taiwan area
          { hex: '7A4262', flight: '', lat: 21.3, lon: 118.4, alt_baro: 22000, gs: 290, track: 195 },
        ],
      },
      now,
    );

    expect(features).toHaveLength(2);
    expect(features[0].id).toBe('mil:AE1234');
    expect(features[0].category).toBe('transport');
    expect(features[0].heading).toBe(215);
    expect(features[0].meta.altitudeFt).toBe(33000);
    expect(features[1].id).toBe('mil:7A4262');
    expect(features[1].category).toBe('recon');
    expect(features[1].meta.country).toBe('China');
  });
});
