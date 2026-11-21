import type { NewsItem } from '@shared/types';
import { NAMED_APP_UA, fetchJsonWithTimeout } from './http';

const VIETNAMESE_DIACRITIC_RE =
  /[ăâđêôơưảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export function isLikelyVietnamese(text: string): boolean {
  return VIETNAMESE_DIACRITIC_RE.test(text);
}

export function parseGoogleGtxResponse(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return '';
  }
  const segments = payload[0] as unknown[];
  const parts: string[] = [];
  for (const seg of segments) {
    if (Array.isArray(seg) && typeof seg[0] === 'string') {
      parts.push(seg[0]);
    }
  }
  return parts.join('').trim();
}

async function fetchSingleGtxTranslation(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
  const json = await fetchJsonWithTimeout<unknown>(url, {
    timeoutMs: 6_500,
    retries: 0,
    userAgent: NAMED_APP_UA,
  });
  return parseGoogleGtxResponse(json) || text;
}

async function defaultBatchTranslateToVi(lines: string[]): Promise<string[]> {
  if (lines.length === 0) return [];
  if (lines.length === 1) {
    return [await fetchSingleGtxTranslation(lines[0])];
  }

  const joined = lines.join('\n');
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(joined)}`;
  const json = await fetchJsonWithTimeout<unknown>(url, {
    timeoutMs: 7_500,
    retries: 0,
    userAgent: NAMED_APP_UA,
  });
  const combined = parseGoogleGtxResponse(json);
  const split = combined.split('\n').map((s) => s.trim());

  if (split.length === lines.length && split.every((s) => s.length > 0)) {
    return split;
  }

  // Fallback to individual translation when line breaks shifted
  return Promise.all(
    lines.map(async (line) => {
      try {
        return await fetchSingleGtxTranslation(line);
      } catch {
        return line;
      }
    }),
  );
}

export type BatchTranslateFn = (texts: string[]) => Promise<string[]>;

export class VietnamTranslator {
  private readonly cache = new Map<string, string>();
  private readonly maxCacheEntries = 3_500;

  constructor(private readonly batchTranslateFn: BatchTranslateFn = defaultBatchTranslateToVi) {}

  async translateBatch(texts: readonly string[]): Promise<string[]> {
    const cleaned = texts.map((t) => t.replace(/\s+/g, ' ').trim());
    const results = new Array<string>(cleaned.length);
    const pendingIndices: number[] = [];
    const pendingUnique = new Map<string, number[]>();

    for (let i = 0; i < cleaned.length; i++) {
      const text = cleaned[i];
      if (!text || isLikelyVietnamese(text)) {
        results[i] = text;
        continue;
      }
      const cached = this.cache.get(text);
      if (cached !== undefined) {
        results[i] = cached;
        continue;
      }
      const group = pendingUnique.get(text);
      if (group) {
        group.push(i);
      } else {
        pendingUnique.set(text, [i]);
        pendingIndices.push(i);
      }
    }

    if (pendingUnique.size === 0) {
      return results;
    }

    const uniqueTexts = [...pendingUnique.keys()];
    const chunkSize = 12;

    for (let offset = 0; offset < uniqueTexts.length; offset += chunkSize) {
      const chunk = uniqueTexts.slice(offset, offset + chunkSize);
      let translatedChunk: string[];
      try {
        translatedChunk = await this.batchTranslateFn(chunk);
      } catch {
        translatedChunk = chunk;
      }

      for (let j = 0; j < chunk.length; j++) {
        const orig = chunk[j];
        const vi = (translatedChunk[j] ?? orig).trim() || orig;
        this.remember(orig, vi);
        const indices = pendingUnique.get(orig) ?? [];
        for (const idx of indices) {
          results[idx] = vi;
        }
      }
    }

    return results;
  }

  async enrichNewsItems(items: readonly NewsItem[]): Promise<NewsItem[]> {
    if (items.length === 0) return [];
    const titles = items.map((item) => item.title);
    const translated = await this.translateBatch(titles);
    return items.map((item, idx) => ({
      ...item,
      titleVi: translated[idx] || item.titleVi || item.title,
    }));
  }

  private remember(key: string, val: string): void {
    this.cache.set(key, val);
    if (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}

export const globalViTranslator = new VietnamTranslator();
