---
name: pi-goal
description: "Pi /goal prompt builder. Use when asked to write or improve an inline Pi /goal command, goal prompt file, long-running objective, or goal_prompt_file.md. Not for PRDs or normal task planning."
---

# Pi Goal Prompt Builder

**Auto-activate when:** drafting, improving, or converting work into a Pi `/goal` prompt or goal prompt file.

## Boundary

Use this skill when the output will be pasted into `/goal` or saved as a goal prompt. Use `planning` for acceptance criteria and `prd` for product requirement documents.

## Core Principle

A goal prompt should state the outcome and constraints clearly enough for autonomous execution without turning ordinary work into a project-management artifact.

## Practical Steps

1. Prefer inline `/goal ...` unless the user asks for a file or the prompt needs durable detail.
2. State the outcome, relevant scope, and constraints.
3. Include tasks only when order or coverage would otherwise be ambiguous.
4. Encourage subagents for independent streams, capability boundaries, output-heavy investigation, or useful independent verification.
5. Name validation only when it directly tests the requested outcome; do not prescribe generic checks.
6. Add waves, backup, rollback, approval, or incident behavior only for actual destructive, stateful, deployment, external-mutation, secret, paid-resource, hardware, or irreversible work.
7. End with `goal_complete` after the requested outcome and relevant checks are complete.

## Template

```markdown
/goal Outcome: <specific end state>
Scope: <important boundaries and constraints>
Work: <tasks only when needed>
Validation: <checks that directly test the outcome, or omit>
Completion: Call goal_complete when complete, naming any real gap.
```

For actual stateful infrastructure, add the minimum safe rollout details: one independent target at a time, current backup or explicit no-prior-state evidence, restore action, rollback boundary, health check, and stop-on-failure behavior.

## Anti-Patterns

- Writing a PRD or detailed plan instead of a goal.
- Requiring waves, incident handling, or rollback for local and reversible work.
- Listing tests or repository checks that do not exercise the requested outcome.
- Expanding scope with optional hardening or speculative tasks.
- Omitting a real destructive or stateful safety boundary.

## Quick Reference

State the outcome, real boundaries, direct checks, and completion condition. Add structure only when the work requires it.
