# DevOps Adversarial Review

1. severity: high
   evidence: The plan hard-codes `C:/Projects/Personal/pi-mono` in constraints, preflight, grep commands, and T1 acceptance. A fresh executor without that checkout cannot satisfy T1, but the plan only says “ask user for harness source” after ambiguous ownership, not how to bootstrap, skip, or degrade.
   required_fix: Add an explicit preflight branch: if `PI_MONO_DIR`/default checkout is missing, record blocked status with exact remediation or clone/update instructions; parameterize commands via one variable instead of repeating a single Windows path.

2. severity: high
   evidence: Rollback says `git checkout -- pi/extensions pi/tests pi/README.md pi/extensions/README.md .specs/...`, but T3 may patch upstream `C:/Projects/Personal/pi-mono/packages/...`. No upstream rollback/status command is specified.
   required_fix: Add rollback and status commands for each touched repo, including `git -C "$PI_MONO_DIR" status --short` and targeted checkout/revert instructions for upstream files if T3 changes pi-mono.

3. severity: medium
   evidence: Commands mix Git Bash syntax with Windows absolute paths and brace expansion: `grep -R ... C:/Projects/Personal/pi-mono/packages/{agent,coding-agent}/src`. This assumes Bash, GNU grep, brace expansion, and `test -d C:/...` path handling.
   required_fix: Define the required shell runner and add portable command variants or a wrapper script. Prefer quoted variables and explicit paths over brace expansion so `/do-it` can run from fresh Git Bash/MSYS sessions reliably.

4. severity: medium
   evidence: Evidence capture is informal: “terminal output copied into plan execution notes,” while acceptance checks depend on grep output and test results. No required evidence artifact paths or minimal contents are defined except optional `evidence/runtime-boundary.md`.
   required_fix: Make evidence files mandatory for T1/V gates, with required sections for command, cwd, exit code, summarized output, and conclusion. This makes archive readiness auditable instead of relying on transient terminal scrollback.

5. severity: medium
   evidence: Validation uses `pnpm test`/`pnpm run typecheck` but never requires `pnpm install --frozen-lockfile` in `pi/tests` or `pi/extensions`. A fresh session/checkout may lack dependencies or have stale node_modules, causing non-reproducible failures.
   required_fix: Add dependency preflight/install steps using the repo policy: `cd pi/tests && pnpm install --frozen-lockfile` and `cd pi/extensions && pnpm install --frozen-lockfile`, or explicitly document that existing locked dependencies are a prerequisite.
