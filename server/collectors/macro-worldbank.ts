import type { MacroCountryIndicator } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from '../lib/http';

const WB_COUNTRY_QUERY = 'US;CN;XC;JP;DE;IN;VN;SG';

const TARGET_ECONOMIES: ReadonlyArray<{
  iso3: string;
  iso2: string;
  name: string;
  regionLabel: string;
  isVietnam?: boolean;
}> = [
  { iso3: 'VNM', iso2: 'VN', name: 'Việt Nam', regionLabel: 'ASEAN', isVietnam: true },
  { iso3: 'USA', iso2: 'US', name: 'Hoa Kỳ', regionLabel: 'Bắc Mỹ' },
  { iso3: 'CHN', iso2: 'CN', name: 'Trung Quốc', regionLabel: 'Đông Á' },
  { iso3: 'EMU', iso2: 'XC', name: 'Khu vực Euro', regionLabel: 'Châu Âu' },
  { iso3: 'JPN', iso2: 'JP', name: 'Nhật Bản', regionLabel: 'Đông Á' },
  { iso3: 'DEU', iso2: 'DE', name: 'Đức', regionLabel: 'Châu Âu' },
  { iso3: 'IND', iso2: 'IN', name: 'Ấn Độ', regionLabel: 'Nam Á' },
  { iso3: 'SGP', iso2: 'SG', name: 'Singapore', regionLabel: 'ASEAN' },
];

interface WorldBankRecord {
  countryiso3code?: string;
  country?: { id?: string; value?: string };
  date?: string;
  value?: number | null;
}

interface CountryHistoryPoint {
  value: number;
  year: number;
  prevValue?: number;
}

function pickLatestAndPrevByCountry(rawPayload: unknown): Map<string, CountryHistoryPoint> {
  const byCountry = new Map<string, Array<{ year: number; value: number }>>();
  if (!Array.isArray(rawPayload) || rawPayload.length < 2 || !Array.isArray(rawPayload[1])) {
    return new Map();
  }

  const rows = rawPayload[1] as WorldBankRecord[];
  for (const row of rows) {
    if (row?.value === null || row?.value === undefined || !Number.isFinite(Number(row.value))) {
      continue;
    }
    const year = parseInt(String(row.date ?? ''), 10);
    if (!Number.isFinite(year) || year <= 0) continue;

    const val = Number(row.value);
    const keys = [row.countryiso3code?.toUpperCase(), row.country?.id?.toUpperCase()].filter(
      (k): k is string => Boolean(k),
    );

    for (const key of keys) {
      const arr = byCountry.get(key) ?? [];
      if (!arr.some((p) => p.year === year)) {
        arr.push({ year, value: val });
      }
      byCountry.set(key, arr);
    }
  }

  const result = new Map<string, CountryHistoryPoint>();
  for (const [key, arr] of byCountry.entries()) {
    arr.sort((a, b) => b.year - a.year);
    if (arr.length > 0) {
      result.set(key, {
        value: arr[0].value,
        year: arr[0].year,
        prevValue: arr[1]?.value,
      });
    }
  }

  return result;
}

export interface WorldBankExtraRawBundle {
  manufacturingRaw?: unknown;
  exportsRaw?: unknown;
  fdiRaw?: unknown;
  unemploymentRaw?: unknown;
}

