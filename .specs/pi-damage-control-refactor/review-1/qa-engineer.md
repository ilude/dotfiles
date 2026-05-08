---
reviewer: qa-engineer-verification-realism
status: complete
---

# Findings

- severity: high
  evidence: "T1 Acceptance Criteria uses `pnpm test damage-control.test.ts -t \"real tracked rules\"` and only requires tests load `pi/damage-control-rules.yaml`; it does not require invoking the same Pi hook/adapter path that blocked command execution."
  required_fix: "Add an acceptance criterion that exercises the exported extension permission handler/runtime adapter with the real rules file, not only pure parser/engine helpers. Include shell-command and file-tool decisions and assert the handler returns the blocking decision before command execution."

- severity: high
  evidence: "Validation Contract manual step 2 runs `cat .env >/dev/null` in a restarted Pi session; if damage-control fails, this still reads the real `.env` and relies on shell redirection/logging behavior to avoid exposure."
  required_fix: "Replace live secret probes with a temporary synthetic secret fixture or test-only blocked path whose contents are non-sensitive, then separately assert real `.env` is denied through non-executing permission checks. Do not execute a real `.env` read as a smoke test."

- severity: medium
  evidence: "T1 debug criterion says fail on unredacted `.env`, token, key path, or private key material, but verify command only runs `-t \"debug\"` and does not define concrete leak fixtures or log-output assertions."
  required_fix: "Specify table-driven redaction tests with representative inputs: `.env` path, `*.pem`, `*.key`, SSH private-key header, `Authorization`/token query strings, and command arguments. Assert both debug log content and test stdout/stderr contain no raw fixture secrets."

- severity: medium
  evidence: "Success Criteria #1 says tests cover ask-rule behavior, while T1 only checks `echo docker compose down` on Windows stays allowed because Linux-only ask rules do not apply."
  required_fix: "Add deterministic ask-rule tests independent of host OS by injecting platform context into the engine/adapter. Assert Linux `docker compose down` yields ask, Windows yields allow/deny as intended, and echo-prefixed commands do not satisfy the ask rule unless explicitly desired."

- severity: medium
  evidence: "T2 acceptance criterion 1 relies on `grep` and `wc -l` with subjective pass conditions: adapter remains readable, no large duplicate logic blocks remain."
  required_fix: "Replace subjective selectors with enforceable checks: tests import only new parser/engine/debug modules for pure logic, adapter tests cover wiring, and a dependency/circularity check fails if rules/engine/debug import the adapter or Pi runtime-only APIs."
