import { fetchJsonWithTimeout } from '../lib/http';
import type { CountryReference } from '@shared/types';

interface CountryPayload {
  data?: {
    _demo?: unknown;
    objects?: Array<{
      names?: { common?: unknown };
      codes?: { alpha_3?: unknown };
      capitals?: Array<{ name?: unknown }>;
      region?: unknown;
      population?: unknown;
      currencies?: Array<{ code?: unknown }>;
    }>;
  };
}

const cache = new Map<string, { expiresAt: number; results: CountryReference[] }>();
const CACHE_TTL_MS = 24 * 3_600_000;
let calls: number[] = [];

export async function searchCountries(query: string, now = Date.now()): Promise<CountryReference[]> {
  const key = query.toLocaleLowerCase('en-US');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.results;
  const token = process.env.RESTCOUNTRIES_API_KEY?.trim();
  if (!token) throw new Error('Chưa cấu hình RESTCOUNTRIES_API_KEY trên máy chủ.');
  calls = calls.filter((t) => t > now - 86_400_000);
  if (calls.length >= 30) throw new Error('Đã đạt giới hạn tra cứu quốc gia trong 24 giờ.');
  calls.push(now);
  const params = new URLSearchParams({ q: query, limit: '10', response_fields: 'names.common,codes.alpha_3,capitals,region,population,currencies.code' });
  const payload = await fetchJsonWithTimeout<CountryPayload>(`https://api.restcountries.com/countries/v5?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, timeoutMs: 8_000, retries: 0,
  });
  if (payload.data?._demo) throw new Error('REST Countries demo data cannot be used for live searches.');
  if (!Array.isArray(payload.data?.objects)) throw new Error('REST Countries trả về dữ liệu không hợp lệ.');
  const results: CountryReference[] = payload.data.objects.flatMap((item) => {
    if (typeof item.names?.common !== 'string' || typeof item.codes?.alpha_3 !== 'string') return [];
    return [{
      name: item.names.common,
      code: item.codes.alpha_3,
      capital: typeof item.capitals?.[0]?.name === 'string' ? item.capitals[0].name : undefined,
      region: typeof item.region === 'string' ? item.region : undefined,
      population: typeof item.population === 'number' && Number.isFinite(item.population) && item.population >= 0 ? item.population : undefined,
      currencies: (item.currencies ?? []).flatMap((currency) => typeof currency.code === 'string' ? [currency.code] : []),
    }];
  });
  if (payload.data.objects.length && !results.length) throw new Error('REST Countries trả về dữ liệu quốc gia không hợp lệ.');
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, results });
  return results;
}
