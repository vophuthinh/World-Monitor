import type { BreakingAlertItem, GeoPointFeature, RealtimeServerEvent } from '@shared/types';

export type RealtimeSubscriber = (event: RealtimeServerEvent) => void;

export function isInAsiaEastSeaTheater(lat: number, lon: number): boolean {
  // Covers Việt Nam, Biển Đông, Eo biển Malacca, ASEAN, Eo biển Đài Loan, Biển Hoa Đông, Nhật Bản, Hàn Quốc & Tây Thái Bình Dương
  return lat >= -10 && lat <= 46 && lon >= 92 && lon <= 148;
}

export class RealtimeHub {
  private readonly subscribers = new Set<RealtimeSubscriber>();
  private readonly seenAlertIds = new Set<string>();
  private readonly seededInitial = new Map<string, number>();

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
   * Scans newly refreshed features and emits breaking_alert events ONLY for high-signal events:
   * - Underway (> 2 kn) naval/coast-guard vessels in Biển Đông / Asia-Pacific (ignores 0 kn moored ships & distant US/EU ports)
   * - Airborne strategic military aircraft (bomber/AWACS/recon/UAV) in Biển Đông / Asia-Pacific
   * - Major earthquakes (M5.8+ globally, or M4.8+ in Biển Đông / Asia) & critical natural disasters
   */
  ingestForAlerts(sourceKey: string, features: readonly GeoPointFeature[], now = Date.now()): void {
    const firstSeenAt = this.seededInitial.get(sourceKey);
    if (firstSeenAt === undefined) {
      this.seededInitial.set(sourceKey, now);
      for (const f of features) {
        this.seenAlertIds.add(f.id);
      }
      return;
    }

    // AIS WebSocket streams trickle initial ship inventory over the first ~20s after socket open;
    // seed those quietly so cold boot never spams alerts.
    if (sourceKey === 'maritime-ws' && now - firstSeenAt < 20_000) {
      for (const f of features) {
        const speedKt = Number(f.meta?.speedKt ?? 0);
        if (speedKt > 2) this.seenAlertIds.add(f.id);
      }
      return;
    }

    for (const f of features) {
      const inAsiaTheater = isInAsiaEastSeaTheater(f.lat, f.lon);
      const speedKt = Number(f.meta?.speedKt ?? 0);
      const onGround = Boolean(f.meta?.onGround);

      // Do NOT mark 0-knot moored ships as seen yet; wait until they actually get underway (> 2 kn)
      if (f.layer === 'vessels' && speedKt <= 2) {
        continue;
      }
      if (f.layer === 'military' && (onGround || speedKt < 80)) {
        continue;
      }

      if (this.seenAlertIds.has(f.id)) continue;
      this.seenAlertIds.add(f.id);

      const mag = f.magnitude ?? 0;
      const isCriticalQuake =
        f.layer === 'earthquakes' && (mag >= 5.8 || (inAsiaTheater && mag >= 4.8));
      const isCriticalDisaster = f.layer === 'natural' && f.severity === 'critical';
      const isSpecialMil =
        f.layer === 'military' &&
        inAsiaTheater &&
        (f.category === 'bomber' ||
          f.category === 'awacs' ||
          f.category === 'recon' ||
          f.category === 'drone');
      const isNavalPatrol =
        f.layer === 'vessels' && f.category === 'naval_patrol' && inAsiaTheater && speedKt > 2;

      if (!isCriticalQuake && !isCriticalDisaster && !isSpecialMil && !isNavalPatrol) {
        continue;
      }

      const badge =
        f.layer === 'earthquakes'
          ? 'SEISMIC ALERT'
          : f.layer === 'natural'
            ? 'DISASTER ALERT'
            : f.layer === 'vessels'
              ? 'NAVAL AIS · CHÂU Á'
              : 'STRATEGIC AIR · CHÂU Á';

      const corridor = typeof f.meta?.corridor === 'string' ? f.meta.corridor : '';
      const baseSubtitle = f.subtitle ?? f.source;
      const subtitle =
        corridor && !baseSubtitle.includes(corridor)
          ? `${corridor} · ${baseSubtitle}`
          : baseSubtitle;

      const alert: BreakingAlertItem = {
        id: f.id,
        severity: f.severity === 'critical' ? 'critical' : 'high',
        badge,
        title: f.title,
        subtitle,
        lat: f.lat,
        lon: f.lon,
        timestamp: now,
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
