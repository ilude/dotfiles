---
name: browser-tab-capture
description: Brave tab capture/recovery. Use for exporting, archiving, saving, or recovering open Brave tabs or Chromium session files.
---

# Browser Tab Capture

Routing card for sensitive Brave tab capture. Tab URLs are private; store captures in the private vault, not tracked paths.

## Commands

```bash
scripts/brave-tab-capture --json
scripts/brave-tab-capture --cdp-port 9222 --json
scripts/brave-tab-capture --session-only --json
scripts/brave-tab-capture --profile Default --json
scripts/brave-tab-capture --migrate-existing --json
```

The script detects existing CDP endpoints first, then falls back to session-file parsing. It never starts, stops, or kills Brave.

## Output Contract

Use the private-store layout:

- Note: `private/browser-tabs/brave/<timestamp>.md`
- Attachments: `private/_attachments/browser-tabs/brave/<timestamp>/`
- Index: `private/_indexes/browser-tabs.md`

Report method and limitations: `cdp` is live CDP capture; `session` is parsed copied session files and may lag or skip locked files. Do not print captured URLs/titles when migrating or summarizing sensitive output.

## Safety

- Do not kill Brave to unlock files.
- Do not write captures under `.pi/` or tracked paths.
- Do not force-add `private/`.
- Do not claim session parsing is live.
