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

## Runtime lessons

- In UI render callbacks, read already-computed state. Perform filesystem scans, network requests, and subprocess work outside those callbacks.
- Before a command starts slow work such as Git, network, or model calls, show that the command was received. Clear temporary progress indicators when the work finishes, fails, or is cancelled.
- Before adding a subprocess, check for an existing helper or equivalent Node API. When a subprocess is needed, specify its arguments, timeout, cancellation handling, and whether output is consumed or discarded.
- For state that belongs to one session, initialize it from that session and stop using it after switching sessions. Clean up timers and subscriptions created for that session when it ends.

## Prompt caching

- Keep unchanged system instructions and tool definitions stable, including deterministic tool ordering. Avoid incidental timestamps or counters in stable prompt content.
- Keep changing task state separate from stable instructions. Replace stale extension-owned current-state context rather than accumulating duplicate snapshots; preserve conversation history.
- Correctness and tool availability take precedence over cache reuse. Restore current context after compaction or session reconstruction without duplicating it.
- Inspect the affected provider's request construction when diagnosing cache behavior. Similar extension context does not guarantee identical provider payloads or cache hits.
- Use reported provider usage to assess caching. Missing values are not zero, and cache-read counts alone do not establish cost or quota savings.

## Validation

Run checks for the changed behavior using the active profile's existing test setup. Distinguish automated coverage from live lifecycle/UI checks; do not require a full runtime audit for every extension change.
