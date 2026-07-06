#!/usr/bin/env bash
# SessionStart hook: install project dependencies for Claude Code on the web.
#
# Wired via .claude/settings.json (SessionStart). Per the docs, project dep
# installs like this belong in a SessionStart hook -- NOT the environment
# "Setup script" field, which runs before the repo is cloned and is meant for
# environment tooling (apt, language runtimes). Do not paste this into that
# field; it would fail with "path not found".
#
# Runs in ASYNC mode so it never blocks session init (a slow cold-container
# install can exceed the setup-script time limit). The fallow MCP server in
# .mcp.json launches its binary directly (not via pnpm), so this background
# install does not contend with MCP startup.
set -euo pipefail

# Tell Claude Code to run this hook in the background (non-blocking).
echo '{"async": true, "asyncTimeout": 600000}'

# Cloud sessions only; locally developers manage their own install.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

# Idempotent: a no-op when the store/node_modules are already current.
pnpm install --frozen-lockfile
