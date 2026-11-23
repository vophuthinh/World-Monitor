/**
 * Set a key in a Map that must not grow forever. Re-setting a key moves it to the newest
 * position; when the size exceeds `max`, the oldest keys (insertion order) are dropped.
 */
export function setBounded<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}
