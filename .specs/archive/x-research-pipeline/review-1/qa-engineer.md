# QA Engineer Review: Automation Readiness and Validation Gates

## Findings

1. **Severity: High — T3 hook verification is not executable from a fresh checkout**
   - **Evidence:** T3 AC2 says `Verify: hook smoke test with a temporary staged file list`, but does not name a command, input format, expected exit code, or whether `scripts/git-hooks/pre-commit-x-private` reads stdin, `git diff --cached`, or arguments.
   - **required_fix:** Replace the prose verifier with a concrete command that creates representative staged files in a temp index or passes a fixture file list to the hook, and state expected pass/fail outcomes for encrypted vs plaintext paths.

2. **Severity: High — Live validation gate depends on unspecified credentials/session prerequisites**
   - **Evidence:** V3 requires “With real credentials available” live `twitterapi.io` and browser-agent smoke tests, but the plan does not define required config keys, config file schema, environment variables, browser profile/session prerequisites, or skip/report behavior when credentials are absent.
   - **required_fix:** Add a `Live prerequisites` section with exact config path/schema, required secret names, browser auth/session checks, and a deterministic command that either runs live smoke tests or emits a documented SKIPPED artifact without failing offline CI.

3. **Severity: Medium — Mock/live split is incomplete for provider acceptance criteria**
   - **Evidence:** T4 and T5 unit tests use mocked responses/DOM, while V3 adds live smoke checks; there is no named test marker, command, fixture boundary, or rule preventing live network/browser dependency from leaking into default `uv run pytest` runs.
   - **required_fix:** Define default mocked test commands and separate opt-in live commands, e.g. `uv run pytest pi/x_research/tests/` for offline and `uv run pytest -m live pi/x_research/tests/` for credentialed smoke tests, with marker configuration and fixture naming expectations.

4. **Severity: Medium — Archive/encryption acceptance criteria do not prove decryptability or tracked-file safety**
   - **Evidence:** Success/V3 require encrypted snapshots under `private-encrypted/x/*.age` and no plaintext staged, but T3 only verifies dry-run output and ignore behavior. No command verifies actual encryption, decryption, age recipient availability, or that only `*.age` files are stageable under `private-encrypted/`.
   - **required_fix:** Add an executable encryption round-trip gate using a temp fixture and test recipient, plus a git staging check that rejects plaintext extensions under `private-encrypted/` and allows only intended `*.age` outputs.

5. **Severity: Medium — Execution checklist lacks a single durable validation transcript/artifact requirement**
   - **Evidence:** V1/V2/V3 list commands, but there is no required output path for logs/results, no checklist item to capture command versions, no status artifact for skipped live tests, and no final “evidence bundle” a later agent can inspect without conversation context.
   - **required_fix:** Add an `Evidence artifacts` checklist requiring command transcript files under `.specs/x-research-pipeline/evidence/` or equivalent, including offline test output, ruff output, git ignore/staging checks, live smoke result or skip reason, and encryption round-trip result.
