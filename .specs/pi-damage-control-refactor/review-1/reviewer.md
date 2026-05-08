---
reviewer: reviewer
status: complete
---

# Findings

- severity: high
  evidence: "Constraints say runtime copies/symlinks may exist under `~/.pi/agent/extensions/`; implementation must verify whether repo and runtime paths are the same before assuming a separate copy step, but no task, acceptance criterion, or final gate requires this verification."
  required_fix: "Add a preflight/final gate that records whether `pi/extensions/damage-control.ts` is the runtime-loaded file, symlink target, or requires an install/copy step; document the exact reload/install action before manual smoke testing."

- severity: high
  evidence: "Manual validation requires restarting Pi and then running live probes, but gives no executable way to restart Pi or confirm the updated extension version is loaded before `cat .env >/dev/null`."
  required_fix: "Add explicit restart/reload instructions and a version/health/status check proving the new damage-control module is active before running any live probe against `.env`."

- severity: medium
  evidence: "T3 adds a parser dependency only in `pi/extensions`, while tests run from `pi/tests` with a separate `pnpm install --frozen-lockfile`; the plan does not state how Vitest resolves the new dependency when tests import extension modules."
  required_fix: "Specify dependency placement and workspace/linking expectations for `yaml` so both extension runtime and `pi/tests` can resolve it, and add a verification command from a clean install state."

- severity: medium
  evidence: "T1 acceptance says debug tests fail on unredacted `.env`, token, key path, or private key material in test output, but does not require synthetic secret fixtures or prohibit tests from touching real local secret files."
  required_fix: "Require tests to use synthetic temp fixtures with fake secret-looking content and assert no real `.env`, SSH key, `*.pem`, or `*.key` file is opened or printed."

- severity: low
  evidence: "Final Gates F1-F5 list statuses and evidence, but the plan has no `## Execution Status` section even though the Validation Contract repeatedly instructs `/do-it` to update `## Execution Status` on failures or awaiting manual validation."
  required_fix: "Add an `## Execution Status` section template with fields for current state, failed/skipped commands, manual validation status, and next action."
