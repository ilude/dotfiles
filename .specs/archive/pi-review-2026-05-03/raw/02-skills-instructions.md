---
date: 2026-05-03
reviewer: code-review
---

# Code Review: Skills and Instructions -- 2026-05-03

**Files reviewed:** 14 files (workflow skills, shared instructions, PI-INSTRUCTIONS.md, extensions README, commit extension, new skills)
**Scope:** commits since 2026-05-02 touching workflow, commit, and instruction surfaces

---

## Summary

Two sessions of changes hardened the do-it/plan-it/review-it triad, introduced a Pi-native commit extension (pi/extensions/commit.ts + pi/lib/commit/), and added two new skills (pdf-reader, reddit). The triad is internally consistent for the plan-file execution path. Four material issues were found: a plan-validation schema mismatch between Claude-shared and Pi-native do-it; a Fast Mode instruction set wired into Claude/OpenCode but silently absent from the Pi commit driver; an orphaned doc reference to a deleted extension; and a buildSkillPrompt function that double-appends args for commands using replaceArguments mode.

---

## Findings

### BLOCKER

**Finding 1 -- claude/shared/do-it-instructions.md validates wrong required plan sections**

- Severity: BLOCKER
- File:line: claude/shared/do-it-instructions.md:98
- Issue: Step 3 validates that a plan has sections Objective, Team Members, and Execution Waves. But plan-it.md (both Pi skill and Claude shared) generates plans with Task Breakdown -- not Team Members -- as the section name. When do-it reads a plan produced by plan-it, it flags the plan as missing Team Members and aborts or warns even when the plan is fully valid.
- Evidence: claude/shared/do-it-instructions.md:98 checks for (Objective, Team Members, Execution Waves). pi/skills/workflow/do-it.md:107-110 uses the corrected set: Objective, Task Breakdown, Execution Waves, Success Criteria. The Claude-shared version was not updated in commit e71b9de.
- Suggested fix: Replace the section list in claude/shared/do-it-instructions.md:98 to: Objective, Task Breakdown, Execution Waves, Success Criteria.

---

**Finding 2 -- buildSkillPrompt double-appends args for review-it and do-it**

- Severity: BLOCKER
- File:line: pi/lib/workflow-commands/prompts.ts:95-99
- Issue: buildSkillPrompt with replaceArguments=true substitutes the plan path into the template body at the structured plan-file-path instruction, then unconditionally appends an Args: suffix line when args are non-empty. For review-it and do-it (both pass replaceArguments=true) the plan path ends up in the prompt twice. Ambiguous duplication risks the LLM treating the trailing line as an override or second task.
- Evidence: workflow-commands.ts:800 calls buildSkillPrompt(template, args, { replaceArguments: true }) for review-it. prompts.ts:96 substitutes the placeholder. prompts.ts:98 appends the Args: suffix unconditionally regardless of the replaceArguments flag.
- Suggested fix: When replaceArguments is true, return resolvedTemplate directly without the Args: suffix.

---

### FOLLOW-UP

**Finding 3 -- pi/prompt-routing/docs/setThinkingLevel-probe.md references deleted extension**

- Severity: FOLLOW-UP
- File:line: pi/prompt-routing/docs/setThinkingLevel-probe.md:78 and :96
- Issue: The doc describes probe-thinking-level.ts as a current extension subscribing to session_start. The file was removed in commit 8900120. An agent directed to verify thinking-level behavior via this doc will look for a file that does not exist.
- Evidence: probe-thinking-level.ts is absent from pi/extensions/. Commit 8900120 shows it deleted. Doc uses present tense.
- Suggested fix: Update the doc to note that probe-thinking-level.ts was a temporary diagnostic probe removed 2026-05-02; reference prompt-router.ts as the current production implementation.

---

**Finding 4 -- commit-instructions.md Fast Mode is not honored by Pi /commit driver**

- Severity: FOLLOW-UP
- File:line: claude/shared/commit-instructions.md:5-7 and pi/extensions/workflow-commands.ts:292-300
- Issue: commit-instructions.md describes a fast keyword selecting a different workflow. PI-INSTRUCTIONS.md says Pi uses this file as the planning prompt. But workflow-commands.ts passes commit-instructions.md only to the LLM grouping subagent as a planning hint -- the TypeScript driver does not parse fast from args and does not change behavior for single-change trees. The pi/skills/workflow/commit.md and commit-fast.md skill files exist but no loadSkill call for either appears in workflow-commands.ts.
- Evidence: workflow-commands.ts:292-300 parseCommitArgs parses push and file paths but not fast. No loadSkill(commit) or loadSkill(commit-fast) call exists in workflow-commands.ts.
- Suggested fix -- two options: (a) Minimal: add a comment to commit-instructions.md that Fast Mode is for Claude/OpenCode clients only, not the Pi TypeScript driver. (b) Full: parse fast in parseCommitArgs and short-circuit LLM grouping when detected.

---

### QUESTIONS

**Question 1 -- commit.ts tools vs. workflow-commands.ts /commit: safety contract scope**

- File:line: pi/extensions/commit.ts (all); pi/extensions/workflow-commands.ts:776
- Issue: commit.ts registers commit_plan, commit_stage, commit_create, and commit_validate_message as agent-callable Pi tools. workflow-commands.ts registers /commit as a slash command with its own implementation. Both paths can create commits with independent safety contracts (token guards in commit.ts vs. no-force-add in executeCommitCommand). It is undocumented whether agents may call commit_stage/commit_create directly.
- Clarification needed: Is commit.ts intended as an agent-callable alternative to /commit, or as a toolbox for future use? If agents may call these tools directly, the token-guard contract should be documented in PI-INSTRUCTIONS.md alongside the /commit policy.

---

## Verified Safe

- review-it / plan-it / do-it triad (Pi skill files): Completion gates, output directories, verdict forms, apply-option menus, and next-step commands are consistent across all three pi/skills/workflow/ files. Archive rule, Validation Contract fallback, and Execution Status tracking are aligned.
- PI-INSTRUCTIONS.md: No references to probe-thinking-level.ts, memory-index.ts, or memory-retrieve.ts in the file itself.
- pdf-reader SKILL.md: Activation trigger (read, parse, analyze, search, render, or extract content from a PDF file) is specific. uv run --with pymupdf runtime is self-contained. No over-firing risk.
- reddit SKILL.md: Activation trigger (search Reddit, view a subreddit, or read a specific post) is specific. No-API-key requirement stated correctly. node runtime call matches reddit.js in the skill directory.
- docs/commit-helper-contract.md vs commit.ts: Contract document accurately describes all four tools, the non-mutating vs. mutating distinction, pushed=false behavior, and token-guard pattern. Schema matches TypeScript types.
- docs/agent-command-surfaces.md: Accurately reflects Pi/Claude/OpenCode/Copilot split for do-it and commit. The make check repo-wide gate is consistent with both do-it skill files.
- plan-it (Pi skill vs. Claude shared): Both versions produce the same plan template structure, Validation Contract requirement, self-validation checklist, and FINAL STATUS line conventions.
- review-it Step 3: Correctly handles archived-plan paths at .specs/archive/{slug}/review-{N}/.
- do-it Step 8/9 (Pi skill): Manual validation gate, deployment gate, and archive preflight are correctly ordered and consistent with the completion classification taxonomy.
