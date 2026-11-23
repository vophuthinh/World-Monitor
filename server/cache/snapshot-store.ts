import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CollectorId, SourceHealth, SourceHealthStatus } from '@shared/types';

export interface SnapshotEnvelope<T> {
  version: 1;
  id: CollectorId;
  data: T;
  itemCount: number;
  fetchedAt: number;
  retainedUntil: number;
  consecutiveFailures: number;
  firstFailureAt: number | null;
  lastAttemptAt: number;
  lastError: string | null;
}

export interface CollectorRegistration<T = unknown> {
  id: CollectorId;
  label: string;
  intervalMs: number;
  retainMs: number;
  retainExpiredForDiagnostics?: boolean;
  countItems: (data: T) => number;
  validate?: (data: T) => boolean;
}

interface FailureRecord {
  consecutiveFailures: number;
  firstFailureAt: number;
  lastAttemptAt: number;
  lastError: string;
}

const FORCE_REFRESH_COOLDOWN_MS = 10_000;

export class SnapshotStore {
  private readonly registrations = new Map<CollectorId, CollectorRegistration<any>>();
  private readonly snapshots = new Map<CollectorId, SnapshotEnvelope<any>>();
  private readonly diagnosticSnapshots = new Map<CollectorId, SnapshotEnvelope<unknown>>();
  private readonly bareFailures = new Map<CollectorId, FailureRecord>();
  private readonly inFlight = new Map<CollectorId, Promise<any>>();
  private readonly lastForceRefreshAt = new Map<CollectorId, number>();

  constructor(private readonly cacheDir: string) {}

  register<T>(config: CollectorRegistration<T>): void {
    this.registrations.set(config.id, config);
  }

  getRegistration(id: CollectorId): CollectorRegistration<any> | undefined {
    return this.registrations.get(id);
  }

  listRegistrations(): CollectorRegistration<any>[] {
    return [...this.registrations.values()];
  }

