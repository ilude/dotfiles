---
reviewer: reviewer
status: complete-inline-recovery
---

# Findings

- severity: high
  evidence: "Wave 1 (parallel)" with T1/T2/T3 all editing `pi/extensions/prompt-router.ts` and `pi/tests/prompt-router.test.ts`
  required_fix: Serialize Wave 1 or split files/ownership so parallel agents cannot race on the same files.

- severity: high
  evidence: "P0 Verify: `... } > .specs/prompt-router-v1/evidence/P0-preflight.md`" vs "Evidence files must record command, cwd, exit code..."
  required_fix: Replace bare redirection with an evidence template/command wrapper that records cwd, exact command, exit code, timestamp, git status, and sanitized summary.

- severity: medium
  evidence: "Codex-first default mapping is explicit" and grep for `"gpt-5.4-mini\|gpt-5.5\|routeState\|RouteProfileResolution"`
  required_fix: Define the exact route-profile source of truth: settings keys, default model/profile table for nano/mini/core/large/max, availability assumptions, and expected fallback state per route.

- severity: medium
  evidence: "V1 Checks: Run `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --artifact-inventory \"warmup\"`" while T2 pass allows "or missing artifact failure is explicit and nonzero"
  required_fix: State whether `t2` artifacts must exist locally; if not guaranteed, make V1 accept the documented nonzero unsupported-artifact result instead of requiring a successful command.

- severity: medium
  evidence: "Manual validation: Start a local Pi session with the modified extension loaded."
  required_fix: Add exact reproducible commands/procedure to start Pi with local extensions, issue `/router-status` and `/router-explain`, and capture sanitized output; or add automated command-surface tests that explicitly replace manual validation.
