# Initial Orchestration Diff Dispositions

This inventory freezes and classifies the Pi working-tree diff present at T0 start. A file-level disposition applies to every initial hunk in that file unless an exception is listed. `Remove` entries were returned to the repository baseline during T0. `Revise` entries remain candidates for their owning wave and are not accepted as final behavior. `Keep` entries are compatible or unrelated changes that remain untouched.

## Remove

Every initial hunk in these files was part of a rejected duplicate authority or tested an invalid state:

| File | Initial hunk count | Reason |
| --- | ---: | --- |
| `pi/extensions/tasks.ts` | 6 | Added the duplicate package inbox, persisted readiness, root-as-blocker edges, premature acceptance settlement, and an unconnected program API. |
| `pi/tests/tasks.test.ts` | 2 | Asserted persisted readiness, root blockers, premature root completion, and blocking follow-ons that did not block settlement. |
| `pi/extensions/subagent/workflow-runtime.ts` | 2 | Added the independent runtime program graph and runtime-only coordinator inbox. |
| `pi/tests/subagent-workflow.test.ts` | 3 | Asserted the duplicate runtime graph/inbox, including construction without the required adapter. |
| `pi/extensions/subagent/run-manager.ts` | 10 | Added mutable lease truth and orchestration-keyed aggregate completion retention to the run-manager projection. |
| `pi/tests/subagent-run-manager.test.ts` | 4 | Asserted aggregate completion retention and duplicate lease projection. |
| `pi/extensions/subagent/tree-runtime.ts` | 6 | Extended the obsolete tree broker as lifecycle and lease authority, with orphan recovery lacking a production caller. |
| `pi/tests/subagent-tree-runtime.test.ts` | 1 | Asserted broker-owned lease/orphan behavior rather than the target dispatcher contract. |

The large test hunks contain multiple individual cases. Their case-level disposition is recorded in the three review reports and includes the obsolete shared-capacity, stale-orphan, aggregate-completion, duplicate-inbox, persisted-readiness, root-blocker, and premature-completion cases.

## Revise

Every initial hunk in these files is directionally related but must be reconciled with the target authority model in its owning wave:

- `pi/extensions/subagent/index.ts` - 24 hunks: retain provider and max-effort safety; remove non-Sol advisory confirmation, aggregate delivery, and premature run-manager settlement; migrate execution authority to the dispatcher.
- `pi/extensions/subagent/ui.ts` - all hunks: replace broker/run-manager cached lifecycle data with the shared authoritative projection and exact controls.
- `pi/extensions/operator-status.ts` - all hunks: recompute from authoritative events and collapse program/package duplicate counts.
- `pi/extensions/workflow-commands.ts` - all hunks: preserve the small model-facing surface and remove runtime-only workflow authority.
- `pi/lib/model-routing.ts` and `pi/tests/model-routing.test.ts` - all hunks: preserve explicit selection precedence while making mismatch classification telemetry-only.
- `pi/lib/orchestration-telemetry.ts`, `pi/docs/orchestration-telemetry.md`, and `pi/tests/orchestration-telemetry.test.ts` - all hunks: preserve historical vocabulary compatibility while using the new terminology for current records.
- `pi/agents/orchestrator.md` - both hunks: migrate the delegated name to `teamlead`; reserve root orchestrator for the conversational root.
- `pi/README.md`, `pi/AGENTS.md`, `pi/skills/orchestration/SKILL.md`, and `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md` - all orchestration hunks: update only when the executable contract exists.
- `pi/skills/pi-extension/references/tooling-contracts.md` - its orchestration hunk must expose no more than the one new control tool.
- `pi/tests/operator-status.test.ts` - all hunks: retarget to the event-driven authoritative projection.
- `pi/tests/subagent.test.ts` - all orchestration hunks: replace obsolete delegated-orchestrator, aggregate delivery, and broker settlement assertions with teamlead, result-ID, and dispatcher behavior.
- `pi/tests/subagent-advisory-routing.test.ts` - new file: retain telemetry and max-effort cases; remove cases requiring override reasons or confirmation for explicit parent selections.

Agent-frontmatter hunks in `backend-dev.md`, `csharp-pro.md`, `devops-pro.md`, `explorer.md`, `frontend-dev.md`, `planner.md`, `python-pro.md`, `qa-engineer.md`, `rust-pro.md`, `skill-review.md`, `typescript-pro.md`, and `validator.md` are revised as a set only if role/default routing remains necessary after the `teamlead` migration.

## Keep

- `pi/agents/summarizer.md` - the complete new file is a bounded read-only, non-delegating leaf and does not claim program ownership.
- Background-terminal hunks in `pi/extensions/background-terminal/index.ts`, `pi/extensions/background-terminal/ui.ts`, `pi/tests/background-terminal-manager.test.ts`, and `pi/tests/background-terminal.test.ts` are unrelated and remain untouched.
- `pi/tests/branch-command.test.ts` and `pi/prompts/yt.md` are unrelated and remain untouched.
- Background-terminal contract hunks in `pi/skills/pi-extension/references/contracts/background-terminals.md` are unrelated and remain untouched.

## Mixed-Hunk Rules

Where one initial hunk contains both compatible and rejected lines, the hunk is classified `revise`, not split into invented sub-hunks. The review reports record the exact symbols and cases to retain, replace, or remove. Unrelated working-tree changes outside `pi/` were not classified or modified.
