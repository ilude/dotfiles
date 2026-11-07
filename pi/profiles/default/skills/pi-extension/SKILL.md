---
name: pi-extension
description: Implement or review Pi extensions, tools, hooks, commands, session lifecycle, UI, subprocesses, and extension-owned prompt context or caching.
---

# Pi extension development

## Sources and profile ownership

The active Pi profile is the configuration directory used by the running Pi process, resolved by Pi's `getAgentDir()`. `PI_CODING_AGENT_DIR` overrides that directory. Do not infer the active profile from the working directory.

- Read the installed Pi documentation and examples for the affected API. Resolve uncertainty against installed source/types, not assumptions from other extension systems.
- Follow comparable active-profile extensions, matching purpose and operating environment. Reuse their helpers where applicable.
- Keep tool descriptions, schemas, and model guidance with the owning tool. Enforce required behavior in code, not prompt instructions alone.
- For native `tool_search` and `codemode`, treat discovery as availability, not authority: deferred tools are searchable, direct tools are not, and the active role's registered callable set still limits scripts. Scripted calls pass through normal validation and `tool_call`/`tool_result` hooks. Do not infer that a structured error value means success or that a completed external side effect is rolled back when a script fails.
- Use typed `outputSchema` plus matching `structuredContent` for composable data, while keeping model-facing content and rendered details compatible. Screen and project results before returning structured data; native codemode does not validate tool outputs against their schemas.

## Host adapters and incremental inversion of control

Keep one default profile across T3 Code, Herdr desktop, Herdr TUI, and ordinary terminals. Move host-dependent behavior toward a shared host resolver and small adapters, incrementally when fixing or extending an affected feature. This is the architectural direction, not an already implemented common adapter API or authorization for a broad migration.

- Start with `lib/herdr-host.ts` and its extension for existing detection and verified membership. Reuse or evolve that boundary rather than scattering new environment checks through extensions. Preserve Herdr core-only and unverified membership distinctions; installed binaries do not establish the caller's host.
- Distinguish the immediate Pi client/transport from an enclosing terminal host. T3 launches Pi in RPC mode and currently injects `T3_PI_MCP_EXTENSION_PATH` and `T3_PI_RUNTIME_MODE`. The former is a useful T3 integration signal, not an authentication or ownership check. RPC alone does not identify T3, and inherited host markers alone do not establish that a child owns its ancestor's UI. Resolve nested or conflicting signals explicitly at the shared boundary, preserving existing verified Herdr precedence where applicable.
- Keep feature logic host-neutral. Inject a narrow adapter into the feature's factory or helper; let the composition boundary choose its implementation. Express operations by intent, such as reporting completion or launching a session, rather than making every consumer switch on host names. Plain typed objects and functions are enough; do not introduce a dependency-injection framework, plugin registry, or speculative universal host interface.
- Separate feature data from presentation. Adapters own terminal styling, status/footer updates, RPC-safe notices, and host-specific launch/layout calls as those capabilities are needed. T3 displays Pi notifications as system notices and does not render Pi's terminal footer; do not send terminal color escapes to it. Whether to suppress a notice or display plain text remains a feature behavior decision, not something host detection decides implicitly.
- Expose only capabilities actually implemented for that host. Detecting Herdr desktop does not port the original TUI's pane, subagent, plan, or update operations. Preserve standalone terminal behavior and existing unsupported-host outcomes unless the requested change includes changing them.
- Implement only the adapter slice needed by the current request and migrate its affected callers. Leave unrelated extensions untouched; grow the shared contract when a concrete next use requires it. Keep resolution and adapter dependencies injectable so focused checks can exercise host selection separately from feature behavior.

## Runtime lessons

- In UI render callbacks, read already-computed state. Perform filesystem scans, network requests, and subprocess work outside those callbacks.
- Before a command starts slow work such as Git, network, or model calls, show that the command was received. Clear temporary progress indicators when the work finishes, fails, or is cancelled.
- Separate command presentation from model input. Record interface-only command invocations with `appendEntry()` and an entry renderer. For prompt-backed commands, keep the expanded prompt model-visible but render only the exact `/command` invocation and localized start date/time.
- Before adding a subprocess, check for an existing helper or equivalent Node API. When a subprocess is needed, specify its arguments, timeout, cancellation handling, and whether output is consumed or discarded.
- At path boundaries, identify the consumer before converting: native filesystem paths, repository IDs, and shell paths are different contracts. Reuse `lib/path-identity.ts` for repository IDs and path comparison, not shell-path conversion. For shell subprocesses, establish which executable receives the arguments. On Windows, use the existing `Get-GitBash` resolver in `powershell/lib/path-utils.ps1` when Git Bash is required; bare `bash` can select WSL instead. Reuse that resolver rather than duplicating executable discovery. Verify the actual Node-to-subprocess call on the affected platform, not only the script from another shell. A separator replacement alone does not establish compatibility.
- When tests or subprocesses launch Pi, invoke the installed `pi` shim or resolve the CLI from the package's `bin.pi` manifest entry. Do not execute unbundled CLI or experimental server modules. Those internal paths may require `@earendil-works/pi-server`, which is intentionally not a default-profile dependency; do not add it to repair a test harness.
- For state that belongs to one session, initialize it from that session and stop using it after switching sessions. Clean up timers and subscriptions created for that session when it ends.

## Prompt context and caching

When editing model-visible instructions, load [prompting](../prompting/SKILL.md) for composition and wording. For reviews that must reconstruct a Pi model call, use the [instruction-composition reference](references/instruction-composition.md).

- Keep unchanged system instructions and tool definitions byte-stable, with deterministic ordering and no incidental timestamps or counters.
- Replace stale extension-owned state rather than accumulating snapshots; preserve conversation history. Correctness and tool availability take precedence over cache reuse, including when restoring context after compaction or session reconstruction.
- For changes to always-visible prompt composition, compare composed byte counts by audience and test required inclusion, unrelated exclusion, deterministic output, and a justified size ceiling.
- Inspect the affected provider's request construction when diagnosing cache behavior. Similar extension context does not guarantee identical provider payloads or cache hits.
- Use reported provider usage to assess caching. Missing values are not zero, and cache-read counts alone do not establish cost or quota savings.

## Tool presentation

- Design the collapsed view for the operator rather than serializing the tool result. Show the action, a recognizable subject, the outcome, and any actionable warning.
- Prefer names, labels, paths, and concise descriptions over internal IDs. Keep pane IDs, UUIDs, protocol fields, and other transport metadata in expanded details unless the operator must act on them.
- Render structured results semantically: confirmations as short statements, lists as bounded rows, and captured output as output rather than JSON containing an `output` field.
- Give in-progress calls a meaningful heading. On completion, avoid empty cards and avoid repeating the same information in both the call and result.
- Keep exact model-facing content separate from presentation. A compact renderer must not remove evidence needed by the model or hide complete diagnostic details from the expanded view.
- Render expected failures in plain language with relevant context. Preserve raw error codes and protocol diagnostics in expanded details.
- Test collapsed and expanded rendering, long values, missing optional labels, errors, and narrow terminal widths.

## Validation

Run checks for the changed behavior using the active profile's existing test setup. The default profile's bounded native-composition smoke is `node scripts/native-composition-smoke.mjs` from `pi/profiles/default/`; it exercises installed Pi's actual native search and QuickJS codemode with offline nested-tool fixtures, not a model or live service. Tests that need a resource loader may use the package's self-contained bundle rather than traversing unrelated unbundled exports. Distinguish automated coverage from live lifecycle/UI checks; do not require a full runtime audit for every extension change.
