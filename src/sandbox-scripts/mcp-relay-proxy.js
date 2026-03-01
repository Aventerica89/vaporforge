#!/usr/bin/env node

// MCP Relay Proxy — runs inside the container on port 9788.
// Forwards JSON-RPC from SDK to Worker relay endpoint.

const http = require('http');
const https = require('https');

const PORT = 9788;
const TIMEOUT_MS = 30000;
const RELAY_URL = process.env.RELAY_URL || '';
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';

if (!RELAY_URL || !RELAY_TOKEN) {
  console.error('[mcp-relay-proxy] Missing RELAY_URL or RELAY_TOKEN, exiting.');
  process.exit(1);
}

function forwardRequest(serverName, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${RELAY_URL}/${serverName}`);
    const payload = JSON.stringify(body);
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RELAY_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ jsonrpc: '2.0', error: { code: -32603, message: raw } }); }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Relay request timed out')); });
    req.write(payload);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const match = req.url?.match(/^\/mcp\/([a-zA-Z0-9_-]+)\/?$/);
  if (!match || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const serverName = match[1];
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); }

  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); }
  catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
    return;
  }

  try {
    const result = await forwardRequest(serverName, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: err.message || 'Relay error' } }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcp-relay-proxy] Listening on http://127.0.0.1:${PORT}`);
});