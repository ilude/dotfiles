---
reviewer: reviewer
status: complete
---

# Findings

1. **Severity:** high
   **Evidence:** T2 says rules-load failure must “blocks handled tool calls,” but the acceptance criterion only names `bash`/file replay. T6 adds shell-wrapper and secret coverage later, but no gate states which Pi tools are “handled” or that every registered `tool_call` path fails closed when health is failed.
   **required_fix:** Define the exact handled tool set and add registered-handler failure tests for each one, including bash and file tools, before declaring fail-closed complete.

2. **Severity:** high
   **Evidence:** The plan requires ports from `claude/hooks/damage-control/patterns.yaml` and `bash-tool-damage-control.py`, but never requires creating a parity matrix or documenting intentionally omitted Claude patterns. “High-value” and “small and high-confidence” are subjective, so `/do-it` can pass while silently skipping important reference behavior.
   **required_fix:** Add a task to inventory Claude rules, map each to Pi port/defer/reject with rationale, and make validation check that all selected ported patterns have tests.

3. **Severity:** medium
   **Evidence:** Manual validation suggests `docker compose down` “only if it will not affect running services,” but gives no safe deterministic alternative unless the implementer creates/removes a temporary project rule. This is ambiguous and environment-dependent for automation readiness.
   **required_fix:** Replace the live manual command with a required scratch-directory test rule/command that cannot affect services, plus cleanup steps and expected `/permissions` evidence.

4. **Severity:** medium
   **Evidence:** T5 says denied decisions should include safe replay payloads with `input` and `cwd`, but also says no secret content. For commands like `cat .env` or pasted secrets in shell input, storing raw `input` can itself capture secret material.
   **required_fix:** Specify redaction rules for replay payloads before persistence, with tests proving `.env` paths/secret-looking values are redacted while metadata needed for replay remains useful.

5. **Severity:** medium
   **Evidence:** Several validation commands use `pnpm install --frozen-lockfile` in both `pi/extensions` and `pi/tests`, but the plan does not state what to do if lockfiles are missing/stale or if install mutates `node_modules`/lockfiles locally. `/do-it` may either proceed inconsistently or create unintended dependency changes.
   **required_fix:** Add preconditions for existing lockfiles and a rule that dependency or lockfile changes require an explicit new task and review before continuing.
