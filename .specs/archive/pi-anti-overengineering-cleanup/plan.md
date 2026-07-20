---
created: 2026-07-20
status: complete
completed: 2026-07-20
---

# Plan: Remove Pi overengineering and scope-expansion instructions

## Context

More-specific instructions and skills still override Pi's smallest-change philosophy with universal validation, parity, design, artifact, follow-up, and tracking requirements. This plan covers only the ten cleanup items from the completed instruction audit, enumerated here so the plan is self-contained:

1. Universal validation-ladder requirements in root `AGENTS.md` that apply broad validation regardless of what changed.
2. Requirements to surface unsolicited alternatives or produce unrelated backlog.
3. The redundant discovery-versus-mutation approval rule and the generic root-cause procedure in global instructions.
4. Universal rollout-wave, exact-workflow, and parity requirements applied outside live stateful or behavior-preserving work.
5. Universal API, UX, TUI, and language mandates in skills (pagination, auth, caching, docs, dark mode, Lighthouse, test-everything, race checks, style retrofits, literal extraction).
6. Mandatory delegation artifacts: file-only discovery, synthesis workers, and coordinator layers.
7. Mandatory reviewer follow-up, questions, and verified-safe sections that manufacture out-of-scope findings.
8. PRD and GitLab issue defaults that expand a document request into planning and delivery work.
9. Workflow-friction and feature-memory tracking prompted by ordinary approved work.
10. Obsolete review ceremony templates with no remaining references.

Use deletion first. Retain rules only when they protect task focus, explicit development or styling preferences, a real safety boundary, or the contract changed by the requested work. Do not replace removed ceremony with a new framework.

## Objective

Remove the identified instructions that cause ordinary Pi work to expand beyond the user's request while preserving necessary project conventions, safety, styling preferences, and changed-contract validation.

## Boundaries

- In scope: T1-T6 below, which map only to the ten recommended cleanup items.
- Root `AGENTS.md` changes intentionally apply to all clients (Claude, OpenCode, Copilot, Pi); do not split or hedge them on client boundaries.
- Out of scope: `/commit`, subagent launcher reliability, task-registry behavior, workflow telemetry architecture, damage-control policy, unrelated command redesign, the automatic workflow-friction capture pipeline, and technical rules not identified as scope-expansion causes.
- Preserve: secret protection, explicit approval for destructive or external actions, live stateful rollback discipline, package-manager rules, ASCII/LF requirements, light-mode prohibition, useful subagent delegation, checks that directly exercise changed behavior, and the one-line rule to surface a materially better alternative briefly and then do what was asked.

## Tasks

- [x] **T1: Remove universal validation, alternatives, backlog, rollout, and parity requirements (items 1-4)**
  - Files: `AGENTS.md`, `pi/AGENTS.md`, `pi/skills/planning/SKILL.md`, `pi/skills/least-astonishment/SKILL.md`, `pi/skills/workflow-design/SKILL.md`
  - Change:
    - Collapse the root validation ladder into changed-contract validation and direct inspection for prose-only edits.
    - Delete requirements to produce unsolicited alternatives or unrelated backlog. Keep the one-line rule in `pi/AGENTS.md` to surface a materially better alternative briefly and then do what was asked, and keep the escape hatch for findings that invalidate the requested outcome.
    - Delete the redundant discovery-versus-mutation approval rule where the user's request already authorizes local work.
    - Delete generic root-cause procedure from global instructions; `analysis-workflow` already owns targeted investigation guidance.
    - Restrict rollout waves to actual live stateful changes.
    - Make exact-workflow and parity checks conditional on behavior the request must preserve.
  - Done when: the listed files no longer require unrelated alternatives, backlog, rollout, parity, or validation work.
  - Verify: inspect the revised files together for contradictory or duplicated scope and validation rules.

