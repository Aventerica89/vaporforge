#!/usr/bin/env bash
# VaporForge Session Auto-Context Gatherer
# Runs ONCE at container startup inside /workspace.
# Outputs structured markdown (max ~2KB) for Claude's system prompt.
# Must NEVER fail — all sections are guarded and exit 0 is guaranteed.

set -o pipefail 2>/dev/null || true

MAX_CHARS=2048
output=""

append() {
  local text="$1"
  local remaining=$(( MAX_CHARS - ${#output} ))
  if [ "$remaining" -le 0 ]; then
    return 1
  fi
  if [ "${#text}" -gt "$remaining" ]; then
    output="${output}${text:0:$remaining}"
    return 1
  fi
  output="${output}${text}"
  return 0
}

cd /workspace 2>/dev/null || exit 0

append "## Project State (auto-generated)
" || { printf '%s' "$output"; exit 0; }

# --- Git ---
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  branch=$(git branch --show-current 2>/dev/null)
  if [ -n "$branch" ]; then
    append "
### Git
Branch: ${branch}
" || { printf '%s' "$output"; exit 0; }

    status=$(git status --short 2>/dev/null | head -20)
    if [ -n "$status" ]; then
      append "Status:
${status}
" || { printf '%s' "$output"; exit 0; }
    else
      append "Status: clean working tree
" || { printf '%s' "$output"; exit 0; }
    fi

    log=$(git log --oneline -5 2>/dev/null)
    if [ -n "$log" ]; then
      append "
Recent commits:
${log}
" || { printf '%s' "$output"; exit 0; }
    fi
  fi
fi

# --- TODOs ---
if command -v grep >/dev/null 2>&1; then
  todos=$(grep -rn 'TODO\|FIXME\|HACK' \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.py' --include='*.rs' --include='*.go' \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    . 2>/dev/null | head -15)
  if [ -n "$todos" ]; then
    append "
### TODOs
${todos}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# --- Code Intelligence ---
append "
### Code Intelligence
" || { printf '%s' "$output"; exit 0; }

# File counts by extension
ts_count=$(find . -name '*.ts' -o -name '*.tsx' 2>/dev/null | grep -v node_modules | grep -v .git | wc -l | tr -d ' ')
js_count=$(find . -name '*.js' -o -name '*.jsx' 2>/dev/null | grep -v node_modules | grep -v .git | wc -l | tr -d ' ')
py_count=$(find . -name '*.py' 2>/dev/null | grep -v node_modules | grep -v .git | wc -l | tr -d ' ')

counts=""
[ "$ts_count" -gt 0 ] 2>/dev/null && counts="${counts}${ts_count} TS/TSX, "
[ "$js_count" -gt 0 ] 2>/dev/null && counts="${counts}${js_count} JS/JSX, "
[ "$py_count" -gt 0 ] 2>/dev/null && counts="${counts}${py_count} Python, "
counts="${counts%, }"
if [ -n "$counts" ]; then
  append "Files: ${counts}
" || { printf '%s' "$output"; exit 0; }
fi

# Package dependencies
if [ -f package.json ]; then
  deps=$(node -e '
    try {
      const p = JSON.parse(require("fs").readFileSync("package.json","utf8"));
      const d = Object.keys(p.dependencies||{}).length;
      const dd = Object.keys(p.devDependencies||{}).length;
      console.log(d + " prod, " + dd + " dev");
    } catch {}
  ' 2>/dev/null)
  if [ -n "$deps" ]; then
    append "Dependencies: ${deps}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# Cached test coverage
if [ -f coverage/coverage-summary.json ]; then
  cov=$(node -e '
    try {
      const c = JSON.parse(require("fs").readFileSync("coverage/coverage-summary.json","utf8"));
      console.log(c.total.lines.pct + "%");
    } catch {}
  ' 2>/dev/null)
  if [ -n "$cov" ]; then
    append "Test coverage: ${cov}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# --- Previous Session Summary ---
if [ -f .vaporforge/session-summary.md ]; then
  summary=$(head -50 .vaporforge/session-summary.md 2>/dev/null)
  if [ -n "$summary" ]; then
    append "
### Previous Session
${summary}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

printf '%s' "$output"
exit 0
