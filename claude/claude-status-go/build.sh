#!/usr/bin/env bash
# Build claude-status.exe via Docker and install to ~/.claude/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="$HOME/.claude/claude-status.exe"

echo "Building claude-status.exe..."
docker build -t claude-status-builder "$SCRIPT_DIR"

echo "Extracting binary..."
id=$(docker create claude-status-builder)
docker cp "$id:/build/claude-status.exe" "$OUTPUT"
docker rm "$id" >/dev/null

echo "Installed: $OUTPUT"
echo "Size: $(du -sh "$OUTPUT" | cut -f1)"
