#!/usr/bin/env python
"""Type-check Pi extensions against the installed pi-coding-agent types."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional


def find_bin(name: str) -> Optional[str]:
    """Resolve a binary via shutil.which (handles .cmd/.exe on Windows)."""
    return shutil.which(name)


def require_bin(name: str) -> str:
    path = find_bin(name)
    if not path:
        print(f"tsc-check: {name} not found on PATH", file=sys.stderr)
        sys.exit(1)
    return path


def bun_install_dir() -> Path:
    bun_install = os.environ.get("BUN_INSTALL")
    if bun_install:
        return Path(bun_install).expanduser()
    return Path.home() / ".bun"


def resolve_pi_agent_dir() -> Path:
    candidates: list[Path] = []

    bun_global = (
        bun_install_dir()
        / "install"
        / "global"
        / "node_modules"
        / "@mariozechner"
        / "pi-coding-agent"
    )
    candidates.append(bun_global)

    pi_bin = find_bin("pi")
    if pi_bin:
        candidates.append(Path(pi_bin).resolve().parent.parent)

    npm = find_bin("npm")
    if npm:
        result = subprocess.run([npm, "root", "-g"], capture_output=True, text=True)
        if result.returncode == 0:
            npm_global = Path(result.stdout.strip())
            candidates.append(npm_global / "@mariozechner" / "pi-coding-agent")

    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.exists():
            return resolved

    checked = "\n  - ".join(str(path) for path in seen)
    print(
        "tsc-check: could not locate @mariozechner/pi-coding-agent. Checked:\n"
        f"  - {checked}",
        file=sys.stderr,
    )
    sys.exit(1)


def run_tsc(local_tsconfig: str, cwd: str) -> int:
    tsc = find_bin("tsc")
    if tsc:
        result = subprocess.run(
            [tsc, "-p", local_tsconfig],
            capture_output=True,
            text=True,
            cwd=cwd,
        )
        output = result.stdout + result.stderr
        if output:
            print(output, end="")
        return result.returncode

    bun = find_bin("bun")
    if bun:
        result = subprocess.run(
            [bun, "x", "tsc", "-p", local_tsconfig],
            capture_output=True,
            text=True,
            cwd=cwd,
        )
        output = result.stdout + result.stderr
        if output:
            print(output, end="")
        return result.returncode

    print("tsc-check: neither tsc nor bun found on PATH", file=sys.stderr)
    return 1


def main():
    ext_dir = os.path.dirname(os.path.abspath(__file__))
    local_tsconfig = os.path.join(ext_dir, "tsconfig.local.json")

    need_regen = True

    if need_regen:
        pi_agent_dir = resolve_pi_agent_dir()
        pi_agent = pi_agent_dir.as_posix()
        pi_node_modules_dir = pi_agent_dir / "node_modules"
        if not pi_node_modules_dir.exists():
            pi_node_modules_dir = pi_agent_dir.parent.parent
        pi_nm = pi_node_modules_dir.as_posix()

        config = {
            "extends": "./tsconfig.json",
            "compilerOptions": {
                "paths": {
                    "@mariozechner/pi-coding-agent": [pi_agent],
                    "@mariozechner/pi-ai": [f"{pi_nm}/@mariozechner/pi-ai"],
                    "@mariozechner/pi-agent-core": [f"{pi_nm}/@mariozechner/pi-agent-core"],
                    "@mariozechner/pi-tui": [f"{pi_nm}/@mariozechner/pi-tui"],
                    "@sinclair/typebox": [f"{pi_nm}/@sinclair/typebox"],
                    "yaml": [f"{pi_nm}/yaml"],
                },
                "typeRoots": [f"{pi_nm}/@types"],
            },
        }
        with open(local_tsconfig, "w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")

    sys.exit(run_tsc(local_tsconfig, ext_dir))


if __name__ == "__main__":
    main()
