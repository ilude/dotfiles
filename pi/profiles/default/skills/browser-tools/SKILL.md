---
name: browser-tools
description: "Operate local Brave through native session/page tools. Load for existing local login, exact local tabs, localhost testing, or local browser comparisons; public cloud screenshots use the web-tools routing skill."
---

# Browser tools

Use [web tool selection](../web-tools/SKILL.md) to choose between search, extraction, cloud browsing, and this local Brave workflow. Use this skill when the task needs local browser state, local access, or the operator's exact browser; a public screenshot alone does not require a local profile.

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

Every `browser_page` call includes the current session ID. Actions other than `list` and `open` also include the exact raw CDP target ID. Supply the exact `frame_id` for iframe controls. Fill takes exactly one of `value` or `secret_ref`; secret references use the operator-configured BWS record/origin/frame/field binding.

- `open` returns the newly created raw target ID, even when restored tabs or duplicate URLs exist.
- `select` binds subsequent operator intent to that exact ID.
- A closed, replaced, stale, or cross-session target fails. Never substitute the focused tab or a matching URL.
- Snapshot the exact target/frame before acting. Use emitted unique control selectors and inspect disabled/visibility facts; never guess an omitted selector. Separate text/control budgets report truncation. Focus omitted content with snapshot's optional unique subtree `selector`.
- Use bounded `scroll`, then snapshot again: default `scroll_mode: "by"` uses integer `delta_x`/`delta_y` from -2000 to 2000 (at least one nonzero), with optional unique container `selector`. `scroll_mode: "into_view"` requires an element selector and no deltas; inspect actual movement, `inView`, and ancestor truncation because movement is bounded within the exact frame. Movement is not proof that all virtualized content was read. Prefer current state/selector evidence over network-idle waits on Office pages.
- Click/fill reject ambiguous or disabled controls without automatic retargeting or mutating retries. For stale/missing controls, re-snapshot the named target/frame. Non-rendered controls are reported, not universally refused.
- Use `snapshot` before `screenshot` when the surface is safe.
- `fill` replaces an input, textarea, or contenteditable element's text. `press` sends a named key or chord such as `Enter`, `Tab`, or `Control+a`. `paste` inserts `value` as text, preserving tabs and line breaks; rich editors can handle its paste event. For `press` and `paste`, supply a selector to focus a specific element, or omit it to use the focused element in the chosen frame.
- `upload` assigns local `files` to the file input identified by `selector`; relative paths resolve against the tool's working directory. File inputs may be hidden.
- Cookie/storage APIs and arbitrary model-callable evaluation are unavailable. Snapshots omit control values. Screenshots capture the actual page without password masking, frame-by-frame approvals, or text/image screening.

Browser actions do not use Damage Control's AI authorization or scope interpretation. Neither owned nor attached sessions intercept page requests. Browser/session/tab identity checks remain; use the requested account and destination and follow the user's instructions for edits and submissions.

Actual CAPTCHA challenges require manual completion. Native TLS/Safe Browsing warnings are not bypassed. For disposable local development only, `browser_session` action `start` may explicitly set `allow_localhost_tls_errors: true`; it is accepted only for a new Pi-owned isolated session and uses Chromium's localhost-only exception, not a global certificate-error bypass. It never applies to real-profile starts, attached browsers, or remote hosts. Omit it for normal operation.

Use the default profile's focused Vitest coverage for synthetic validation. Browser process/page control uses TypeScript and CDP, with a narrow PowerShell CIM adapter on Windows; it does not use `agent-browser` or `npx`. Local BWS retrieval separately uses the bounded `uv`/Python Bitwarden SDK helper. Do not run a live Brave smoke unless the operator explicitly authorizes it.
