# Standalone Readiness Review

Result: **BLOCKERS: 2**

Reviewed `.specs/pi-tasks-control-plane/plan.md` as if starting a fresh Pi session and executing `/do-it .specs/pi-tasks-control-plane/plan.md` with no prior conversation.

## Blockers

### 1. Wave 1 security gate requires tool/slash-command integration before those surfaces exist

**Where:** T2 acceptance criterion 3 and V1.

T2 is scheduled in Wave 1, before T5 (`TaskCreate`/`TaskCreateMany`/etc.) and T6 (`/tasks` command upgrade). However T2 AC3 requires:

> raw sentinel strings are absent from serialized task JSON, renderer output, task tool output, and `/tasks` list/show fixtures.

At V1, task tools are not implemented yet and `/tasks` has not been upgraded to the new renderer/settings path. A brand-new `/do-it` executor cannot satisfy V1 as written without either pulling T5/T6 work forward or weakening the acceptance criteria ad hoc.

**Required fix:** Split the redaction gates by wave:

- T2/V1: validate helper behavior plus any registry ingress/egress paths available after T1.
- T4/V2: validate renderer redaction integration.
- T5/T6/V3: validate task-tool and `/tasks` output redaction.

Alternatively move all tool/slash-command redaction integration work into Wave 1, but that would conflict with the dependency structure and is not recommended.

### 2. Archive preflight conflicts with mandated sentinel-secret tests

**Where:** `Implementation Contracts`, T2 tests, `Archive rule`, and F5 evidence mapping.

The plan requires tests to use fake sentinel secrets such as `pi_test_secret_12345`, then requires archive preflight to pass this command:

```bash
! grep -R -nE "pi_test_secret_|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}" .specs/pi-tasks-control-plane/evidence pi/tests 2>/dev/null
```

Because T2 requires committed tests/fixtures covering sentinel strings, scanning `pi/tests` for `pi_test_secret_` will likely fail by design. The later sentence about justifying fake sentinel usage in non-archived test-only contexts is ambiguous and contradicts the negated grep pass condition plus F5's requirement for clean archive preflight evidence.

**Required fix:** Make the archive gate executable and non-contradictory. For example:

- Scan evidence logs for all sentinel/private-key markers.
- Scan source/tests for real-looking private keys and AWS keys.
- Permit documented fake sentinel literals in test files, or use an allowlist such as `pi/tests/task-security.test.ts`.
- Define the exact pass command and expected evidence for F5.

## Hardening Issues

- The all-or-nothing/idempotent retry contract is stated globally but not mapped to a clear acceptance test for create/batch-create retry after `persist_failed`. Add a focused AC under T1/T5 or V3.
- Several task-specific commands assume `pnpm install --frozen-lockfile` was already run. That is probably OK after P0, but standalone recovery after dependency cleanup would be safer if validation gates, not every focused AC, are the authoritative gates.
- T7 says evidence logs are files under `.specs/.../evidence`; confirm whether these should remain uncommitted or be committed as review artifacts. The plan says generated/runtime task state should not be committed, but evidence log commit policy is not explicit.

## Nits

- `TaskCreateMany` dependency syntax is not specified enough for implementers to know whether intra-batch references use temporary client keys, aliases, titles, or generated IDs.
- The lifecycle matrix says `completed|cancelled` allow metadata/tombstone annotations only, but `/tasks clear completed` behavior for `skipped` is not explicit.

## Overall Assessment

The plan has strong context, constraints, validation commands, credential guidance, and a consistent top-level checklist. It is **not standalone ready** because V1 and F5 can become impossible to pass as written without interpretation.