---
name: full-send
description: Complete an agreed task or workflow autonomously when the user explicitly says "full send" or invokes this skill. Includes task-scoped implementation, testing, review and fixes, without a PR workflow.
---

# Full send

Use only for an explicit user request for full send, not a quotation, discussion of the skill, or inferred enthusiasm. Apply it to the agreed task or plan, not every later request in the session.

The user wants completion without approving each implementation step. Do available work rather than stopping after a plan, a progress report, or a request to continue.

## Advance permission

Within the agreed repositories, resources and outcome, invocation authorizes implementation, necessary dependency/tool use, task-specific test fixtures, running the app or a dev server, browser/computer-use checks, screenshots, and fixing demonstrated task-related defects. Do not ask again merely because the exact command, test method or equivalent implementation detail was not specified. Follow the owning surface's commands and testing methods.

Complete commit and local integration steps when they are part of the agreed workflow. Invocation alone does not authorize pushing, rewriting published history, deployment, production changes, deleting existing user data, or work outside the agreed resources. Explicit authorization for those steps in the conversation or plan still applies; do not ask for it again. Preserve unrelated changes and ignored paths.

Ask only when a choice changes the intended result, scope or acceptance; necessary access requires user input; the next action falls outside the grant; or a concrete blocker prevents completion. Include the context, options and recommendation in the harness's blocking question mechanism when available. Do not treat user silence as approval.

## Finish and verify

1. Finish the smallest change that meets the agreed outcome. Resolve routine implementation choices yourself. Use the existing plan/delegation workflow when applicable rather than introducing another coordinator.
2. Observe direct evidence for the changed behavior. Reproduce the original failure when practical, run the relevant repository checks, and exercise UI/runtime behavior directly when that is what changed. Add a focused regression test when the behavior lacks coverage and the repository has a suitable test setup. Do not expand into unrelated hardening or exhaustive validation.
3. Get an independent read-only review through the existing role routing. Invocation authorizes this review, not a council or an unrequested provider/model substitution. Assess findings under the existing scope and triage rules; fix demonstrated in-scope defects without another user approval. Record reasons for declining optional or unsupported proposals. Recheck affected behavior after fixes; follow any agreed review rounds rather than looping until everyone approves.
4. Finish the agreed workflow and stop when its acceptance conditions pass. For genuine external waits, use the existing scheduler with event context rather than keeping a shell asleep. Missing checks or unavailable reviewers are gaps to report, never evidence of approval.
5. Report what finished, observed verification and review results, material decisions, and any remaining blocker or unverified behavior. Do not claim success when the acceptance evidence is missing.

## Damage Control boundary

This skill grants task authority; it does not itself toggle or reconfigure runtime enforcement. Existing Damage Control sees direct user authorization during contextual review, but human-only prompts and hard blocks remain enforced. Do not disguise a denied action or claim that loading this skill disabled the gate.

The existing `/dc off` is an operator-controlled, session-local bypass for eligible local asks, not a plan-scoped exemption. Its exact limits are in [Damage Control controls](../../docs/damage-control-setup.md#operator-controls). Automatic task-scoped runtime preapproval is not implemented by this skill.

## No PR lifecycle

Do not create or manage a PR, alter auto-merge or merge queues, impose branch-publication requirements, or merge a PR because of this skill. A separately authorized workflow may include those actions; full send adds no PR rules.

Inspired by [Theo's tstack full-send](https://github.com/t3dotgg/tstack/blob/main/skills/full-send/SKILL.md), adapted to this profile's task scope and existing routing. PR automation and adoption of other tstack skills remain separate decisions.
