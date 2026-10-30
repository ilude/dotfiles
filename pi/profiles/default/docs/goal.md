# Same-session goals

`/goal` starts authorized work toward a stated outcome and continues through bounded checkpoints in the same native Pi session. It is independent of the planning skill and `/do-it`: no plan, redundant execution approval, or Git worktree is required. Existing repository instructions, tool permissions, and separate push/deployment authorization still apply.

Load the extension in a fresh default-profile Pi process, or use `/reload` only when no subagents are active or retained. Reloading or restoring a session does not restart goal work automatically; inspect `/goal status`, then explicitly resume.

## Commands

```text
/goal [start] [--bedrock-usd N] [--codex-percent N] <goal>
/goal status
/goal pause
/goal resume [--restore-buildability] [instruction]
```

`/goal` alone shows status. Put optional budget flags before the goal text; both may be supplied. Amounts must be positive, and the Codex threshold cannot exceed 100. For example:

```text
/goal Fix the CSV export regression and run the existing focused checks.
/goal start --bedrock-usd 20 --codex-percent 15 Implement the agreed import behavior.
/goal resume Keep the existing public API unchanged.
```

Pause a running goal before starting another. Resume continues the existing goal with its recorded budget, not a fresh allowance. A completed goal requires a new start. Goals require a durable native Pi session.

## Scope and continuation

The original goal and explicit user decisions remain authoritative. Durable goal context is supplied separately from operational notes, findings, and conversation summaries, so continuation and compaction do not turn discoveries into acceptance criteria. Only direct user instructions can revise acceptance.

The agent investigates facts before asking. If a consequential decision remains unresolved, it asks one focused question with a recommendation and stops for the answer. It reports concrete blockers rather than repeatedly retrying or polling. Optional discoveries are reported separately, not implemented as extra requirements. Defects necessary to meet the stated goal remain in scope; completion means meeting that goal, not inventing more work.

The loop re-presents the same goal at healthy completion boundaries and continues in the current session until an explicit outcome stops it. Progress checkpoints preserve current work without adding requirements. This is not a scheduler or a new session. Questions, blockers, budget pauses, errors, interruption, and completion stop automatic continuation. `/goal status` shows the recorded outcome and reason; use `/goal resume [instruction]` when ready. A direct answer to a waiting question or blocker can also resume work. Asynchronous findings are not user answers.

## Optional budgets

With no flags, `/goal` imposes no budget counter. A configured counter applies across the run, including continuation and resume, rather than granting a new allowance per turn or agent.

- **`--bedrock-usd N`** sets the normal dollar allowance for attributed Bedrock work in this run, not the monthly personal total shown in the footer. Whole-run accounting must include the orchestrator and participating descendants and helpers; incomplete coverage or unavailable prices must pause budgeted work, not silently count as zero.
- **`--codex-percent N`** sets an **absolute weekly subscription-used threshold**, not an additional percentage allowance. Starting at 6% with a threshold of 15% leaves 9 percentage points for normal work. This is shared account quota: other sessions can consume it too. Current weekly usage and reset data are required; unavailable or invalid data pauses work. Quota reporting uses the existing `/usage` authentication, separate from native OpenAI model login.

Each flag covers only its named counter. Omitting Bedrock or Codex does not prohibit that provider. Other billable providers and services are not implicitly covered by either counter. Specify both flags if both counters matter.

Normal implementation and agreed checks must fit within the normal allowance. A fixed **10% emergency reserve is only for bounded restoration of a broken build**, not optional work, ordinary testing, or finishing features:

- A $20 Bedrock allowance has a $2 reserve, for a $22 emergency ceiling.
- Starting Codex at 6% with a 15% threshold gives 9 points of normal headroom. Ten percent is rounded up to one percentage point, giving a 16% emergency ceiling, not 25%. The ceiling is capped at 100%.

The launch reserve does not compound or refresh on resume or quota reset. Reaching a normal threshold pauses ordinary work; reaching the emergency ceiling stops even build restoration. If a run paused before it could mark a build-restoring step, `/goal resume --restore-buildability [instruction]` permits only that bounded cleanup within the existing reserve. It does not increase either ceiling.

Budget checkpoints use observed usage, headroom, and pace to reduce workload and concurrency conservatively. Pace is not a completion estimate. These checks are not atomic spend reservations or a strict ceiling guarantee: in-flight calls, concurrent consumption, and reporting lag can overshoot an observed threshold.

## Current verification limits

Focused automated checks cover goal state, budget arithmetic and observations, runtime/extension lifecycle, descendant transport, and helper accounting. Bedrock compaction, internal permission judges, and commit review use the same finalized-response accounting path; aggregate returned usage is not counted twice. Live autonomous goal runs, quota-boundary stopping, and attached-terminal behavior have not been verified. Uninstrumented external services or helpers with no returned usage are not a measured spend guarantee.
