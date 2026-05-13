#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GOOS="${GOOS:-$(go env GOOS 2>/dev/null || echo linux)}"
GOARCH="${GOARCH:-$(go env GOARCH 2>/dev/null || echo amd64)}"
BINARY="${BINARY:-dolos}"
if [[ "$GOOS" == "windows" && "$BINARY" != *.exe ]]; then
  BINARY="${BINARY}.exe"
fi
mkdir -p "$REPO_ROOT/bin"
docker build \
  --build-arg "GOOS=$GOOS" \
  --build-arg "GOARCH=$GOARCH" \
  --build-arg "BINARY=$BINARY" \
  -t dolos-build \
  "$SCRIPT_DIR"
cid="$(docker create dolos-build)"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
docker cp "$cid:/out/$BINARY" "$REPO_ROOT/bin/$BINARY"
