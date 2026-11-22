import { describe, expect, it } from 'vitest';
import {
  buildSectorRotation,
  classifyMacroQuadrant,
  computeDynamicPortfolioAllocation,
  computeFedNetLiquidity,
  computeNyFedRecessionProb12m,
  computeVietnamEquityRiskPremium,
  computeVn30MarketBreadth,
  evaluateInvestmentCompass,
  evaluateMacroHealth,
  extractPolymarketMacroInsight,
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
      walclDelta4pMillions: 28_000,
      wtregenDelta4pMillions: -22_000,
      rrpDelta4pBillions: -5,
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
        { id: 'WALCL', label: 'WALCL', subtitle: 'WALCL', value: 6_741_452, change: 1000, delta4p: 25_000, unit: 'M$', date: '2026-11-18', pillar: 'leading', sparkline: [] },
        { id: 'WTREGEN', label: 'TGA', subtitle: 'TGA', value: 916_613, change: -500, delta4p: -15_000, unit: 'M$', date: '2026-11-18', pillar: 'leading', sparkline: [] },
        { id: 'RRPONTSYD', label: 'RRP', subtitle: 'RRP', value: 0.4, change: 0, delta4p: 0, unit: 'B$', date: '2026-11-20', pillar: 'leading', sparkline: [] },
        { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5.2, change: 0.2, unit: '%', date: '2026-10-01', pillar: 'leading', sparkline: [] },
        { id: 'NFCI', label: 'NFCI', subtitle: 'NFCI', value: -0.45, change: -0.02, unit: 'idx', date: '2026-11-13', pillar: 'leading', sparkline: [] },
        { id: 'STLFSI4', label: 'Stress', subtitle: 'Stress', value: -0.62, change: -0.05, unit: 'idx', date: '2026-11-13', pillar: 'leading', sparkline: [] },
        { id: 'BAMLH0A0HYM2', label: 'HY', subtitle: 'HY', value: 3.1, change: -0.05, unit: '%', date: '2026-11-19', pillar: 'leading', sparkline: [] },
        { id: 'T10Y3M', label: '10Y3M', subtitle: '10Y3M', value: 0.6, change: 0.02, unit: '%', date: '2026-11-20', pillar: 'leading', sparkline: [] },
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

    const erp = computeVietnamEquityRiskPremium(val?.peRatio);
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
      fred: [
        { id: 'M2SL', label: 'M2', subtitle: 'M2', value: 5.7, change: 0.2, unit: '%', date: '2026-10-01', pillar: 'leading', sparkline: [] },
        { id: 'VIXCLS', label: 'VIX', subtitle: 'VIX', value: 24.2, change: 3.1, unit: 'pts', date: '2026-11-20', pillar: 'market', sparkline: [] },
        { id: 'T10Y3M', label: '10Y3M', subtitle: '10Y3M', value: 0.6, change: 0.02, unit: '%', date: '2026-11-20', pillar: 'leading', sparkline: [] },
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
    // 1. Continuous smooth factor scoring has zero step-function discontinuities
    const s1 = smoothFactorScore(3.89, 4.15, 0.75, true);
    const s2 = smoothFactorScore(3.91, 4.15, 0.75, true);
    expect(Math.abs(s1 - s2)).toBeLessThanOrEqual(2);
    expect(smoothFactorScore(6.0, 2.0, 2.5, false)).toBeGreaterThan(smoothFactorScore(1.0, 2.0, 2.5, false));

    // 2. Parse live Vietnam monthly PMI, CPI, Interbank, Quarterly GDP, Trade Surplus & VN10Y Bond Yield
    const vnPulse = parseTradingEconomicsVietnamHtml(
      `<table>
        <tr><td><a href='/vietnam/inflation-cpi'>Inflation Rate</a></td><td>5.09</td><td>5.08</td></tr>
        <tr><td><a href='/vietnam/manufacturing-pmi'>Manufacturing PMI</a></td><td>52.3</td><td>51.9</td></tr>
        <tr><td><a href='/vietnam/interbank-rate'>Interbank Rate</a></td><td>7.66</td><td>7.04</td></tr>
        <tr><td><a href='/vietnam/gdp-growth-annual'>GDP Annual Growth Rate</a></td><td>9.95</td><td>8.81</td></tr>
        <tr><td><a href='/vietnam/balance-of-trade'>Balance of Trade</a></td><td>7.31</td><td>1.27</td></tr>
      </table>`,
      `<meta name="description" content="The yield on Vietnam 10Y Bond Yield held steady at 4.57% on November 20, 2026." />`,
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

    const health = evaluateMacroHealth(snapshot, predictions);
    // Live monthly CPI 5.09% (>4.5% ceiling) + Quarterly GDP 9.95% accurately shifts VN to Q2 Reflation!
    expect(health.vn?.quadrant).toBe('Q2_REFLATION');
    expect(health.vn?.regime).toBe('overheating');
    expect(health.us?.warningFlags.some((f) => f.text.includes('Polymarket'))).toBe(true);

    const compassFull = evaluateInvestmentCompass(snapshot, predictions);
    expect(compassFull?.vnErpPct).toBeCloseTo(4.99, 1); // 100/10.46 - 4.57% live VN10Y!
    expect(compassFull?.usErpPct).toBeCloseTo(-0.79, 1); // 100/23.55 - 5.04% live US10Y!
    expect(compassFull?.vnUsYieldSpreadBps).toBe(-47);
    expect(compassFull?.factorPillars).toHaveLength(5);
    expect(compassFull?.factorPillars?.reduce((s, p) => s + p.weightPct, 0)).toBe(100);
    expect(compassFull?.sectorRotation?.quadrant).toBe('Q2_REFLATION');
  });
});
