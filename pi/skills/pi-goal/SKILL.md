---
name: pi-goal
description: "Write or improve Pi /goal, goal prompt files, long-running objectives, or goal_prompt_file.md. Not for PRDs or task planning."
---

# Pi Goal Prompt Builder

## Boundary

Use this skill when the output will be pasted into `/goal` or saved as a goal prompt. Use `planning` for acceptance criteria and `prd` for product requirement documents.

## Core Principle

A goal prompt should state the outcome and constraints clearly enough for autonomous execution without turning ordinary work into a project-management artifact.

## Practical Steps

1. Prefer inline `/goal ...` unless the user asks for a file or the prompt needs durable detail.
2. State the outcome, relevant scope, and constraints.
3. Include tasks only when order or coverage would otherwise be ambiguous.
4. Name validation only when it directly tests the requested outcome; do not prescribe generic checks.
5. Add waves, backup, rollback, approval, or incident behavior only for actual destructive, stateful, deployment, external-mutation, secret, paid-resource, hardware, or irreversible work.

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
