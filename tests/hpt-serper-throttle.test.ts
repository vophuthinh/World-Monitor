import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

it('throttles Serper after empty results and errors, including across module reloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wm-serper-'));
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T00:00:00Z'));
  vi.stubEnv('SERPER_API_KEY', 'test-key');
  vi.stubEnv('SEARXNG_BASE_URL', 'off');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  let serperCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address.includes('google.serper.dev')) {
      serperCalls += 1;
      return serperCalls === 1
        ? new Response(JSON.stringify({ organic: [] }), { status: 200 })
        : new Response('unavailable', { status: 503 });
    }
    if (address.includes('dchart-api.vndirect.com.vn')) {
      return new Response(JSON.stringify({ c: [10] }), { status: 200 });
    }
    return new Response('unavailable', { status: 503 });
  }));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const load = async () => {
    vi.resetModules();
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      return await import('../server/collectors/hpt-company-intel');
    } finally {
      cwd.mockRestore();
    }
  };
  try {
    let collector = await load();
    await collector.fetchHptCompanyIntelligence();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    collector = await load();
    await collector.fetchHptCompanyIntelligence();
    expect(serperCalls).toBe(1);
    vi.setSystemTime(Date.now() + 55 * 60_000);
    await collector.fetchHptCompanyIntelligence();
    expect(serperCalls).toBe(2);
    vi.setSystemTime(Date.now() + 5 * 60_000);
    collector = await load();
    await collector.fetchHptCompanyIntelligence();
    expect(serperCalls).toBe(2);
    expect(warn).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each(['failure', 'empty'])('does not renew HPT from an expired Serper slot after %s', async (outcome) => {
  const dir = mkdtempSync(join(tmpdir(), 'wm-serper-stale-'));
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T00:00:00Z'));
  vi.stubEnv('SERPER_API_KEY', 'test-key');
  vi.stubEnv('SEARXNG_BASE_URL', 'off');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  let outage = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address.includes('google.serper.dev')) {
      return outage
        ? outcome === 'failure'
          ? new Response('unavailable', { status: 503 })
          : new Response(JSON.stringify({ organic: [] }), { status: 200 })
        : new Response(JSON.stringify({ organic: [{
          title: 'UIT ký kết hợp tác cùng Công nghệ Tin học HPT',
          link: 'https://www.facebook.com/UIT.Fanpage/posts/1515918327240833/',
          snippet: 'Trường ĐH CNTT ký kết cùng Công nghệ Tin học HPT.',
        }] }), { status: 200 });
    }
    if (address.includes('dchart-api.vndirect.com.vn')) {
      return new Response(JSON.stringify({ c: outage ? [] : [10] }), { status: 200 });
    }
    return new Response('unavailable', { status: 503 });
  }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.resetModules();
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  try {
    const collector = await import('../server/collectors/hpt-company-intel');
    cwd.mockRestore();
    const previous = await collector.fetchHptCompanyIntelligence();
    expect(previous.items).toHaveLength(1);
    outage = true;
    vi.setSystemTime(Date.now() + 61 * 60_000);
    await expect(collector.fetchHptCompanyIntelligence(previous)).rejects.toThrow('sources failed');
  } finally {
    cwd.mockRestore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each(['failure', 'empty'])('throttles SearXNG and CSE after %s results', async (outcome) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T00:00:00Z'));
  vi.stubEnv('SERPER_API_KEY', '');
  vi.stubEnv('SEARXNG_BASE_URL', 'http://127.0.0.1:8888');
  vi.stubEnv('GOOGLE_CSE_API_KEY', 'test-key');
  vi.stubEnv('GOOGLE_CSE_CX', 'test-cx');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  let searx = 0;
  let cse = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address.includes('127.0.0.1:8888') || address.includes('googleapis.com/customsearch')) {
      if (address.includes('127.0.0.1:8888')) searx += 1;
      else cse += 1;
      return outcome === 'failure'
        ? new Response('unavailable', { status: 404 })
        : new Response(JSON.stringify({ results: [], items: [] }), { status: 200 });
    }
    if (address.includes('dchart-api.vndirect.com.vn')) return new Response(JSON.stringify({ c: [10] }), { status: 200 });
    return new Response('unavailable', { status: 404 });
  }));
  vi.resetModules();
  try {
    const collector = await import('../server/collectors/hpt-company-intel');
    await collector.fetchHptCompanyIntelligence();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await collector.fetchHptCompanyIntelligence();
    expect([searx, cse]).toEqual([1, 1]);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await collector.fetchHptCompanyIntelligence();
    expect([searx, cse]).toEqual([2, 1]);
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await collector.fetchHptCompanyIntelligence();
    expect([searx, cse]).toEqual([2, 2]);
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it('labels Simplize reference price without inventing trading change or volume', async () => {
  vi.stubEnv('SEARXNG_BASE_URL', 'off');
  vi.stubEnv('SERPER_API_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('api2.simplize.vn')
    ? new Response(JSON.stringify({ data: { priceReferrance: 24500 } }), { status: 200 })
    : new Response('unavailable', { status: 404 })));
  try {
    const collector = await import('../server/collectors/hpt-company-intel');
    const snapshot = await collector.fetchHptCompanyIntelligence();
    expect(snapshot.stock).toMatchObject({ priceThousandVnd: 24.5, priceKind: 'reference' });
    expect(snapshot.stock?.changePercent).toBeUndefined();
    expect(snapshot.stock?.volume).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
