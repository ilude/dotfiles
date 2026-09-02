---
name: browser-tools
description: "Local browser automation via Brave CDP. Use for logged-in checks, exact page targets, screenshots, or controlled browser comparisons."
---

# Browser tools

Prefer `web_search`, `web_fetch`, or a source-specific tool unless the task requires JavaScript, logged-in state, screenshots, or visible interaction.

## Start with discovery

Use Pi's tools rather than shell-level profile, PID, or active-tab guesses:

1. Call `browser_session` with `action: "discover"`.
2. For a real profile, choose one candidate whose Brave profile directory and live `Local State` display name match the operator's intent.
3. Save the alias locally with `/browser-setup` using its exact `profileDirectory` and, when needed to disambiguate roots, `userDataDir`.
4. Call `browser_session` with `action: "start"`, `profile_mode: "real"`, and that alias. Isolated mode is the default and needs no local profile file.
5. Verify the website's rendered account identity separately. Brave profile metadata does not prove the signed-in website account.

Tracked `browser-profiles.schema.json` and `browser-profiles.example.json` describe identity-free configuration. Real aliases stay in `~/.pi/agent/browser-profiles.json`; runtime ownership stays in `~/.pi/agent/browser/session.json`. Never add either machine-local file to tracked fixtures or telemetry.

Supported Brave stable roots are discovered from `Local State` on Windows, macOS, and Linux. `BRAVE_USER_DATA_DIR` may name an alternate root. Missing, corrupt, stale, duplicate, or ambiguous metadata must fail with setup guidance rather than selecting `Default` or a display name.

## Session ownership

Only one automation session may own the machine-local registry. `browser_session` records and revalidates the surviving Brave root's process identity, canonical user-data root, profile directory, CDP port, and generated launch marker.

- Do not start a second session or attach an untracked browser.
- Never kill Brave or Chrome by image name.
- Treat `detached`, `graceful_close_incomplete`, and `failed` as not stopped.
- Restarting an occupied real profile requires the current per-call authorization returned for that exact process tuple. Do not reuse authorization after process or profile state changes.
- Session shutdown cleans only an isolated session with proven ownership. It preserves real-profile browsers.

## Exact page targets

Every `browser_page` call includes the current session ID. Actions other than `list` and `open` also include the exact raw CDP target ID.

- `open` returns the newly created raw target ID, even when restored tabs or duplicate URLs exist.
- `select` binds subsequent operator intent to that exact ID.
- A closed, replaced, stale, or cross-session target fails. Never substitute the focused tab or a matching URL.
- Use `snapshot` before `screenshot` when the surface is safe.
- Password fields, credentials, cookies, tokens, storage, arbitrary evaluation, CAPTCHA controls, and protected screenshots/snapshots are outside the tool surface.

Let the operator handle CAPTCHAs or consent interstitials manually. Detection increments the comparison generation, clears the selected target, and invalidates the active comparison unconditionally.

## Controlled comparisons

Record one comparison transaction containing:

- Brave profile directory and live display-name match
- redacted rendered-account alias match
- raw target ID and sanitized URL
- extension command-line mode and runtime extension-target mode
- query and result mode
- personalization indicator
- locale and region
- comparison generation and invalidation events

Accept the second leg only when extension mode is the sole changed invariant. A changed account, CAPTCHA/interstitial handling, locale, query, region, result mode, personalization indicator, experiment state, or comparison generation rejects the comparison. Re-establish the baseline instead of attributing the difference.

Use `scripts/smoke-browser-control.ps1` to validate sanitized evidence. It reports only match status and invariant names, not account content, credentials, CAPTCHA material, or local absolute paths.
