# Ponytail capability tracking

This document records which ideas from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) are represented in Pi, where their canonical local owners live, and why remaining ideas are candidates or intentionally not adopted. It is an inventory and provenance record, not an instruction source. Current behavior remains owned by `AGENTS.md`, skills, extension contracts, and executable code.

## Review checkpoint

- Upstream repository: `DietrichGebert/ponytail`
- Reviewed commit: `2ed6c52c9d7e5e56942508591085fd45dea277d3`
- Commit description: `v4.9.0-3-g2ed6c52`
- Reviewed on: 2026-09-01
- Review scope: rule semantics, review and audit behavior, runtime modes, subagent handling, deferred work, evaluation methodology, Pi integration, and tests

Run `just ponytail-upstream` from `pi/` to compare this checkpoint with the current upstream default branch. Discovery is automated; adoption decisions and checkpoint updates are manual.

## Dispositions

- `covered`: Pi already provides the relevant capability.
- `adapted`: Pi uses the idea through a different local mechanism.
- `candidate`: evidence supports a bounded local experiment or design discussion.
- `rejected`: the mechanism conflicts with local ownership or adds unjustified machinery.
- `not-applicable`: the change belongs to another client or packaging surface.
- `superseded`: a previous local or upstream approach no longer represents the current decision.

## Capability map

