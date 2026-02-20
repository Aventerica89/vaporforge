---
name: auto-dockerfile-review
enabled: true
event: file
conditions:
  - field: file_path
    operator: contains
    pattern: Dockerfile
action: warn
---

**Dockerfile was just modified.**

Automatically invoke the `dockerfile-reviewer` subagent now to audit the changes before any deploy. Do not wait for the user to ask — run it immediately as the next action.

The reviewer checks: heredoc syntax, IS_SANDBOX env var, options.env spread, options.agents injection, vfTools definitions, WS server port 8765, MCP config try/catch, and Docker cache trap.
