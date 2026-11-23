import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMarketCatalystCalendar,
  evaluateChokepointMarketImpacts,
  getNthWeekdayOfMonthUtc,
} from '../shared/catalysts-and-chokepoints';
import {
  buildSectorRotation,
  classifyMacroQuadrant,
  computeDynamicPortfolioAllocation,
  computeFedNetLiquidity,
  computeNyFedBondEquivalentSpread,
  computeNyFedRecessionProb12m,
  computeVietnamEquityRiskPremium,
  computeVn30MarketBreadth,
  evaluateInvestmentCompass,
  evaluateMacroHealth,
  extractPolymarketMacroInsight,
  resolveNyFedSpreadAndProb,
  smoothFactorScore,
} from '../shared/macro-health';

import { SnapshotStore } from '../server/cache/snapshot-store';
import {
  computeTechnicalIndicators,
  computeWorldGoldLuongMillionVnd,
  normalizeFredObservationSeries,
  normalizeMihongGoldPrices,
  normalizeVn30DchartQuote,
  normalizeYahooChartQuote,
  parseMultplSp500PeHtml,
  parseSimplizeIndexValuationHtml,
  parseTradingEconomicsVietnamHtml,
  parseVietnamOfficialYtdContext,
} from '../server/collectors/markets-crypto';
import {
  normalizeNwsWeatherAlerts,
  parseNasaFirmsCsv,
  parseNoaaNhcCycloneRss,
} from '../server/collectors/natural-events';
import {
  normalizeAdsbGpsJammingZone,
  normalizeRipeBgpCountryAnomaly,
  normalizeVietnamEnvLocations,
  parseNchmfWeatherRss,
} from '../server/collectors/vietnam-env-outages';
import {
  GROQ_MODEL_CHAIN,
  buildDeterministicSitrep,
  buildMonitorLiveContext,
  parseSitrepResponseText,
} from '../server/lib/groq-intel';
import { RegimeHistoryLedger } from '../server/lib/regime-ledger';

it('treats a flat price history as neutral and keeps zero or negative real yields in ERP', () => {
  expect(computeTechnicalIndicators(Array(60).fill(100)).rsi14).toBe(50);
  expect(computeTechnicalIndicators(Array.from({ length: 60 }, (_, i) => 100 + i)).rsi14).toBe(100);
  expect(computeVietnamEquityRiskPremium(20, 0)?.erpPct).toBe(5);
  expect(computeVietnamEquityRiskPremium(20, -0.5)?.erpPct).toBe(5.5);
  expect(computeVietnamEquityRiskPremium(20, NaN)).toBeNull();
});

it('does not fabricate missing ERP or four-week net liquidity change in AI context', () => {
  const now = Date.now();
  const metric = (id: string, value: number) => ({
    id, label: id, subtitle: id, value, change: 0, unit: 'B', date: '2026-11-20', sparkline: [],
  });
  const store = new SnapshotStore('/tmp/wm-ai-context-unused');
  store.set('markets-crypto', {
    quotes: [{ symbol: 'VN-Index', name: 'VN', group: 'index', price: 1200, changePercent24h: 0, peRatio: 15, updatedAt: now, source: 'test' }],
    crypto: [], fearGreed: null, macro: [], updatedAt: now,
    fred: [metric('WALCL', 7_000_000), metric('WTREGEN', 500_000), metric('RRPONTSYD', 100)],
  }, 3_600_000, 1, now);
  const context = buildMonitorLiveContext(store, now);
  expect(context).toContain('ERP không rõ');
  expect(context).toContain('biến động 4T không rõ');
  expect(context).not.toContain('ERP 0%');
  expect(context).not.toContain('0B$ 4T');
});

