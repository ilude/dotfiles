---
created: 2026-08-15
status: complete
completed: 2026-08-15
---

# Plan: Primary Orchestration with Fable Subscription-Only Work

## Context

`pi/extensions/fable.ts` already gives Fable foreman guidance and rewrites common `subagent` model selection, but the current behavior is advisory. Fable can still call direct work tools, same-family routing can select a metered provider, explicit or agent-pinned models can bypass GPT subscription routing, advanced delegation tools are not covered, and the policy omits print mode. Separately, `pi/extensions/subagent/index.ts` implicitly promotes the agent named `orchestrator` to coordinator when no role is supplied, so primary GPT-5.6 models can delegate orchestration itself without an explicit coordinator decision.

Adversarial, proponent, Pi implementation, and lean/churn reviewers agreed that the primary Fable agent itself is the orchestrator. It must dispatch GPT subscription leaves or bounded workflows directly, not spawn another orchestrator. The user clarified that GPT-5.6 primary models must also retain root orchestration by default while preserving explicitly requested coordinators. This removes recursive policy-marker plumbing and implicit coordinator promotion while keeping enforcement at the two existing authoritative boundaries: Fable tool policy and subagent dispatch.

## Objective

The selected primary model remains the root orchestrator unless a non-Fable caller explicitly requests `role: "coordinator"`. When that primary model is `amazon-bedrock/us.anthropic.claude-fable-5`, Fable must spend its API tokens only on high-level orchestration and every Pi-managed work delegation must run as an `openai-codex` subscription leaf. GPT-5.6 roots may work directly, dispatch leaves, or explicitly opt into a coordinator.

## Boundaries and decisions

- `openai-codex` is the deterministic subscription-provider boundary. Bedrock-hosted GPT and every other provider are metered for this policy.
- Every primary model owns root orchestration by default. Naming the `orchestrator` agent without a role must not imply coordinator execution; a non-Fable coordinator requires explicit `role: "coordinator"`.
- Fable is always the root orchestrator. Fable may dispatch leaves through single, parallel, chain, fan-out, or typed workflow execution. Explicit and implicit coordinator requests are rejected for every Fable call.
- Fable may use only `subagent`, `subagent_chain`, `subagent_fanout`, `subagent_workflow`, `task`, `ask_user`, and `plan_archive` while the owning plan workflow has activated it. `tool_search` and `subagent_continue` are not available to Fable.
- GPT subscription leaves retain their ordinary direct work tools. Existing leaf role gates prevent them from delegating further.
- Explicit `openai-codex` selections and agents pinned to `openai-codex` remain valid. Explicit or pinned non-subscription models fail before spawn rather than being silently changed. Omitted or size-based models resolve only from available `openai-codex` models.
- Fable cannot supply a string `output` path. File-only or overflow evidence uses a runtime-generated private artifact. This restriction does not affect non-Fable calls.
- The guarantee covers Pi-managed delegation. Arbitrary subprocess or direct provider traffic initiated by a GPT leaf is outside scope; credential, network, and process isolation are not added.
- Preserve `/foreman`, Fable Bedrock payload compatibility, project-agent trust, task ownership, role and depth gates, scope leases, cancellation, workflow bounds, scheduler behavior, and all non-Fable routing.

## Requirements

- R1: Exact Fable detection must use the resolved provider and model ID and must be independent of TUI, RPC, JSON, or print mode, including direct model selection and `/fable`.
- R2: The agent named `orchestrator` must never be promoted implicitly. A request for that agent without an explicit role must fail before spawn with guidance that the primary model owns orchestration; every other omitted role resolves as a leaf. Non-Fable roots retain explicit `role: "coordinator"`; a Fable root must reject explicit coordinator requests and may dispatch GPT subscription leaves and typed workflows directly.
- R3: Provider-visible tools must use one process-local keyed Fable visibility restriction over the current desired tool state. Permitted advanced delegation tools are directly visible; `plan_archive` is visible only while its existing owner has activated it; removing the restriction reveals the current desired state without restoring stale tools. Do not add persistence, settings, telemetry, or a general policy engine.
- R4: A hard `tool_call` guard must block every non-control tool before execution and must reject `tool_search`, `subagent_continue`, coordinator roles, and caller-supplied string output paths. The block must name the subscription-only orchestration boundary and must not depend on prompt compliance.
- R5: After trusted agent discovery and before tree creation or spawn, `subagentExecutor` must atomically resolve every requested final model for single, parallel, chain, fan-out, and workflow calls. Every final provider must be `openai-codex`; missing subscription candidates and explicit or pinned metered models fail before any child starts.
- R6: Every Fable-visible foreground result must be bounded to 50 KB or 2000 lines, whichever is reached first. One shared final-result boundary must reuse the existing truncation and default temporary-artifact mechanisms; full output remains available through that artifact or a continuable session, and internal chain handoff is not truncated.
- R7: Non-Fable roots must retain optional delegation, explicit coordinator support, direct-tool access, output paths, continuation, explicit model behavior, deferred discovery, and active workflow state. GPT-5.6 roots must not be required to delegate ordinary work.

## Tasks

