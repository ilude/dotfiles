---
created: 2026-05-07
status: draft
---

# PRD: Pi Subagent Team Coordination Cleanup

## Problem

Pi has overlapping delegation concepts: direct `subagent` workers and a separate `/team` command for lead coordination. Today the boundary is unclear:

- `pi/agents/` and stale `pi/multi-team/agents/` duplicate agent definitions.
- Lead agents can appear as ordinary workers even though they are meant for coordination.
- Agent frontmatter includes fields such as `roleType`, `reportsTo`, `team`, `leads`, and `domain`, but most are not runtime-enforced.
- `/team` is a second delegation surface and is not functioning as originally intended.

This creates operator confusion, accidental misuse of coordinator agents, duplicated extension logic, and metadata drift.

## Users / Jobs To Be Done

- Primary user: Pi operator maintaining and using specialized coding agents.
- Job/story: As a Pi operator, I want a single, predictable `subagent` delegation system that can run direct workers or coordination leads without a separate `/team` command.
- Current workaround: Manually choose agents via `subagent`, remember which agents are leads, and inspect duplicated/stale agent config by hand.

## Goals

1. Make `pi/agents/` the single canonical source for agent definitions.
2. Define clear role semantics: lead/orchestrator agents are coordinators, not workers.
3. Remove `/team` as a separate command/surface and fold explicit team/lead coordination into `subagent`.
4. Allow leads to triage: coordinate when a team is warranted, or report that a task is too simple and recommend a direct worker/specialist instead.
5. Reduce misleading metadata by removing, renaming, or documenting fields that are not runtime-supported.
6. Align coding worker models with the approved Codex ladder.

## Non-Goals

- Implement a full staged workflow engine in this PRD's first implementation.
- Implement real `domain` path access enforcement.
- Migrate `pi/multi-team/expertise` or redesign the expertise/memory system.
- Add worktree isolation, background/scheduled agents, event bus RPC, or cross-extension orchestration.
- Preserve Claude Code frontmatter compatibility; this system should optimize for Pi.

## Requirements

### Functional Requirements

- Remove stale duplicate source agents from `pi/multi-team/agents/`.
- Update docs and reload/watch references so `pi/agents/` is documented as canonical.
- Parse `roleType` from agent frontmatter in the subagent discovery layer.
- Supported `roleType` values are `orchestrator`, `lead`, `worker`, and `specialist`; remove the current `tier` role type.
- Define role behavior:
  - `roleType: lead` means a coordination agent that triages, delegates, and synthesizes; it must not perform worker implementation directly.
  - `roleType: orchestrator` is a higher-level lead for multi-team coordination.
  - `roleType: worker` and `roleType: specialist` are execution agents; they may be directly invoked by the root assistant or by leads.
  - Former tier agents (`coding-light`, `coding-medium`, `coding-heavy`, `utility-mini`) become `worker` agents.
- Leads and orchestrators may be invoked directly, but their valid behavior is coordination/triage only:
  - If coordination is warranted, delegate to appropriate workers/specialists via `subagent` and synthesize the result.
  - If the task is too simple for a team, return an advisory routing recommendation rather than auto-rerouting or doing the worker task directly.
  - If additional teams/leads are needed, report that need back to the caller rather than invoking another lead directly.
- `subagent` should become the single simple delegation primitive. It may resolve an explicit team/lead request to a lead coordinator with team context, while direct worker/specialist requests remain simple worker execution.
- Fully remove `/team` as a command/surface; do not keep a backwards-compatible alias in v1.
- v1 team routing is explicit only: route to a lead when the caller names a lead/team or asks for team coordination; do not autonomously choose a team from task text yet.
- The subagent dispatch path should record lightweight routing-evaluation telemetry for corpus-building:
  - coordination request type: `none`, `team`, `lead`, or `generic`;
  - whether the prompt/context appears to warrant team coordination;
  - which agent/team was requested or resolved;
  - whether a lead declined as too simple, coordinated, or reported another team was needed;
  - timestamp and classifier round-trip time;
  - session reference and prompt hash for later correlation with existing Pi session logs, without duplicating raw prompt text by default.
