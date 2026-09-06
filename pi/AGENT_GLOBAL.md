# Global Agent Rules

General working rules extracted from the dotfiles repository instructions. This file is staged here for future global configuration; it is not automatically loaded as a Pi profile's `AGENTS.md` and is not wired into any profile yet.

## Scope and communication

- Before substantive work, state the observable completion evidence and how the outcome could fail.
- Ask only when a missing operator-owned decision materially changes correctness, direction, destructive scope, rollback risk, or intended outcome; otherwise inspect available state and proceed.
- Keep planning proportional: brief prose for complex work and none for simple work.
- For lists or batches, track every item to completed, explicitly skipped with reason, or blocked before finalizing.
- Stop research when the core question is answered and further retrieval is unlikely to change the conclusion; be exhaustive only when requested.

## Implementation and workflow

- Prefer `bun` for general JavaScript/TypeScript work. Never use `npm` or create/commit `package-lock.json`.
- All scripts must be idempotent. Use LF line endings only.
- Use only tools, workflows, permissions, and memory/task systems available in the active harness. If a capability is absent, adapt instead of assuming or naming it.
- Use deterministic mechanisms when they enforce a known invariant or make an external contract observable; preserve contextual judgment where no such invariant exists.
- Missing data and dependencies must fail explicitly. Do not hide them with broad exception wrappers, guard flags, or fallback paths; remove redundant paths rather than preserving them behind switches.
- Delegate only bounded work that is independently executable or materially benefits from specialization, verification independence, or context isolation; keep decomposition, integration, and acceptance with the root.

## Validation and policy

- Validation must directly exercise the changed contract or regression. Start with the cheapest focused check. Run broader or aggregate gates only when shared impact, applicable repository policy, or requested release or merge readiness requires them. When the request explicitly requires preserving a user workflow, validate its relevant entrypoint and sequence when available. Identify smoke tests as smoke tests and never claim unobserved behavior.
- Tests protect executable behavior, parsed schemas, normalized configuration meaning, or external protocols. Do not use assertions as the primary store for policy prose, prompt wording, comments, source spelling, or internal file layout. A test may cover policy through its executable parser or enforcement behavior.
- Keep durable policy and design intent in the applicable `AGENTS.md` or owning skill/tooling contract so instruction discovery delivers it as context; do not encode it indirectly in tests.
- For bug fixes, define the expected successful outcome before editing. If a contract-required workflow check is unavailable, report what remains unvalidated instead of substituting unrelated checks.

## Shared worktrees and change history

- Treat every worktree as potentially shared. Never use `git restore`, `git checkout`, `git reset`, `git clean`, file deletion, or overwrite to discard a change unless the current task created it or the user explicitly authorizes its removal. This does not prohibit editing a file that already has unrelated changes; preserve those changes in the resulting file and diff.
- Keep commit messages concise, but make them specific enough to capture the delivered outcome and relevant user intent. Use a short body only when the subject cannot preserve an important constraint or distinction; leave detailed rationale to the changelog.
- Do not invent rationale. Skip changelog entries for mechanical changes that do not alter supported behavior.

## Rollout and incident discipline

- For live stateful infrastructure, replace or migrate one independent service per rollout until the canary is healthy. Before changing existing state, require a current backup, a known restore path, an explicit rollback boundary, and a reviewed plan naming every create, update, replace, and delete. First-time provisioning requires no backup.
- The first failed live mutation enters incident mode: stop roadmap work, broad applies, parallel recovery, and unrelated refactoring. Diagnose directly, recover one service, preserve healthy services, and exit incident mode only after the original endpoint and state checks pass.
- Direct command output, saved logs, and endpoint checks outrank summaries. The parent executing or coordinating live work must independently verify critical plan and health claims.
- Reuse the user's authorization for repeated in-scope, non-destructive recovery steps. Ask again only when the target, destructive scope, rollback risk, or intended outcome materially changes.
