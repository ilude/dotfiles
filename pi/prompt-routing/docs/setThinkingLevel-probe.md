---
title: ExtensionAPI.setThinkingLevel probe (T0 / B1)
date: 2026-04-22
status: complete
branch: a
---

# ExtensionAPI.setThinkingLevel probe result

This document records the Wave 0 / T0 probe for
`pi.setThinkingLevel(level)` on the `ExtensionAPI` surface (plan item B1).
Downstream tasks T2 and T4 are gated on the branch selected here.

## Branch selected

**Branch (a): method exists + callable.** T2 and T4 may call
`pi.setThinkingLevel(...)` directly from the router extension; no fallback
to `settings.defaultThinkingLevel` is needed for the happy path. The
existing `settings.defaultThinkingLevel` key (already set to `"medium"` in
`pi/settings.json`) remains the cold-start default.

## Static evidence

Installed Pi package (global npm): `@mariozechner/pi-coding-agent` at
`C:/Users/mglenn/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent`.

Type declaration (authoritative):

- `dist/core/extensions/types.d.ts:827` declares
  `getThinkingLevel(): ThinkingLevel;`
- `dist/core/extensions/types.d.ts:829` declares
  `setThinkingLevel(level: ThinkingLevel): void;`

Both are members of the exported `ExtensionAPI` interface, which is the
value passed to an extension's default-export factory
`(pi: ExtensionAPI) => void`. `ThinkingLevel` is imported from
`@mariozechner/pi-agent-core` and resolves to the union
`"off" | "minimal" | "low" | "medium" | "high" | "xhigh"` (confirmed by
`docs/extensions.md:1412` and `docs/settings.md:20`).

Public docs (`docs/extensions.md:1407-1414`):

> Get or set the thinking level. Level is clamped to model capabilities
> (non-reasoning models always use "off").
>
> ```ts
> const current = pi.getThinkingLevel();  // "off"|"minimal"|...|"xhigh"
> pi.setThinkingLevel("high");
> ```

Changelog corroboration:

- `CHANGELOG.md:2136` -- ExtensionAPI `setModel()`, `getThinkingLevel()`,
  `setThinkingLevel()` added (pi-mono #509).
- `CHANGELOG.md:1455` -- `setThinkingLevel()` made idempotent (#1118).
- `CHANGELOG.md:1000` -- unsupported `xhigh` is clamped to supported levels
  (#1548); `CHANGELOG.md:3111` -- thinking level auto-clamped on model
  switch (#253).
- `CHANGELOG.md:855` -- non-reasoning-model switches no longer persist a
  capability-forced `off` clamp on the stored default (#1864).

Repo search for prior call sites:

- `rg setThinkingLevel pi/` returns zero matches outside this probe and the
  plan/review docs. The repo has never called the method; the probe is
  the first use.

Example extensions shipped with the Pi package (reference usage):

- `examples/extensions/preset.ts:147,275,328` calls
  `pi.setThinkingLevel(preset.thinkingLevel)` and restores via
  `pi.setThinkingLevel(originalState.thinkingLevel)`.

## Runtime evidence

A minimal probe extension was added at
`pi/extensions/probe-thinking-level.ts`. It subscribes to `session_start`
and logs `typeof pi.setThinkingLevel`, the result of
`pi.getThinkingLevel()`, and the observed level after
`pi.setThinkingLevel("minimal")` and `pi.setThinkingLevel("xhigh")`.

This harness (multi-team agent shell) has no interactive Pi session
available, so the extension was verified by TypeScript compilation against
the exact installed `ExtensionAPI` type under
`pi/extensions/tsconfig.local.json`:

```bash
cd pi/extensions && bun x tsc --noEmit -p tsconfig.local.json
```

The probe file compiles clean under `strict: true` with
`ExtensionAPI.setThinkingLevel(level: ThinkingLevel)` and
`ExtensionAPI.getThinkingLevel(): ThinkingLevel` both resolved. (Pre-existing
unrelated errors in `tool-reduction.ts` are not produced by this file.)
If a Pi session is later started with `probe-thinking-level.ts` loaded,
the on-session-start notification will record the observed clamped value
for `"xhigh"` and confirm idempotency.

## Clamping behavior (documented)

Per upstream docs and changelog, `setThinkingLevel` is a total function
over the declared union and does not throw for unsupported values on the
current model; instead it clamps:

- Non-reasoning models -> effective level is forced to `"off"`.
- Reasoning models without `xhigh` support -> `"xhigh"` is silently clamped
  down to the highest supported level (commonly `"high"`).
- Repeated calls with the same level are idempotent (no spurious
  `thinking_level_change` session entries).

This matches the plan's assumption for `router.effort.maxLevel` (H4):
application-level capping is still required because upstream clamping is
per-model-capability, not per-policy. The runtime policy must apply its
own `maxLevel` cap before calling `setThinkingLevel`.

## Implications for T2 / T4

- T4 (`pi/extensions/prompt-router.ts`): may call `pi.setThinkingLevel`
  directly alongside `pi.setModel`. No need to write
  `settings.defaultThinkingLevel` at session boundary.
- T4 MUST apply `router.effort.maxLevel` (H4) before calling
  `setThinkingLevel`; upstream clamping is capability-based, not
  policy-based, and will not reject `"xhigh"` for policy reasons.
- T4 should call `pi.getThinkingLevel()` after `setThinkingLevel` to
  determine the effective (post-clamp) level for status display and for
  the `/router-explain` rule-fired attribution (H6).
- T2 (`pi/prompt-routing/classify.py`) is not affected by this probe;
  the classifier output schema (T1) is consumed by T4 in TypeScript.

## Do-not-proceed conditions

Branch (a) was selected, so T2/T4 are unblocked. Re-probe and revisit
this document if any of the following change:

- `@mariozechner/pi-coding-agent` is downgraded to a version predating
  pi-mono #509.
- The `ExtensionAPI` type declaration loses `setThinkingLevel` or
  renames it.
- The installed Pi version drops `xhigh` from the `ThinkingLevel`
  union without adding a replacement policy knob.
