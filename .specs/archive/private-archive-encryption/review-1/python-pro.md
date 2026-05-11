# python-pro Review

## Finding 1

severity: high  
evidence: T2/T3 require decrypting and unpacking `private.tar.age`, but acceptance criteria only verify byte-for-byte restore and conflict behavior. The plan never requires tar member validation for absolute paths, `..` traversal, symlinks/hardlinks, or extraction staying under `private/`/temp roots. A crafted or corrupted archive can write plaintext outside the intended directory during Python `tarfile.extract*` or external `tar` extraction.  
required_fix: Add implementation requirements and pytest fixtures for malicious tar entries; extraction must validate every member path/type before writing and reject unsafe archives.

## Finding 2

severity: high  
evidence: T2 says helpers should use `tar`/`age` and tests verify happy-path encrypt/decrypt/recipients, but no acceptance criterion covers subprocess failure handling. If `age` or `tar` exits nonzero after producing partial output, the plan does not require atomic output replacement or cleanup of partial `private.tar.age`/temp tar files.  
required_fix: Require `subprocess.run(..., check=True)`-style handling without shell interpolation, write ciphertext to a temp file, atomically replace `private.tar.age` only after success, and add pytest cases for failed subprocess cleanup.

## Finding 3

severity: medium  
evidence: T2 specifies archive helpers use `tar`; V1 only checks py_compile and focused tests. The plan has no requirement for cross-platform tar semantics: Git Bash/MSYS2 path conversion, file mode/owner metadata, pax headers, ordering, line endings, or whether external `tar` exists on Windows. This can pass on one shell and fail or produce unstable archives elsewhere.  
required_fix: Specify a portable implementation strategy, preferably Python `tarfile` with deterministic member ordering/metadata and explicit path handling, or require capability detection plus cross-platform tests for Git Bash/MSYS2 behavior.

## Finding 4

severity: medium  
evidence: T3 requires cleanup of decrypted temp files unless `--keep-temp`, but T2 decrypt/encrypt acceptance only checks the plaintext temp archive is removed on successful encrypt. There is no decrypt failure cleanup criterion and no check that temp dirs are outside the repo or permission-restricted.  
required_fix: Require `tempfile.TemporaryDirectory` cleanup in `finally` for all helper paths, restrictive permissions where supported, temp locations outside the repo by default, and tests that simulate failure and assert no temp plaintext remains.

## Finding 5

severity: low  
evidence: V1 uses `python -m py_compile scripts/private-archive-encrypt ...` while repo instructions state Python tooling uses `uv`; the plan elsewhere uses `uv run pytest`. This can validate against a different interpreter than the project tooling.  
required_fix: Change py_compile validation to `uv run python -m py_compile ...` and include all Python helper scripts, including the conflict resolver once added.