- [x] **T2: Make API, UX, TUI, and language mandates contract-dependent (item 5)**
  - Files: `pi/skills/api-design/SKILL.md`, `pi/skills/ux-design-workflow/SKILL.md`, `pi/skills/tui-ux/SKILL.md`, `pi/skills/go/SKILL.md`, `pi/skills/go/core.md`, `pi/skills/rust/SKILL.md`, `pi/skills/rust/core.md`, `pi/skills/rust/testing.md`, `pi/skills/python/SKILL.md`, `pi/skills/python/reference.md`, `pi/skills/python/testing.md`, `pi/skills/typescript/SKILL.md`, `pi/skills/typescript/reference.md`
  - Change:
    - Remove universal API requirements for pagination, authentication, caching, documentation, and GraphQL batching.
    - Restrict the full UX pipeline and dark-mode, Lighthouse, mobile, loading, and component-system requirements to work whose requested contract needs them.
    - Restrict TUI checks to invariants affected by the requested change.
    - Remove language-wide mandates to test every change, run all tests or race checks, retrofit unrelated style, document every public item, or extract every literal.
    - Keep correctness, security, package-manager, and local-convention rules that apply to changed code.
    - Distinguish quick-reference command tables from mandate prose: tables that only document how to run a command (for example `go test -race ./...` in the Go skill's reference table) stay; edit only prose that requires running them on every change.
  - Done when: the listed universal mandates are conditional on the changed contract or an explicitly invoked workflow.
  - Verify: inspect remaining absolute language and confirm each retained mandate maps to a language invariant, security boundary, repository rule, or explicit workflow.

- [x] **T3: Remove delegation artifacts and reviewer follow-up scope (items 6-7)**
  - Files: `pi/skills/orchestration/SKILL.md`, `pi/agents/code-reviewer.md`, `pi/agents/security-reviewer.md`
  - Change:
    - Remove mandatory file-only discovery, synthesis workers, artifacts, and coordinator layers.
    - Preserve subagents for useful independent work without prescribing persistence or a replacement protocol.
    - Remove mandatory pre-existing follow-up, questions, and verified-safe report sections.
    - Limit findings to assigned scope except when an adjacent issue invalidates the requested outcome or presents an immediate severe risk.
  - Done when: delegation does not require artifacts and reviewers do not manufacture unrelated backlog.
  - Verify: inspect the three files and confirm concise inline worker and reviewer results are valid.

- [x] **T4: Reduce PRD and GitLab issue defaults (item 8)**
  - Files: `pi/skills/prd/SKILL.md`, `pi/skills/workflow/templates/prd-template.md`, `pi/prompts/gitlab-ticket.md`
  - Change:
    - Keep problem, goals/non-goals, requirements, and acceptance criteria as the minimal PRD.
    - Make other PRD sections and planning/review handoffs optional unless requested or needed by the product decision.
    - In `gitlab-ticket.md`, the branch/MR and label steps are already opt-in; the actual deltas are making the mandatory Technical Design & Rationale section optional and removing the unprompted follow-up asks (labels, branch/MR) unless the user raises them.
  - Done when: requesting a PRD or issue does not automatically create implementation-planning or delivery work.
  - Verify: inspect the revised templates and confirm their optional sections can be omitted without violating their instructions.

- [x] **T5: Require explicit intent for model-initiated tracking (item 9)**
  - Files: `pi/extensions/workflow-friction-review.ts`, `pi/extensions/feature-memory.ts`
  - Change:
    - Edit only model-facing text: tool descriptions, `promptSnippet`, `promptGuidelines`, and prompts built for the model. The automatic capture pipeline (`agent_settled` handlers, trigger detection, queueing, metadata persistence) is deterministic telemetry and stays untouched; it feeds `/improve` and is out of scope.
    - `pi/AGENTS.md` already states that approval for requested work does not authorize auxiliary tracking; do not duplicate that rule into the extensions.
    - In the `/improve` decision prompts, keep experiment recording gated behind the explicit `/improve decide` command (already the case; verify wording does not invite tracking outside it).
    - In `feature_memory_record` guidelines, require an explicit user request for memory or an active owning workflow that needs the durable event; feature matching alone is insufficient.
  - Done when: ordinary approved work does not prompt the model to create either auxiliary record, and automatic capture behavior is unchanged.
  - Verify: inspect tool descriptions and guidelines; run `cd pi && pnpm run typecheck` for any `.ts` edit, and run focused tests only if executable behavior or an existing assertion changes (`pi/tests/workflow-friction.test.ts` asserts on trigger/selection behavior, which must not change).

- [x] **T6: Delete obsolete review ceremony templates (item 10)**
  - Files: `pi/skills/workflow/templates/review-it-reviewer-prompts.md`, `pi/skills/workflow/templates/review-synthesis-template.md`
  - Change: confirm no active filename reference remains, then delete both templates.
  - Done when: neither file exists and no active `pi/` reference remains.
  - Verify: search `pi/` for both filenames before and after deletion.

## Validation

- [x] Inspect the revised instruction hierarchy and changed skills together.
  - Expected: ordinary local work requires only requested work and directly relevant checks; destructive and stateful work retains narrow safety rules.
- [x] Inspect T5 registrations, run `cd pi && pnpm run typecheck` for the `.ts` edits, and run focused tests only if executable behavior or an existing assertion changed.
  - Expected: model-initiated tracking requires explicit tracking intent; automatic capture behavior is unchanged; prose-only cleanup does not trigger a broad test suite.

## Archive Rule

After every checkbox passes, archive this plan under `.specs/archive/pi-anti-overengineering-cleanup/` as required for completed plans.
