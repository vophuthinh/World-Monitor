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
        // Keep strictly genuine observed daily snapshots (discard any legacy unverified/reconstructed rows)
        this.entries = raw
          .filter(
            (r): r is RegimeHistoryPoint =>
              Boolean(
                r &&
                  typeof r.date === 'string' &&
                  typeof r.compassScore === 'number' &&
                  r.reconstructed !== true &&
                  typeof r.observedAt === 'number',
              ),
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
    const health = evaluateMacroHealth(fullSnap, predictions, nowMs);
    const compass = evaluateInvestmentCompass(fullSnap, predictions, nowMs);
    if (!compass) return this.getHistory();

    const todayStr = formatVnDate(nowMs);
    const vni = markets.quotes.find((q) => q.symbol === 'VN-Index');
    const eqSlice = compass.allocations.find((a) => a.id === 'equities')?.weightPct ?? 50;

    const todayPoint: RegimeHistoryPoint = {
      date: todayStr,
      ...(health.vn ? { vnMacroScore: health.vn.compositeScore } : {}),
      ...(health.us ? { usMacroScore: health.us.compositeScore } : {}),
      compassScore: compass.riskAppetiteScore,
      ...(vni ? { vnIndexPrice: vni.price } : {}),
      ...(vni?.peRatio ? { vnIndexPe: vni.peRatio } : {}),
      ...(health.vn?.quadrant ? { quadrant: health.vn.quadrant } : {}),
      stance: compass.stance,
      equitiesWeightPct: eqSlice,
      reconstructed: false,
      observedAt: nowMs,
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
