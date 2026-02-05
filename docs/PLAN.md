# Plan: Claude in the Cloud with Cloudflare Sandboxes

## User Requirements (Confirmed)

- **Use Case**: All-in-one platform (mobile CLI, multi-agent, dev assistant)
- **Auth**: Claude OAuth (Pro/Max subscription) - MANDATORY, NOT API keys
- **UI**: Full IDE-like experience (file tree, diff viewer, Monaco editor)
- **Figma**: Add later (not Phase 1)

## Executive Summary

Build a web-based Claude Code IDE deployed on Cloudflare Sandboxes. This gives you VS Code-like experience accessible from any device (mobile, tablet, desktop) using your existing Claude Pro/Max subscription.

## Why NOT 1Code (Report's Recommendation)

The report recommended 1Code + Cloudflare Containers, but:
- 1Code is an **Electron desktop app**, not a web service
- No native container/cloud support exists
- Would require massive refactoring
- **We'll build something better** using official SDKs

## Recommended Architecture

```
Mobile Browser / Desktop
    ↓ HTTPS
Cloudflare Worker (Router)
    ├─ Auth (Clerk or Cloudflare Access)
    ├─ WebSocket for real-time updates
    └─ Routes to Durable Objects
        ↓
Cloudflare Sandbox (Isolated Container)
    ├─ Claude Agent SDK
    ├─ Git operations
    ├─ File system access
    └─ MCP servers (optional)
        ↓
Claude API (via Agent SDK)
```

---

## VaporForge OAuth Fix (Immediate Task)

**Root Cause Analysis from Debug Output:**
The debug shows Claude CLI IS running successfully:
```
"Welcome to Claude Code v2.1.31"
```

But we're failing to capture the OAuth URL because of these bugs:

### Bug 1: Wrong Credentials Path
- **Current**: `/root/.claude/.credentials.json`
- **Correct**: `/root/.config/claude-code/auth.json`

### Bug 2: Wrong URL Pattern
- **Looking for**: `https://claude.ai/oauth/...`
- **Actual format**: `http://localhost:8080/auth?code=...&state=...`

The CLI starts a **local callback server on port 8080**. The OAuth URL points to localhost!

### Bug 3: ANSI Escape Codes Not Stripped
Debug output contains ANSI codes like `\u001b[2J\u001b[3J\u001b[H\u001b[?2026h` which break URL matching.

### Bug 4: CLI Expects Interactive Input
The welcome screen with dots (`………`) indicates the CLI is showing an animation and may be waiting for user interaction before showing the login URL.

---

## Specific Code Fixes for `src/api/oauth.ts`

### Fix 1: Add ANSI stripping function
```typescript
// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-?9;]*[mGKHJ]/g, '');
}
```

### Fix 2: Fix credentials path (line 17)
```typescript
// OLD: const CREDENTIALS_PATH = '/root/.claude/.credentials.json';
// NEW:
const CREDENTIALS_PATH = '/root/.config/claude-code/auth.json';
```

### Fix 3: Fix URL patterns (lines 318-322)
```typescript
// The CLI outputs URLs in different formats depending on context
const urlPatterns = [
  // localhost callback URL
  /http:\/\/localhost:8080\/[^\s\n"']*/,
  // Direct authorization URL that might appear
  /https:\/\/accounts\.anthropic\.com\/oauth[^\s\n"']*/,
  /https:\/\/claude\.ai\/oauth[^\s\n"']*/,
  /https:\/\/[^\s\n"']*anthropic[^\s\n"']*auth[^\s\n"']*/,
];
```

### Fix 4: Apply ANSI stripping before URL matching
```typescript
// Strip ANSI codes from all output before searching
const cleanOutput = stripAnsi(combinedOutput);

let foundUrl: string | null = null;
for (const pattern of urlPatterns) {
  const match = cleanOutput.match(pattern);
  if (match) {
    foundUrl = match[0];
    break;
  }
}
```

### Fix 5: Update credentials structure in types
```typescript
// The actual structure from ~/.config/claude-code/auth.json
export interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}
// NOT claudeAiOauth wrapper
```

### Fix 6: Update login script to properly capture output
```bash
#!/bin/bash
# Create config directory
mkdir -p /root/.config/claude-code

# Run claude login with unbuffered output
# Use 'script' to capture PTY output and strip control sequences
script -q -c "claude /login 2>&1" /tmp/auth-raw.txt &
LOGIN_PID=$!

# Wait for process to produce output
sleep 5

# Strip ANSI codes and save clean output
cat /tmp/auth-raw.txt | sed 's/\x1B\[[0-9;]*[mGKHJ]//g' > /tmp/auth-output.txt

echo "LOGIN_PID=$LOGIN_PID" >> /tmp/auth-output.txt
```

---

## Implementation Order

1. **First**: Fix ANSI stripping (this is likely why we can't see the URL)
2. **Second**: Fix credentials path
3. **Third**: Fix URL patterns
4. **Fourth**: Fix credentials structure parsing
5. **Deploy and test**

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/api/oauth.ts` | Fix | Fix URL pattern, credentials path, ANSI stripping |
| `src/types.ts` | Fix | Update credentials structure |

---

## Verification Plan

1. **Start OAuth**: Click button, verify sandbox starts
2. **Debug Check**: Verify ANSI codes are stripped in debug output
3. **Get URL**: Poll returns OAuth URL within 5-10 seconds
4. **Open URL**: Browser opens Claude.ai auth page
5. **Get Code**: Complete auth on Claude.ai, get XXX#YYY code
6. **Submit Code**: Paste code, verify token returned
7. **Token Storage**: Token saved to localStorage
8. **Session Resume**: Refresh page, verify still authenticated
9. **API Calls**: Make Claude API call with token

---

## Security Considerations

- Tokens stored in browser localStorage only (not on server)
- OAuth sessions expire after 10 minutes
- Sandbox deleted after auth completes
- Refresh token enables seamless re-auth
- Session binding via client secrets prevents hijacking

---

## Cost Estimate

| Component | Estimate |
|-----------|----------|
| Cloudflare Workers Paid | $5/month base |
| Sandbox compute | Usage based |
| Claude Pro/Max | Existing subscription |
| **Total new costs** | **~$5-20/month** |

---

## MANDATORY RULE

**NEVER use Anthropic API keys for this project.**

User cannot afford API costs. This project MUST use Claude Pro/Max OAuth (1Code-style) authentication. Any attempt to switch to API key auth is unauthorized.
