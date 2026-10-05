---
name: browser-tools
description: "Local browser automation via Brave CDP. Use for logged-in checks, exact page targets, screenshots, or controlled browser comparisons."
---

# Browser tools

Prefer `web_search`, `web_fetch`, or a source-specific tool unless the task requires JavaScript, logged-in state, screenshots, or visible interaction. For setup, credential binding, stale-session recovery, and enforcement limits, see the [browser security and operation guide](../../../../../docs/browser-security.md).

## Start with discovery

Use Pi's tools rather than shell-level profile, PID, or active-tab guesses:

1. Call `browser_session` with `action: "discover"`.
2. For a real profile, choose one candidate whose Brave profile directory and live `Local State` display name match the operator's intent.
3. Save the alias locally with `/browser-setup` using its exact `profileDirectory` and, when needed to disambiguate roots, `userDataDir`.
4. For Pi-owned automation, call `browser_session` with `action: "start"`, `profile_mode: "real"`, and that alias. Isolated mode is the default and needs no local profile file.
5. For an operator-launched browser, use the explicit `browser_session` `action: "attach"` with the configured alias (and optional `cdp_port`, default `9222`). Attach never launches Brave: it requires a live loopback CDP endpoint and a matching Brave root process carrying explicit `--user-data-dir`, `--profile-directory`, `--remote-debugging-address=127.0.0.1`, and port flags.
6. Verify the website's rendered account identity separately. Brave profile metadata does not prove the signed-in website account.

Tracked `browser-profiles.schema.json` and `browser-profiles.example.json` describe identity-free configuration. Real aliases stay in the active profile's `browser-profiles.json`; runtime ownership stays in its `browser/session.json`. Legacy aliases are copied once into the default profile, but session state and browser data are never migrated. Never add machine-local files to tracked fixtures or telemetry.

Supported Brave stable roots are discovered from `Local State` on Windows, macOS, and Linux. `BRAVE_USER_DATA_DIR` may name an alternate root. Missing, corrupt, stale, duplicate, or ambiguous metadata must fail with setup guidance rather than selecting `Default` or a display name.

## Session ownership

Only one automation session may own the machine-local registry. `browser_session` records and revalidates the surviving Brave root's process identity, canonical user-data root, profile directory, CDP port, and generated launch marker for Pi-owned launches. Attached sessions instead require the explicit real-profile tuple and loopback address; their process need not carry Pi's generated marker.

- Do not start a second session or attach an untracked browser.
- Never kill Brave or Chrome by image name.
- Treat `detached`, `graceful_close_incomplete`, and `failed` as not stopped.
- Restarting an occupied real profile requires the current per-call authorization returned for that exact process tuple. Do not reuse authorization after process or profile state changes. Attached sessions cannot be restarted by Pi.
- Session shutdown cleans only an isolated session with proven ownership. It preserves real-profile and attached browsers. Stopping an attached session only disconnects and clears Pi's session record; it never terminates the operator's browser.

## Exact page targets

Every `browser_page` call includes the current session ID. Actions other than `list` and `open` also include the exact raw CDP target ID. Supply the exact `frame_id` for iframe controls. Fill takes exactly one of `value` or `secret_ref`; secret references work only with an operator-configured, exact BWS record/origin/frame/field binding and login-purpose policy authorization. Direct disposable development values remain supported.

- `open` returns the newly created raw target ID, even when restored tabs or duplicate URLs exist.
- `select` binds subsequent operator intent to that exact ID.
- A closed, replaced, stale, or cross-session target fails. Never substitute the focused tab or a matching URL.
- Use `snapshot` before `screenshot` when the surface is safe.
- Cookie/storage APIs and arbitrary model-callable evaluation are unavailable. Snapshots omit control values; supported sensitive controls are masked for screenshots. This cannot remove arbitrary reflected pixels or guarantee complete visual screening.

Actual CAPTCHA challenges require manual completion; challenge words elsewhere do not block ordinary page use. Login/reading authorization does not authorize posting, messaging, purchases, deletion, or security changes. Native TLS/Safe Browsing warnings are not bypassed. Localhost development is supported; other private-network destinations need direct request or local configuration. See the operation guide for recovery and residual network/model-review limits.

Use the default profile's focused Vitest coverage for synthetic validation. Browser process/page control uses TypeScript and CDP, with a narrow PowerShell CIM adapter on Windows; it does not use `agent-browser` or `npx`. Local BWS retrieval separately uses the bounded `uv`/Python Bitwarden SDK helper. Do not run a live Brave smoke unless the operator explicitly authorizes it.
