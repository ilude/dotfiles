---
name: pi-goal
description: "Pi /goal prompt builder. Use when asked to write or improve an inline Pi /goal command, goal prompt file, long-running objective, or goal_prompt_file.md. Not for PRDs or normal task planning."
---

# Pi Goal Prompt Builder

**Auto-activate when:** drafting, improving, or converting work into a Pi `/goal` prompt or goal prompt file.

## Boundary

Use this skill when the output will be pasted into `/goal` or saved as a goal prompt. Use `planning` for acceptance criteria and `prd` for product requirement documents.

## Core Principle

A goal prompt should let Pi work autonomously until completion, with explicit scope, validation, and closeout rules.

## Practical Steps

1. Prefer inline `/goal ...` unless the user asks for a file or the prompt is long.
2. Name the outcome and why it matters.
3. List scope: files, systems, constraints, non-goals.
4. Give execution rules: ask only when blocked, track batches, avoid unrelated changes.
5. Define validation with exact commands or inspection criteria.
6. Require closeout: concise summary, validation, gaps, next steps.

## Template

```markdown
/goal Objective: <specific outcome>
Context: <relevant background>
Scope: <in scope / out of scope>
Execution rules: Work until complete; ask only if blocked; keep changes focused.
Tasks:
- <task 1>
- <task 2>
Validation: <commands/checks>
Completion: Call goal_complete with summary, validation, gaps, next steps.
```

## Anti-Patterns

- Writing a PRD instead of an executable goal.
- Omitting validation or completion criteria.
- Hiding autonomy boundaries in vague prose.
- Asking multiple clarifying questions when one blocker question is enough.

## Quick Reference

Goal prompts optimize execution. They should be concrete enough that another agent can finish without reinterpreting intent.