- [x] **T1: Enforce the Fable root control plane without stale tool-state restoration**
  - Files: `pi/extensions/fable.ts`, `pi/lib/tool-activation.ts`, `pi/extensions/tool-visibility.ts`, `pi/tests/fable.test.ts`, `pi/tests/tool-visibility.test.ts`.
  - Action: separate exact-Fable enforcement from advisory Sol/Opus foreman behavior; add one process-local `fable` visibility restriction to the existing activation helper rather than a new policy framework; expose the fixed Fable control set and allowed advanced delegation tools; preserve state-owned `plan_archive`; inject mandatory guidance; and hard-block direct work tools, `tool_search`, `subagent_continue`, coordinator requests, and string output paths.
  - Done when: Fable in TUI, RPC, JSON, or print sees only the permitted current controls; a state change made while Fable is selected remains current when switching away; `plan_archive` cannot be exposed outside its owning state; blocked calls do not execute; `ask_user` retains its existing no-UI behavior; and ordinary models plus `/foreman` retain current behavior.
  - Verify: `cd pi && pnpm test fable.test.ts tool-visibility.test.ts` passes with cases for every runtime mode, allowed and blocked tools, model switching, concurrent state ownership, plan archival visibility, coordinator rejection, continuation rejection, and output-path rejection.

- [x] **T2: Make subagent dispatch the atomic subscription-model and result boundary**
  - Depends on: T1.
  - Files: `pi/extensions/subagent/index.ts`, `pi/tests/subagent.test.ts`, using the existing exact-Fable predicate exported from `pi/extensions/fable.ts`; do not create another policy module.
  - Action: remove agent-name-based coordinator promotion and require explicit coordinator intent for non-Fable roots; after the trusted agent catalog and `agentScope` are known, compute every effective child role and model before starting any work; preserve valid subscription pins and thinking suffixes; resolve omitted and size-based Fable requests from available `openai-codex` candidates only; reject all Fable coordinator requests and metered pins or overrides atomically; force generated artifact paths; and pass every Fable-visible final result through one shared bounded-result helper that reuses existing truncation and temporary-artifact behavior without changing chain handoff.
  - Done when: naming `orchestrator` without a role never starts a coordinator; an explicit non-Fable coordinator still works; GPT-5.6 roots can work directly or dispatch leaves; Fable single, parallel, chain, fan-out, and workflow dispatches start only `openai-codex` leaves; a mixed invalid batch starts no child; trusted project-agent scope remains authoritative; missing subscription models fail before spawn; oversized results stay within 50 KB and 2000 lines with a generated full-output reference; and unmarked calls preserve continuation, explicit-model, and custom-output behavior.
  - Verify: `cd pi && pnpm test fable.test.ts subagent.test.ts` passes with parameterized assertions for omitted versus explicit coordinator roles, GPT-5.6 direct/leaf behavior, provider, model size, thinking suffix, agent pin, atomic rejection, delegation shapes, generated artifacts, result bounds, and unchanged non-Fable calls.

- [x] **T3: Publish the enforced contract, run the shared gate, and archive the completed spec**
  - Depends on: T2.
  - Files: `pi/README.md`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/skills/pi-extension/references/contracts/tool-discovery.md`, plus the changed runtime and tests from T1-T2.
  - Action: document that the selected primary model owns orchestration by default, non-Fable coordinators require an explicit role, Fable cannot delegate orchestration, and Fable uses the fixed control plane, direct GPT leaves, subscription-provider preflight, and bounded result/artifact behavior. Do not document internal helper names or add policy to `pi/AGENTS.md`.
  - Done when: revised prose matches executable behavior; `cd pi && pnpm test fable.test.ts subagent.test.ts tool-visibility.test.ts` passes; `cd pi && pnpm run typecheck` passes; `cd pi && pnpm exec biome check extensions/fable.ts extensions/subagent/index.ts extensions/tool-visibility.ts lib/tool-activation.ts tests/fable.test.ts tests/subagent.test.ts tests/tool-visibility.test.ts` passes; one final `cd pi && pnpm test` passes because tool visibility and subagent routing are shared surfaces; and `git diff --check` reports no whitespace errors.
  - Archive: after all task checkboxes and gates pass, `/do-it` must set this plan to complete and invoke `plan_archive` for `.specs/fable-subscription-orchestration/plan.md`. Completion requires `.specs/archive/fable-subscription-orchestration/plan.md` to exist and the active `.specs/fable-subscription-orchestration/` directory to be absent. An archive collision or failure leaves the plan incomplete and must be reported without moving files manually.

## Validation

- [x] `cd pi && pnpm test fable.test.ts subagent.test.ts tool-visibility.test.ts`
- [x] `cd pi && pnpm test goal-state.test.ts goal.test.ts`
- [x] `cd pi && pnpm run typecheck`
- [x] `cd pi && pnpm exec biome check extensions/fable.ts extensions/subagent/index.ts extensions/tool-visibility.ts lib/tool-activation.ts tests/fable.test.ts tests/subagent.test.ts tests/tool-visibility.test.ts tests/goal.test.ts tests/goal-state.test.ts`
- [x] `cd pi && pnpm test`
- [x] `git diff --check`

## Execution Status

- State: complete
- Blocker: none
- Next: none
- Result: T1 focused tests passed: `cd pi && pnpm test fable.test.ts tool-visibility.test.ts`.
- Result: T2 focused tests passed: `cd pi && pnpm test fable.test.ts subagent.test.ts`.
- Result: The slow unattended-goal integration scenario was split into focused deterministic flows while preserving pure threshold coverage in `goal-state.test.ts`; `cd pi && pnpm test goal-state.test.ts goal.test.ts` passed.
- Result: T3 focused tests, typecheck, Biome, `git diff --check`, and the final `cd pi && pnpm test` gate passed.
- Resume: none
