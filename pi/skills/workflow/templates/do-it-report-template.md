For plan-file execution, report the observed state plainly. The first and last lines must agree with the plan's current Execution Status.

Use one of these first-line forms:

- `COMPLETE: <one-sentence outcome>` only when all required gates passed and the plan was archived.
- `CHECKPOINT: <one-sentence progress summary>` when verified work and the next ready item were saved without a blocker.
- `BLOCKED: <one-sentence blocker or user decision>` only when the plan's Execution Status records the same current blocker.

Then include:

## Outcome

- **State:** `complete`, `checkpoint`, or `blocked`
- **Plan:** archived path when complete; active path when checkpointed or blocked
- **What changed:** concise file and behavior summary
- **Validation:** commands run and observed results
- **What remains:** `None` when complete; otherwise the next unchecked work or unresolved gate
- **Next action:** `None` when complete; otherwise the exact resume command or required user action

For a checkpoint, state the last completed task or gate and the next dependency-ready item. Do not describe an ordinary pause as a failure or invent a blocker. For a blocked report, name only a blocker recorded in the plan after re-verifying it against current state.

Use exactly one matching final line:

- `FINAL STATUS: COMPLETE -- archived at <archive-path>.`
- `FINAL STATUS: CHECKPOINT -- saved at <active-plan-path>; next: <next task or gate>.`
- `FINAL STATUS: BLOCKED -- <blocker recorded in Execution Status>.`
