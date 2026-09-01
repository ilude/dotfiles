---
name: browser-tools
description: "Local browser automation via Brave/Chrome CDP. Use for existing tabs, real profiles, logged-in checks, screenshots, or browser A/B tests."
---

# Browser Tools

Prefer `web_search`, `web_fetch`, or a source-specific tool unless the task requires JavaScript, logged-in state, screenshots, or visible interaction.

## Browser Boundary

1. Run `scripts/agent-browser-brave --check` and `--status` before launch or attachment.
2. Treat an opened URL and an automation connection as separate facts. A URL forwarded to an existing Chromium process does not prove CDP attached to that tab.
3. Use the dedicated Pi profile by default. Use a real profile only after the user explicitly requests logged-in state.
4. Before using a real profile, read Brave `Local State` and report the profile directory and display name. Verify the expected account in the rendered page before drawing conclusions from account-specific state.
5. Do not export cookies, tokens, CAPTCHA material, or credentials.

## Real Profile And Process Ownership

Chromium allows one process to own a user-data directory. If the requested profile is already open without CDP, a second launch may forward the URL to the existing process and ignore new debugging or extension flags.

- Do not claim access unless the CDP endpoint is online and the target appears in its tab list.
- Do not restart a real browser profile unless the user authorized that disruption.
- Before shutdown, identify the exact browser root and expected user-data directory. Stop only that owned tree.
- Treat a saved launcher PID as advisory. Chromium may hand off to a different surviving root PID. Reconcile ownership through the CDP endpoint, effective command line, user-data directory, and process tree before cleanup.
- Never kill every Brave or Chrome process by image name.
- After relaunch, verify session restoration and the expected account before continuing.

On Windows, do not construct a real-profile launch with an unverified `Start-Process -ArgumentList` string when the user-data path contains spaces. Use the maintained wrapper or verify the effective process command line and CDP profile identity before navigation.

## Tabs

Use stable `agent-browser` tab IDs such as `t22`, not list positions or guessed labels:

```bash
agent-browser --cdp <port> --session <session> tab list
agent-browser --cdp <port> --session <session> tab t22
agent-browser --cdp <port> --session <session> snapshot
```

After session restore or `open`, explicitly select the intended tab and verify its URL before inspecting the DOM. The active tab may be an unrelated restored page.

## Controlled Browser Comparisons

For extension, account, or setting A/B tests, hold account, profile, query, locale, region, cookies, and result mode constant. Change one variable at a time.

Before accepting a comparison, record observable evidence for:

- effective browser command line and profile directory
- expected signed-in account in the rendered page
- CDP target URL and selected stable tab ID
- extension state, including extension targets when relevant
- query URL and result mode
- CAPTCHA, consent, abuse-exemption, or experiment changes

A CAPTCHA completion, new cookie, account mismatch, profile-path parsing error, or changed Google experiment assignment invalidates the comparison. Re-establish the baseline instead of attributing the difference to extensions.

## Preferred Wrapper

```bash
scripts/agent-browser-brave --open https://example.com --title --snapshot
scripts/agent-browser-brave --screenshot /tmp/pi-agent-browser.png
scripts/agent-browser-brave --status
scripts/agent-browser-brave --close-owned
```

Use `--real-brave-profile <directory>` rather than assuming a display name maps to `Default`. The wrapper's state must not be treated as proof when CDP identity or process ownership contradicts it.

## Extraction

- Inspect DOM snapshots before screenshots.
- Bound scrolling and waits; report partial or blocked results directly.
- Let the user complete CAPTCHAs manually. Do not solve, relay, or bypass them.
- For X/Twitter, Reddit, YouTube, Gmail, Drive, or Calendar, prefer the source-specific skill or tool when available.