- Do not log fields that can be inferred from other logged fields.
- For v1, `teamWarranted` should be evaluated by a lightweight classifier call to `openai-codex/gpt-5.4-mini` using the minimal routing context capsule, not full chat history.
- The classifier should return `teamWarranted: yes | no | uncertain`, confidence, and a compact `signals` array from a small enum such as `multi_specialty`, `multi_phase`, `high_risk`, `ambiguous_scope`, and `simple_direct`.
- `simple_direct` is mutually exclusive with all other signals.
- Run the classifier for every `subagent` dispatch, including explicit direct worker calls, to capture false-negative cases where team coordination may have been warranted.
- Because the classifier is telemetry-only, run it asynchronously/non-blocking after dispatch; it must not add latency to delegation.
- Classifier failures/timeouts should be logged with `classifierStatus: ok | timeout | error`, `teamWarranted: unknown`, and round-trip time; classifier failure must never block subagent execution.
- The v1 classifier result is telemetry-only; it must not autonomously change routing yet.
- Explicit team-key dispatch through `subagent` should resolve the configured lead with clearer validation, team-roster context, and messaging; it should not execute multi-stage workflows.
- Audit and update skills, commands, docs, and extension text that advertise lead agents as directly available workers.
- Update coding worker models:
  - `coding-light` uses `openai-codex/gpt-5.4-mini`.
  - `coding-medium` uses `openai-codex/gpt-5.3-codex`.
  - `coding-heavy` uses `openai-codex/gpt-5.5` with low effort.
- Lead/orchestrator tools should be limited to coordination tools only:
  - v1: `subagent`, `todo`.
  - no direct `read`, `bash`, `edit`, or `write`.
  - future-compatible with a dependency-tracked `pi-tasks` style task manager.
- Worker and specialist agents should not have `subagent` by default; if they need another specialty, they report that need back to the lead/caller.
- Subagent dispatch should include a simple delegation depth safety guard:
  - track delegation depth across child processes;
  - default max depth: 3, supporting root -> orchestrator -> lead -> worker;
  - make max depth configurable through settings/env with a safe default;
  - when depth is exceeded, block gracefully and instruct the current agent to report the need upward;
  - include `delegationDepth` in routing-evaluation telemetry.
- Do not implement cycle prevention in v1; tool restrictions and max depth are the primary safeguards.
- `teams.yaml` provides the default starting roster, not a hard allowlist. Leads may delegate to any available `worker` or `specialist` when justified, and should briefly justify out-of-roster delegation in their synthesis.
- Leads should not delegate to other leads directly in v1; cross-team needs should be reported back to the caller/orchestrator.
- Decide cleanup for currently advisory fields:
  - remove `reportsTo`, `team`, and `leads` from agent frontmatter unless immediately used by `/team`.
  - remove or reframe `domain` so it does not imply enforced sandboxing.
  - keep only fields that are used now or intentionally documented as advisory.

### Non-Functional Requirements

- Keep implementation small and testable.
- Preserve direct `subagent` use for normal worker/specialist agents.
- Avoid surprising automatic reroutes when a lead declares a task too simple for team coordination.
- Routing-evaluation telemetry must avoid storing secrets or excessive raw prompt/context; store non-redundant structured labels plus session reference and prompt hash by default, not raw prompt text. Redacted excerpts should require an explicit setting.
- Existing tests must be updated or replaced to reflect removal of `/team` and the new `subagent` team-dispatch contract.
- No destructive git operations or commits unless explicitly requested.

## Acceptance Criteria

1. [ ] Duplicate legacy agents are removed.
   - Verify: `pi/multi-team/agents/` no longer exists or contains no active agent definitions.
   - Pass: Runtime/docs refer to `pi/agents/` for agent source.
   - Fail: docs or reload code still treats `pi/multi-team/agents/` as active.