it('marks missing VN-Index and VN30 changes as unknown in AI context', () => {
  const now = Date.now();
  const store = new SnapshotStore('/tmp/wm-ai-context-unused');
  store.set('markets-crypto', {
    quotes: [{ symbol: 'VN-Index', name: 'VN', group: 'index', price: 1200, changePercent24h: null, updatedAt: now, source: 'test' }],
    vn30: [{ symbol: 'VCB', name: 'VCB', sector: 'bank', priceThousandVnd: 80, changePercent: null, volume: null, sparkline: [80], updatedAt: now }],
    crypto: [], fearGreed: null, macro: [], updatedAt: now,
  }, 3_600_000, 1, now);
  const context = buildMonitorLiveContext(store, now);
  expect(context).toContain('VN-Index: 1200 (biến động không rõ)');
  expect(context).toContain('VCB 80.00k (biến động không rõ)');
});

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
    expect(ctx).toContain('dữ liệu cũ hoặc chưa rõ');

    const fallback = buildDeterministicSitrep(store, now);
    expect(fallback.provider).toBe('deterministic');
    expect(fallback.bullets.length).toBe(4);
    expect(fallback.bullets.find((bullet) => bullet.tag.includes('VÀNG'))?.text).toContain('dữ liệu cũ hoặc chưa rõ');
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

  it('normalizes Open-Meteo Vietnam AQI, UV, Rain Prob, Hoàng Sa / Trường Sa wave heights & NCHMF / NWS / NHC alerts', () => {
    const locations = normalizeVietnamEnvLocations(
      [
        {
          current: { temperature_2m: 31.2, relative_humidity_2m: 62, uv_index: 7.4, wind_speed_10m: 10, wind_direction_10m: 180, wind_gusts_10m: 18, weather_code: 3 },
          daily: { precipitation_probability_max: [45], temperature_2m_min: [26], temperature_2m_max: [33] },
        },
        { current: { temperature_2m: 26.4, wind_speed_10m: 12, wind_gusts_10m: 20, weather_code: 2 } },
        { current: { temperature_2m: 28.1, wind_speed_10m: 15, wind_gusts_10m: 24, weather_code: 1 } },
        { current: { temperature_2m: 25.0, wind_speed_10m: 18, wind_gusts_10m: 28, weather_code: 2 } },
        { current: { temperature_2m: 27.8, wind_speed_10m: 44, wind_direction_10m: 45, wind_gusts_10m: 66, weather_code: 95 } },
        { current: { temperature_2m: 28.5, wind_speed_10m: 28, wind_gusts_10m: 42, weather_code: 80 } },
      ],
      [
        { current: { us_aqi: 78, pm2_5: 24.5 } },
        { current: { us_aqi: 138, pm2_5: 50.4 } },
        { current: { us_aqi: 42, pm2_5: 10.1 } },
        { current: { us_aqi: 65, pm2_5: 18.2 } },
      ],
      [
        { current: { wave_height: 2.85, wave_period: 7.2 } },
        { current: { wave_height: 1.65, wave_period: 6.1 } },
      ],
    );

    expect(locations.length).toBe(6);
    expect(locations.map((l) => l.id)).toEqual([
      'vn-hcmc',
      'vn-hanoi',
      'vn-danang',
      'vn-haiphong',
      'vn-hoang-sa',
      'vn-truong-sa',
    ]);
    const hcmc = locations.find((l) => l.id === 'vn-hcmc')!;
    expect(hcmc.uvIndex).toBe(7.4);
    expect(hcmc.rainProbPct).toBe(45);

    const hanoi = locations.find((l) => l.id === 'vn-hanoi')!;
    expect(hanoi.usAqi).toBe(138);
    expect(hanoi.aqiBand).toBe('sensitive');

    const hoangSa = locations.find((l) => l.id === 'vn-hoang-sa')!;
    expect(hoangSa.region).toBe('maritime');
    expect(hoangSa.stormWarning).toBe(true);
    expect(hoangSa.waveHeightM).toBe(2.85);
    expect(hoangSa.windDirLabel).toBe('ĐB');
    expect(hoangSa.beaufortScale).toBeGreaterThanOrEqual(6);

    const nchmf = parseNchmfWeatherRss(`
      <rss><channel>
        <item>
          <title>Cảnh báo áp thấp nhiệt đới mạnh lên thành bão trên Biển Đông - Báo Chính phủ</title>
          <link>https://baochinhphu.vn/canh-bao-bao-1</link>
          <pubDate>Sun, 22 Nov 2026 08:00:00 GMT</pubDate>
          <source>Báo Chính phủ</source>
        </item>
      </channel></rss>
    `);
    expect(nchmf).toHaveLength(1);
    expect(nchmf[0].badge).toBe('BÃO / ATNĐ');
    expect(nchmf[0].severity).toBe('critical');

    const nws = normalizeNwsWeatherAlerts({
      features: [
        {
          id: 'urn:oid:1',
          geometry: { type: 'Point', coordinates: [-80.19, 25.76] },
          properties: {
            id: 'urn:oid:1',
            event: 'Hurricane Warning',
            severity: 'Extreme',
            areaDesc: 'Miami-Dade, FL',
            headline: 'Hurricane Warning issued by NWS Miami',
          },
        },
      ],
    });
    expect(nws).toHaveLength(1);
    expect(nws[0].severity).toBe('critical');

    const nhc = parseNoaaNhcCycloneRss(`
      <rss><channel>
        <item>
          <nhc:center>18.4, -66.2</nhc:center>
          <nhc:type>Hurricane</nhc:type>
          <nhc:name>Maria</nhc:name>
          <nhc:wind>115</nhc:wind>
          <nhc:pressure>952 mb</nhc:pressure>
          <link>https://www.nhc.noaa.gov/</link>
        </item>
      </channel></rss>
    `);
    expect(nhc).toHaveLength(1);
    expect(nhc[0].title).toContain('Hurricane Maria');
    expect(nhc[0].severity).toBe('critical');
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
    expect(fredMetric?.avg3Observations).toBeCloseTo(-0.12, 1);
    expect(fredMetric?.trendSlope).toBeLessThan(0);
    expect(fredMetric?.delta4w).toBeUndefined();
    expect(fredMetric?.alertBadge).toContain('ĐẢO NGƯỢC');
    expect(fredMetric?.sparkline).toEqual([0.1, -0.05, -0.12, -0.18]);

    const fourWeekMetric = normalizeFredObservationSeries(
      {
        id: 'WALCL',
        label: 'Fed Assets',
        subtitle: 'Fed Assets',
        unit: 'M$',
        pillar: 'leading',
      },
      {
        observations: [
          { date: '2026-11-20', value: '100' },
          { date: '2026-10-23', value: '90' },
        ],
      },
    );
    expect(fourWeekMetric?.delta4w).toBe(10);

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
    const testNow = Date.UTC(2026, 10, 22);
    const health = evaluateMacroHealth({
      quotes: [
        {
          symbol: 'USD/VND',
          name: 'Tỷ giá USD/VND',
          group: 'fx',
          price: 25480,
          changePercent24h: 0,
          updatedAt: testNow,
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
      vnMacroPulse: {
        ytdAvgCpiPct: 3.63,
        ytdCpiMonths: 10,
        updatedAt: testNow,
        fieldMeta: {
          ytdAvgCpiPct: {
            source: 'Cục Thống kê (NSO)',
            period: '10T/2026',
            fetchedAt: testNow,
            retained: false,
          },
        },
      },
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
      updatedAt: testNow,
    }, [], testNow);

    expect(health.vn).not.toBeNull();
    expect(health.vn?.regime).toBe('soft_landing');
    expect(health.vn?.compositeScore).toBeGreaterThan(75);
    expect(health.vn?.pillars).toHaveLength(3);

    expect(health.us).not.toBeNull();
    expect(health.us?.regime).toBe('overheating');
    expect(health.us?.warningFlags.some((f) => f.text.includes('10Y–2Y đảo ngược'))).toBe(true);
    expect(health.us?.warningFlags.some((f) => f.text.includes('PPI'))).toBe(true);

    const compassMarkets: Parameters<typeof evaluateInvestmentCompass>[0] = {
      quotes: [
        { symbol: 'Copper', name: 'Dr. Copper', group: 'commodity', price: 5.48, changePercent24h: 1.4, updatedAt: 1700000000000, source: 'Yahoo' },
        { symbol: 'Gold', name: 'Gold', group: 'commodity', price: 3550, changePercent24h: 0.2, observedAt: 1700000000000, updatedAt: 1700000000000, source: 'Yahoo' },
        { symbol: 'SOX Semi', name: 'PHLX Semiconductor', group: 'index', price: 8408, changePercent24h: 1.8, updatedAt: 1700000000000, source: 'Yahoo' },
        { symbol: 'USD/VND', name: 'USD/VND', group: 'fx', price: 25780, changePercent24h: 0, observedAt: 1700000000000, updatedAt: 1700000000000, source: 'FX' },
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
          worldParityRetained: false,
          changeBuyPercent: 0,
          changeSellPercent: 0,
          observedAt: 1700000000000,
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
    };
    const compass = evaluateInvestmentCompass(compassMarkets, [], 1700000000000);

    expect(compass).not.toBeNull();
    expect(compass?.stance).toBe('selective_growth');
    // Valuation/trend/FX pillars have no data here and now use a neutral prior (52), not a bullish one.
    expect(compass?.riskAppetiteScore).toBeGreaterThan(65);
    expect(compass?.riskAppetiteScore).toBeLessThan(80);
    expect(compass?.signals.length).toBe(8);
    expect(compass?.favoredAssets).toHaveLength(1);
    expect(compass?.sectorRotation).toBeUndefined();
    expect(compass?.avoidAssets.some((a) => a.includes('SJC'))).toBe(true);
    const staleGold = evaluateInvestmentCompass({
      ...compassMarkets,
      vnGold: compassMarkets.vnGold?.map((gold) => ({ ...gold, worldParityRetained: true })),
    }, [], 1700000000000);
    expect(staleGold?.avoidAssets.some((a) => a.includes('SJC'))).toBe(false);
    const agedGold = evaluateInvestmentCompass(compassMarkets, [], 1700000000000 + 6 * 3_600_000 + 1);
    expect(agedGold?.avoidAssets.some((a) => a.includes('SJC'))).toBe(false);
  });

  it('computes Quant v2.0 metrics: Fed Net Liquidity, NY Fed Probit Recession Prob, 4-Quadrant Z-Score, World Bank Buffers & MA200 Dual Confirmation', () => {
    // 1. NY Fed Probit 12M Recession Probability (Estrella-Mishkin formula)
    const probPositiveCurve = computeNyFedRecessionProb12m(0.6);
    const probInvertedCurve = computeNyFedRecessionProb12m(-1.1);
    expect(probPositiveCurve).toBeGreaterThan(15);
    expect(probPositiveCurve).toBeLessThan(22);
    expect(probInvertedCurve).toBeGreaterThan(55);

    // 2. Institutional Fed Net Liquidity: (WALCL - WTREGEN)/1000 - RRPONTSYD
    const netLiq = computeFedNetLiquidity({
      walclMillions: 6_741_452,
      wtregenMillions: 916_613,
      rrpBillions: 0.4,
      walclDelta4wMillions: 28_000,
      wtregenDelta4wMillions: -22_000,
      rrpDelta4wBillions: -5,
    });
    expect(netLiq).not.toBeNull();
    expect(netLiq?.netLiquidityBillions).toBeCloseTo(5824.4, 1);
    expect(netLiq?.delta4wBillions).toBeCloseTo(55.0, 1);

    // 3. 4-Quadrant GIP Matrix
    expect(classifyMacroQuadrant(0.8, -0.4).quadrant).toBe('Q1_GOLDILOCKS');
    expect(classifyMacroQuadrant(0.9, 0.7).quadrant).toBe('Q2_REFLATION');
    expect(classifyMacroQuadrant(-0.8, 0.9).quadrant).toBe('Q3_STAGFLATION');
    expect(classifyMacroQuadrant(-0.6, -0.5).quadrant).toBe('Q4_DEFLATION');

    // 4. Rolling 12-period Z-Score on FRED series
    const pceSeries = normalizeFredObservationSeries(
      {
        id: 'PCEPILFE',
        label: 'Core PCE YoY',
        subtitle: 'Lạm phát Lõi Core PCE (Thước đo FOMC)',
        unit: '%',
        pillar: 'inflation',
        benchmarkValue: 2.0,
      },
      {
        observations: [
          { date: '2026-10-01', value: '3.12' },
          { date: '2026-09-01', value: '2.95' },
          { date: '2026-08-01', value: '2.82' },
          { date: '2026-07-01', value: '2.75' },
          { date: '2026-06-01', value: '2.68' },
          { date: '2026-05-01', value: '2.64' },
        ],
      },
    );
    expect(pceSeries?.zScore).toBeDefined();
    expect(pceSeries?.zScore).toBeGreaterThan(1.0);
    expect(pceSeries?.alertBadge).toContain('FOMC');

    // 5. Technical Indicators (MA50 / MA200 / RSI-14) + Dual Confirmation Gate
    const uptrendCloses = Array.from({ length: 220 }, (_, i) => 1450 + i * 1.1 + (i % 3 === 0 ? 4 : -1));
    const tech = computeTechnicalIndicators(uptrendCloses);
    expect(tech.ma50).toBeDefined();
    expect(tech.ma200).toBeDefined();
    expect(tech.rsi14).toBeGreaterThan(55);

    const dualCompass = evaluateInvestmentCompass({
      quotes: [
        {
          symbol: 'VN-Index',
          name: 'VN-Index',
          group: 'index',
          price: 1510, // Below MA200 (1600) -> triggers divergence gate!
          changePercent24h: -0.8,
          ma50: 1545,
          ma200: 1600,
          rsi14: 39.5,
          updatedAt: 1700000000000,
          source: 'HOSE',
        },
        {
          symbol: 'S&P 500',
          name: 'S&P 500',
          group: 'index',
          price: 6910,
          changePercent24h: 0.4,
          ma50: 6780,
          ma200: 6420,
          rsi14: 61.2,
          updatedAt: 1700000000000,
          source: 'Yahoo',
        },
      ],
      crypto: [],
      fearGreed: null,
      macro: [],
      fred: [
        { id: 'WALCL', label: 'WALCL', subtitle: 'WALCL', value: 6_741_452, change: 1000, delta4w: 25_000, unit: 'M$', date: '2026-11-18', pillar: 'leading', sparkline: [] },
        { id: 'WTREGEN', label: 'TGA', subtitle: 'TGA', value: 916_613, change: -500, delta4w: -15_000, unit: 'M$', date: '2026-11-18', pillar: 'leading', sparkline: [] },
        { id: 'RRPONTSYD', label: 'RRP', subtitle: 'RRP', value: 0.4, change: 0, delta4w: 0, unit: 'B$', date: '2026-11-20', pillar: 'leading', sparkline: [] },
        { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5.2, change: 0.2, unit: '%', date: '2026-10-01', pillar: 'leading', sparkline: [] },
        { id: 'NFCI', label: 'NFCI', subtitle: 'NFCI', value: -0.45, change: -0.02, unit: 'idx', date: '2026-11-13', pillar: 'leading', sparkline: [] },
        { id: 'STLFSI4', label: 'Stress', subtitle: 'Stress', value: -0.62, change: -0.05, unit: 'idx', date: '2026-11-13', pillar: 'leading', sparkline: [] },
        { id: 'BAMLH0A0HYM2', label: 'HY', subtitle: 'HY', value: 3.1, change: -0.05, unit: '%', date: '2026-11-19', pillar: 'leading', sparkline: [] },
        { id: 'DFII10', label: '10Y Real Yield', subtitle: '10Y Real Yield', value: 1.8, change: 0, unit: '%', date: '2026-11-19', pillar: 'leading', sparkline: [] },
        { id: 'T10Y3M', label: '10Y3M', subtitle: '10Y3M', value: 0.6, change: 0.02, unit: '%', date: '2026-11-01', frequency: 'monthly', pillar: 'leading', sparkline: [] },
      ],
      updatedAt: 1700000000000,
    });

    expect(dualCompass).not.toBeNull();
    expect(dualCompass?.netLiquidityBillions).toBeCloseTo(5824.4, 1);
    expect(dualCompass?.recessionProb12m).toBeCloseTo(probPositiveCurve, 1);
    expect(dualCompass?.dualConfirmation).toBe('macro_bull_trend_weak');
    // Dual confirmation blocks aggressive 'risk_on' when VN-Index is below MA200!
    expect(dualCompass?.stance).not.toBe('risk_on');
    expect(dualCompass?.avoidAssets.some((a) => a.includes('MA200'))).toBe(true);
  });

  it('computes VN-Index P/E & ERP, VN30 Breadth, VIX/VIX3M Capitulation Detector, Carry Trade & 100% Dynamic Allocation', () => {
    const val = parseSimplizeIndexValuationHtml(
      `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            summary: {
              peRatio: 10.457,
              pbRatio: 1.798,
              close52wLow: 1586.44,
              close52wHigh: 1933.11,
              volume: 736_616_872,
              volAvg90d: 542_334_243,
            },
          },
        },
      })}</script></body></html>`,
    );
    expect(val).not.toBeNull();
    expect(val?.peRatio).toBe(10.46);
    expect(val?.pbRatio).toBe(1.8);
    expect(val?.volumeVs90dRatio).toBe(1.36);

    const erp = computeVietnamEquityRiskPremium(val?.peRatio, 5.2);
    expect(erp?.erpPct).toBeCloseTo(4.36, 1);

    const breadth = computeVn30MarketBreadth([
      { symbol: 'FPT', name: 'FPT', sector: 'Tech', priceThousandVnd: 135, changePercent: 1, volume: 1000, sparkline: [], ma50: 130, ma200: 120, rsi14: 58, updatedAt: 1 },
      { symbol: 'VCB', name: 'VCB', sector: 'Bank', priceThousandVnd: 92, changePercent: 0.2, volume: 1000, sparkline: [], ma50: 90, ma200: 88, rsi14: 52, updatedAt: 1 },
      { symbol: 'HPG', name: 'HPG', sector: 'Steel', priceThousandVnd: 26, changePercent: -1, volume: 1000, sparkline: [], ma50: 28, ma200: 27, rsi14: 35, updatedAt: 1 },
      { symbol: 'VHM', name: 'VHM', sector: 'RE', priceThousandVnd: 40, changePercent: -1.5, volume: 1000, sparkline: [], ma50: 43, ma200: 44, rsi14: 31, updatedAt: 1 },
    ]);
    expect(breadth?.aboveMa50Pct).toBe(50);
    expect(breadth?.aboveMa200Pct).toBe(50);

    const alloc = computeDynamicPortfolioAllocation({
      stance: 'selective_growth',
      riskAppetiteScore: 76,
      vnErpPct: 4.36,
      dualConfirmation: 'macro_bull_trend_weak',
      capitulationSignal: true,
      highInflationPressure: true,
      liquidityExpanding: true,
    });
    const sumPct = alloc.reduce((s, a) => s + a.weightPct, 0);
    expect(sumPct).toBe(100);
    expect(alloc).toHaveLength(4);

    const compass = evaluateInvestmentCompass({
      quotes: [
        { symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1689, changePercent24h: -0.05, ma50: 1748, ma200: 1784, rsi14: 33, peRatio: 10.46, pbRatio: 1.8, updatedAt: 1, source: 'HOSE' },
        { symbol: 'S&P 500', name: 'S&P 500', group: 'index', price: 6910, changePercent24h: -3.7, ma50: 7625, ma200: 7349, rsi14: 25, updatedAt: 1, source: 'Yahoo' },
        { symbol: 'VIX 3M', name: 'VIX 3M', group: 'index', price: 21.5, changePercent24h: 4.0, updatedAt: 1, source: 'Yahoo' },
        { symbol: 'AUD/JPY', name: 'AUD/JPY', group: 'fx', price: 98.4, changePercent24h: -1.65, updatedAt: 1, source: 'Yahoo' },
      ],
      crypto: [],
      fearGreed: null,
      macro: [],
      vnMacroPulse: { vn10yYieldPct: 5.2, updatedAt: 1 },
      fred: [
        { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5.7, change: 0.2, unit: '%', date: '2026-10-01', pillar: 'leading', sparkline: [] },
        { id: 'VIXCLS', label: 'VIX', subtitle: 'VIX', value: 24.2, change: 3.1, unit: 'pts', date: '2026-11-20', pillar: 'market', sparkline: [] },
        { id: 'T10Y3M', label: '10Y3M', subtitle: '10Y3M', value: 0.6, change: 0.02, unit: '%', date: '2026-11-01', frequency: 'monthly', pillar: 'leading', sparkline: [] },
        { id: 'T5YIFR', label: '5Y5Y', subtitle: '5Y5Y', value: 2.31, change: -0.01, unit: '%', date: '2026-11-21', pillar: 'inflation', sparkline: [] },
      ],
      updatedAt: 1,
    });

    expect(compass?.vnIndexPe).toBe(10.46);
    expect(compass?.vnErpPct).toBeCloseTo(4.36, 1);
    expect(compass?.vixTermRatio).toBeCloseTo(1.13, 1);
    expect(compass?.capitulationSignal).toBe(true);
    expect(compass?.allocations.reduce((s, a) => s + a.weightPct, 0)).toBe(100);
    expect(compass?.signals.some((s) => s.id === 'aud-jpy' && s.tone === 'bearish')).toBe(true);
  });

  it('computes continuous multi-factor scores, live VN 10Y / PMI / CPI pulse, S&P 500 ERP, Polymarket FOMC odds & 4-phase Sector Rotation', () => {
    const now = Date.UTC(2026, 10, 22);
    // 1. Continuous smooth factor scoring has zero step-function discontinuities
    const s1 = smoothFactorScore(3.89, 4.15, 0.75, true);
    const s2 = smoothFactorScore(3.91, 4.15, 0.75, true);
    expect(Math.abs(s1 - s2)).toBeLessThanOrEqual(2);
    expect(smoothFactorScore(6.0, 2.0, 2.5, false)).toBeGreaterThan(smoothFactorScore(1.0, 2.0, 2.5, false));

    // 2. Parse live Vietnam monthly PMI, CPI, Interbank, Quarterly GDP, Trade Surplus & VN10Y Bond Yield
    const vnPulse = parseTradingEconomicsVietnamHtml(
      `<table>
        <tr><td><a href='/vietnam/inflation-cpi'>Inflation Rate</a></td><td>5.09</td><td>5.08</td><td>Oct/26</td></tr>
        <tr><td><a href='/vietnam/manufacturing-pmi'>Manufacturing PMI</a></td><td>52.3</td><td>51.9</td></tr>
        <tr><td><a href='/vietnam/interbank-rate'>Interbank Rate</a></td><td>7.66</td><td>7.04</td></tr>
        <tr><td><a href='/vietnam/gdp-growth-annual'>GDP Annual Growth Rate</a></td><td>9.95</td><td>8.81</td></tr>
        <tr><td><a href='/vietnam/balance-of-trade'>Balance of Trade</a></td><td>7.31</td><td>1.27</td></tr>
      </table>`,
      `<meta name="description" content="The yield on Vietnam 10Y Bond Yield held steady at 4.57% on November 20, 2026." />`,
      now,
    );
    expect(vnPulse.vn10yYieldPct).toBe(4.57);
    expect(vnPulse.monthlyCpiPct).toBe(5.09);
    expect(vnPulse.manufacturingPmi).toBe(52.3);
    expect(vnPulse.interbankRatePct).toBe(7.66);
    expect(vnPulse.quarterlyGdpPct).toBe(9.95);
    expect(vnPulse.tradeBalanceBillionUsd).toBe(7.31);

    const spPe = parseMultplSp500PeHtml(`<div id="current">Current S&amp;P 500 PE Ratio: <b>23.55</b></div>`);
    expect(spPe).toBe(23.55);

    // 3. Polymarket real-money FOMC hawkish rate hike detection
    const polyInsight = extractPolymarketMacroInsight([
      {
        id: 'fed-decision-in-december',
        title: 'Fed Decision in December?',
        category: 'finance',
        yesPercent: 90,
        outcomeLabel: '25 bps increase',
        volumeUsd: 49_745_117,
        liquidityUsd: 2_500_000,
        endDate: '2026-12-18',
        url: 'https://polymarket.com/event/fed-decision-in-december',
        updatedAt: 1,
      },
    ]);
    expect(polyInsight).not.toBeNull();
    expect(polyInsight?.bias).toBe('hawkish_hike');
    expect(polyInsight?.fedActionLabel).toContain('90%');

    // 4. Sector rotation maps all 4 quadrants distinctly
    expect(buildSectorRotation('Q1_GOLDILOCKS').leadingSectors[0]).toContain('CNTT');
    expect(buildSectorRotation('Q2_REFLATION').leadingSectors[0]).toContain('Dầu khí');
    expect(buildSectorRotation('Q3_STAGFLATION').leadingSectors[0]).toContain('Điện');
    expect(buildSectorRotation('Q4_DEFLATION').leadingSectors[0]).toContain('Trái phiếu');

    // 5. End-to-end Macro Health & Multi-Factor Investment Compass with live VN10Y & Polymarket
    const snapshot = {
      quotes: [
        { symbol: 'VN-Index', name: 'VN-Index', group: 'index' as const, price: 1689, changePercent24h: -0.05, ma50: 1748, ma200: 1784, rsi14: 37, peRatio: 10.46, pbRatio: 1.8, updatedAt: 1, source: 'HOSE' },
        { symbol: 'S&P 500', name: 'S&P 500', group: 'index' as const, price: 6910, changePercent24h: -3.7, ma50: 7625, ma200: 7349, rsi14: 25, updatedAt: 1, source: 'Yahoo' },
        { symbol: 'USD/VND', name: 'USD/VND', group: 'fx' as const, price: 25783, changePercent24h: 0, updatedAt: 1, source: 'FX' },
      ],
      crypto: [],
      fearGreed: null,
      macro: [
        {
          countryCode: 'VNM',
          countryName: 'Việt Nam',
          regionLabel: 'ASEAN',
          isVietnam: true,
          gdpGrowthPct: 8.02,
          gdpGrowthYear: 2025,
          gdpCurrentUsd: 514_000_000_000,
          gdpCurrentYear: 2025,
          cpiInflationPct: 3.31,
          cpiYear: 2025,
          fdiPctGdp: 4.27,
          currentAccountPctGdp: 6.44,
          creditPctGdp: 125.0,
        },
      ],
      fred: [
        { id: 'DGS10', label: 'US 10Y', subtitle: 'US 10Y', value: 5.04, change: 0, unit: '%', date: '2026-11-20', pillar: 'market' as const, sparkline: [] },
        { id: 'PCEPILFE', label: 'Core PCE', subtitle: 'Core PCE', value: 3.12, change: 0.09, zScore: 1.01, unit: '%', date: '2026-09-01', pillar: 'inflation' as const, sparkline: [] },
        { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5.71, change: 0.1, unit: '%', date: '2026-09-01', pillar: 'leading' as const, sparkline: [] },
      ],
      vnMacroPulse: {
        ...vnPulse,
        sp500PeRatio: 23.55,
        updatedAt: 1,
      },
      updatedAt: 1,
    };

    const predictions = [
      {
        id: 'fed-decision-in-december',
        title: 'Fed Decision in December?',
        category: 'finance' as const,
        yesPercent: 90,
        outcomeLabel: '25 bps increase',
        volumeUsd: 49_745_117,
        liquidityUsd: 2_500_000,
        endDate: '2026-12-18',
        url: 'https://polymarket.com/event/fed-decision-in-december',
        updatedAt: 1,
      },
    ];

    const health = evaluateMacroHealth(snapshot, predictions, now);
    // Monthly CPI can inform the quadrant, but cannot establish whether the annual CPI target is met.
    expect(health.vn?.quadrant).toBe('Q2_REFLATION');
    expect(health.vn?.regime).toBeUndefined();
    expect(health.us?.warningFlags.some((f) => f.text.includes('Polymarket'))).toBe(true);

    const compassFull = evaluateInvestmentCompass(snapshot, predictions, now);
    expect(compassFull?.vnErpPct).toBeCloseTo(4.99, 1); // 100/10.46 - 4.57% live VN10Y!
    expect(compassFull?.usErpPct).toBeCloseTo(-0.79, 1); // 100/23.55 - 5.04% live US10Y!
    expect(compassFull?.vnUsYieldSpreadBps).toBe(-47);
    expect(compassFull?.factorPillars).toHaveLength(5);
    expect(compassFull?.factorPillars?.reduce((s, p) => s + p.weightPct, 0)).toBe(100);
    expect(compassFull?.sectorRotation?.quadrant).toBe('Q2_REFLATION');
  });

  it('verifies Catalyst Calendar, Chokepoint-to-Stock Impact Engine, Historical Regime Ledger & 24/7 Telegram Alert Engine', () => {
    // 1. Statutory 3rd Thursday VN30F1M derivatives expiry + upcoming FOMC & GSO catalysts
    const thirdThuDec2026 = getNthWeekdayOfMonthUtc(2026, 11, 4, 3);
    expect(new Date(thirdThuDec2026).toISOString().slice(0, 10)).toBe('2026-12-17');

    const catalysts = buildMarketCatalystCalendar(
      Date.UTC(2026, 10, 22, 11, 0, 0),
      '90% Tăng +25bps (Quyết định của Fed vào tháng 12?)',
    );
    expect(catalysts.length).toBe(5);
    expect(catalysts[0].daysUntil).toBeLessThanOrEqual(catalysts[1].daysUntil);
    expect(catalysts.some((e) => e.id === 'fomc-rate' && e.impactNote.includes('90%'))).toBe(true);

    // 2. Chokepoint -> Commodity & VN Stock Impact (detects inverted "returns to normal: 3%" => 97% disrupted!)
    const chokepoints = evaluateChokepointMarketImpacts({
      military: [
        {
          id: 'mil-1',
          layer: 'military',
          category: 'recon',
          title: 'USN P-8A Poseidon',
          lat: 26.2,
          lon: 56.4,
          timestamp: 1,
          severity: 'high',
          source: 'ADSB',
          meta: {},
        },
      ],
      vessels: [],
      geopolitics: [],
      predictions: [
        {
          id: 'hormuz-normal',
          title: 'Strait of Hormuz traffic returns to normal by December 31?',
          category: 'geopolitics',
          yesPercent: 3,
          volumeUsd: 18_290_000,
          liquidityUsd: 500_000,
          endDate: '2026-12-31',
          url: 'https://polymarket.com',
          updatedAt: 1,
        },
      ],
      quotes: [
        {
          symbol: 'Brent Crude',
          name: 'Brent',
          group: 'commodity',
          price: 89.95,
          changePercent24h: 1.2,
          updatedAt: 1,
          source: 'Yahoo',
        },
      ],
    });
    expect(chokepoints[0].id).toBe('hormuz');
    expect(chokepoints[0].status).toBe('critical');
    expect(chokepoints[0].polymarketNote).toContain('97%');
    expect(chokepoints[0].vnStockImpact).toContain('GAS');

    // 3. RegimeHistoryLedger persists only observed daily snapshots
    const tempDir = mkdtempSync(join(tmpdir(), 'wm-ledger-tg-'));
    try {
      const ledger = new RegimeHistoryLedger(tempDir);
      const history = ledger.recordSnapshot(
        {
          quotes: [
            {
              symbol: 'VN-Index',
              name: 'VN-Index',
              group: 'index',
              price: 1689,
              changePercent24h: -0.05,
              ma50: 1748,
              ma200: 1784,
              rsi14: 37,
              peRatio: 10.46,
              sparkline: [1735, 1736, 1726, 1703, 1690, 1689],
              updatedAt: 1,
              source: 'HOSE',
            },
          ],
          crypto: [],
          fearGreed: null,
          macro: [],
          fred: [
            {
              id: 'M2SL',
              label: 'M2',
              subtitle: 'M2',
              value: 5.7,
              change: 0.1,
              unit: '%',
              date: '2026-10-01',
              pillar: 'leading',
              sparkline: [5.2, 5.4, 5.5, 5.6, 5.7],
            },
          ],
          updatedAt: 1,
        },
        [],
        [],
        Date.UTC(2026, 10, 22, 11, 0, 0),
      );
      expect(history).toHaveLength(1);
      expect(history[history.length - 1].date).toBe('2026-11-22');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('aligns Vietnam CPI strictly on YTD Average vs 4.5% National Assembly target and flags lagged 2025 Current Account vs 2026 YTD Trade Deficit', () => {
    const ytdCtx = parseVietnamOfficialYtdContext({
      now: Date.UTC(2026, 10, 22, 12, 0, 0),
      nsoPostsJson: JSON.stringify([
        {
          date: '2026-11-04T15:44:31',
          title: { rendered: 'Một số nét chính tình hình kinh tế – xã hội tháng 10 và 10 tháng năm 2026' },
          content: {
            rendered:
              '<p>Cán cân thương mại hàng hóa tháng Mười sơ bộ xuất siêu 7,31 tỷ USD. Cán cân thương mại hàng hóa mười tháng năm 2026 sơ bộ nhập siêu 12,07 tỷ USD.</p>',
          },
        },
        {
          date: '2026-11-03T09:01:54',
          title: {
            rendered:
              'Chỉ số giá tiêu dùng, chỉ số giá vàng và chỉ số giá đô la Mỹ tháng Mười và mười tháng năm 2026',
          },
          content: {
            rendered:
              '<p>Bình quân mười tháng năm 2026, CPI tăng 4,57% so với cùng kỳ năm trước; lạm phát cơ bản tăng 4,24%.</p>',
          },
        },
      ]),
      cpiRssXml: `
        <rss><channel>
          <item>
            <title>Bình quân 11 tháng năm 2025, CPI tăng 3,29%, lạm phát cơ bản tăng 3,21% và kịch bản 2026</title>
            <pubDate>Sat, 06 Dec 2025 08:00:00 GMT</pubDate>
          </item>
        </channel></rss>
      `,
      tradeRssXml: `
        <rss><channel>
          <item><title>Xuất nhập khẩu vượt 1.070 tỷ USD, nhập siêu còn 11,74 tỷ USD</title><pubDate>Wed, 18 Nov 2026 09:00:00 GMT</pubDate></item>
        </channel></rss>
      `,
      vcbFxXml: `<ExrateList><Exrate CurrencyCode="USD" Buy="25,570.00" Transfer="25,600.00" Sell="25,980.00" /></ExrateList>`,
    });

    expect(ytdCtx.ytdCpiMonths).toBe(10);
    expect(ytdCtx.ytdAvgCpiPct).toBe(4.57);
    expect(ytdCtx.ytdCoreCpiPct).toBe(4.24);
    // Authoritative NSO 10-month trade balance (-12.07B$) takes precedence over Customs mid-month RSS (-11.74B$)
    expect(ytdCtx.ytdTradeBalanceBillionUsd).toBe(-12.07);
    expect(ytdCtx.vcbSellUsdVnd).toBe(25980);

    // Even when NSO JSON is temporarily unavailable, RSS fallback prefers GSO full-month release window (Nov 5 -> -12.07B$) over Customs mid-month flash (Nov 19 -> -11.74B$)
    const rssFallbackCtx = parseVietnamOfficialYtdContext({
      now: Date.UTC(2026, 10, 22, 12, 0, 0),
      cpiRssXml: `<rss><channel><item><title>10 tháng đầu năm 2026, CPI tăng 4,57%, lạm phát cơ bản tăng 4,24%</title><pubDate>Fri, 06 Nov 2026 08:00:00 GMT</pubDate></item></rss>`,
      tradeRssXml: `
        <rss><channel>
          <item><title>Xuất nhập khẩu vượt 1.070 tỷ USD, nhập siêu còn 11,74 tỷ USD - Tin nhanh chứng khoán</title><pubDate>Thu, 19 Nov 2026 07:42:01 GMT</pubDate></item>
          <item><title>Xuất nhập khẩu Việt Nam vượt 1.000 tỉ USD, nhập siêu 12,07 tỉ - Báo Văn Hóa</title><pubDate>Thu, 05 Nov 2026 08:00:00 GMT</pubDate></item>
        </channel></rss>
      `,
    });
    expect(rssFallbackCtx.ytdTradeBalanceBillionUsd).toBe(-12.07);

    const pulseNow = Date.UTC(2026, 10, 22, 8, 0, 0);
    const health = evaluateMacroHealth({
      quotes: [
        { symbol: 'USD/VND', name: 'USD/VND', group: 'fx', price: 25783, changePercent24h: 0, updatedAt: pulseNow, source: 'FX' },
        { symbol: 'VN-Index', name: 'VN-Index', group: 'index', price: 1689, changePercent24h: -0.05, peRatio: 10.46, pbRatio: 1.8, updatedAt: pulseNow, source: 'HOSE' },
      ],
      crypto: [],
      fearGreed: null,
      macro: [
        {
          countryCode: 'VNM',
          countryName: 'Việt Nam',
          regionLabel: 'ASEAN',
          isVietnam: true,
          gdpGrowthPct: 8.02,
          gdpGrowthYear: 2025,
          gdpCurrentUsd: 514_000_000_000,
          gdpCurrentYear: 2025,
          cpiInflationPct: 3.31,
          cpiYear: 2025,
          fdiPctGdp: 4.27,
          currentAccountPctGdp: 6.44,
          currentAccountYear: 2025,
          creditPctGdp: 125.0,
        },
      ],
      vnMacroPulse: {
        quarterlyGdpPct: 9.95,
        manufacturingPmi: 52.3,
        monthlyCpiPct: 5.09,
        ytdAvgCpiPct: 4.57,
        ytdCoreCpiPct: 4.24,
        ytdCpiMonths: 10,
        tradeBalanceBillionUsd: 7.31,
        ytdTradeBalanceBillionUsd: -12.07,
        interbankRatePct: 7.66,
        vn10yYieldPct: 4.57,
        vcbSellUsdVnd: 25980,
        fieldMeta: {
          quarterlyGdpPct: { source: 'NSO / TE', period: 'Q3/2026', fetchedAt: pulseNow, retained: false },
          manufacturingPmi: { source: 'S&P Global / TE', period: 'T10/2026', fetchedAt: pulseNow, retained: false },
          monthlyCpiPct: { source: 'GSO / TradingEconomics', period: 'T10/2026', fetchedAt: pulseNow, retained: false },
          ytdAvgCpiPct: { source: 'Cục Thống kê (NSO)', period: '10T/2026', fetchedAt: pulseNow, retained: false },
          ytdCoreCpiPct: { source: 'Cục Thống kê (NSO)', period: '10T/2026', fetchedAt: pulseNow, retained: false },
          tradeBalanceBillionUsd: { source: 'Hải quan / TE', period: 'T10/2026', fetchedAt: pulseNow, retained: false },
          ytdTradeBalanceBillionUsd: { source: 'Cục Thống kê (NSO)', period: '10T/2026', fetchedAt: pulseNow, retained: false },
          interbankRatePct: { source: 'SBV / TE', fetchedAt: pulseNow, retained: false },
          vn10yYieldPct: { source: 'VBMA / TE', fetchedAt: pulseNow, retained: false },
          vcbSellUsdVnd: { source: 'Vietcombank', fetchedAt: pulseNow, retained: false },
        },
        updatedAt: pulseNow,
      },
      updatedAt: pulseNow,
    }, [], pulseNow);

    const vnCpiMetric = health.vn?.pillars[1].metrics.find((m) => m.id === 'vn-cpi');
    // Must compare YTD Average CPI (4.57%), NOT single-month 5.09%, against the 4.5% National Assembly target!
    expect(vnCpiMetric?.actual).toBe(4.57);
    expect(vnCpiMetric?.deltaVsBenchmark).toBe(0.07);
    expect(vnCpiMetric?.status).toBe('watch');
    expect(vnCpiMetric?.trendLabel).toContain('Lõi BQ 4.24%');
    expect(vnCpiMetric?.trendLabel).toContain('Tháng YoY 5.09%');

    // Must NEVER emit false-present "Lá chắn ngoại hối vững +6.44% GDP" when 6.44% is lagged 2025 data & 2026 YTD trade is in deficit!
    expect(health.vn?.warningFlags.some((f) => f.text.includes('Lá chắn ngoại hối vững'))).toBe(false);
    expect(health.vn?.warningFlags.some((f) => f.text.includes('lũy kế 10 tháng nhập siêu -12.07B$'))).toBe(true);
    expect(
      health.vn?.warningFlags.some(
        (f) => f.text.includes('Cán cân vãng lai/GDP năm 2025') && f.text.includes('không suy ra'),
      ),
    ).toBe(true);
    expect(health.vn?.pillars[2].metrics.find((m) => m.id === 'vn-cab')?.status).toBe('watch');
  });

  it('does not treat a prior-year World Bank current-account value as current when live data is absent', () => {
    const health = evaluateMacroHealth({
      quotes: [],
      crypto: [],
      fearGreed: null,
      macro: [{
        countryCode: 'VNM',
        countryName: 'Việt Nam',
        regionLabel: 'ASEAN',
        gdpGrowthPct: 8.0,
        gdpGrowthYear: 2025,
        gdpCurrentUsd: 514_000_000_000,
        gdpCurrentYear: 2025,
        cpiInflationPct: 3.3,
        cpiYear: 2025,
        currentAccountPctGdp: 6.44,
        currentAccountYear: 2025,
      }],
      updatedAt: 1,
    });

    expect(health.vn?.warningFlags.some((f) => f.text.includes('Lá chắn ngoại hối vững'))).toBe(false);
    expect(health.vn?.warningFlags.some((f) => f.text.includes('Cán cân vãng lai/GDP năm 2025'))).toBe(true);
    expect(health.vn?.pillars[2].metrics.find((m) => m.id === 'vn-cab')?.status).toBe('watch');
  });

  it('reproduces official NY Fed monthly bond-equivalent 10Y-3M recession probability (12.4%), breakeven terminology, and Dec 9 FOMC schedule', () => {
    const spreadOct2026 = computeNyFedBondEquivalentSpread(5.13, 4.05);
    expect(spreadOct2026).toBe(0.98128);
    expect(computeNyFedRecessionProb12m(spreadOct2026)).toBe(12.4);
    const monthlySpread = {
      id: 'T10Y3M',
      label: '10Y-3M',
      subtitle: '10Y-3M',
      value: 0.6,
      change: 0,
      unit: '%',
      date: '2026-10-01',
      frequency: 'monthly' as const,
      sparkline: [0.6],
    };
    expect(resolveNyFedSpreadAndProb(new Map([['T10Y3M', monthlySpread]])).spreadPct).toBe(0.6);
    const gs10 = { ...monthlySpread, id: 'GS10', value: 5.13 };
    const tb3ms = { ...monthlySpread, id: 'TB3MS', value: 4.05 };
    expect(resolveNyFedSpreadAndProb(new Map([['GS10', gs10], ['TB3MS', tb3ms]])).prob12m).toBe(12.4);
    const mismatch = { ...tb3ms, date: '2026-09-01' };
    expect(resolveNyFedSpreadAndProb(new Map([['GS10', gs10], ['TB3MS', mismatch]])).prob12m).toBeUndefined();
    expect(resolveNyFedSpreadAndProb(new Map([['GS10', gs10], ['TB3MS', mismatch], ['T10Y3M', monthlySpread]])).spreadPct).toBe(0.6);
    expect(
      resolveNyFedSpreadAndProb(
        new Map([['T10Y3M', { ...monthlySpread, frequency: undefined }]]),
      ).prob12m,
    ).toBeUndefined();

    const usHealth = evaluateMacroHealth({
      quotes: [],
      crypto: [],
      fearGreed: null,
      macro: [],
      fred: [
        { id: 'GS10', label: 'GS10', subtitle: 'GS10', value: 5.13, change: 0, unit: '%', date: '2026-10-01', sparkline: [5.13] },
        { id: 'TB3MS', label: 'TB3MS', subtitle: 'TB3MS', value: 4.05, change: 0, unit: '%', date: '2026-10-01', sparkline: [4.05] },
        { id: 'T10Y3M', label: 'T10Y3M', subtitle: 'T10Y3M', value: 0.6, change: -0.1, unit: '%', date: '2026-11-20', sparkline: [0.6] },
        { id: 'T10Y2Y', label: 'T10Y2Y', subtitle: 'Độ dốc 10Y-2Y', value: 0.29, change: 0.01, unit: '%', date: '2026-11-20', sparkline: [0.29] },
        { id: 'DGS10', label: 'US 10Y', subtitle: 'US 10Y', value: 5.04, change: 0, unit: '%', date: '2026-11-19', sparkline: [5.04] },
        { id: 'PCEPILFE', label: 'Core PCE', subtitle: 'Core PCE', value: 3.12, change: 0.1, unit: '%', date: '2026-09-01', sparkline: [3.12] },
        { id: 'T5YIFR', label: '5Y5Y Breakeven', subtitle: 'Lạm phát Hòa vốn Kỳ hạn 5Y5Y', value: 2.12, change: 0, unit: '%', date: '2026-11-20', sparkline: [2.12] },
      ],
      vnMacroPulse: { sp500PeRatio: 23.55, updatedAt: 1 },
      updatedAt: 1,
    });

    expect(usHealth.us?.recessionProb12m).toBe(12.4);
    expect(usHealth.us?.pillars[1].title).toBe('2. CORE PCE · CPI & LẠM PHÁT HÒA VỐN TRÁI PHIẾU');
    expect(
      usHealth.us?.warningFlags.some((f) => f.text.includes('ở mức thấp (12.4%)')),
    ).toBe(true);
    expect(
      usHealth.us?.warningFlags.some((f) => f.text.includes('lạm phát hòa vốn trái phiếu neo ở 2.12%')),
    ).toBe(true);
    expect(
      usHealth.us?.warningFlags.some((f) => f.text.includes('kỳ vọng trái phiếu ngày')),
    ).toBe(false);

    const cal = buildMarketCatalystCalendar(Date.UTC(2026, 10, 22, 12, 0, 0));
    const fomc = cal.find((e) => e.category === 'fomc');
    expect(fomc?.dateIso).toBe('2026-12-09');
    expect(fomc?.dateLabel).toBe('09/12');
    expect(fomc?.estimated).toBe(false);
    expect(cal.find((e) => e.id === 'us-cpi')?.estimated).toBe(true);
    const future = buildMarketCatalystCalendar(Date.UTC(2027, 11, 18));
    expect(future.find((e) => e.id === 'fomc-rate')).toBeUndefined();
  });
});
