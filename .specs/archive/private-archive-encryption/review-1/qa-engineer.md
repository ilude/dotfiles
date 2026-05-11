# QA Review: Private Archive Encryption Plan

## Finding 1
- **severity:** high
- **evidence:** The plan allows `age --version || true` in preflight and says tests may skip if `age` is missing, while `/do-it` evidence can still include skipped pytest output unless explicitly rejected. Acceptance criteria rely on real age encryption/decryption, so skips would create false-positive completion.
- **required_fix:** Add a final gate that fails if any `test/test_private_archive.py` age-dependent test is skipped, or require an explicit `age` availability check before running focused tests. `/do-it` must not mark F1/F2 complete unless real `age-keygen`, `age`, and decrypt paths executed.

## Finding 2
- **severity:** high
- **evidence:** Conflict resolver acceptance criteria do not require constructing an actual Git index with stages 1/2/3 for `private.tar.age`; they only name pytest filters. A unit test could mock `git ls-files -u` and validate parsing without proving real Git conflict behavior.
- **required_fix:** Require at least one integration fixture that initializes a temp Git repo, creates divergent encrypted archives on branches, performs a real merge conflict, verifies `git ls-files -u private.tar.age` has stages, then runs the resolver.

## Finding 3
- **severity:** medium
- **evidence:** Fixture isolation says avoid real `private/`, but no acceptance criterion verifies helpers run from a temp repo with controlled `cwd`, `HOME`, `XDG_CONFIG_HOME`, and generated recipient/identity files. A path bug could read repo-root `private/` or user age config unnoticed.
- **required_fix:** Add pytest fixture requirements that copy scripts into or invoke them against an isolated temp repo, set `HOME`/`XDG_CONFIG_HOME` to temp dirs, assert repo-root `private/` is absent/untouched, and fail on any access outside the temp repo.

## Finding 4
- **severity:** medium
- **evidence:** Decrypt tests require byte-for-byte restore, but there is no negative coverage for malicious or unsafe tar entries. Archive extraction is a high-risk path; a crafted tar with `../`, absolute paths, or symlinks could write outside `private/` while tests still pass for normal fixtures.
- **required_fix:** Add negative tests using encrypted fixture archives containing path traversal, absolute path, and unsafe symlink/hardlink entries. Decrypt must reject them before extraction and leave no files outside the intended temp `private/` directory.

## Finding 5
- **severity:** medium
- **evidence:** Scanner/hook validation uses fixture path lists, but final plaintext check only checks tracked files via `git ls-files`. It may miss staged additions, generated plaintext artifacts in the working tree, or hook bypass behavior with NUL-delimited staged input.
- **required_fix:** Add validation that stages fixture paths in a temp Git repo and runs the actual hook/scanner command against Git’s staged NUL output. Final evidence must include `git status --short` review and explicit failure if any `private/`, `private.tar`, or `private.conflicts/` path is staged or untracked in the real repo.