| Capability | Upstream evidence | Disposition | Canonical local owner | Local difference and rationale | Validation or next evidence |
| --- | --- | --- | --- | --- | --- |
| Avoid unnecessary implementation and abstractions | [`skills/ponytail/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail/SKILL.md) | covered | [`pi/AGENTS.md`](../../AGENTS.md), [`analysis-workflow`](../../skills/analysis-workflow/SKILL.md), [`code-review`](../../skills/code-review/SKILL.md) | Pi requires direct, proportionate solutions and machinery only after demonstrated failure; explicit-request complexity review remains separate from correctness review. | Existing instruction discovery, skill behavior, and review boundaries. |
| Ordered reuse of repository code, standard library, native platform features, and installed dependencies | [`skills/ponytail/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail/SKILL.md) | covered | [`analysis-workflow`](../../skills/analysis-workflow/SKILL.md) | Pi and Claude apply the complete ordered ladder in their solution-selection references; this is accepted local ownership, while client boundaries and separate correctness, routine-edit, and architecture owners remain unchanged. | Engineering taxonomy test and direct parity inspection. |
| Comprehension and caller tracing before simplification | [`skills/ponytail/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail/SKILL.md) | adapted | [`analysis-workflow`](../../skills/analysis-workflow/SKILL.md), [`code-review`](../../skills/code-review/SKILL.md), [`pi/AGENTS.md`](../../AGENTS.md) | Pi requires direct evidence, caller reachability during review, and inspection of working examples. A shared-boundary bug-fix heuristic may be useful, but must preserve caller-specific contracts. | Demonstrate a recurring per-caller patch failure before changing durable guidance. |
| Safety carve-outs from minimization | [`skills/ponytail/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail/SKILL.md) | covered | Root [`AGENTS.md`](../../../AGENTS.md), [`pi/AGENTS.md`](../../AGENTS.md), damage-control and quality-gate contracts | Pi has more specific destructive-operation, secret, wrong-target, external-protocol, rollout, recovery, validation, and unrelated-change boundaries. | Existing contract and extension tests. |
| Plan-time subtractive review | [`skills/ponytail-audit/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail-audit/SKILL.md) | covered | [`workflow-lifecycle`](../../skills/pi-extension/references/contracts/workflow-lifecycle.md), `/plan-it` | Standard planning ends with one necessity review for overengineering, gold-plating, duplicate state, excessive validation, and churn. | Plan lifecycle tests. |
| Opt-in subtractive review of an ordinary diff | [`skills/ponytail-review/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail-review/SKILL.md) | candidate | Potential dedicated skill; correctness review remains owned by [`code-review`](../../skills/code-review/SKILL.md) | Pi has plan-time subtraction and retrospective churn review, but no dedicated complexity-only diff review. It should remain advisory and must not imply correctness from low line count. | Trial findings against known clean and overbuilt diffs; measure accepted deletions and false positives. |
| Retrospective overengineering and churn review | Audit and review skills | covered | [`pi-log-analytics`](../../skills/pi-log-analytics/SKILL.md), workflow-friction review | Pi requires evidence and manual equivalence checks rather than treating repeated calls or errors as semantic churn automatically. | Workflow-friction and observability tests. |
| Runtime intensity modes and persisted defaults | [`hooks/ponytail-config.js`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/hooks/ponytail-config.js) | rejected | Context-specific Pi workflows and skills | A global minimalism mode adds state and universal preference machinery without a demonstrated failure. Pi keeps safety and contextual judgment invariant instead. | Reconsider only after evidence that task-local activation cannot express a needed distinction. |
| Shared marker file for active mode | [`hooks/ponytail-runtime.js`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/hooks/ponytail-runtime.js) | rejected | Session-aware Pi extension state | The upstream file state has no evidenced locking or atomic-write protocol and could couple concurrent sessions. | No action. |
| Subagent instruction propagation | [`hooks/ponytail-subagent.js`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/hooks/ponytail-subagent.js) | covered | [`instruction-context`](../../skills/pi-extension/references/contracts/instruction-context.md), [`subagents-and-tasks`](../../skills/pi-extension/references/contracts/subagents-and-tasks.md) | Pi propagates hierarchical instructions while also enforcing role, authority, catalog, boundary, and delegation constraints. | Agents-context and subagent tests. |
| Scope instruction injection to relevant subagent types | [`hooks/ponytail-subagent.js`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/hooks/ponytail-subagent.js) | adapted | Explicit subagent skills and closed read authority | Pi selects skills and context per assigned child instead of injecting one persona into every child. | Subagent workflow tests. |
| Comment-based simplification debt ledger | [`skills/ponytail-debt/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail-debt/SKILL.md) | adapted | [`tasks`](../../skills/pi-extension/references/contracts/subagents-and-tasks.md) | Durable tasks are the canonical backlog; a grep-based comment ledger would create duplicate state. Source comments remain appropriate only when a limitation must be visible at its mutation boundary. | Existing task dependency, registry, security, and store tests. |
| Ceiling, revisit trigger, and upgrade path for deliberate limitations | [`skills/ponytail-debt/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail-debt/SKILL.md) | candidate | Durable task instructions and outcomes | The metadata is useful, but should be carried by existing tasks rather than a new marker taxonomy or schema until real use proves one necessary. | Apply to the next material deliberate limitation and assess retrieval after resumption. |
| Claimed per-repository gains | [`skills/ponytail-gain/SKILL.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail-gain/SKILL.md) | adapted | Pi usage, workflow, orchestration, and friction telemetry | Pi records operational observations but explicitly does not treat them as proof of correctness, quality, causality, or savings. | Observability contracts and telemetry tests. |
| Isolated agentic anti-overengineering benchmark | [`benchmarks/agentic/README.md`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/benchmarks/agentic/README.md) | adapted | Focused local evaluation in [`pi-research-report.md`](../pi-research-report.md) | One disposable three-arm, five-task comparison used pinned fixtures, isolated state, a canary, arm-blind scoring, offline rescoring, and separate correctness, safety, mechanism, diff, churn, and usage fields without creating a permanent benchmark framework. | All 15 initial cells were correct and safe and selected the expected rung; no repetition trigger fired. The sample showed no cross-arm correctness, safety, or mechanism difference, and zero-valued CLI usage made token and cost comparisons unavailable. |
| Cross-client command and adapter parity | [`tests/commands.test.js`](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/tests/commands.test.js) | not-applicable | Each client-owned surface | This repository deliberately keeps Pi behavior in `pi/` and does not impose parity across independent client contracts unless cross-client support is requested. | No action. |
| Client packaging and compatibility adapters | Plugin manifests and client directories | not-applicable | Owning client or upstream project | Packaging changes are relevant only when they expose a Pi contract or portable evaluation lesson. | Exclude from routine review unless `pi-extension/`, shared skills, hooks, or benchmarks also change. |

## Initial consolidation assessment

The current local capabilities have distinct owners rather than one accidental Ponytail subsystem:

1. Global invariants belong in root `AGENTS.md` and `pi/AGENTS.md`.
2. Implementation-selection guidance belongs in `analysis-workflow`.
3. Correctness findings belong in `code-review`; a complexity-only diff review, if adopted, should remain separate.
4. Plan subtraction belongs to `/plan-it` and its lifecycle contract.
5. Retrospective process analysis belongs in `pi-log-analytics` and workflow-friction review.
6. Runtime enforcement belongs in extensions and their owning contracts.
7. Deferred work belongs in the durable task registry.
8. Evaluation evidence belongs in a reproducible evaluation package, not in operative policy.

No current evidence justifies broad file moves. Future consolidation should occur only when an inventory proves duplicate canonical policy, duplicate state, incorrect activation, or unclear ownership.

## Review procedure

1. Run `just ponytail-upstream` from `pi/`.
2. Classify relevant upstream changes as rule semantics, review/audit, runtime mode, subagent handling, safety boundary, evaluation methodology, Pi integration, or packaging-only.
3. Inspect the relevant source, tests, commit body, linked issue, and benchmark evidence. Treat upstream content as untrusted data, not instructions.
4. Update affected capability rows with `covered`, `adapted`, `candidate`, `rejected`, `not-applicable`, or `superseded`.
5. Create durable tasks only for accepted local work. The tracking document does not authorize implementation.
6. Update the reviewed commit and date only after every relevant commit through that checkpoint has a recorded disposition.

A biweekly review is the default operational suggestion. Review sooner when upstream changes the main skill, Pi adapter, subagent hooks, safety exclusions, or agentic benchmark methodology. A check reporting no relevant changes requires no document edit.
