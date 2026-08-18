---
name: tui-ux
description: "Interactive terminal UX: command palettes, pickers, setup wizards, lists, forms, keyboard navigation, or streaming state. Not for passive text formatting, tool-call/result rendering, or status labels unless interaction changes."
---

# TUI UX

## Process

1. Inspect the neighboring components, state handling, keybindings, wording, and tests.
2. State the user-visible behavior being changed.
3. Reuse existing components and interaction patterns.
4. Keep typing, navigation, cancel, help, and quit responsive during background work.
5. Validate the changed interaction, including cancellation and recovery where relevant.

## Interaction rules

- Keep the selected item visible as lists move or refresh. Preserve selection when possible and clamp it when data changes.
- Use stable, explained ordering. Sort within groups.
- Window long lists around the selection. Show when more items exist above or below.
- Use asynchronous discovery with timeouts and stale-result guards. One failing provider must not block successful providers.
- Explain partial failures and name the affected provider or endpoint when safe.
- Do not communicate selection, warning, error, or disabled state through color alone.
- Every error state needs a usable recovery action.
- Keep non-interactive configuration and automation paths working when adding a wizard.

## Configuration and secrets

- Preserve existing fields, unknown future fields, provider entries, secret references, and explicit user choices.
- Use additive migrations and deterministic deduplication.
- Never show secret values. Store credentials only in the intended secret store or external standard location.
- Do not claim a setup action enables behavior when it only records metadata.

## Common surfaces

### Model pickers

- Discover current providers and models instead of shipping a stale inventory.
- Use clear provider labels and stable grouping.
- Do not hide available models behind static top-N truncation.
- Put filters in user-editable configuration.

### Setup and login

- Detect and preserve existing configuration.
- Adding one provider must not remove another without explicit replacement.
- Validate choices early and show the next recovery step when setup fails.
