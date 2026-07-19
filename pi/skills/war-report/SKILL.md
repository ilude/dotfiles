---
name: war-report
description: Weekly activity report generator from Git commits. Use for war reports, weekly activity reports, or work accomplishment summaries.
---

# WAR Report

Routing card for weekly work accomplishment reports.

## Inputs and Scope

- Use `date` to calculate the Sunday-Saturday reporting range and Friday report filename.
- Scan `C:\\Projects\\Work\\Gitlab\\` for Git repos.
- Resolve the report output directory from `WAR_ROOT`, then `CLAUDE_WAR_ROOT`, then `~/.claude/war`.
- Do not include GitHub/personal repos.
- Use exact author email matching via `war-report/get-user-commits.py`:

```bash
python SKILL_DIR/get-user-commits.py <repo_path> "<since>" "<until>"
```

- Review the previous report in the resolved output directory for continuity when available.

## Output

Write `war-YYYY-MM-DD.md` in the resolved output directory using date-prefixed chronological entries only, no header:

```text
9 Feb: Developed onboarding application edit models and update functionality
10 Feb: Resolved transaction log filtering issues and added coverage for the new filter box
```

Rules: no bullets, no trailing periods, active past tense, manager-friendly outcome language, specific component/system names, 1-2 sentences max per entry.

## Filters

Exclude AI/tooling/internal setup work, including commits mentioning Claude, AI, Bedrock, OpenCode, or agent workflow configuration. Avoid versions, instance types, package names, file paths, config keys, SHAs, and branch names.
