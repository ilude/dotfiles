# QA Engineer Validation Review

1. **Severity: High**  
   **Evidence:** T7/V3 use `git grep ... || true` with pass criteria based on interpretation. This can falsely pass when active legacy encryption remains because the command always exits 0 and no exact allowlist is defined.  
   **Required fix:** Replace with an explicit negative assertion script/pytest that fails on active hook/script calls, with an allowlist for deprecation text/tests only.

2. **Severity: High**  
   **Evidence:** V2 requires an “End-to-end temp repo smoke” but gives prose instead of an exact reproducible command. Success Criteria also references a “generated fixture script/test” that is not named.  
   **Required fix:** Add a concrete command/path, e.g. `cd tools/dolos && go test ./... -run TestEndToEndTempRepoSSHKeys`, covering pack/unpack with both generated SSH identities.

3. **Severity: Medium**  
   **Evidence:** Malicious archive coverage is listed, but not tied to committed/generated fixture constructors that prove no external tar behavior is skipped on Windows/MSYS. Devices/FIFOs/sockets are caveated “where supported,” risking silent coverage gaps.  
   **Required fix:** Require table-driven tests that generate each malicious tar entry in Go, skip unsupported file-type creation only with explicit test skip evidence, and assert live `private/` sentinel unchanged.

4. **Severity: Medium**  
   **Evidence:** Linked worktree/state isolation is required in T8, but no exact validation command proves `git rev-parse --git-path dolos/...` differs per linked worktree or that locks/indexes do not collide.  
   **Required fix:** Add a named test using real `git worktree add`, asserting distinct git-private state paths and independent clean/dirty status per worktree.

5. **Severity: Medium**  
   **Evidence:** Secret checks scan staged diffs with regexes but do not explicitly verify generated SSH private keys, decrypted scratch, or malicious fixture payloads are never staged/logged.  
   **Required fix:** Add tests/commands asserting temp key paths remain outside repo, scratch is under git-private tmp, evidence logs redact paths/content, and `git ls-files` contains no fixture private keys/plaintext.
