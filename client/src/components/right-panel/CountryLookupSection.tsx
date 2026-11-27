import { useState, type FormEvent } from 'react';
import type { CountryReference } from '@shared/types';

export function CountryLookupSection() {
  const [query, setQuery] = useState('');
  const [countries, setCountries] = useState<CountryReference[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setCountries(null);
    try {
      const response = await fetch(`/api/countries?${new URLSearchParams({ q: query.trim() })}`);
      const data = await response.json() as { countries?: CountryReference[]; error?: string };
      if (!response.ok || !Array.isArray(data.countries)) throw new Error(data.error ?? 'Không thể tra cứu quốc gia.');
      setCountries(data.countries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tra cứu quốc gia.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded border border-slate-800 bg-[#0d1524] p-2.5">
      <h2 className="font-mono text-xs font-semibold tracking-wider text-slate-200">TRA CỨU QUỐC GIA · REST COUNTRIES</h2>
      <form onSubmit={search} className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="country-search">Tên quốc gia</label>
        <input id="country-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={80}
          placeholder="Tên quốc gia, ví dụ Vietnam" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[13px] text-slate-100" />
        <button type="submit" disabled={loading || query.trim().length < 2}
          className="rounded border border-sky-600 px-2 py-1 text-[13px] text-sky-200 disabled:opacity-50">
          {loading ? 'Đang tìm…' : 'Tìm'}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-[13px] text-amber-300">{error}</p>}
      {countries && countries.length === 0 && <p className="mt-2 text-[13px] text-slate-400">Không tìm thấy quốc gia.</p>}
      {countries && countries.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] text-slate-300">
          {countries.map((country) => (
            <li key={country.code} className="rounded border border-slate-800 p-1.5">
              <strong>{country.name} ({country.code})</strong>
              <div>Thủ đô: {country.capital ?? 'Không rõ'} · Khu vực: {country.region ?? 'Không rõ'}</div>
              <div>Dân số: {country.population?.toLocaleString('vi-VN') ?? 'Không rõ'} · Tiền tệ: {country.currencies.join(', ') || 'Không rõ'}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