2. [ ] Lead/orchestrator agents behave as coordinators, not workers.
   - Verify: lead/orchestrator prompts and injected runtime context require triage, delegation, synthesis, and advisory decline for too-simple tasks.
   - Pass: leads do not have direct read/bash/edit/write tools and do not present themselves as implementation workers.
   - Fail: leads are configured like ordinary workers or instructed to perform implementation directly.

3. [ ] `subagent` dispatches explicit team requests to leads with team context.
   - Verify: a `subagent` team-key or lead request produces a lead invocation path with the default roster from `teams.yaml`.
   - Pass: `subagent` gives the lead enough context to coordinate, decline as too simple, or report that another team is needed.
   - Fail: coordination still depends on `/team` or assumes a rigid full workflow engine.

4. [ ] Agent frontmatter is Pi-focused and less misleading.
   - Verify: unused org-chart fields are removed or documented as advisory.
   - Pass: no field implies security/access enforcement unless implemented.
   - Fail: `domain` or similar fields still look like enforced access control.

5. [ ] Former coding tier agents are workers and match the desired model ladder.
   - Verify: inspect `pi/agents/coding-light.md`, `coding-medium.md`, and `coding-heavy.md`.
   - Pass: `roleType: worker` and models/effort match this PRD.
   - Fail: coding agents remain `roleType: tier` or use stale model choices.

6. [ ] Tests cover the new contract.
   - Verify: run relevant Pi extension tests.
   - Pass: tests cover roleType parsing, lead tool restrictions/coordination context, `/team` lead dispatch, and routing-evaluation log records.
   - Fail: behavior is only manually verified.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Block all direct lead invocation | Strong separation between leads and workers | Too rigid; lead may reasonably triage and say a task is too simple | Rejected |
| Prompt-only lead behavior | Simple and flexible | Rules may drift across lead files | Partially accepted |
| Hybrid lead protocol | Shared runtime/context instruction plus lead prompts | Slightly more implementation | Selected |
| Build full workflow engine now | More powerful coordination; supports staged execution | Larger change; higher risk; violates KISS for first cleanup | Deferred |
| Use `reportsTo/team/leads` frontmatter as orchestration source | Keeps org chart in agent files | Blurs agent identity vs workflow config; more metadata drift | Rejected for v1 |
| Keep `/team` as lead dispatch only | Small compatibility bridge | Preserves second delegation surface and duplicated logic | Rejected |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lead behavior remains too prompt-dependent | Leads may still act like workers | Use hybrid shared lead protocol plus tool restrictions |
| Team config/parser mismatch remains | Explicit team dispatch still feels broken | Include minimal parser/config fix needed for subagent team dispatch |
| Removing metadata loses useful intent | Less context for future design | Keep intent in descriptions or `teams.yaml`; avoid fake enforcement |
| `effort` remains metadata-only | Coding-heavy low effort may not affect runtime | Document current behavior or wire effort through if low-risk during implementation |
| Lead has insufficient coordination state | Complex work becomes hard to manage | Keep `todo` for v1 and design for future `pi-tasks` dependency tracking |
| Routing telemetry stores too much sensitive context | Privacy/security risk | Store structured labels, session references, and prompt hashes by default; avoid raw prompt excerpts unless explicitly enabled |

## Open Questions

- Should `roleType: orchestrator` be mapped to `/team all`, a future `/orchestrate`, or remain a direct coordination agent for now?
- Should `effort` be wired to actual child Pi thinking/reasoning settings in the same implementation, or remain a separate follow-up?
- What is the minimum useful interface for a future dependency-tracked `pi-tasks` integration?
- Where should team-routing evaluation records be stored, and what retention/redaction policy should apply?

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/pi-agent-team-cleanup/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/pi-agent-team-cleanup/PRD.md
  ```
- Notes for planner:
  - Keep v1 focused on canonical agent source, roleType parsing, lead coordination semantics, `/team` removal, `subagent` team dispatch, docs, and tests.
  - Defer full staged workflows, domain enforcement, and `pi-tasks` implementation.
