#!/usr/bin/env python3
"""Remove only the obsolete pp link installed by this checkout."""

import argparse
from pathlib import Path


def remove_owned_pp_link(root: Path, home: Path) -> bool:
    link = home / ".local" / "bin" / "pp"
    if not link.is_symlink():
        return False
    if link.resolve() != (root / "scripts" / "pp").resolve():
        return False
    link.unlink()
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    if remove_owned_pp_link(args.root, args.home):
        print("Removed obsolete repository-owned pp link; use pi.")


if __name__ == "__main__":
    main()
