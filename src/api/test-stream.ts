/**
 * TEMPORARY: Test endpoints for verifying CF Sandbox execStream/streamProcessLogs
 * real-time delivery. Will be removed after investigation.
 *
 * Tests whether CF fixed the RPC buffering that forced the WS bridge architecture.
 */
import { Hono } from 'hono';
import { SandboxManager } from '../sandbox';

const testStreamRoutes = new Hono<{
  Bindings: Env;
}>();

// Helper: create a SandboxManager and get session ID from query param
function getContext(c: { req: { query: (k: string) => string | undefined }; env: Env }) {
  const sessionId = c.req.query('sessionId') || null;
  const sandboxManager = new SandboxManager(
    c.env.Sandbox,
    c.env.SESSIONS_KV,
    c.env.FILES_BUCKET,
  );
  return { sessionId, sandboxManager };
}

/**
 * Test 1: execStream with timed output
 * GET /api/test-stream/exec?sessionId=...
 *
 * Runs a Node.js script that outputs a JSON line every 500ms for 5 seconds.
 * If streaming works: browser sees events arriving every ~500ms.
 * If buffered: all events arrive at once after ~5s.
 */
testStreamRoutes.get('/exec', async (c) => {
  const { sessionId, sandboxManager } = getContext(c);
  if (!sessionId) {
    return c.json({ error: 'Provide ?sessionId= in the URL' }, 400);
  }

  const script = [
    'const start = Date.now();',
    'for (let i = 0; i < 10; i++) {',
    '  console.log(JSON.stringify({ i, elapsed: Date.now() - start, t: Date.now() }));',
    '  await new Promise(r => setTimeout(r, 500));',
    '}',
  ].join(' ');

  const cmd = `node -e "${script}"`;

  try {
    const stream = await sandboxManager.execStreamInSandbox(sessionId, cmd);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

/**
 * Test 2: startProcess + streamProcessLogs
 * GET /api/test-stream/process?sessionId=...
 *
 * Same timed output, but via startProcess + streamProcessLogs.
 */
testStreamRoutes.get('/process', async (c) => {
  const { sessionId, sandboxManager } = getContext(c);
  if (!sessionId) {
    return c.json({ error: 'Provide ?sessionId= in the URL' }, 400);
  }

  const script = [
    'const start = Date.now();',
    'for (let i = 0; i < 10; i++) {',
    '  console.log(JSON.stringify({ i, elapsed: Date.now() - start, t: Date.now() }));',
    '  await new Promise(r => setTimeout(r, 500));',
    '}',
  ].join(' ');

  const cmd = `node -e "${script}"`;

  try {
    // Access raw sandbox for startProcess + streamProcessLogs
    const sbx = sandboxManager.getRawSandbox(sessionId) as unknown as {
      startProcess(cmd: string, opts?: Record<string, unknown>): Promise<{ id: string }>;
      streamProcessLogs(id: string): Promise<ReadableStream<Uint8Array>>;
    };

    const process = await sbx.startProcess(cmd, { cwd: '/workspace' });
    const logStream = await sbx.streamProcessLogs(process.id);

    return new Response(logStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

/**
 * Test 3: NDJSON output pattern (like claude-agent.js)
 * GET /api/test-stream/ndjson?sessionId=...
 *
 * Tests whether NDJSON lines arrive as individual SSE events.
 */
testStreamRoutes.get('/ndjson', async (c) => {
  const { sessionId, sandboxManager } = getContext(c);
  if (!sessionId) {
    return c.json({ error: 'Provide ?sessionId= in the URL' }, 400);
  }

  // Simulate claude-agent.js NDJSON output with process.stdout.write
  // Use a temp script file to avoid shell quoting issues with node -e
  const cmd = `node -e 'var f=[{type:"text-delta",text:"Hello "},{type:"text-delta",text:"world "},{type:"text-delta",text:"streaming "},{type:"text-delta",text:"test "},{type:"reasoning",text:"Thinking"},{type:"text-delta",text:"More "},{type:"text-delta",text:"after "},{type:"process-exit",exitCode:0}];var s=Date.now();(async()=>{for(var x of f){process.stdout.write(JSON.stringify(Object.assign({},x,{t:Date.now(),elapsed:Date.now()-s}))+String.fromCharCode(10));await new Promise(r=>setTimeout(r,300))}})()'`;

  try {
    const stream = await sandboxManager.execStreamInSandbox(sessionId, cmd);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

/**
 * Test page: HTML page that opens all three SSE endpoints and logs timestamps.
 * GET /api/test-stream/
 */
testStreamRoutes.get('/', async (c) => {
  const { sessionId } = getContext(c);
  const sid = sessionId || 'NO_SESSION';

  return c.html(`<!DOCTYPE html>
<html><head><title>execStream Buffering Test</title>
<style>
  body { font-family: monospace; background: #0a0a0a; color: #e0e0e0; padding: 20px; }
  h1 { color: #00bcd4; }
  .test { margin: 20px 0; padding: 15px; border: 1px solid #333; border-radius: 8px; }
  .test h2 { color: #4caf50; margin-top: 0; }
  .log { white-space: pre-wrap; font-size: 12px; max-height: 300px; overflow-y: auto; }
  button { background: #00bcd4; color: black; border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; margin: 4px; }
  button:hover { background: #00acc1; }
  .status { color: #ff9800; font-weight: bold; }
  .ts { color: #ff9800; }
</style>
</head><body>
<h1>CF Sandbox execStream Buffering Test</h1>
<p>Session: <code>${sid}</code></p>
<p>Click each test. If streaming works, events arrive ~500ms apart. If buffered, they arrive all at once.</p>

<div class="test">
  <h2>Test 1: execStream</h2>
  <button onclick="runTest('exec','log1')">Run</button>
  <pre id="log1" class="log"></pre>
</div>

<div class="test">
  <h2>Test 2: startProcess + streamProcessLogs</h2>
  <button onclick="runTest('process','log2')">Run</button>
  <pre id="log2" class="log"></pre>
</div>

<div class="test">
  <h2>Test 3: NDJSON (claude-agent.js pattern)</h2>
  <button onclick="runTest('ndjson','log3')">Run</button>
  <pre id="log3" class="log"></pre>
</div>

<script>
async function runTest(ep, logId) {
  var log = document.getElementById(logId);
  log.textContent = 'Connecting...\\n';
  var t0 = Date.now();
  try {
    var resp = await fetch('/api/test-stream/' + ep + '?sessionId=${sid}');
    log.textContent += 'Stream opened at +' + (Date.now() - t0) + 'ms\\n';
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var buf = '';
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\\n');
      buf = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        log.textContent += '[+' + (Date.now() - t0) + 'ms] ' + lines[i].substring(0, 200) + '\\n';
        log.scrollTop = log.scrollHeight;
      }
    }
    log.textContent += 'Done at +' + (Date.now() - t0) + 'ms\\n';
  } catch (err) {
    log.textContent += 'ERROR: ' + err.message + '\\n';
  }
}
</script>
</body></html>`);
});

export { testStreamRoutes };
