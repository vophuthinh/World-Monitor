import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { evaluateInvestmentCompass, evaluateMacroHealth } from '@shared/macro-health';
import type {
  MacroCountryIndicator,
  MarketSnapshot,
  PredictionItem,
  RegimeHistoryPoint,
} from '@shared/types';

const MAX_HISTORY_DAYS = 90;

function formatVnDate(tsMs: number): string {
  const vnMs = tsMs + 7 * 3_600_000;
  return new Date(vnMs).toISOString().slice(0, 10);
}

/**
 * Reconstructs up to 10 historical trading sessions from actual FRED & Index sparklines
 * on initial bootstrap so the 30–90d Regime Timeline immediately shows true recent trajectory,
 * while every subsequent day is appended natively up to 90 days.
 */
export function backfillRecentRegimeHistory(
  markets: MarketSnapshot,
  macro: MacroCountryIndicator[],
  predictions: PredictionItem[],
  nowMs = Date.now(),
): RegimeHistoryPoint[] {
  const vni = markets.quotes.find((q) => q.symbol === 'VN-Index');
  const spx = markets.quotes.find((q) => q.symbol === 'S&P 500');
  const sparkLen = Math.min(
    10,
    Math.max(vni?.sparkline?.length ?? 0, spx?.sparkline?.length ?? 0),
  );
  if (sparkLen < 3) return [];

  const points: RegimeHistoryPoint[] = [];
  for (let offset = sparkLen - 1; offset >= 1; offset--) {
    const dayMs = nowMs - offset * 86_400_000;
    const dateStr = formatVnDate(dayMs);

    const historicalQuotes = markets.quotes.map((q) => {
      if (!q.sparkline || q.sparkline.length <= offset) return q;
      const idx = q.sparkline.length - 1 - offset;
      const histPrice = q.sparkline[idx];
      const prevPrice = idx > 0 ? q.sparkline[idx - 1] : histPrice;
      const chgPct = prevPrice > 0 ? Number((((histPrice - prevPrice) / prevPrice) * 100).toFixed(2)) : 0;
      const scaleRatio = q.price > 0 ? histPrice / q.price : 1;
      return {
        ...q,
        price: histPrice,
        changePercent24h: chgPct,
        ...(q.peRatio ? { peRatio: Number((q.peRatio * scaleRatio).toFixed(2)) } : {}),
      };
    });

    const historicalFred = (markets.fred ?? []).map((f) => {
      if (!f.sparkline || f.sparkline.length <= offset) return f;
      const idx = Math.max(0, f.sparkline.length - 1 - Math.floor(offset / 2));
      return {
        ...f,
        value: f.sparkline[idx],
      };
    });

    const histSnap: MarketSnapshot = {
      ...markets,
      quotes: historicalQuotes,
      fred: historicalFred,
      macro,
    };

    const health = evaluateMacroHealth(histSnap, predictions);
    const compass = evaluateInvestmentCompass(histSnap, predictions);
    if (!compass) continue;

    const eqSlice = compass.allocations.find((a) => a.id === 'equities')?.weightPct ?? 50;
    const histVni = historicalQuotes.find((q) => q.symbol === 'VN-Index');

    points.push({
      date: dateStr,
      vnMacroScore: health.vn?.compositeScore ?? 70,
      usMacroScore: health.us?.compositeScore ?? 68,
      compassScore: compass.riskAppetiteScore,
      ...(histVni ? { vnIndexPrice: histVni.price } : {}),
      ...(histVni?.peRatio ? { vnIndexPe: histVni.peRatio } : {}),
      ...(health.vn?.quadrant ? { quadrant: health.vn.quadrant } : {}),
      stance: compass.stance,
      equitiesWeightPct: eqSlice,
    });
  }

  return points;
}

export class RegimeHistoryLedger {
  private readonly filePath: string;
  private entries: RegimeHistoryPoint[] = [];

  constructor(cacheDir: string) {
    this.filePath = resolve(cacheDir, 'regime-history.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown;
      if (Array.isArray(raw)) {
        this.entries = raw
          .filter(
            (r): r is RegimeHistoryPoint =>
              Boolean(r && typeof r.date === 'string' && typeof r.compassScore === 'number'),
          )
          .slice(-MAX_HISTORY_DAYS);
      }
    } catch {
      this.entries = [];
    }
  }

  private persistToDisk(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch {
      // Non-fatal disk write error
    }
  }

  recordSnapshot(
    markets: MarketSnapshot | null | undefined,
    macro: MacroCountryIndicator[],
    predictions: PredictionItem[],
    nowMs = Date.now(),
  ): RegimeHistoryPoint[] {
    if (!markets || markets.quotes.length === 0) {
      return this.getHistory();
    }

    const fullSnap: MarketSnapshot = { ...markets, macro };
    const health = evaluateMacroHealth(fullSnap, predictions);
    const compass = evaluateInvestmentCompass(fullSnap, predictions);
    if (!compass) return this.getHistory();

    // Seed historical trajectory if ledger has fewer than 3 days recorded
    if (this.entries.length < 3) {
      const seeded = backfillRecentRegimeHistory(markets, macro, predictions, nowMs);
      const byDate = new Map<string, RegimeHistoryPoint>();
      for (const p of seeded) byDate.set(p.date, p);
      for (const p of this.entries) byDate.set(p.date, p);
      this.entries = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    }

    const todayStr = formatVnDate(nowMs);
    const vni = markets.quotes.find((q) => q.symbol === 'VN-Index');
    const eqSlice = compass.allocations.find((a) => a.id === 'equities')?.weightPct ?? 50;

    const todayPoint: RegimeHistoryPoint = {
      date: todayStr,
      vnMacroScore: health.vn?.compositeScore ?? 70,
      usMacroScore: health.us?.compositeScore ?? 68,
      compassScore: compass.riskAppetiteScore,
      ...(vni ? { vnIndexPrice: vni.price } : {}),
      ...(vni?.peRatio ? { vnIndexPe: vni.peRatio } : {}),
      ...(health.vn?.quadrant ? { quadrant: health.vn.quadrant } : {}),
      stance: compass.stance,
      equitiesWeightPct: eqSlice,
    };

    const existingIdx = this.entries.findIndex((e) => e.date === todayStr);
    if (existingIdx >= 0) {
      this.entries[existingIdx] = todayPoint;
    } else {
      this.entries.push(todayPoint);
      this.entries.sort((a, b) => a.date.localeCompare(b.date));
    }

    if (this.entries.length > MAX_HISTORY_DAYS) {
      this.entries = this.entries.slice(-MAX_HISTORY_DAYS);
    }

    this.persistToDisk();
    return this.getHistory();
  }

  getHistory(): RegimeHistoryPoint[] {
    return [...this.entries];
  }
}
