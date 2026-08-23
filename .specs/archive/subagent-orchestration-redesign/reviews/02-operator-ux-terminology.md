# Operator UX and Terminology Review

Source run: `45e0e467-3c31-45d5-ab3e-822a3517d0ea`

## Findings

1. `/subagents` filtering fails. Arguments are ignored and all process-local runs are listed in `pi/extensions/subagent/index.ts:2598-2606` and `ui.ts:226-228`. Snapshots lack parent session and normalized workspace IDs in `run-manager.ts:90-128`.
2. Visible IDs and state are incomplete. Details expose some metadata, but list rows truncate IDs and provide no copy action, orchestration ID, dispatcher capacity, queue position, or complete lease display in `ui.ts:54-76,354-362,493-506`.
3. Graceful and forced cancellation fail. The `x` action immediately calls recursive `cancelTree()` in `ui.ts:316-319,454-457`. There is no operator-visible cancellation phase, force API, or group cancellation in `run-manager.ts:600-628`.
4. Root-accessible cancellation fails. `subagent_status` is read-only in `index.ts:2480-2596`; cancellation exists only through the TUI and process-local manager.
5. Completion acknowledgement is incomplete. Completion is retained and pushed in `index.ts:2400-2432`, but failures are implicitly acknowledged by later input in `index.ts:2640-2651`. There is no explicit acknowledgement state or command.
6. Explicit routing fails. Explicit models are selected first in `index.ts:2166-2173,2787-2791`, but non-Sol coordinator choices require reason or confirmation in `index.ts:3396-3417`, and mismatch labels emit visible advisory warnings in `index.ts:334-340`. Existing tests require the gate in `subagent-advisory-routing.test.ts:207-251`.
7. Terminology migration fails. The delegated agent remains `orchestrator` in `pi/agents/orchestrator.md:1-14`; runtime special-cases that name in `index.ts:302-305,1036-1046`. Terminology is inconsistent across docs and tests, including `pi/README.md:88-92`.

## Required Direction

- Add session and workspace identity plus filters.
- Expose full operational IDs and live dispatcher state.
- Separate graceful cancellation from force termination.
- Add root-callable controls.
- Make acknowledgement explicit.
- Remove advisory UI noise for explicit routing while retaining provider availability and max-effort safety gates.
- Rename the delegated `orchestrator` agent to `teamlead`, reserving `root orchestrator` for the primary process and returning a migration error for the obsolete name.

## Recommendation

Fail. Treat operator controls, routing, acknowledgement, identity, filtering, and terminology as one required surface rather than a footer-only patch.
