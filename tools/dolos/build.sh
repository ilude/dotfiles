#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -z "${GOOS:-}" ]]; then
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) GOOS=windows ;;
    Linux*) GOOS=linux ;;
    Darwin*) GOOS=darwin ;;
    *) printf 'Unsupported Dolos host OS: %s\n' "$(uname -s)" >&2; exit 1 ;;
  esac
fi

if [[ -z "${GOARCH:-}" ]]; then
  case "$(uname -m)" in
    x86_64|amd64) GOARCH=amd64 ;;
    arm64|aarch64) GOARCH=arm64 ;;
    *) printf 'Unsupported Dolos host architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
  esac
fi

case "$GOOS/$GOARCH" in
  windows/amd64|windows/arm64|linux/amd64|linux/arm64|darwin/amd64|darwin/arm64) ;;
  *) printf 'Unsupported Dolos target: %s/%s\n' "$GOOS" "$GOARCH" >&2; exit 1 ;;
esac

artifact="dolos-$GOOS-$GOARCH"
destination="$REPO_ROOT/bin/dolos"
if [[ "$GOOS" == "windows" ]]; then
  artifact="$artifact.exe"
  destination="$destination.exe"
fi

mkdir -p "$REPO_ROOT/bin"
docker build -t dolos-build "$SCRIPT_DIR"
cid="$(docker create dolos-build)"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
docker cp "$cid:/out/$artifact" "$destination"
chmod +x "$destination"
printf 'Built %s from the full Dolos platform matrix.\n' "$destination"
