#!/usr/bin/env python3
# install.d:
#   reason: Keep Pi's /model picker in configured provider/model order.
#   remove_when: Upstream Pi stops promoting the current/default models above configured order.
#   safe_to_skip: true
#   idempotent: true
"""Remove current/default promotion from installed Pi model selectors."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

PACKAGE = "@earendil-works/pi-coding-agent"
RELATIVE = Path("dist/modes/interactive/components/model-selector.js")
ORDER_MARKER = "// Preserve registry/configured order within each provider."
DISPLAY_MARKER = "// Display compact labels without changing provider model IDs."
OLD = """        // Sort: current model first, default model second, then by provider.
        sorted.sort((a, b) => {
            const aIsCurrent = modelsAreEqual(this.currentModel, a.model);
            const bIsCurrent = modelsAreEqual(this.currentModel, b.model);
            if (aIsCurrent && !bIsCurrent)
                return -1;
            if (!aIsCurrent && bIsCurrent)
                return 1;
            const aIsDefault = this.isDefaultModel(a.model);
            const bIsDefault = this.isDefaultModel(b.model);
            if (aIsDefault && !bIsDefault)
                return -1;
            if (!aIsDefault && bIsDefault)
                return 1;
            return a.provider.localeCompare(b.provider);
        });"""
NEW = """        // Preserve registry/configured order within each provider.
        sorted.sort((a, b) => a.provider.localeCompare(b.provider));"""
DISPLAY_OLD = '            const modelText = isSelected ? theme.fg("accent", item.id) : item.id;'
DISPLAY_V1 = """            // Display major-only GPT generations with an explicit .0 for alignment.
            const displayId = item.id.replace(/^gpt-(\\d+)-(?=astra|sol|terra|luna)/u, "gpt-$1.0-");
            const modelText = isSelected ? theme.fg("accent", displayId) : displayId;"""
DISPLAY_NEW = """            // Display compact labels without changing provider model IDs.
            const displayId = (item.provider === "bedrock-mantle"
                ? item.id.replace(/^(?:anthropic\\.claude-|openai\\.)/u, "")
                : item.id).replace(/^gpt-(\\d+)-(?=astra|sol|terra|luna)/u, "gpt-$1.0-");
            const modelText = isSelected ? theme.fg("accent", displayId) : displayId;"""
BUNDLE_ORDER_MARKER = "/* Preserve registry/configured order within each provider. */"
BUNDLE_DISPLAY_V1_MARKER = "/* Display major-only GPT generations with an explicit .0 for alignment. */"
BUNDLE_DISPLAY_MARKER = "/* Display compact labels without changing provider model IDs. */"
BUNDLE_ORDER_PATTERN = re.compile(r"sortModels\(models\)\{let sorted=\[\.\.\.models\];return sorted\.sort\(\(a,b2\)=>\{.*?\}\),sorted\}getScopeText\(\)")
BUNDLE_ORDER_NEW = f"sortModels(models){{let sorted=[...models];{BUNDLE_ORDER_MARKER}return sorted.sort((a,b2)=>a.provider.localeCompare(b2.provider)),sorted}}getScopeText()"
BUNDLE_DISPLAY_OLD = 'modelText=isSelected?theme.fg("accent",item.id):item.id'
BUNDLE_DISPLAY_V1 = f'{BUNDLE_DISPLAY_V1_MARKER}displayId=item.id.replace(/^gpt-(\\d+)-(?=astra|sol|terra|luna)/u,"gpt-$1.0-"),modelText=isSelected?theme.fg("accent",displayId):displayId'
BUNDLE_DISPLAY_NEW = f'{BUNDLE_DISPLAY_MARKER}displayId=(item.provider==="bedrock-mantle"?item.id.replace(/^(?:anthropic\\.claude-|openai\\.)/u,""):item.id).replace(/^gpt-(\\d+)-(?=astra|sol|terra|luna)/u,"gpt-$1.0-"),modelText=isSelected?theme.fg("accent",displayId):displayId'


def command_output(args: list[str]) -> str | None:
    try:
        return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def candidates() -> list[Path]:
    roots: list[Path] = []
    pnpm_root = command_output(["pnpm", "root", "-g"])
    if pnpm_root:
        root = Path(pnpm_root)
        roots.extend([root, root / "node_modules"])
        if root.exists():
            roots.extend(path / "node_modules" for path in root.iterdir() if path.is_dir())
    local = os.environ.get("LOCALAPPDATA")
    bases = [Path(local) / "pnpm/global"] if local else []
    bases.extend([Path.home() / ".local/share/pnpm/global", Path.home() / "Library/pnpm/global"])
    for base in bases:
        if base.exists():
            roots.extend(path / "node_modules" for path in base.iterdir() if path.is_dir())
    found: set[Path] = set()
    for root in roots:
        package_root = root / PACKAGE
        direct = package_root / RELATIVE
        if direct.is_file():
            found.add(direct.resolve())
        for bundle in (package_root / "dist/bundle/chunks").glob("*.js"):
            text = bundle.read_text(encoding="utf-8")
            if BUNDLE_DISPLAY_OLD in text or BUNDLE_DISPLAY_V1_MARKER in text or BUNDLE_DISPLAY_MARKER in text:
                found.add(bundle.resolve())
        store = root.parent / ".pnpm"
        if store.exists():
            for package_dir in store.glob("@earendil-works+pi-coding-agent@*"):
                package_root = package_dir / "node_modules" / PACKAGE
                path = package_root / RELATIVE
                if path.is_file():
                    found.add(path.resolve())
                for bundle in (package_root / "dist/bundle/chunks").glob("*.js"):
                    text = bundle.read_text(encoding="utf-8")
                    if BUNDLE_DISPLAY_OLD in text or BUNDLE_DISPLAY_V1_MARKER in text or BUNDLE_DISPLAY_MARKER in text:
                        found.add(bundle.resolve())
    return sorted(found)


def main() -> int:
    paths = candidates()
    if not paths:
        print("No pnpm-global Pi model selector found; nothing to patch.")
        return 0
    applied = False
    for path in paths:
        text = path.read_text(encoding="utf-8")
        changed = False
        if path.name.startswith("chunk-"):
            if BUNDLE_ORDER_MARKER not in text and BUNDLE_ORDER_PATTERN.search(text):
                text = BUNDLE_ORDER_PATTERN.sub(BUNDLE_ORDER_NEW, text, count=1)
                changed = True
            if BUNDLE_DISPLAY_MARKER not in text:
                if BUNDLE_DISPLAY_V1 in text:
                    text = text.replace(BUNDLE_DISPLAY_V1, BUNDLE_DISPLAY_NEW, 1)
                    changed = True
                elif BUNDLE_DISPLAY_OLD in text:
                    text = text.replace(BUNDLE_DISPLAY_OLD, BUNDLE_DISPLAY_NEW, 1)
                    changed = True
            complete = BUNDLE_ORDER_MARKER in text and BUNDLE_DISPLAY_MARKER in text
        else:
            if ORDER_MARKER not in text and OLD in text:
                text = text.replace(OLD, NEW, 1)
                changed = True
            if DISPLAY_MARKER not in text:
                if DISPLAY_V1 in text:
                    text = text.replace(DISPLAY_V1, DISPLAY_NEW, 1)
                    changed = True
                elif DISPLAY_OLD in text:
                    text = text.replace(DISPLAY_OLD, DISPLAY_NEW, 1)
                    changed = True
            complete = ORDER_MARKER in text and DISPLAY_MARKER in text
        if changed:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"patched: {path}")
        elif complete:
            print(f"already patched: {path}")
        else:
            print(f"unsupported version skipped: {path}")
        applied = applied or complete
    return 0 if applied else 1


if __name__ == "__main__":
    raise SystemExit(main())
