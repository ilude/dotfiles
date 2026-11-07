#!/usr/bin/env bash
set -euo pipefail

# Input is a Git bundle, so host credentials, ignored files and live T3 state stay out.
export CI=true VP_REMOTE_CACHE=off T3CODE_TELEMETRY_CHANNEL=dev
export T3CODE_HOME=/workspace/.t3
export TMPDIR
TMPDIR=$(mktemp -d /tmp/t3code-windows.XXXXXX)
mkdir -p /out
exec > >(tee /out/build.log) 2>&1

if [[ ! -d /workspace/.git ]]; then
    git init /workspace
    # Bundles omit shallow boundaries; carry the source checkout's marker separately.
    if [[ -f /input/shallow ]]; then
        cp /input/shallow /workspace/.git/shallow
    fi
    git bundle unbundle /input/source.bundle
    read -r source_commit _ < <(git bundle list-heads /input/source.bundle refs/heads/main)
    git sparse-checkout set --no-cone '/*' '!/.repos/'
    git checkout -b main "$source_commit"
fi
cd /workspace
version="${1:-$(node -p 'require("./apps/server/package.json").version')-preview.$(date -u +%Y%m%d).1}"
git rev-parse HEAD >/out/source-commit.txt
printf '%s\n' "$version" >/out/version.txt
node --version
vp --version

vp install --frozen-lockfile --filter=t3... --filter=@t3tools/web... --filter=@t3tools/desktop... --filter=@t3tools/scripts...
node scripts/update-release-package-versions.ts "$version"
vp run build:desktop:bundle

cargo build --locked --release --manifest-path native/resource-monitor/Cargo.toml
cargo xwin build --locked --release --manifest-path native/resource-monitor/Cargo.toml --target x86_64-pc-windows-msvc
mkdir -p /out/resource-monitor-linux/linux-x64 /out/resource-monitor-windows/win32-x64
cp native/resource-monitor/target/release/t3-resource-monitor /out/resource-monitor-linux/linux-x64/
cp native/resource-monitor/target/x86_64-pc-windows-msvc/release/t3-resource-monitor.exe /out/resource-monitor-windows/win32-x64/

# The Windows desktop includes the matching Linux CLI archive for its WSL backend.
node apps/server/scripts/cli.ts build-exe --verbose
node scripts/build-cli-archive.ts --platform linux --arch x64 --version "$version" \
    --resource-monitor-dir /out/resource-monitor-linux --output-dir /out/cli-linux
node scripts/smoke-cli-archive.ts --archive "/out/cli-linux/t3-$version-linux-x64.tar.gz" --expect-version "$version"
node apps/server/scripts/cli.ts build-exe --verbose --target win-x64
node scripts/build-cli-archive.ts --platform win --arch x64 --version "$version" \
    --resource-monitor-dir /out/resource-monitor-windows --output-dir /out/cli-windows

T3CODE_DESKTOP_REUSE_RESOURCE_MONITOR=true vp run dist:desktop:artifact \
    --platform win --target nsis --arch x64 --build-version "$version" --skip-build --keep-stage \
    --wsl-runtime "/out/cli-linux/t3-$version-linux-x64.tar.gz" --verbose

cp -a release /out/installer
stages=("$TMPDIR"/t3code-desktop-win-stage-*/app/dist/win-unpacked)
[[ ${#stages[@]} -eq 1 ]]
cp -a "${stages[0]}" /out/win-unpacked

# Match upstream's dependency-free verification scripts for the Windows host.
mkdir -p /out/verify
esbuild=scripts/node_modules/.bin/esbuild
banner="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);"
"$esbuild" scripts/verify-windows-desktop-artifact.ts --bundle --platform=node --format=esm \
    --target=node24 --define:import.meta.main=false --banner:js="$banner" \
    --outfile=/out/verify/verify-windows-desktop-artifact.mjs
"$esbuild" scripts/smoke-cli-archive.ts --bundle --platform=node --format=esm \
    --target=node24 --banner:js="$banner" --outfile=/out/verify/smoke-cli-archive.mjs
printf '\nWindows x64 build complete: %s\n' "$version"