  async hydrateFromDisk(now = Date.now()): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true }).catch(() => {});

    await Promise.all(
      [...this.registrations.values()].map(async (reg) => {
        const filePath = this.filePathFor(reg.id);
        try {
          const raw = await readFile(filePath, 'utf8');
          const parsed = JSON.parse(raw) as SnapshotEnvelope<unknown>;
          if (
            parsed?.version === 1 &&
            parsed.id === reg.id &&
            Number.isSafeInteger(parsed.fetchedAt) &&
            parsed.fetchedAt > 0 &&
            Number.isSafeInteger(parsed.retainedUntil) &&
            (reg.validate ? reg.validate(parsed.data) : parsed.data !== null && parsed.data !== undefined)
          ) {
            if (reg.retainExpiredForDiagnostics) this.diagnosticSnapshots.set(reg.id, parsed);
            if (now < parsed.retainedUntil) this.snapshots.set(reg.id, parsed);
          }
        } catch {
          // Missing or corrupted cache file is safely ignored on cold boot
        }
      }),
    );
  }

  async refresh<T>(id: CollectorId, fetcher: () => Promise<T>, nowOverride?: number): Promise<T | null> {
    const reg = this.registrations.get(id) as CollectorRegistration<T> | undefined;
    if (!reg) {
      throw new Error(`Collector "${id}" is not registered in SnapshotStore`);
    }

    const existingPromise = this.inFlight.get(id) as Promise<T | null> | undefined;
    if (existingPromise) {
      return existingPromise;
    }

    const task = this.executeRefresh(reg, fetcher, nowOverride).finally(() => {
      this.inFlight.delete(id);
    });

    this.inFlight.set(id, task);
    return task;
  }

  get<T>(id: CollectorId, now = Date.now()): T | null {
    const snap = this.snapshots.get(id) as SnapshotEnvelope<T> | undefined;
    if (!snap) return null;
    if (now >= snap.retainedUntil) {
      return null;
    }
    return snap.data;
  }

  getDiagnosticSnapshot<T>(id: CollectorId): T | null {
    return (this.diagnosticSnapshots.get(id)?.data as T | undefined) ?? null;
  }

  set<T>(
    id: CollectorId,
    data: T,
    retainMs: number,
    itemCount = 1,
    now = Date.now(),
  ): void {
    const envelope: SnapshotEnvelope<T> = {
      version: 1,
      id,
      data,
      itemCount,
      fetchedAt: now,
      retainedUntil: now + retainMs,
      consecutiveFailures: 0,
      firstFailureAt: null,
      lastAttemptAt: now,
      lastError: null,
    };
    this.snapshots.set(id, envelope);
    if (this.registrations.get(id)?.retainExpiredForDiagnostics) {
      this.diagnosticSnapshots.set(id, envelope);
    }
    this.bareFailures.delete(id);
  }

  getHealth(id: CollectorId, now = Date.now()): SourceHealth | null {
    const reg = this.registrations.get(id);
    if (!reg) return null;

    const snap = this.snapshots.get(id);
    const bareFail = this.bareFailures.get(id);

    if (snap && now < snap.retainedUntil) {
      const status: SourceHealthStatus = snap.consecutiveFailures > 0 ? 'stale' : 'ok';
      return {
        id: reg.id,
        label: reg.label,
        status,
        itemCount: snap.itemCount,
        intervalMs: reg.intervalMs,
        retainMs: reg.retainMs,
        lastSuccessAt: snap.fetchedAt,
        lastAttemptAt: snap.lastAttemptAt,
        retainedUntil: snap.retainedUntil,
        consecutiveFailures: snap.consecutiveFailures,
        firstFailureAt: snap.firstFailureAt,
        lastError: snap.lastError,
      };
    }

    if (snap && now >= snap.retainedUntil) {
      return {
        id: reg.id,
        label: reg.label,
        status: 'error',
        itemCount: 0,
        intervalMs: reg.intervalMs,
        retainMs: reg.retainMs,
        lastSuccessAt: snap.fetchedAt,
        lastAttemptAt: bareFail?.lastAttemptAt ?? snap.lastAttemptAt,
        retainedUntil: snap.retainedUntil,
        consecutiveFailures: Math.max(1, bareFail?.consecutiveFailures ?? snap.consecutiveFailures),
        firstFailureAt: bareFail?.firstFailureAt ?? snap.firstFailureAt,
        lastError: bareFail?.lastError ?? snap.lastError ?? 'Snapshot retention window expired',
      };
    }

    if (bareFail) {
      return {
        id: reg.id,
        label: reg.label,
        status: 'error',
        itemCount: 0,
        intervalMs: reg.intervalMs,
        retainMs: reg.retainMs,
        lastSuccessAt: null,
        lastAttemptAt: bareFail.lastAttemptAt,
        retainedUntil: null,
        consecutiveFailures: bareFail.consecutiveFailures,
        firstFailureAt: bareFail.firstFailureAt,
        lastError: bareFail.lastError,
      };
    }

    return {
      id: reg.id,
      label: reg.label,
      status: 'warming',
      itemCount: 0,
      intervalMs: reg.intervalMs,
      retainMs: reg.retainMs,
      lastSuccessAt: null,
      lastAttemptAt: null,
      retainedUntil: null,
      consecutiveFailures: 0,
      firstFailureAt: null,
      lastError: null,
    };
  }

  getAllHealth(now = Date.now()): SourceHealth[] {
    return [...this.registrations.keys()]
      .map((id) => this.getHealth(id, now))
      .filter((h): h is SourceHealth => h !== null);
  }

  tryClaimForceRefresh(
    id: CollectorId,
    now = Date.now(),
  ): { allowed: boolean; retryAfterMs: number } {
    const prev = this.lastForceRefreshAt.get(id);
    if (prev !== undefined && now - prev < FORCE_REFRESH_COOLDOWN_MS) {
      return {
        allowed: false,
        retryAfterMs: FORCE_REFRESH_COOLDOWN_MS - (now - prev),
      };
    }
    this.lastForceRefreshAt.set(id, now);
    return { allowed: true, retryAfterMs: 0 };
  }

  private async executeRefresh<T>(
    reg: CollectorRegistration<T>,
    fetcher: () => Promise<T>,
    nowOverride?: number,
  ): Promise<T | null> {
    const previous = this.snapshots.get(reg.id) as SnapshotEnvelope<T> | undefined;

    try {
      const value = await fetcher();
      const now = nowOverride ?? Date.now();
      const isValid = reg.validate ? reg.validate(value) : value !== null && value !== undefined;
      if (!isValid) {
        throw new Error(`Validation failed for collector "${reg.id}"`);
      }

      const envelope: SnapshotEnvelope<T> = {
        version: 1,
        id: reg.id,
        data: value,
        itemCount: reg.countItems(value),
        fetchedAt: now,
        retainedUntil: now + reg.retainMs,
        consecutiveFailures: 0,
        firstFailureAt: null,
        lastAttemptAt: now,
        lastError: null,
      };

      this.snapshots.set(reg.id, envelope);
      if (reg.retainExpiredForDiagnostics) this.diagnosticSnapshots.set(reg.id, envelope);
      this.bareFailures.delete(reg.id);
      await this.persistAtomically(reg.id, envelope);
      return value;
    } catch (error) {
      const now = nowOverride ?? Date.now();
      const errMessage = error instanceof Error ? error.message : String(error);

      // selectSourceSnapshot invariant: retain previous valid snapshot without renewing fetchedAt/retainedUntil
      const usablePrevious =
        previous?.version === 1 &&
        Number.isSafeInteger(previous.fetchedAt) &&
        previous.fetchedAt > 0 &&
        previous.fetchedAt <= now &&
        Number.isSafeInteger(previous.retainedUntil) &&
        now < previous.retainedUntil &&
        previous.retainedUntil <= previous.fetchedAt + reg.retainMs;

      if (usablePrevious && previous) {
        const priorFailures =
          Number.isSafeInteger(previous.consecutiveFailures) &&
          previous.consecutiveFailures > 0 &&
          previous.firstFailureAt !== null &&
          previous.firstFailureAt >= previous.fetchedAt &&
          previous.firstFailureAt <= now
            ? previous.consecutiveFailures
            : 0;

        const retainedEnvelope: SnapshotEnvelope<T> = {
          ...previous,
          consecutiveFailures: Math.min(priorFailures + 1, 100),
          firstFailureAt: priorFailures > 0 ? previous.firstFailureAt : now,
          lastAttemptAt: now,
          lastError: errMessage,
        };

        this.snapshots.set(reg.id, retainedEnvelope);
        await this.persistAtomically(reg.id, retainedEnvelope);
        return retainedEnvelope.data;
      }

      // Expired or never-succeeded collector
      if (previous && now >= previous.retainedUntil) {
        this.snapshots.delete(reg.id);
      }
      const prevBare = this.bareFailures.get(reg.id);
      const priorCount = prevBare?.consecutiveFailures ?? (previous?.consecutiveFailures ?? 0);
      this.bareFailures.set(reg.id, {
        consecutiveFailures: Math.min(priorCount + 1, 100),
        firstFailureAt: prevBare?.firstFailureAt ?? previous?.firstFailureAt ?? now,
        lastAttemptAt: now,
        lastError: errMessage,
      });

      return null;
    }
  }

  private filePathFor(id: CollectorId): string {
    return join(this.cacheDir, `${id}.json`);
  }

  private async persistAtomically(id: CollectorId, envelope: SnapshotEnvelope<any>): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const finalPath = this.filePathFor(id);
      const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmpPath, JSON.stringify(envelope), 'utf8');
      await rename(tmpPath, finalPath);
    } catch (err) {
      console.warn(`[snapshot-store] Failed to persist ${id}:`, (err as Error)?.message);
    }
  }
}
