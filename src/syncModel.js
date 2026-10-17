export const stamp = element => `${element.version ?? 0}:${element.versionNonce ?? 0}`;
export function isSameEdit(a, b) { return Boolean(a && b && a.id === b.id && stamp(a) === stamp(b)); }
export function mergeRemote(local, remote, pending) {
  const merged = new Map(local.map(element => [element.id, element]));
  let changed = false;
  for (const element of remote) {
    if (pending.has(element.id)) continue;
    const current = merged.get(element.id);
    if (!current || element.version > current.version || (element.version === current.version && !isSameEdit(current, element))) {
      merged.set(element.id, element); changed = true;
    }
  }
  return changed ? [...merged.values()] : null;
}
export function makeBatch(pending, maxBytes = 1500000, maxCount = 25) {
  const batch = []; let bytes = 32;
  const encoder = new TextEncoder();
  for (const element of pending.values()) {
    const size = encoder.encode(JSON.stringify(element)).byteLength + 1;
    if (batch.length && (batch.length >= maxCount || bytes + size > maxBytes)) break;
    batch.push(element); bytes += size;
  }
  return batch;
}
