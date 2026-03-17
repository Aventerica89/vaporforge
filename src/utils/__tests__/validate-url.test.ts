import { describe, it, expect } from 'vitest';
import { validateExternalUrl } from '../validate-url';

describe('validateExternalUrl', () => {
  describe('loopback — always allowed over HTTP or HTTPS', () => {
    it('allows http://localhost:8080', () => {
      expect(validateExternalUrl('http://localhost:8080')).toBeNull();
    });

    it('allows https://localhost:8080', () => {
      expect(validateExternalUrl('https://localhost:8080')).toBeNull();
    });

    it('allows http://127.0.0.1:3000', () => {
      expect(validateExternalUrl('http://127.0.0.1:3000')).toBeNull();
    });

    it('allows http://127.0.0.2:3000 (any 127.x)', () => {
      expect(validateExternalUrl('http://127.0.0.2:3000')).toBeNull();
    });

    it('allows http://[::1]:8080 (IPv6 loopback)', () => {
      expect(validateExternalUrl('http://[::1]:8080')).toBeNull();
    });

    it('allows http://0.0.0.0:8080', () => {
      expect(validateExternalUrl('http://0.0.0.0:8080')).toBeNull();
    });

    it('rejects ftp://localhost (non-HTTP/HTTPS scheme on loopback)', () => {
      expect(validateExternalUrl('ftp://localhost')).not.toBeNull();
    });
  });

  describe('SSRF vectors — always blocked', () => {
    it('rejects http://169.254.169.254 (AWS metadata)', () => {
      expect(validateExternalUrl('http://169.254.169.254')).not.toBeNull();
    });

    it('rejects https://169.254.169.254 (AWS metadata over HTTPS)', () => {
      expect(validateExternalUrl('https://169.254.169.254')).not.toBeNull();
    });

    it('rejects http://10.0.0.1:8080 (RFC 1918)', () => {
      expect(validateExternalUrl('http://10.0.0.1:8080')).not.toBeNull();
    });

    it('rejects https://10.0.0.1 (RFC 1918 even over HTTPS)', () => {
      expect(validateExternalUrl('https://10.0.0.1')).not.toBeNull();
    });

    it('rejects https://172.16.0.1 (RFC 1918)', () => {
      expect(validateExternalUrl('https://172.16.0.1')).not.toBeNull();
    });

    it('rejects https://192.168.1.1 (RFC 1918)', () => {
      expect(validateExternalUrl('https://192.168.1.1')).not.toBeNull();
    });

    it('rejects https://api.internal (internal hostname)', () => {
      expect(validateExternalUrl('https://api.internal')).not.toBeNull();
    });

    it('rejects https://service.local (mDNS hostname)', () => {
      expect(validateExternalUrl('https://service.local')).not.toBeNull();
    });

    it('rejects http://api.example.com (non-loopback HTTP)', () => {
      expect(validateExternalUrl('http://api.example.com')).not.toBeNull();
    });

    it('rejects an invalid URL', () => {
      expect(validateExternalUrl('not a url')).not.toBeNull();
    });
  });

  describe('valid external URLs', () => {
    it('allows https://api.example.com', () => {
      expect(validateExternalUrl('https://api.example.com')).toBeNull();
    });

    it('allows https://mcp.example.com/sse', () => {
      expect(validateExternalUrl('https://mcp.example.com/sse')).toBeNull();
    });

    it('allows https://server.mcp.claude.com (Anthropic-hosted MCP)', () => {
      expect(validateExternalUrl('https://server.mcp.claude.com')).toBeNull();
    });
  });
});
