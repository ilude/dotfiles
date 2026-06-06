---
name: browser-tab-capture
description: "Brave browser tab URL capture. Activate when the user asks to capture, export, list, archive, save, or recover open Brave tabs, browser tabs, tab URLs, or session files."
---

# Browser Tab Capture

**Auto-activate when:** The user asks to capture, export, list, archive, save, or recover open Brave tabs, tab URLs, browser sessions, or Chromium session files.

## Core Principle

Tab URLs are sensitive. Capture them deterministically, write the primary note into the private Obsidian vault, store raw artifacts as attachments, and report whether the data came from live CDP or session-file recovery.

## Practical Steps

1. Prefer the tracked capture script:

   ```bash
   scripts/brave-tab-capture --json
   ```

2. For a known Brave CDP port, make the live source explicit:

   ```bash
   scripts/brave-tab-capture --cdp-port 9222 --json
   ```

3. If Brave is not running with CDP, force the session-file path:

   ```bash
   scripts/brave-tab-capture --session-only --json
   ```

4. Use the private vault layout:
   - Note: `private/browser-tabs/brave/<timestamp>.md`
   - Attachments: `private/_attachments/browser-tabs/brave/<timestamp>/`
   - Index: `private/_indexes/browser-tabs.md`

5. Report the method and limitations:
   - `cdp`: live `/json/list` target capture from a Brave CDP endpoint.
   - `session`: copied the newest readable `Session_*` and `Tabs_*` files per profile, then parsed tab URLs and titles. Locked latest files can make this approximate.

## Markdown Format

The Markdown note is the primary Obsidian artifact. It must include YAML frontmatter with at least:

```yaml
---
title: Brave tabs capture 2026-06-06 10:45:09
created: 2026-06-06T10:45:09-04:00
updated: 2026-06-06T10:45:09-04:00
type: browser-tabs
source: brave
capture_method: session
tab_count: 42
locked_files: 2
sensitive: true
tags:
  - private/browser-tabs
  - browser/brave
related:
  - "[[browser-tabs]]"
attachments:
  - "../../_attachments/browser-tabs/brave/20260606-104509/brave-tabs-full.json"
---
```

Use `## Summary`, `## Tabs`, `## Attachments`, and `## Notes` sections. Render tab entries as Markdown links.

## Migration

To migrate legacy captures from timestamp directories into the private vault layout:

```bash
scripts/brave-tab-capture --migrate-existing --json
```

Migration reports paths and counts only. Do not print captured URLs, page titles, JSON contents, or note bodies.

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Killing Brave to unlock files | Destructive and can lose session state | Copy the newest readable session files |
| Writing captures under `.pi/` or tracked paths | Sensitive data can mix with runtime state or diffs | Use the private vault layout |
| Claiming session parsing is live | Session files can lag and locked files may be skipped | State `method=session` and mention locked files |
| Using broad URL regex extraction as the main result | Produces duplicates and history noise | Parse Chromium session commands |
| Force-adding private output | Leaks sensitive browsing data | Keep `private/` ignored |

## Quick Reference

| Need | Command |
|------|---------|
| Default capture | `scripts/brave-tab-capture --json` |
| Live CDP port | `scripts/brave-tab-capture --cdp-port 9222 --json` |
| Session files only | `scripts/brave-tab-capture --session-only --json` |
| Specific profile | `scripts/brave-tab-capture --profile Default --json` |
| Deterministic test output | `scripts/brave-tab-capture --timestamp test-run --json` |
| Migrate legacy captures | `scripts/brave-tab-capture --migrate-existing --json` |

## Notes

The script never starts, stops, or kills Brave. It detects existing CDP endpoints first, then falls back to session-file parsing. Output includes an Obsidian note, `brave-tabs-full.json`, `manifest.json`, copied session files when session parsing is used, and an index entry.
