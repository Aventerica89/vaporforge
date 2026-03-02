#!/bin/bash
# Append deploy result to Obsidian vault as a timestamped table row.
# Usage: deploy-log.sh <exit_code>
# Called automatically by `npm run deploy`.

EXIT_CODE="${1:-0}"
REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")
HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "-------")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
TIMESTAMP=$(TZ="America/Denver" date "+%Y-%m-%d %H:%M MST")

if [ "$EXIT_CODE" -eq 0 ]; then
  RESULT="Success"
else
  RESULT="FAILED ($EXIT_CODE)"
fi

LOG_DIR="$HOME/Obsidian-Claude/John Notes/Deploy Logs"
LOG_FILE="$LOG_DIR/Deploy Logs.md"

# Create file with headers if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
  mkdir -p "$LOG_DIR"
  cat > "$LOG_FILE" << 'HEADER'
# Deploy Logs

Automatic deployment log — updated by `scripts/deploy-log.sh` after every `npm run deploy`.

| Time | Repo | Branch | Commit | Result |
|------|------|--------|--------|--------|
HEADER
fi

# Append row
echo "| $TIMESTAMP | $REPO | $BRANCH | \`$HASH\` | $RESULT |" >> "$LOG_FILE"
