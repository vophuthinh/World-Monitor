import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_SSE_CLIENTS, createApp } from '../server/app';
import { CollectorScheduler } from '../server/cache/scheduler';
import { SnapshotStore } from '../server/cache/snapshot-store';
import { setBounded } from '../server/lib/bounded-map';
import { RealtimeHub } from '../server/realtime/hub';

const newApp = (hub: RealtimeHub) =>
  createApp(new CollectorScheduler(new SnapshotStore(mkdtempSync(join(tmpdir(), 'wm-mem-')))), hub);

describe('setBounded', () => {
  it('evicts the oldest keys beyond max and refreshes the position of re-set keys', () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 10; i += 1) setBounded(m, `k${i}`, i, 3);
    expect([...m.keys()]).toEqual(['k7', 'k8', 'k9']);
    setBounded(m, 'k7', 70, 3); // refresh k7 -> now newest
    setBounded(m, 'k10', 10, 3);
    expect([...m.keys()]).toEqual(['k9', 'k7', 'k10']);
    expect(m.get('k7')).toBe(70);
  });
});

describe('SSE memory safety', () => {
  it('rejects new live connections with 503 once the client cap is reached', async () => {
    const hub = new RealtimeHub();
    for (let i = 0; i < MAX_SSE_CLIENTS; i += 1) hub.subscribe(() => {});
    const res = await newApp(hub).request('/api/stream');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('drops a client that does not read instead of buffering events forever', async () => {
    const hub = new RealtimeHub();
    const res = await newApp(hub).request('/api/stream');
    expect(res.status).toBe(200);
    expect(hub.subscriberCount()).toBe(1);
    // The body is never read, so the queue fills up.
    for (let i = 0; i < 500; i += 1) hub.publish({ type: 'connected', serverTime: i, aisStreamConfigured: false });
    expect(hub.subscriberCount()).toBe(0);
  });

  it('keeps a client that reads normally', async () => {
    const hub = new RealtimeHub();
    const res = await newApp(hub).request('/api/stream');
    const reader = res.body!.getReader();
    for (let i = 0; i < 200; i += 1) {
      hub.publish({ type: 'connected', serverTime: i, aisStreamConfigured: false });
      await reader.read();
    }
    expect(hub.subscriberCount()).toBe(1);
    await reader.cancel();
  });
});
