---
name: tui-ux
description: "Terminal UI/CLI UX: TUIs, command palettes, pickers, setup wizards, lists, forms, status bars, keyboard navigation, streaming, or workflows."
---

# TUI UX Skill

Treat terminal UI as a product surface, not just command output. Users should not need to discover basic interaction flaws manually.

## Research-Informed Additions

Key takeaways to apply:

- **Preserve design consistency:** reuse existing TUI styles, tokens, wording, spacing, and component patterns instead of creating one-off UI.
- **Interactive mode should reduce mistakes:** setup/login flows should constrain choices, validate early, and explain recovery steps.
- **Good CLI/TUI UX reduces time-to-value:** show useful first actions and examples in-app instead of forcing users to read docs.
- **Interactive UX does not replace automation:** keep non-interactive/env/config paths working when adding wizards.

## Core Principles

Apply the invariants affected by the requested TUI change. Security and preservation rules apply whenever config, profiles, or secrets are affected.

1. **Responsiveness first**
   - Keep typing, navigation, cancel, help, and quit responsive during network/storage/provider work.
   - Use async work with stale-result guards for provider/model/session changes.
   - Discover live provider/model data on startup or cache refresh instead of hardcoding stale lists.
   - Add timeouts for provider/model list calls so one bad endpoint cannot hang the UI.

2. **Predictable navigation**
   - Selection movement must update the visible window. Never let selection move into hidden rows without scrolling/windowing.
   - Preserve selection where sensible after refresh; clamp safely when list length changes.

3. **Deterministic ordering**
   - Lists should have stable, explainable ordering: alphabetical, newest-first, grouped by provider, etc.
   - If grouped, sort within groups.
   - Do not rely on map iteration or provider response order unless intentionally documented.

4. **Window long content**
   - Long lists need pagination/windowing and clear indicators: `... N previous`, `... N more`.
   - Avoid hiding available items with a static top-N truncation.

5. **Provider isolation and graceful degradation**
   - A failing provider must not block other providers from listing models or working.
   - Surface failures as warnings when partial success exists.
   - Make provider names specific enough for recovery, including endpoint/base URL when useful and safe.

6. **Safe configuration behavior**
   - Do not silently overwrite or drop existing profile fields, secret refs, user-chosen models, or unknown future fields.
   - Prefer additive migration and explicit dedupe rules.

7. **Secrets stay secret**
   - UI should mention secret refs/locations only when safe; avoid exposing values.
   - When editing config manually or by tool, preserve `secret_ref` unless intentionally deleting credentials.

8. **No color-only state**
   - Status, selected state, warnings, errors, and disabled actions need text/symbol/layout cues, not only color.

9. **Explicit recovery paths**
   - Every error/degraded state should explain what happened and what the user can do: retry, cancel, run `/login`, edit config, restart, etc.

10. Apply POLA (see the `least-astonishment` skill) to keybindings, wording, and spacing.

## Agent Behavior Rules for TUI Work

Before implementing TUI changes:

1. Inspect nearby UI/state/test patterns relevant to the requested change.
2. Identify the affected user-visible invariant, e.g. "selection remains visible" or "one provider failure does not block others".
3. Add or update tests when they are needed to protect that invariant.
4. For typing latency changes, instrument first and validate against measured input/render timing before guessing.
5. If touching config/profile/secret behavior, preserve existing fields and add migration/preservation tests when the change can affect them.

## Checklist Before Marking a TUI Change Done

For a TUI/list/form/setup change, verify the items affected by the requested contract:

- [ ] Keyboard navigation works and selected item remains visible.
- [ ] Esc/cancel behavior is clear and safe.
- [ ] Long lists are windowed or paginated.
- [ ] Ordering is deterministic and tested.
- [ ] Partial provider failures do not block successes.
- [ ] Status text and recovery guidance are visible.
- [ ] Secrets are not rendered, logged, or dropped from profiles.
- [ ] Config defaults are created only when missing and do not overwrite edits.
- [ ] Tests cover UX invariants, not only happy-path function output.
- [ ] Narrow terminal behavior is acceptable or explicitly bounded.

## Common TUI Tests to Add

- List with more items than visible window; move selection past first page and assert selected item is rendered.
- List sorting with shuffled inputs.
- One failing provider plus one successful provider returns successful results and warning.
- Setup form loads existing config and preserves secret refs when key field is blank.
- Missing config creates defaults; existing config is not overwritten.
- Esc/cancel closes modal/form and leaves app in a recoverable state.
- Rendering does not include secret values.

## Model Picker Specific Guidance

- Model lists should be stable and scannable.
- Populate provider/model data from live discovery on startup or cache refresh; do not rely on stale hardcoded inventories.
- Use provider labels and alphabetical or clearly documented grouping.
- Avoid static truncation; window around selection.
- If visible numbers are removed, do not prompt primarily for typed numbers. If typed numbers remain supported, treat them as hidden compatibility, not primary UX.
- Apply model filters through explicit user config, with global and per-provider scopes.
- Default filters should be documented and migrated into the same mechanism users can edit.

## Login/Setup Specific Guidance

- Setup should detect existing provider config and preserve it.
- Adding a provider should not delete other providers unless the UI explicitly confirms replacement.
- Credentials should be stored in the intended secret store or external standard location; provider metadata should not contain secret-like values.
- If a setup option only enables metadata for future transport, say so clearly.
