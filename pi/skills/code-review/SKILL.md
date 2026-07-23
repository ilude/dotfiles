---
name: code-review
description: "Code, PR, diff, branch, or commit review; git diff, git show, or change comparison. Not for debugging or design critique."
---

# Evidence-Based Code Review

## Boundary

Use `code-review` only when reviewing a change set for findings. Use `analysis-workflow` for general troubleshooting and `least-astonishment` while making edits.

## Core Principle: Must vs May

Report only issues that are demonstrably reachable and worth fixing. Suggestions are allowed, but label them separately from required findings.

## Review Steps

1. Identify the reviewed range and changed files.
2. Understand intended behavior from code, tests, and docs.
3. Check changed paths for correctness, security, data loss, regressions, and test gaps.
4. Treat changes under `.vscode/`, `.claude/`, `.gemini/`, `.cursor/`, `.github/workflows/`,
   `.forgejo/workflows/`, package lifecycle scripts, setup scripts, and `go:generate` directives
   as security-sensitive executable or agent-instruction surface.
5. Prove reachability: inputs, callers, guards, and runtime conditions.
6. Classify severity and confidence.
7. Provide exact evidence and required fix.

## Finding Format

```markdown
[severity] Title
Evidence: <file:line and why the path is reachable>
Impact: <user/system consequence>
Required fix: <specific change or invariant>
```

## Severity Guide

| Severity | Meaning |
| --- | --- |
| Critical | data loss, credential exposure, remote exploit, total outage |
| High | common path broken, security boundary bypass, major regression |
| Medium | real bug with bounded impact |
| Low | minor correctness/maintainability issue |

## Anti-Patterns

- Flagging hypothetical bugs without a reachable path.
- Reviewing unchanged code as if introduced by the diff.
- Mixing style preferences with required fixes.
- Missing tests but not explaining the untested risk.
- Treating editor tasks, agent hooks, or workflow changes as harmless metadata without checking execution triggers and secret access.
