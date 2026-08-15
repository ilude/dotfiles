---
created: 2026-08-15
status: draft
completed:
---

# Plan: Fable Subscription-Only Orchestration

## Context

`pi/extensions/fable.ts` already gives Fable foreman guidance and rewrites common `subagent` model selection, but the current behavior is advisory. Fable may still call direct work tools, same-family routing may select a metered provider, explicit or agent-pinned models may bypass GPT subscription routing, advanced delegation tools are not covered, and the policy applies only to interactive TUI parents. The hierarchical subagent runtime can carry a narrow process-local policy marker through coordinator and leaf processes.

## Objective

When the resolved parent model is `amazon-bedrock/us.anthropic.claude-fable-5`, Fable must spend its API tokens only on high-level orchestration. Repository inspection, implementation, testing, detailed review, and other real work must run on `openai-codex` subscription subagents. Hierarchical delegation remains optional and unchanged for every non-Fable root.

## Boundaries and assumptions

- `openai-codex` is the deterministic subscription-provider boundary. Bedrock-hosted GPT and every other provider are metered for this policy.
- Fable may use only high-level control tools: `subagent`, deferred `subagent_*` workflow tools, `tool_search`, `task`, `ask_user`, and state-gated `plan_archive`. All other tool calls are blocked before execution while Fable is the active root model.
- GPT subscription descendants may perform direct work. If they delegate inside a Fable-origin tree, their descendants must also use `openai-codex`.
- Explicit `openai-codex` selections and agents pinned to `openai-codex` remain valid. Explicit or pinned non-subscription models fail before spawn rather than being silently changed. Omitted or size-based models resolve only from available `openai-codex` models.
- `subagent_continue` is rejected inside this boundary unless the runtime can deterministically prove the saved session used `openai-codex`; this plan does not add session-file model inference.
- Preserve `/foreman`, ordinary Fable Bedrock compatibility, task ownership, scope leases, cancellation, workflow bounds, and all non-Fable routing behavior. Do not change provider billing, credentials, model catalogs, durable task schemas, or the scheduler.

## Requirements

- R1: Exact Fable detection must use the resolved provider and model ID and must apply in TUI, JSON, and RPC modes, including direct model selection and `/fable`.
- R2: A Fable root must receive the existing foreman guidance plus a concise mandatory delegation instruction, and provider-visible tools must be reduced to the high-level control set. Switching away from Fable must restore the prior active tool set.
- R3: A hard `tool_call` guard must block every non-control tool before execution while Fable is the active root. The block must name the subscription-only orchestration boundary and must not depend on prompt compliance.
- R4: Common, parallel, chain, fan-out, and typed-workflow delegation must resolve only to available `openai-codex` models. Missing subscription models and explicit or pinned non-subscription models must fail before any child starts.
- R5: The subagent runtime must propagate one process-local Fable-origin marker to every descendant. A GPT descendant may use direct work tools, but any nested delegation must retain R4. The marker must not alter unrelated trees or survive process exit.
- R6: Fable must receive bounded child results and remain responsible only for decomposition, ambiguity resolution, coordination, evidence review, course correction, and final synthesis.
- R7: Non-Fable roots and non-Fable trees must retain their existing optional delegation, direct-tool access, explicit model behavior, and deferred tool discovery.

## Tasks

- [ ] **T1: Make the Fable root boundary deterministic and fail closed**
  - Files: `pi/extensions/fable.ts`, `pi/tests/fable.test.ts`.
  - Action: separate the mandatory exact-Fable policy from the existing advisory Sol/Opus foreman behavior; manage the Fable-only active control-tool set; hard-block direct work tools; normalize every supported delegation shape against available `openai-codex` models; preserve valid subscription-pinned agents; and reject metered pins, metered explicit models, unavailable subscription routing, and unverified continuation before spawn.
  - Done when: Fable in TUI, JSON, or RPC cannot execute `read`, shell, mutation, validation, web, or commit tools; allowed control tools still execute; common, parallel, chain, fan-out, and workflow calls select only `openai-codex`; model switching restores the previous active tools; and ordinary models plus `/foreman` retain current behavior.
  - Verify: `cd pi && pnpm test fable.test.ts model-routing.test.ts tool-search.test.ts` passes with behavioral cases for allowed tools, blocked tools, all delegation shapes, explicit and pinned models, missing subscription models, all runtime modes, and model switching.

- [ ] **T2: Propagate the subscription-only boundary through hierarchical subagents**
  - Depends on: T1.
  - Files: `pi/extensions/subagent/index.ts`, `pi/tests/subagent.test.ts`, with shared Fable policy exports kept in `pi/extensions/fable.ts` unless implementation evidence requires a smaller dependency-neutral module.
  - Action: mark children spawned by an exact Fable root or an already marked descendant, preserve that marker in coordinator and leaf environments, and let `fable.ts` enforce subscription-only routing on nested delegation without removing direct work tools from GPT descendants.
  - Done when: a Fable root can launch a GPT coordinator, that coordinator can perform direct work and launch a GPT leaf, both child models use `openai-codex`, a nested metered override fails before spawn, the marker is absent from ordinary trees, and existing role, depth, scope, cancellation, task, and workflow behavior remains unchanged.
  - Verify: `cd pi && pnpm test fable.test.ts subagent.test.ts` passes with a root -> coordinator -> leaf regression and explicit assertions on child model/provider and process-local marker propagation.

- [ ] **T3: Publish the enforced contract, run the shared gate, and archive the completed spec**
  - Depends on: T2.
  - Files: `pi/README.md`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/skills/pi-extension/references/contracts/tool-discovery.md`, plus the changed runtime and tests from T1-T2.
  - Action: document the exact Fable-only control plane, subscription-provider boundary, fail-closed behavior, recursive marker, continuation restriction, and unchanged non-Fable behavior. Keep callable enforcement in `fable.ts` and stable cross-cutting semantics in the contracts.
  - Done when: revised prose matches executable behavior; focused tests pass; `cd pi && pnpm run typecheck` passes; `cd pi && pnpm exec biome check extensions/fable.ts extensions/subagent/index.ts tests/fable.test.ts tests/subagent.test.ts` passes; one final `cd pi && pnpm test` passes because tool visibility and routing are shared surfaces; and `git diff --check` reports no whitespace errors.
  - Archive: after all task checkboxes and gates pass, `/do-it` must set this plan to complete and invoke `plan_archive` for `.specs/fable-subscription-orchestration/plan.md`. Completion requires `.specs/archive/fable-subscription-orchestration/plan.md` to exist and the active `.specs/fable-subscription-orchestration/` directory to be absent. An archive collision or failure leaves the plan incomplete and must be reported without moving files manually.

## Execution status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it .specs/fable-subscription-orchestration/plan.md`
