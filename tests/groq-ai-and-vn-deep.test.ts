import { describe, expect, it } from 'vitest';
import { evaluateInvestmentCompass, evaluateMacroHealth } from '../shared/macro-health';
import { SnapshotStore } from '../server/cache/snapshot-store';
import {
  computeWorldGoldLuongMillionVnd,
  normalizeFredObservationSeries,
  normalizeMihongGoldPrices,
  normalizeVn30DchartQuote,
  normalizeYahooChartQuote,
} from '../server/collectors/markets-crypto';
import { parseNasaFirmsCsv } from '../server/collectors/natural-events';
import {
  normalizeAdsbGpsJammingZone,
  normalizeRipeBgpCountryAnomaly,
  normalizeVietnamEnvLocations,
} from '../server/collectors/vietnam-env-outages';
import {
  GROQ_MODEL_CHAIN,
  buildDeterministicSitrep,
  buildMonitorLiveContext,
  parseSitrepResponseText,
} from '../server/lib/groq-intel';

describe('Phase 12 — Groq LPU AI Intelligence & Deep Vietnam Markets / Env / GPS-BGP', () => {
  it('defines active Groq 2026 frontier models and parses AI Sitrep structured bullets cleanly', () => {
    expect(GROQ_MODEL_CHAIN).toContain('qwen/qwen3.8-27b');
    expect(GROQ_MODEL_CHAIN).toContain('openai/gpt-oss-120b');
    expect(GROQ_MODEL_CHAIN).not.toContain('llama-3.1-8b-instant');

    const sampleAiOutput = [
      'HEADLINE: Biển Đông duy trì giám sát cao, vàng SJC giữ mốc 133.5 triệu đồng/lượng.',
      '- [BIỂN ĐÔNG & AN NINH] Ghi nhận 18 tàu AIS quanh Hoàng Sa - Trường Sa, nhiễu GPS tăng 50% tại Baltic.',
      '- [THỊ TRƯỜNG & VÀNG SJC] Vàng SJC bán ra 133.50 tr/lượng, VN-Index quanh 1,265 điểm, USD/VND ở mức 25,450.',
      '- [CHÍNH SÁCH & BỘ KH&CN] Bộ KH&CN ban hành thông tư hướng dẫn triển khai Nghị quyết 57 về bán dẫn & AI.',
      '- [CYBER & KHÍ TƯỢNG] CISA cảnh báo 2 lỗ hổng Zero-Day KEV; gió giật cấp 6 tại vùng biển Trường Sa.',
    ].join('\n');

    const parsed = parseSitrepResponseText(sampleAiOutput);
    expect(parsed.headline).toContain('Biển Đông');
    expect(parsed.bullets.length).toBe(4);
    expect(parsed.bullets[0].tag).toBe('BIỂN ĐÔNG & AN NINH');
    expect(parsed.bullets[1].text).toContain('133.50');
  });

  it('builds grounded live context from SnapshotStore and produces deterministic Sitrep fallback without API keys', () => {
    const store = new SnapshotStore('/tmp/wm-test-phase12-nonexistent');
    const now = Date.now();
    store.set(
      'markets-crypto',
      {
        quotes: [
          {
            symbol: 'VN-Index',
            name: 'VN-Index',
            group: 'index',
            price: 1288.5,
            changePercent24h: 1.12,
            updatedAt: now,
            source: 'VNDirect',
          },
          {
            symbol: 'USD/VND',
            name: 'USD/VND',
            group: 'fx',
            price: 25480,
            changePercent24h: 0,
            updatedAt: now,
            source: 'ER-API',
          },
        ],
        crypto: [],
        fearGreed: { value: 64, classification: 'Greed', updatedAt: now },
        macro: [],
        vnGold: [
          {
            code: 'SJC',
            name: 'Vàng miếng SJC 999.9',
            buyPerLuongMillionVnd: 132.0,
            sellPerLuongMillionVnd: 133.5,
            spreadMillionVnd: 1.5,
            changeBuyPercent: 0,
            changeSellPercent: 0,
            updatedAt: now,
            source: 'Mi Hồng',
          },
        ],
        updatedAt: now,
      },
      300_000,
      1,
      now,
    );

    const ctx = buildMonitorLiveContext(store, now);
    expect(ctx).toContain('VN-Index: 1288.5');
    expect(ctx).toContain('USD/VND: 25480');
    expect(ctx).toContain('133.5');

    const fallback = buildDeterministicSitrep(store, now);
    expect(fallback.provider).toBe('deterministic');
    expect(fallback.bullets.length).toBe(4);
  });

  it('normalizes Vietnam domestic gold (SJC & 9999) in triệu VND/lượng + computes world gold parity spread', () => {
    const worldLuong = computeWorldGoldLuongMillionVnd(2650, 25450);
    // 2650 USD/oz * 1.20565 oz/lượng * 25,450 VND / 1e6 ≈ 81.31 tr/lượng
    expect(worldLuong).toBeGreaterThan(80);
    expect(worldLuong).toBeLessThan(83);

    const rawMihong = [
      {
        buyingPrice: 13200000,
        sellingPrice: 13350000,
        code: 'SJC',
        buyChangePercent: 0.4,
        sellChangePercent: 0.5,
        dateTime: '22/11/2026 06:55',
      },
      {
        buyingPrice: 13150000,
        sellingPrice: 13300000,
        code: '999',
        buyChangePercent: 0.2,
        sellChangePercent: 0.3,
        dateTime: '22/11/2026 06:55',
      },
      {
        buyingPrice: 11350000,
        sellingPrice: 11650000,
        code: '985',
        buyChangePercent: 0,
        sellChangePercent: 0,
        dateTime: '22/11/2026 06:55',
      },
    ];

    const normalized = normalizeMihongGoldPrices(rawMihong, 2650, 25450, 1700000000000);
    expect(normalized.length).toBe(3);
    expect(normalized[0].code).toBe('SJC');
    expect(normalized[0].buyPerLuongMillionVnd).toBe(132);
    expect(normalized[0].sellPerLuongMillionVnd).toBe(133.5);
    expect(normalized[0].spreadMillionVnd).toBe(1.5);
    expect(normalized[0].premiumVsWorldMillionVnd).toBeGreaterThan(45);
  });

  it('extracts 5d/7d sparklines for Yahoo Finance indices & VN30 bluechips via VNDirect DChart', () => {
    const yahooQuote = normalizeYahooChartQuote(
      'S&P 500',
      'S&P 500 Index',
      'index',
      {
        chart: {
          result: [
            {
              meta: { regularMarketPrice: 5980.5, previousClose: 5950.0 },
              indicators: { quote: [{ close: [5910, 5925, 5940, 5950, 5980.5] }] },
            },
          ],
        },
      },
      'pts',
    );
    expect(yahooQuote?.sparkline).toEqual([5910, 5925, 5940, 5950, 5980.5]);

    const fpt = normalizeVn30DchartQuote(
      { symbol: 'FPT', name: 'FPT Corp', sector: 'Công nghệ & AI' },
      {
        c: [49.55, 50.1, 49.4, 48.5, 46.95, 45.7, 45.0],
        v: [1000000, 1200000, 900000, 1100000, 1400000, 1500000, 15727808],
        s: 'ok',
      },
    );
    expect(fpt).not.toBeNull();
    expect(fpt?.symbol).toBe('FPT');
    expect(fpt?.priceThousandVnd).toBe(45);
    expect(fpt?.sparkline.length).toBe(7);
    expect(fpt?.changePercent).toBeLessThan(0);
  });

  it('normalizes Open-Meteo Vietnam AQI + Hoàng Sa / Trường Sa marine weather & gusts', () => {
    const locations = normalizeVietnamEnvLocations(
      [
        { current: { temperature_2m: 31.2, wind_speed_10m: 10, wind_gusts_10m: 18, weather_code: 3 } },
        { current: { temperature_2m: 26.4, wind_speed_10m: 12, wind_gusts_10m: 20, weather_code: 2 } },
        { current: { temperature_2m: 28.1, wind_speed_10m: 15, wind_gusts_10m: 24, weather_code: 1 } },
        { current: { temperature_2m: 27.8, wind_speed_10m: 44, wind_gusts_10m: 66, weather_code: 95 } },
        { current: { temperature_2m: 28.5, wind_speed_10m: 28, wind_gusts_10m: 42, weather_code: 80 } },
      ],
      [
        { current: { us_aqi: 78, pm2_5: 24.5 } },
        { current: { us_aqi: 138, pm2_5: 50.4 } },
        { current: { us_aqi: 42, pm2_5: 10.1 } },
      ],
    );

    expect(locations.length).toBe(5);
    expect(locations.map((l) => l.id)).toEqual([
      'vn-hcmc',
      'vn-hanoi',
      'vn-danang',
      'vn-hoang-sa',
      'vn-truong-sa',
    ]);
    const hanoi = locations.find((l) => l.id === 'vn-hanoi')!;
    expect(hanoi.usAqi).toBe(138);
    expect(hanoi.aqiBand).toBe('sensitive');

    const hoangSa = locations.find((l) => l.id === 'vn-hoang-sa')!;
    expect(hoangSa.region).toBe('maritime');
    expect(hoangSa.stormWarning).toBe(true);
    expect(hoangSa.beaufortScale).toBeGreaterThanOrEqual(6);
  });

  it('normalizes ADS-B low-NIC GPS jamming zones and RIPE BGP country routing anomalies', () => {
    const gpsFeature = normalizeAdsbGpsJammingZone(
      { id: 'ew-baltic', name: 'Baltic / Kaliningrad', lat: 54.7, lon: 20.5 },
      [
        { lat: 54.8, lon: 20.4, alt_baro: 34000, nic: 0 },
        { lat: 54.6, lon: 20.6, alt_baro: 36000, nic: 2 },
        { lat: 54.9, lon: 20.2, alt_baro: 32000, nic: 8 },
      ],
      1700000000000,
    );
    expect(gpsFeature).not.toBeNull();
    expect(gpsFeature?.layer).toBe('gpsOutages');
    expect(gpsFeature?.severity).toBe('critical');
    expect(gpsFeature?.meta.jammedRatioPct).toBe(67);

    const bgpFeature = normalizeRipeBgpCountryAnomaly(
      { code: 'MM', name: 'Myanmar', lat: 19.76, lon: 96.07 },
      {
        data: {
          stats: [
            { v4_prefixes_ris: 1200, v6_prefixes_ris: 220, asns_ris: 95, stats_date: '2026-11-15T00:00:00' },
            { v4_prefixes_ris: 920, v6_prefixes_ris: 180, asns_ris: 88, stats_date: '2026-11-22T00:00:00' },
          ],
        },
      },
      1700000000000,
    );
    expect(bgpFeature).not.toBeNull();
    expect(bgpFeature?.layer).toBe('gpsOutages');
    expect(bgpFeature?.category).toBe('bgp_outage');
    expect(bgpFeature?.severity).toBe('high');
  });

  it('normalizes FRED Federal Reserve series and 375m VIIRS NASA FIRMS CSV', () => {
    const fredMetric = normalizeFredObservationSeries(
      {
        id: 'T10Y2Y',
        label: '10Y–2Y Spread',
        subtitle: 'Độ dốc Đường cong Lợi suất Mỹ',
        unit: '%',
        pillar: 'monetary',
      },
      {
        observations: [
          { date: '2026-11-20', value: '.' },
          { date: '2026-11-19', value: '-0.18' },
          { date: '2026-11-18', value: '-0.12' },
          { date: '2026-11-17', value: '-0.05' },
          { date: '2026-11-16', value: '0.10' },
        ],
      },
    );
    expect(fredMetric).not.toBeNull();
    expect(fredMetric?.value).toBe(-0.18);
    expect(fredMetric?.avg3m).toBeCloseTo(-0.12, 1);
    expect(fredMetric?.trendSlope).toBeLessThan(0);
    expect(fredMetric?.alertBadge).toContain('ĐẢO NGƯỢC');
    expect(fredMetric?.sparkline).toEqual([0.1, -0.05, -0.12, -0.18]);

    const viirsCsv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '14.521,108.112,348.5,0.39,0.36,2026-11-22,0615,N20,VIIRS,h,2.0NRT,294.1,52.4,D',
      '11.220,106.510,332.1,0.42,0.38,2026-11-22,0618,N20,VIIRS,n,2.0NRT,288.2,29.8,D',
    ].join('\n');
    const viirsPoints = parseNasaFirmsCsv(viirsCsv, 1700000000000, 10, 'ĐNÁ / Biển Đông');
    expect(viirsPoints.length).toBe(2);
    expect(viirsPoints[0].meta.instrument).toBe('VIIRS');
    expect(viirsPoints[0].magnitude).toBe(52.4);
    expect(viirsPoints[0].severity).toBe('high');
  });

  it('evaluates Vietnam & US Macroeconomic Health Scores, Actual-vs-Forecast deltas, and Regime classifications', () => {
    const health = evaluateMacroHealth({
      quotes: [
        {
          symbol: 'USD/VND',
          name: 'Tỷ giá USD/VND',
          group: 'fx',
          price: 25480,
          changePercent24h: 0,
          updatedAt: 1700000000000,
          source: 'FX',
        },
      ],
      crypto: [],
      fearGreed: null,
      macro: [
        {
          countryCode: 'VNM',
          countryName: 'Việt Nam',
          regionLabel: 'ASEAN',
          isVietnam: true,
          gdpGrowthPct: 7.09,
          gdpPrevPct: 5.05,
          gdpGrowthYear: 2025,
          gdpCurrentUsd: 476_000_000_000,
          gdpCurrentYear: 2025,
          cpiInflationPct: 3.63,
          cpiPrevPct: 3.25,
          cpiYear: 2025,
          manufacturingGrowthPct: 9.97,
          exportsPctGdp: 87.2,
          fdiPctGdp: 4.27,
          unemploymentPct: 1.52,
        },
      ],
      fred: [
        {
          id: 'A191RL1Q225SBEA',
          label: 'US Real GDP',
          subtitle: 'Tăng trưởng GDP thực (Quý SAAR)',
          value: 3.4,
          change: 0.4,
          unit: '%',
          date: '2026-07-01',
          pillar: 'growth',
          benchmarkValue: 2.1,
          trendSlope: 0.5,
          sparkline: [2.8, 3.0, 3.4],
        },
        {
          id: 'INDPRO',
          label: 'Industrial Prod YoY',
          subtitle: 'Sản xuất Công nghiệp (YoY)',
          value: 2.15,
          change: 0.2,
          unit: '%',
          date: '2026-10-01',
          pillar: 'growth',
          benchmarkValue: 1.5,
          trendSlope: 0.4,
          sparkline: [1.8, 2.0, 2.15],
        },
        {
          id: 'CPIAUCSL',
          label: 'US CPI YoY',
          subtitle: 'Lạm phát Tiêu dùng CPI (YoY)',
          value: 3.72,
          change: 0.36,
          unit: '%',
          date: '2026-09-01',
          pillar: 'inflation',
          benchmarkValue: 2.0,
          trendSlope: 0.35,
          sparkline: [3.3, 3.35, 3.72],
        },
        {
          id: 'PPIFIS',
          label: 'US PPI YoY',
          subtitle: 'Chỉ số Giá Sản xuất PPI (YoY)',
          value: 6.52,
          change: 0.23,
          unit: '%',
          date: '2026-10-01',
          pillar: 'inflation',
          benchmarkValue: 2.5,
          trendSlope: 0.8,
          sparkline: [5.46, 6.29, 6.52],
        },
        {
          id: 'T10Y2Y',
          label: '10Y–2Y Spread',
          subtitle: 'Độ dốc Đường cong Lợi suất',
          value: -0.15,
          change: -0.05,
          unit: '%',
          date: '2026-11-20',
          pillar: 'monetary',
          benchmarkValue: 0.0,
          trendSlope: -0.2,
          sparkline: [0.05, -0.08, -0.15],
        },
      ],
      updatedAt: 1700000000000,
    });

    expect(health.vn).not.toBeNull();
    expect(health.vn?.regime).toBe('soft_landing');
    expect(health.vn?.compositeScore).toBeGreaterThan(75);
    expect(health.vn?.pillars).toHaveLength(3);

    expect(health.us).not.toBeNull();
    expect(health.us?.regime).toBe('overheating');
    expect(health.us?.warningFlags.some((f) => f.text.includes('10Y–2Y đảo ngược'))).toBe(true);
    expect(health.us?.warningFlags.some((f) => f.text.includes('PPI'))).toBe(true);

    const compass = evaluateInvestmentCompass({
      quotes: [
        { symbol: 'Copper', name: 'Dr. Copper', group: 'commodity', price: 5.48, changePercent24h: 1.4, updatedAt: 1700000000000, source: 'Yahoo' },
        { symbol: 'Gold', name: 'Gold', group: 'commodity', price: 3550, changePercent24h: 0.2, updatedAt: 1700000000000, source: 'Yahoo' },
        { symbol: 'SOX Semi', name: 'PHLX Semiconductor', group: 'index', price: 8408, changePercent24h: 1.8, updatedAt: 1700000000000, source: 'Yahoo' },
        { symbol: 'USD/VND', name: 'USD/VND', group: 'fx', price: 25780, changePercent24h: 0, updatedAt: 1700000000000, source: 'FX' },
      ],
      crypto: [],
      fearGreed: null,
      macro: [],
      vnGold: [
        {
          code: 'SJC',
          name: 'Vàng miếng SJC',
          buyPerLuongMillionVnd: 132,
          sellPerLuongMillionVnd: 133.5,
          spreadMillionVnd: 1.5,
          premiumVsWorldMillionVnd: 23.5,
          changeBuyPercent: 0,
          changeSellPercent: 0,
          updatedAt: 1700000000000,
          source: 'Mi Hồng',
        },
      ],
      fred: [
        { id: 'M2SL', label: 'M2', subtitle: 'M2 YoY', value: 5.71, change: 0.3, unit: '%', date: '2026-09-01', pillar: 'leading', sparkline: [5.1, 5.4, 5.71] },
        { id: 'NFCI', label: 'NFCI', subtitle: 'NFCI', value: -0.48, change: -0.02, unit: 'idx', date: '2026-11-13', pillar: 'leading', sparkline: [-0.4, -0.45, -0.48] },
        { id: 'BAMLH0A0HYM2', label: 'HY Spread', subtitle: 'HY Spread', value: 3.52, change: -0.04, unit: '%', date: '2026-11-19', pillar: 'leading', sparkline: [3.6, 3.56, 3.52] },
        { id: 'DFII10', label: '10Y Real', subtitle: '10Y Real', value: 2.88, change: 0.03, unit: '%', date: '2026-11-19', pillar: 'leading', sparkline: [2.8, 2.85, 2.88] },
        { id: 'SAHMREALTIME', label: 'Sahm', subtitle: 'Sahm', value: 0.0, change: 0, unit: 'pts', date: '2026-10-01', pillar: 'leading', sparkline: [0.0, 0.0] },
        { id: 'ICSA', label: 'Claims', subtitle: 'Claims', value: 203000, change: -2000, unit: 'đơn', date: '2026-11-14', pillar: 'leading', sparkline: [208000, 205000, 203000] },
        { id: 'PERMIT', label: 'Permits', subtitle: 'Permits', value: -8.67, change: -1.1, unit: '%', date: '2026-10-01', pillar: 'leading', sparkline: [-6.5, -7.5, -8.67] },
      ],
      updatedAt: 1700000000000,
    });

    expect(compass).not.toBeNull();
    expect(compass?.stance).toBe('selective_growth');
    expect(compass?.riskAppetiteScore).toBeGreaterThan(70);
    expect(compass?.signals.length).toBe(8);
    expect(compass?.favoredAssets.length).toBeGreaterThanOrEqual(2);
    expect(compass?.avoidAssets.some((a) => a.includes('SJC'))).toBe(true);
  });
});
