/**
 * Validates a user-supplied URL is safe to fetch from a Worker.
 * Blocks SSRF vectors: non-HTTPS schemes, private IP ranges, cloud metadata endpoints.
 */

const PRIVATE_RANGES = [
  // Loopback (IPv4)
  /^127\./,
  // Wildcard bind address — routes to localhost on some systems
  /^0\.0\.0\.0$/,
  // IPv6 loopback — bare and bracket-wrapped forms
  /^::1$/,
  /^\[::1\]$/,
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

  if (parsed.protocol !== 'https:') {
    return 'Only HTTPS URLs are allowed for MCP servers';
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of PRIVATE_RANGES) {
    if (pattern.test(hostname)) {
      return 'Private/internal IP addresses are not allowed';
    }
  }

  // Block 'localhost' and common internal hostnames
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return 'Internal hostnames are not allowed';
  }

  return null;
}
