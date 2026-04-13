#!/usr/bin/env python
"""Type-check Pi extensions against the installed pi-coding-agent types."""

import json
import os
import shutil
import subprocess
import sys


def find_bin(name: str) -> str:
    """Resolve a binary via shutil.which (handles .cmd/.exe on Windows)."""
    path = shutil.which(name)
    if not path:
        print(f"tsc-check: {name} not found on PATH", file=sys.stderr)
        sys.exit(1)
    return path


def main():
    ext_dir = os.path.dirname(os.path.abspath(__file__))
    base_tsconfig = os.path.join(ext_dir, "tsconfig.json")
    local_tsconfig = os.path.join(ext_dir, "tsconfig.local.json")

    need_regen = not os.path.exists(local_tsconfig) or (
        os.path.getmtime(base_tsconfig) > os.path.getmtime(local_tsconfig)
    )

    if need_regen:
        npm = find_bin("npm")
        result = subprocess.run([npm, "root", "-g"], capture_output=True, text=True)
        if result.returncode != 0:
            print("tsc-check: failed to resolve npm global root", file=sys.stderr)
            sys.exit(1)

        npm_global = result.stdout.strip().replace("\\", "/")
        pi_agent = f"{npm_global}/@mariozechner/pi-coding-agent"
        pi_nm = f"{pi_agent}/node_modules"

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

    tsc = find_bin("tsc")
    result = subprocess.run(
        [tsc, "-p", local_tsconfig],
        capture_output=True,
        text=True,
        cwd=ext_dir,
    )
    output = result.stdout + result.stderr
    if output:
        print(output, end="")
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
