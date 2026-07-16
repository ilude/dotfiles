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


def package_manager_roots() -> list[Path]:
    roots: list[Path] = []
    for package_manager in ("pnpm", "npm"):
        executable = find_bin(package_manager)
        if not executable:
            continue
        result = subprocess.run([executable, "root", "-g"], capture_output=True, text=True)
        if result.returncode == 0:
            roots.append(Path(result.stdout.strip()))
    return roots


def resolve_pi_agent() -> tuple[Path, Path]:
    package_path = Path("@earendil-works") / "pi-coding-agent"
    project_node_modules = Path(__file__).resolve().parent.parent / "node_modules"
    node_module_roots = [project_node_modules]

    pi_bin = find_bin("pi")
    if pi_bin:
        node_module_roots.append(Path(pi_bin).resolve().parent / "node_modules")

    node_module_roots.extend(package_manager_roots())
    node_module_roots.append(bun_install_dir() / "install" / "global" / "node_modules")

    seen: set[Path] = set()
    checked: list[Path] = []
    for node_modules in node_module_roots:
        expanded_root = node_modules.expanduser()
        candidate = expanded_root / package_path
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        checked.append(candidate)
        if candidate.exists():
            return candidate, expanded_root

    locations = "\n  - ".join(str(path) for path in checked)
    print(
        f"tsc-check: could not locate @earendil-works/pi-coding-agent. Checked:\n  - {locations}",
        file=sys.stderr,
    )
    sys.exit(1)


def run_tsc(local_tsconfig: str, cwd: str) -> int:
    local_bin = Path(cwd).parent / "node_modules" / ".bin"
    local_tsc = local_bin / ("tsc.CMD" if os.name == "nt" else "tsc")
    tsc = str(local_tsc) if local_tsc.exists() else find_bin("tsc")
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
        pi_agent_dir, pi_node_modules_dir = resolve_pi_agent()
        pi_agent = pi_agent_dir.as_posix()
        pi_nm = pi_node_modules_dir.as_posix()

        config = {
            "extends": "./tsconfig.json",
            "compilerOptions": {
                "baseUrl": ".",
                "allowImportingTsExtensions": True,
                "types": ["node"],
                "paths": {
                    "@earendil-works/pi-coding-agent": [
                        pi_agent,
                        f"{pi_agent}/dist/index.js",
                    ],
                    "@earendil-works/pi-ai": [
                        f"{pi_nm}/@earendil-works/pi-ai",
                        f"{pi_nm}/@earendil-works/pi-ai/dist/index.js",
                    ],
                    "@earendil-works/pi-ai/oauth": [
                        f"{pi_nm}/@earendil-works/pi-ai/dist/oauth",
                        f"{pi_nm}/@earendil-works/pi-ai/dist/oauth.js",
                    ],
                    "@earendil-works/pi-agent-core": [
                        f"{pi_nm}/@earendil-works/pi-agent-core",
                        f"{pi_nm}/@earendil-works/pi-agent-core/dist/index.js",
                    ],
                    "@earendil-works/pi-tui": [
                        f"{pi_nm}/@earendil-works/pi-tui",
                        f"{pi_nm}/@earendil-works/pi-tui/dist/index.js",
                    ],
                    "typebox": [f"{pi_nm}/typebox"],
                    "typebox/compile": [f"{pi_nm}/typebox/compile"],
                    "typebox/value": [f"{pi_nm}/typebox/value"],
                    "@sinclair/typebox": [f"{pi_nm}/@sinclair/typebox"],
                    "@sinclair/typebox/compile": [f"{pi_nm}/@sinclair/typebox/compile"],
                    "@sinclair/typebox/value": [f"{pi_nm}/@sinclair/typebox/value"],
                    "yaml": [f"{pi_nm}/yaml"],
                },
            },
        }
        with open(local_tsconfig, "w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")

    sys.exit(run_tsc(local_tsconfig, ext_dir))


if __name__ == "__main__":
    main()
