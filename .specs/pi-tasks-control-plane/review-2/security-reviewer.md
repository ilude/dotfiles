---
reviewer: security-reviewer
status: complete
---

## Findings

### 1. High — Redaction is scoped to representative patterns, not all persistence paths
**Evidence:** Plan says “cover common token/key patterns” and “optional integration call sites in `pi/lib/task-registry.ts` after T1 shape is known.”  
**Required fix:** Make redaction/rejection mandatory at every task ingress and egress path before persistence/rendering/tool results. Add tests proving `TaskCreate`, `TaskCreateMany`, `TaskUpdate`, registry writes, renderer output, and `/tasks show` cannot expose raw representative secrets.

### 2. Medium — Evidence logs can persist sensitive task content
**Evidence:** Automation writes terminal output to `.specs/pi-tasks-control-plane/evidence/*.log`; archive rule only says evidence “must not contain secrets,” but no enforcement is specified.  
**Required fix:** Add archive preflight that scans evidence logs and git diff for representative secrets/private keys before F5. If matches are found, fail archive and require sanitized evidence regeneration.

### 3. Medium — Rollback guidance allows broad checkout without path safety
**Evidence:** Rollback says “revert edited files with normal git checkout only if user requests,” while repo has existing unrelated user changes.  
**Required fix:** Require a path-scoped rollback manifest generated from intended files, `git diff --name-only` review, and explicit confirmation before any checkout/revert. Never rollback untracked evidence or unrelated modified files implicitly.

### 4. Medium — Redaction tests may use realistic secrets that become committed fixtures
**Evidence:** T2 requires tests for “common API-token/private-key-like strings” in prompt/metadata/output-like fields.  
**Required fix:** Require fake sentinel secrets only, e.g. `pi_test_secret_...` and synthetic PEM blocks clearly marked invalid. Add a validation check that no real-looking high-entropy tokens or valid private-key blocks are introduced in tests/fixtures.

### 5. Low — Deferred execution tools are prohibited but not namespace-reserved safely
**Evidence:** MVP must not register `TaskExecute`, `TaskStop`, or `TaskOutput` as working tools; validation only confirms they are not registered.  
**Required fix:** Add a test that these names are absent or return explicit “deferred/unavailable” non-success results if present. Document that no command path may execute shell/subagent work from persisted task content in MVP.
