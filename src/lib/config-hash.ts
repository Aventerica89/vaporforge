/**
 * Compute a short hash of a config object for cache-busting.
 * Uses SubtleCrypto (available in Workers + Node 18+).
 */
export async function configHash(
  data: Record<string, unknown> | unknown[] | null | undefined
): Promise<string> {
  if (!data) return 'empty';
  const str = JSON.stringify(data);
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = new Uint8Array(hashBuf);
  // 8-char hex prefix is enough for cache-busting
  return Array.from(arr.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
