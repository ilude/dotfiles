# Default Pi Brave operation

The default Pi profile provides `browser_session`, `browser_page`, and `/browser-setup`. The current implementation prioritizes working browser control. Custom Damage Control authorization, AI intent/review decisions, network-request interception, private-transfer tracking, and screenshot masking are not part of browser execution. This is not a browser or network sandbox. General shell tools retain their separate configuration.

## Setup and session ownership

Use `browser_session` with `action: "discover"` to identify Brave profiles from live `Local State` metadata. Match the exact profile directory and display name, then save a local alias through `/browser-setup`. Setup accepts `alias`, `profileDirectory`, optional `userDataDir`, and optional `extensionsExpected`. Machine-local aliases belong in the active profile's ignored `browser-profiles.json`, not tracked examples.

- `start` defaults to an isolated browser. A real-profile start needs a configured alias.
- `attach` connects to an already running operator-launched browser, using loopback CDP port `9222` by default. The root process must carry matching explicit user-data, profile, loopback address, and port flags.
- Pi does not launch, restart, or terminate an attached browser. Stopping an attachment disconnects tooling and preserves its tabs.
- Only one browser session owns the machine-local registry. Session state records the exact process and profile tuple. A process/profile mismatch stops operations rather than selecting a different browser.

Every `browser_page` call includes the current `session_id`. Except for `list` and `open`, also supply the exact raw `target_id`. For an iframe, use its `frame_id` from snapshot metadata. Opening a page returns its new target ID. A closed/replaced tab is not interchangeable with another tab at the same URL.

Browser tooling keeps its connection across agent turns and disconnects when the Pi session switches or shuts down. Attached Brave and its tabs remain open. The next operation reconnects and verifies the process. Use `status` to diagnose a stale attachment and perform a normal verified attachment to the intended profile when necessary.

## Actions

| Action | Arguments and behavior |
| --- | --- |
| `list` | List current page targets. |
| `open` | Navigate a new target to `url`; return the exact target ID. |
| `select` | Bring an exact target to the front. |
| `snapshot` | Read bounded text and control facts in a target/frame. Optional `selector` focuses a subtree. Includes unique control selectors and frame metadata. |
| `scroll` | Move the document or a selected container, or bring a selected element into view. |
| `screenshot` | Save the actual page as PNG at `output_path`. No per-frame authorization, password masking, or image screening. |
| `click` | Click the element identified by `selector` in the exact frame. |
| `fill` | Replace an input, textarea, or contenteditable element's text using `value`, or fill a configured credential using `secret_ref`. |
| `press` | Send `key`, such as `Enter`, `Tab`, `Escape`, `ArrowDown`, `Control+a`, or `ControlOrMeta+a`. Optional `selector` focuses an element first. |
| `paste` | Insert `value`, preserving tabs and line breaks. Optional `selector` focuses an element first. Rich editors receive a text/plain paste event; ordinary controls use native text insertion when the event is unhandled. |
| `upload` | Set a file input's `files` using its `selector`. Relative local paths resolve against the tool's working directory. Hidden file inputs are supported. |
| `close` | Close the exact target. |

`press` and `paste` operate on the focused element in the chosen frame when `selector` is omitted. Paste does not read or overwrite the operating system clipboard. Editor-specific paste behavior still needs verification on the target application; successful event dispatch alone does not prove a spreadsheet accepted a table.

## Observation and input details

Snapshot text and controls have separate budgets. Truncation is reported. Use a focused snapshot to read omitted controls rather than assuming the entire page was extracted. Snapshot results omit form-control values; screenshots contain actual page pixels, including any visible sensitive information.

Selectors must identify one element in the exact frame. Missing/ambiguous selectors are reported rather than silently choosing a different control. Click/fill report visibility; non-rendered controls are not universally refused. Re-snapshot after a rerender when a selector becomes stale.

The default scroll mode, `by`, accepts integer `delta_x` and `delta_y` between -2000 and 2000, with at least one nonzero delta. A `selector` chooses the container instead of the document. `into_view` requires a selector and no deltas, moving up to 2000 pixels per axis for each of at most 16 ancestors within the selected frame. Returned positions, boundaries, `inView`, and truncation describe movement, not proof that all virtualized content was read. Prefer current state over waiting for network idle on continuously active applications.

The model-callable tools do not expose arbitrary JavaScript, cookies, or browser-storage APIs. Internal fixed CDP expressions implement the actions above. Browser execution uses TypeScript and CDP; Windows process inspection uses a narrow PowerShell CIM adapter. It does not use `agent-browser`, `npx`, or Python for page control.

## Credentials

Direct `value` fills work with normal text inputs. Existing BWS references remain available through the active profile's ignored `browser-credentials.json`. Use the tracked `browser-credentials.example.json` and `browser-credentials.schema.json` for its shape. Bind the exact BWS record/key, page origins, frame origins, fields, and available form origins. Do not put live credentials or record IDs into tracked examples.

The resolver uses Pi's inherited `BITWARDEN_ACCESS_KEY` and the existing Bitwarden SDK helper. It fetches the configured record on demand and passes the value to the chosen field. Record/key/origin/field matching remains part of credential resolution, but does not depend on a Damage Control policy owner or AI approval. Credentials are disclosed to the destination site's scripts as with ordinary login. Values supplied directly in tool arguments remain in the transcript; screenshots are not masked.

## Timeouts and browser warnings

CDP commands default to 30 seconds. Both browser tools accept `timeout_ms` from 1000 to 300000 milliseconds, setting the overall call deadline and command timeout for that call. Overrides do not carry into later calls. Browser/process/frame checks still apply; there are no browser policy approval or intercepted-request deadlines.

Native certificate and Safe Browsing warnings remain browser/operator concerns and are not bypassed. For disposable localhost development only, a new isolated `start` may explicitly request `allow_localhost_tls_errors: true`, using Chromium's localhost-only exception. It defaults to false and is unavailable for real-profile starts and attachments. CAPTCHA completion is manual.

## Validation and current limits

Focused default-profile tests exercise registration, dispatch, identity, CDP commands, and DOM input semantics with synthetic fixtures. Live Brave checks establish actual browser behavior separately; neither proves every website's event handling. The functionality-first changes do not claim security hardening, credential isolation, network confinement, or universal spreadsheet compatibility.

The archived [browser-task-security plan](../.specs/archive/browser-task-security/plan.md) documents the previous policy architecture. It is historical, not the current browser execution contract. Use the [browser skill](../pi/profiles/default/skills/browser-tools/SKILL.md) for the active operating workflow. Reload a settled Pi session or start a fresh process after changing the tools.
