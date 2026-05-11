- severity: high
  evidence: Wave 3 and Wave 4 combine registry schema migration, dependency graph invariants, secret redaction, five LLM tools, and a broad `/tasks` CLI in one MVP. This is closer to a workflow platform than a consolidation cleanup.
  required_fix: Split task work into MVP1 (`list/show/create/update/status` with existing registry) and later phases for dependencies, bulk create, settings modes, and deferred execution-tool semantics.

- severity: high
  evidence: T5 requires role/tool restriction enforcement, T6 requires team-key lead dispatch/decline/depth guard, and T4 removes `/team` in the same wave. Removing the old surface before proving equivalent dispatch risks breaking operator workflows.
  required_fix: Sequence as add-and-verify first: implement subagent dispatch compatibility, add tests/docs, then remove `/team` only after a migration check confirms no active references or required behavior remain.

- severity: medium
  evidence: T9 requires proving secrets are rejected/redacted before persistence, rendering, tool output, and slash-command output, but the plan only mentions tests with sentinels. There is no reusable wrapper/gate specified for all task write/render paths.
  required_fix: Define a single task metadata sanitizer/redactor API and require all registry writes, renderers, tools, and slash commands to call it, with tests that fail if any path bypasses the helper.

- severity: medium
  evidence: V3 requires full `make check` after Pi-focused TypeScript validation. This repository includes broad dotfiles checks unrelated to Pi control-plane behavior, making every iteration expensive and potentially blocked by unrelated failures.
  required_fix: Make focused Pi validation the merge gate for this plan and reserve `make check` for final smoke/non-blocking evidence unless changed files touch repo-wide shell, Python, install, or Dotbot behavior.

- severity: medium
  evidence: F3 says archive this plan and remove superseded active spec directories as part of completion. That mixes implementation with specs housekeeping and risks hiding unfinished scope if any wave is partially deferred.
  required_fix: Add an explicit closeout decision: only archive superseded specs after each deferred item has a new owner/artifact or is formally cut from scope with rationale.
