---
name: code-review
description: "Evidence-based review of code changes. Use for code review, PR review, diff review, branch/commit review, git diff, git show, or compare changes. Not for general debugging or design critique."
---

# Evidence-Based Code Review

**Auto-activate when:** the user asks to review code changes, a PR, branch, commit, `git diff`, or `git show` output.

## Boundary

Use `code-review` only when reviewing a change set for findings. Use `analysis-workflow` for general troubleshooting and `least-astonishment` while making edits.

## Core Principle: Must vs May

Report only issues that are demonstrably reachable and worth fixing. Suggestions are allowed, but label them separately from required findings.

## Review Steps

1. Identify the reviewed range and changed files.
2. Understand intended behavior from code, tests, and docs.
3. Check changed paths for correctness, security, data loss, regressions, and test gaps.
4. Prove reachability: inputs, callers, guards, and runtime conditions.
5. Classify severity and confidence.
6. Provide exact evidence and required fix.

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

## Quick Reference

Every finding needs changed-code evidence, a reachable scenario, impact, and a required fix.
