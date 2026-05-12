---
reviewer: security-reviewer
status: complete
source: inline-recovery
---

# Findings

- severity: high
  evidence: "Hook acceptance requires `git add -- .encrypted` and scanner patterns, but does not require removing/de-staging plaintext `private/...` that may already be staged with `git add -f`."
  required_fix: "Update hook acceptance criteria to explicitly fail if any staged path under `private/` exists, and add a test that force-stages `private/secret.txt` then verifies the hook blocks or unstages it."

- severity: high
  evidence: "Automation Plan commits with `git add -- .gitignore .gitattributes pi/prompts/handoff.md scripts test`, staging broad directories."
  required_fix: "Require a pre-commit secret/plaintext scan of the full staged diff, including generated fixtures, before commit; stage explicit intended files only, not broad directories."

- severity: medium
  evidence: "Rollback says delete worktree/branch or revert commit, but does not mention cleanup of generated plaintext `private/` files or decrypted outputs in temp/worktree locations."
  required_fix: "Add rollback/cleanup steps that delete generated `private/`, temporary age identities, decrypted test outputs, and evidence artifacts; verify no plaintext private files remain with targeted find/scanner checks."

- severity: medium
  evidence: "Decryption restores `.encrypted/**/*.age` into `private/` without path traversal/symlink safety requirements for encrypted filenames."
  required_fix: "Add acceptance criteria that decryption rejects unsafe paths, symlinks, absolute paths, `..` traversal, and collisions before writing into `private/`."

- severity: medium
  evidence: "Recipients may be comments-only, but plan does not require validating malformed lines, duplicates, or accidental encryption to the wrong recipient set."
  required_fix: "Require recipient parsing tests for comments, whitespace, malformed recipients, duplicate recipients, and no-recipient cases; fail closed with a clear error before reading/encrypting private files."
