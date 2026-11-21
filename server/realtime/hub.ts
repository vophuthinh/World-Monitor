import type { BreakingAlertItem, GeoPointFeature, RealtimeServerEvent } from '@shared/types';

export type RealtimeSubscriber = (event: RealtimeServerEvent) => void;

export class RealtimeHub {
  private readonly subscribers = new Set<RealtimeSubscriber>();
  private readonly seenAlertIds = new Set<string>();
  private seededInitial = new Set<string>();

  subscribe(listener: RealtimeSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  publish(event: RealtimeServerEvent): void {
    for (const listener of this.subscribers) {
      try {
        listener(event);
      } catch {
        // Isolate individual subscriber write errors
      }
    }
  }

  /**
   * Scans newly refreshed features and emits breaking_alert events for genuinely new
   * high/critical seismic, disaster, or strategic military aircraft detections.
   */
  ingestForAlerts(sourceKey: string, features: readonly GeoPointFeature[]): void {
    // First pass per source seeds known IDs so cold start doesn't flood toasts
    if (!this.seededInitial.has(sourceKey)) {
      this.seededInitial.add(sourceKey);
      for (const f of features) {
        this.seenAlertIds.add(f.id);
      }
      return;
    }

    for (const f of features) {
      if (this.seenAlertIds.has(f.id)) continue;
      this.seenAlertIds.add(f.id);

      const isCriticalQuake = f.layer === 'earthquakes' && (f.magnitude ?? 0) >= 5.2;
      const isCriticalDisaster = f.layer === 'natural' && f.severity === 'critical';
      const isSpecialMil =
        f.layer === 'military' &&
        (f.category === 'bomber' || f.category === 'awacs' || f.category === 'recon' || f.category === 'drone' || f.category === 'vip');
      const isNavalPatrol = f.layer === 'vessels' && f.category === 'naval_patrol';

      if (!isCriticalQuake && !isCriticalDisaster && !isSpecialMil && !isNavalPatrol) {
        continue;
      }

      const badge =
        f.layer === 'earthquakes'
          ? 'SEISMIC ALERT'
          : f.layer === 'natural'
            ? 'DISASTER ALERT'
            : f.layer === 'vessels'
              ? 'NAVAL AIS'
              : 'STRATEGIC AIR';

      const alert: BreakingAlertItem = {
        id: f.id,
        severity: f.severity === 'critical' ? 'critical' : 'high',
        badge,
        title: f.title,
        subtitle: f.subtitle ?? f.source,
        lat: f.lat,
        lon: f.lon,
        timestamp: Date.now(),
      };

      this.publish({ type: 'breaking_alert', alert });
    }

    // Bound memory of seenAlertIds
    if (this.seenAlertIds.size > 5_000) {
      const keep = [...this.seenAlertIds].slice(-2_500);
      this.seenAlertIds.clear();
      for (const id of keep) this.seenAlertIds.add(id);
    }
  }
}
