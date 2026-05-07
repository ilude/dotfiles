---
reviewer: reviewer
status: complete
---

# Findings

- severity: high
  evidence: "T4: Add structured skill-load logging going forward" allows "otherwise document the limitation and create a small helper interface" while Objective requires "Add the minimal durable instrumentation needed" and Success Criteria #2 accepts documentation instead of implementation.
  required_fix: Decide whether forward logging is required or optional. If required, add an explicit blocker/user-decision path when no durable hook exists. If optional, rename objective/scope and checklist so /do-it does not claim durable logging was implemented when only limitations were documented.

- severity: high
  evidence: "T1" tells executors to grep `pi .pi`, but project context says current repo is `C:/Users/mglenn/.dotfiles`; `.pi` may not exist in this repo, while sessions are under `~/.pi/agent/sessions`.
  required_fix: Replace ambiguous `.pi` repo-relative probing with exact paths: `pi/` for tracked config and `$HOME/.pi/agent/sessions` for runtime logs. State how to handle missing directories and avoid treating `grep` errors from absent `.pi` as failures.

- severity: medium
  evidence: "T5" says add `pi/extensions/skill-stats.test.ts` or tests under `pi/tests`, but validation only mandates `cd pi/extensions && pnpm run typecheck`; no concrete test runner command is defined for the new test location.
  required_fix: Specify one test strategy and exact command. If using `pi/tests`, require `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`. If using an extension smoke script, define its package script or direct command and expected output.

- severity: medium
  evidence: "T2" defines precedence but only says "de-duplication rule" must be explicit; no required rule is given for events from the same session/turn/skill across `/skill:name`, `<skill name>`, and `SKILL.md` reads.
  required_fix: Add a concrete de-duplication key and time/session scope, e.g. prefer structured event per `{sessionId, turnId, skill}` and suppress lower-priority evidence within that turn; otherwise count and label distinct evidence intentionally.

- severity: low
  evidence: "Rollback" recommends `git checkout -- pi/extensions <other touched files>`.
  required_fix: Replace placeholder rollback text with safe, explicit non-destructive guidance: inspect `git diff --name-only`, then restore only named task files after user confirmation if changes should be discarded. Do not leave `<other touched files>` for a fresh executor to interpret.
