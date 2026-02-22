#!/usr/bin/env bash
# VaporForge Session Auto-Context Gatherer
# Runs ONCE at container startup inside /workspace.
# Outputs structured markdown (max ~2KB) for Claude's system prompt.
# Must NEVER fail — all sections are guarded and exit 0 is guaranteed.

set -o pipefail 2>/dev/null || true

MAX_CHARS=4096
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

# Package name, version, and framework detection
if [ -f package.json ] && command -v node >/dev/null 2>&1; then
  pkg_info=$(node -e '
    try {
      const p = JSON.parse(require("fs").readFileSync("package.json","utf8"));
      const parts = [];
      if (p.name) parts.push(p.name);
      if (p.version) parts.push("v" + p.version);
      const deps = Object.assign({}, p.dependencies, p.devDependencies);
      const fw = [];
      if (deps["next"]) fw.push("Next.js " + deps["next"].replace(/[\^~>=<]/g,""));
      else if (deps["astro"]) fw.push("Astro " + deps["astro"].replace(/[\^~>=<]/g,""));
      else if (deps["@remix-run/node"]) fw.push("Remix");
      else if (deps["nuxt"]) fw.push("Nuxt");
      else if (deps["react"]) fw.push("React " + deps["react"].replace(/[\^~>=<]/g,""));
      else if (deps["vue"]) fw.push("Vue");
      if (deps["typescript"] || deps["ts-node"]) fw.push("TypeScript");
      if (fw.length) parts.push("(" + fw.join(", ") + ")");
      if (parts.length) console.log(parts.join(" "));
    } catch {}
  ' 2>/dev/null)
  if [ -n "$pkg_info" ]; then
    append "Project: ${pkg_info}
" || { printf '%s' "$output"; exit 0; }
  fi
fi

# --- Health Checks ---
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  health=""

  # Staged console.log calls in TS/JS files
  staged_logs=$(git diff --cached --name-only 2>/dev/null | \
    grep -E '\.(ts|tsx|js|jsx)$' | \
    xargs -I{} git diff --cached {} 2>/dev/null | \
    grep '^\+' | grep -v '^\+\+\+' | grep 'console\.log' | wc -l | tr -d ' ')
  [ "$staged_logs" -gt 0 ] 2>/dev/null && health="${health}⚠ ${staged_logs} console.log in staged files\n"

  # Large files outside node_modules/dist/.git (>500KB)
  large_files=$(find . -size +500k \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    2>/dev/null | head -5 | tr '\n' ' ')
  [ -n "$large_files" ] && health="${health}⚠ Large files: ${large_files}\n"

  # Unpushed commits
  unpushed=$(git log @{u}..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
  [ "$unpushed" -gt 0 ] 2>/dev/null && health="${health}⚠ ${unpushed} unpushed commit(s)\n"

  # New TODOs introduced since last commit
  new_todos=$(git diff HEAD 2>/dev/null | \
    grep '^\+' | grep -v '^\+\+\+' | \
    grep -c 'TODO\|FIXME\|HACK' 2>/dev/null || echo 0)
  new_todos=$(echo "$new_todos" | tr -d ' ')
  [ "$new_todos" -gt 0 ] 2>/dev/null && health="${health}⚠ ${new_todos} new TODO/FIXME in uncommitted changes\n"

  # Cached test failure count (vitest)
  if [ -f test-results/results.json ]; then
    failed_tests=$(node -e '
      try {
        const r = JSON.parse(require("fs").readFileSync("test-results/results.json","utf8"));
        const n = (r.numFailedTests || r.failed || 0);
        if (n > 0) console.log(n);
      } catch {}
    ' 2>/dev/null)
    [ -n "$failed_tests" ] && health="${health}⚠ ${failed_tests} test(s) failed in last run\n"
  fi

  if [ -n "$health" ]; then
    append "
### Health Checks
$(printf '%b' "$health")" || { printf '%s' "$output"; exit 0; }
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
