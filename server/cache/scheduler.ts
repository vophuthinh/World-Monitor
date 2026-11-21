import type { CollectorId } from '@shared/types';
import type { CollectorRegistration, SnapshotStore } from './snapshot-store';

export interface ManagedCollector<T = unknown> extends CollectorRegistration<T> {
  fetcher: (previous: T | null) => Promise<T>;
}

export type CollectorSyncHook = (id: CollectorId, data: unknown) => void;

export class CollectorScheduler {
  private readonly collectors = new Map<CollectorId, ManagedCollector<any>>();
  private readonly timers = new Map<CollectorId, ReturnType<typeof setInterval>>();
  private running = false;

  constructor(
    private readonly store: SnapshotStore,
    private readonly onSync?: CollectorSyncHook,
  ) {}

  registerCollector<T>(collector: ManagedCollector<T>): void {
    this.store.register(collector);
    this.collectors.set(collector.id, collector);
  }

  getStore(): SnapshotStore {
    return this.store;
  }

  hasCollector(id: string): id is CollectorId {
    return this.collectors.has(id as CollectorId);
  }

  async refreshCollector(id: CollectorId): Promise<unknown> {
    const collector = this.collectors.get(id);
    if (!collector) {
      throw new Error(`Unknown collector: ${id}`);
    }
    const previous = this.store.get(id);
    const updated = await this.store.refresh(id, () => collector.fetcher(previous));
    if (updated !== null && this.onSync) {
      this.onSync(id, updated);
    }
    return updated;
  }

  startAll(options: { runImmediately?: boolean } = {}): void {
    if (this.running) return;
    this.running = true;
    const { runImmediately = true } = options;

    for (const collector of this.collectors.values()) {
      if (runImmediately) {
        const existing = this.store.get(collector.id);
        const health = this.store.getHealth(collector.id);
        const isFreshEnough =
          existing !== null &&
          health?.lastSuccessAt !== null &&
          health?.lastSuccessAt !== undefined &&
          Date.now() - health.lastSuccessAt < collector.intervalMs;

        if (!isFreshEnough) {
          void this.refreshCollector(collector.id);
        }
      }

      const timer = setInterval(() => {
        void this.refreshCollector(collector.id);
      }, collector.intervalMs);

      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      this.timers.set(collector.id, timer);
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.running = false;
  }
}
