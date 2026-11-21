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

function pickLatestByCountry(rawPayload: unknown): Map<string, { value: number; year: number }> {
  const result = new Map<string, { value: number; year: number }>();
  if (!Array.isArray(rawPayload) || rawPayload.length < 2 || !Array.isArray(rawPayload[1])) {
    return result;
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
      const existing = result.get(key);
      if (!existing || year > existing.year) {
        result.set(key, { value: val, year });
      }
    }
  }

  return result;
}

export function normalizeWorldBankIndicators(
  gdpGrowthRaw: unknown,
  gdpCurrentRaw: unknown,
  cpiRaw: unknown,
): MacroCountryIndicator[] {
  const growthMap = pickLatestByCountry(gdpGrowthRaw);
  const currentMap = pickLatestByCountry(gdpCurrentRaw);
  const cpiMap = pickLatestByCountry(cpiRaw);

  return TARGET_ECONOMIES.map((econ) => {
    const growth = growthMap.get(econ.iso3) ?? growthMap.get(econ.iso2);
    const current = currentMap.get(econ.iso3) ?? currentMap.get(econ.iso2);
    const cpi = cpiMap.get(econ.iso3) ?? cpiMap.get(econ.iso2);

    return {
      countryCode: econ.iso3,
      countryName: econ.name,
      regionLabel: econ.regionLabel,
      isVietnam: econ.isVietnam,
      gdpGrowthPct: growth ? Number(growth.value.toFixed(2)) : null,
      gdpGrowthYear: growth ? growth.year : null,
      gdpCurrentUsd: current ? Math.round(current.value) : null,
      gdpCurrentYear: current ? current.year : null,
      cpiInflationPct: cpi ? Number(cpi.value.toFixed(2)) : null,
      cpiYear: cpi ? cpi.year : null,
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
  const [growthRes, currentRes, cpiRes] = await Promise.all([
    fetchIndicator('NY.GDP.MKTP.KD.ZG'),
    fetchIndicator('NY.GDP.MKTP.CD'),
    fetchIndicator('FP.CPI.TOTL.ZG'),
  ]);

  const normalized = normalizeWorldBankIndicators(growthRes, currentRes, cpiRes);
  const populatedCount = normalized.filter(
    (row) => row.gdpGrowthPct !== null || row.gdpCurrentUsd !== null || row.cpiInflationPct !== null,
  ).length;

  if (populatedCount === 0) {
    throw new Error('World Bank macro returned zero populated country records');
  }
  return normalized;
}