export function normalizeWorldBankIndicators(
  gdpGrowthRaw: unknown,
  gdpCurrentRaw: unknown,
  cpiRaw: unknown,
  extra: WorldBankExtraRawBundle = {},
): MacroCountryIndicator[] {
  const growthMap = pickLatestAndPrevByCountry(gdpGrowthRaw);
  const currentMap = pickLatestAndPrevByCountry(gdpCurrentRaw);
  const cpiMap = pickLatestAndPrevByCountry(cpiRaw);
  const manfMap = pickLatestAndPrevByCountry(extra.manufacturingRaw);
  const expMap = pickLatestAndPrevByCountry(extra.exportsRaw);
  const fdiMap = pickLatestAndPrevByCountry(extra.fdiRaw);
  const uemMap = pickLatestAndPrevByCountry(extra.unemploymentRaw);

  const pick = (m: Map<string, CountryHistoryPoint>, iso3: string, iso2: string) =>
    m.get(iso3) ?? m.get(iso2);

  return TARGET_ECONOMIES.map((econ) => {
    const growth = pick(growthMap, econ.iso3, econ.iso2);
    const current = pick(currentMap, econ.iso3, econ.iso2);
    const cpi = pick(cpiMap, econ.iso3, econ.iso2);
    const manf = pick(manfMap, econ.iso3, econ.iso2);
    const exp = pick(expMap, econ.iso3, econ.iso2);
    const fdi = pick(fdiMap, econ.iso3, econ.iso2);
    const uem = pick(uemMap, econ.iso3, econ.iso2);

    return {
      countryCode: econ.iso3,
      countryName: econ.name,
      regionLabel: econ.regionLabel,
      isVietnam: econ.isVietnam,
      gdpGrowthPct: growth ? Number(growth.value.toFixed(2)) : null,
      gdpPrevPct: growth?.prevValue !== undefined ? Number(growth.prevValue.toFixed(2)) : null,
      gdpGrowthYear: growth ? growth.year : null,
      gdpCurrentUsd: current ? Math.round(current.value) : null,
      gdpCurrentYear: current ? current.year : null,
      cpiInflationPct: cpi ? Number(cpi.value.toFixed(2)) : null,
      cpiPrevPct: cpi?.prevValue !== undefined ? Number(cpi.prevValue.toFixed(2)) : null,
      cpiYear: cpi ? cpi.year : null,
      manufacturingGrowthPct: manf ? Number(manf.value.toFixed(2)) : null,
      exportsPctGdp: exp ? Number(exp.value.toFixed(1)) : null,
      fdiPctGdp: fdi ? Number(fdi.value.toFixed(2)) : null,
      unemploymentPct: uem ? Number(uem.value.toFixed(2)) : null,
    };
  });
}

async function fetchIndicator(indicatorCode: string): Promise<unknown> {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 6;
  const url = `https://api.worldbank.org/v2/country/${WB_COUNTRY_QUERY}/indicator/${indicatorCode}?format=json&per_page=300&date=${startYear}:${currentYear}`;
  return fetchJsonWithTimeout<unknown>(url, {
    timeoutMs: 15_000,
    retries: 1,
    userAgent: NAMED_APP_UA,
  });
}

export async function fetchWorldBankMacro(): Promise<MacroCountryIndicator[]> {
  const [growthRes, currentRes, cpiRes, manfRes, expRes, fdiRes, uemRes] = await Promise.all([
    fetchIndicator('NY.GDP.MKTP.KD.ZG'),
    fetchIndicator('NY.GDP.MKTP.CD'),
    fetchIndicator('FP.CPI.TOTL.ZG'),
    fetchIndicator('NV.IND.MANF.KD.ZG').catch(() => null),
    fetchIndicator('NE.EXP.GNFS.ZS').catch(() => null),
    fetchIndicator('BX.KLT.DINV.WD.GD.ZS').catch(() => null),
    fetchIndicator('SL.UEM.TOTL.ZS').catch(() => null),
  ]);

  const normalized = normalizeWorldBankIndicators(growthRes, currentRes, cpiRes, {
    manufacturingRaw: manfRes,
    exportsRaw: expRes,
    fdiRaw: fdiRes,
    unemploymentRaw: uemRes,
  });
  const populatedCount = normalized.filter(
    (row) => row.gdpGrowthPct !== null || row.gdpCurrentUsd !== null || row.cpiInflationPct !== null,
  ).length;

  if (populatedCount === 0) {
    throw new Error('World Bank macro returned zero populated country records');
  }
  return normalized;
}
