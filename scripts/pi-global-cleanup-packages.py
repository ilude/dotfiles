#!/usr/bin/env python3
"""List exact direct dependency names from pnpm's global JSON output."""

import json
import sys
from typing import TextIO


def list_global_packages(source: TextIO, output: TextIO) -> None:
    """Preserve pnpm package names, including their scopes, for exact matching."""
    for project in json.load(source):
        print("\n".join(project.get("dependencies", {})), file=output)


if __name__ == "__main__":
    list_global_packages(sys.stdin, sys.stdout)
