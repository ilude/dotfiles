#!/usr/bin/env bash
# ensure-mcp-config.sh
# SessionStart hook to ensure flaresolverr MCP config exists
# Config-only - does NOT install dependencies

set -e

# Determine home directory (cross-platform: Linux/Mac/Windows Git Bash)
USER_HOME="${HOME:-$USERPROFILE}"
CLAUDE_JSON="$USER_HOME/.claude.json"

# Exit early if file doesn't exist (Claude Code hasn't been set up yet)
[[ -f "$CLAUDE_JSON" ]] || exit 0

# Quick exit if already configured
check_config() {
  if command -v jq &>/dev/null; then
    jq -e '.mcpServers.flaresolverr' "$CLAUDE_JSON" &>/dev/null
  else
    python -c "
import json, sys
try:
    with open('$CLAUDE_JSON', 'r') as f:
        d = json.load(f)
    if 'flaresolverr' in d.get('mcpServers', {}):
        sys.exit(0)
    sys.exit(1)
except:
    sys.exit(1)
"
  fi
}

check_config && exit 0

# Build flaresolverr path based on OS
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  WIN_HOME=$(cygpath -w "$USER_HOME" 2>/dev/null || echo "$USERPROFILE")
  FLARESOLVERR_PATH="${WIN_HOME}/.claude/tools/flaresolverr-mcp/server.py"
  FLARESOLVERR_PATH="${FLARESOLVERR_PATH//\//\\}"
elif [[ -n "$USERPROFILE" ]]; then
  FLARESOLVERR_PATH="${USERPROFILE}\\.claude\\tools\\flaresolverr-mcp\\server.py"
else
  FLARESOLVERR_PATH="$USER_HOME/.claude/tools/flaresolverr-mcp/server.py"
fi

# Add flaresolverr if missing
if command -v jq &>/dev/null; then
  tmp_file=$(mktemp)
  jq --arg path "$FLARESOLVERR_PATH" '.mcpServers.flaresolverr = {"command": "python", "args": [$path]}' "$CLAUDE_JSON" > "$tmp_file"
  mv "$tmp_file" "$CLAUDE_JSON"
else
  python -c "
import json, os
home = os.path.expanduser('~')
claude_json = os.path.join(home, '.claude.json')
flaresolverr_path = os.path.join(home, '.claude', 'tools', 'flaresolverr-mcp', 'server.py')
with open(claude_json, 'r') as f:
    data = json.load(f)
if 'mcpServers' not in data:
    data['mcpServers'] = {}
if 'flaresolverr' not in data['mcpServers']:
    data['mcpServers']['flaresolverr'] = {'command': 'python', 'args': [flaresolverr_path]}
    with open(claude_json, 'w') as f:
        json.dump(data, f, indent=2)
"
fi
exit 0
