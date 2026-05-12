---
reviewer: reviewer
status: complete
source: inline-recovery
---

# Findings

- severity: high
  evidence: "Automation Plan Commit row runs `git diff --cached --check` before `git add -- .gitignore .gitattributes pi/prompts/handoff.md scripts test`."
  required_fix: "Run `git add -- ...` before `git diff --cached --check`, or add an explicit post-stage `git diff --cached --check` gate. As written, whitespace check can pass against an empty/stale index before intended files are staged."

- severity: high
  evidence: "T2 acceptance uses `grep -n \"private-archive-encrypt\\|git add -- .encrypted\\|private-archive-scan --staged\"` to prove hook behavior."
  required_fix: "Replace grep-only verification with an executable hook test that fails if plaintext `private/...` remains staged. Grep cannot prove order, error handling, or that `git add -- .encrypted` only stages `.age` files."

- severity: medium
  evidence: "T1 says encrypts every regular file under `private/`; Alternatives notes deletes/renames need a decision, but no task/acceptance criterion covers it."
  required_fix: "Define stale artifact behavior for deleted/renamed private files, then add script behavior and tests, e.g. remove orphaned `.encrypted/**/*.age` when source disappears or report them with required cleanup."

- severity: medium
  evidence: "Constraints say comments-only recipients must fail safely; acceptance criteria only mention status and do not require encrypt command failure semantics."
  required_fix: "Add acceptance criteria for comments-only/missing recipients: nonzero exit, no `.encrypted/` output written, actionable error message, and no hook staging."

- severity: medium
  evidence: "Decrypt restores `.encrypted/**/*.age` into `private/`, but no acceptance criterion covers path traversal or unsafe per-file paths."
  required_fix: "Add tests for malicious encrypted artifact paths/symlinks such as absolute-path-like names, `..`, and symlinked `.encrypted`/`private` entries; require decryption to reject unsafe restore paths."
