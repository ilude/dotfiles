# QA adversarial review: private encrypted workflow plan

## Finding 1 — High — T2 hook acceptance can pass without proving real commit blocking/staging

**Evidence:** T2 AC1 verifies only `grep -n "private-archive-encrypt\|git add -- .encrypted\|private-archive-scan --staged" scripts/git-hooks/pre-commit-x-private` and a claimed textual order. A hook containing those strings in comments, dead branches, or wrong working directory would pass. V1 adds a temp-repo hook run, but it does not require an actual `git commit` attempt or verify scanner failure paths during commit.

**Required fix:** Replace/augment T2 AC1 with a temp git repo test that installs the hook as `.git/hooks/pre-commit`, configures a generated age recipient, creates `private/handoffs/example.md`, runs `git add private/handoffs/example.md`/`git commit`, and asserts: commit succeeds only with `.encrypted/handoffs/example.md.age` committed; `private/handoffs/example.md` is not committed; staging a forced plaintext private file or non-age `.encrypted` file makes `git commit` fail.

## Finding 2 — High — Encryption/decryption checks can pass while plaintext leaks into `.encrypted/`

**Evidence:** T1 AC1 only tests `test -f .encrypted/a/note.txt.age`; it does not inspect the artifact for plaintext, require the source plaintext to be absent from git staging, or prove age decryption is the only way to recover content. The listed fail condition says “plaintext copied into `.encrypted/`,” but the verify command does not detect that.

**Required fix:** Add verification that `.encrypted/a/note.txt.age` does not contain the fixture string (`! grep -a -q secret .encrypted/a/note.txt.age`), that `age --decrypt -i id.txt .encrypted/a/note.txt.age` returns exactly the fixture, and that no non-`.age` files are created under `.encrypted/`.

## Finding 3 — Medium — Stale encrypted artifacts after delete/rename are not acceptance-tested

**Evidence:** The plan acknowledges “deletes/renames need explicit stale-output handling decisions” but no task acceptance criterion defines expected behavior. A script could leave `.encrypted/old-path.age` after `private/old-path` is removed, causing deleted private content to remain committed indefinitely while all current tests pass.

**Required fix:** Add an explicit delete/rename contract: either encryption synchronizes `.encrypted/` by removing artifacts with no source, or provides a documented status/error requiring manual removal. Add a regression test that encrypts `private/a/old.txt`, deletes or renames it, reruns encryption/status/hook, and verifies stale `.encrypted/a/old.txt.age` cannot silently remain staged/committed.

## Finding 4 — Medium — Merge behavior success criterion is named but not testable as written

**Evidence:** T3 asks for “independent private-file merge behavior where practical,” but no acceptance criterion or validation command proves two branches changing different private files can merge without conflicts and preserve both encrypted files. This can be skipped as “not practical” while the plan still claims per-file merge benefits.

**Required fix:** Add a concrete temp-repo regression: from a base commit, branch A adds/encrypts `private/a.txt`, branch B adds/encrypts `private/b.txt`, merge B into A, and assert no conflict plus both `.encrypted/a.txt.age` and `.encrypted/b.txt.age` exist. If merge behavior is out of scope, remove it from success claims and handoff language.

## Finding 5 — Medium — `/do-it` evidence ledger lacks falsifiable evidence requirements

**Evidence:** Checklist items only say `Status` and `Evidence`, but do not require recording exact commands, cwd, exit codes, commit hash, or key temp-repo assertions. Final gates F1/F2 can be checked after broad commands pass even if individual AC commands were not run in the worktree or were run against stale temp files such as `/tmp/age.out`.

**Required fix:** Require `/do-it` to record for each validation checkbox: cwd, exact command, exit status, and key assertion output/path. For temp age commands, use a per-test temp output path inside `$tmp` instead of shared `/tmp/age.out`, and require cleanup or uniqueness to avoid stale cross-test evidence.
