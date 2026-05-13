# QA Validation Review

## Finding 1 — High
**Evidence:** AC3 says “missing, clean, dirty, and no-index `private/` cases” but does not require fixtures proving scratch-first extraction cannot partially mutate live `private/` after validation/decrypt failures.
**Required fix:** Add acceptance criteria requiring a malicious/corrupt archive fixture and a preexisting sentinel file in `private/`; tests must assert sentinel content and tree digest are unchanged after failed unpack.

## Finding 2 — High
**Evidence:** NFR lists dangerous archive entries to reject, but no acceptance criterion explicitly verifies absolute paths, `..`, backslashes, duplicate normalized paths, symlinks, hardlinks, devices/FIFOs/sockets, or path collisions.
**Required fix:** Add an AC or verification matrix with malicious tar fixtures for each rejected entry type and expected “no promote/no live mutation” result.

## Finding 3 — Medium
**Evidence:** AC2 validates decryption with matching private key, but not that every SSH public key in `.dolos/authorized_keys` is used, malformed keys fail safely, or `recipients.txt` fallback is impossible.
**Required fix:** Add multi-recipient fixtures: two SSH keypairs can both decrypt; malformed/empty authorized_keys fails without artifact; no `recipients.txt` is read.

## Finding 4 — Medium
**Evidence:** AC5 requires simulating upstream artifact changes, but “generally behind” vs artifact-behind can false-pass if tests mock status text instead of real Git refs.
**Required fix:** Require real temporary origin/clone fixtures with commits for unrelated files and `.dolos/artifacts/**`, verifying fetch occurs, unrelated behind warns only, and artifact-behind blocks auto-pack.

## Finding 5 — Medium
**Evidence:** AC6 says old workflow removed or wrapped, but readiness can pass by search only while legacy hooks/scripts still affect `/commit` or pre-commit behavior on some platforms.
**Required fix:** Add regression tests that install/use the active hook and `/commit` paths and assert no `.encrypted/` staging, no age requirement for unrelated commits, and no plaintext `private/` tracked files.
