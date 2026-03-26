#!/usr/bin/env bash
# Build claude-status binary via Docker and install to ~/.claude/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        GOOS=windows; GOARCH=amd64; BINARY=claude-status.exe ;;
    Darwin)
        GOOS=darwin;  GOARCH=amd64; BINARY=claude-status-bin ;;
    *)
        GOOS=linux;   GOARCH=amd64; BINARY=claude-status-bin ;;
esac

OUTPUT="$HOME/.claude/$BINARY"

echo "Building for $GOOS/$GOARCH -> $BINARY..."
docker build \
    --build-arg GOOS="$GOOS" \
    --build-arg GOARCH="$GOARCH" \
    --build-arg BINARY="$BINARY" \
    -t claude-status-builder "$SCRIPT_DIR"

echo "Extracting binary..."
id=$(docker create claude-status-builder)
docker cp "$id:/build/$BINARY" "$OUTPUT"
docker rm "$id" >/dev/null

chmod +x "$OUTPUT"
echo "Installed: $OUTPUT"
echo "Size: $(du -sh "$OUTPUT" | cut -f1)"
