/**
 * Validates a user-supplied URL is safe to fetch from a Worker.
 * Blocks SSRF vectors: non-HTTPS schemes (except loopback), private IP ranges, cloud metadata endpoints.
 *
 * Loopback exception (mirrors CF agents SDK v0.7.6 fix, PR #1090):
 * localhost / 127.x / ::1 / 0.0.0.0 are allowed over plain HTTP.
 * These are used by MCP servers running in the container or in local dev.
 * All other URLs must be HTTPS and must not resolve to private/internal ranges.
 */

// Loopback addresses — always safe, HTTP allowed
const LOOPBACK_PATTERNS = [/^127\./, /^::1$/, /^\[::1\]$/, /^0\.0\.0\.0$/];

function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  return LOOPBACK_PATTERNS.some(p => p.test(hostname));
}

const PRIVATE_RANGES = [
  // IPv4-mapped IPv6 addresses (bypass naive 127.x.x.x checks)
  // e.g. ::ffff:127.0.0.1 or [::ffff:127.0.0.1]
  /^::ffff:/i,
  /^\[::ffff:/i,
  // Private RFC 1918
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  // Link-local / cloud metadata
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  // IPv6 link-local
  /^fe80:/i,
];

/**
 * Returns an error string if the URL is unsafe, or null if safe to fetch.
 */
export function validateExternalUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'Invalid URL';
  }

  const hostname = parsed.hostname.toLowerCase();

  // Loopback: allow HTTP or HTTPS, skip all private-range checks
  if (isLoopback(hostname)) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Only HTTP/HTTPS URLs are allowed';
    }
    return null;
  }

  // Non-loopback: require HTTPS
  if (parsed.protocol !== 'https:') {
    return 'Only HTTPS URLs are allowed for external MCP servers';
  }

  // Block private/internal IP ranges
  for (const pattern of PRIVATE_RANGES) {
    if (pattern.test(hostname)) {
      return 'Private/internal IP addresses are not allowed';
    }
  }

  // Block internal hostnames (.local, .internal)
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return 'Internal hostnames are not allowed';
  }

  return null;
}
