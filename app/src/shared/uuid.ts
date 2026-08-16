/**
 * UUID v4 that also works in insecure browsing contexts.
 *
 * The player web app is served over plain HTTP on a LAN IP, and browsers
 * only expose crypto.randomUUID() in secure contexts (https / localhost) —
 * on a phone at http://192.168.x.x it is simply undefined. getRandomValues
 * is available everywhere, so fall back to building the UUID from it.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
