---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "hidden prerequisite"
  evidence: "Plan requires pack/unpack with age SSH recipients but never adds age to tool preflight/install checks. T2 only validates Docker/Go help; T4 first discovers whether external age CLI or Go library works. Existing constraints say 'Age SSH behavior must be verified during implementation,' but /do-it has no early gate ensuring age is available or a library choice is selected before feature work."
  required_fix: "Add a Wave 1 prerequisite check/decision: detect `age` CLI version or choose a Go age dependency that supports SSH recipients, with a tiny generated SSH key encrypt/decrypt proof before T4. Document fallback/stop behavior if age support is unavailable."
- severity: high
  category: "ambiguous destructive behavior"
  evidence: "Unpack acceptance says 'promote only when safe' and tests remove `private/`, but plan never defines whether unpack may replace an existing real `private/` tree, merge into it, back it up, or refuse unless empty/clean. Risk section says real `private/` must not be modified by tests, but CLI behavior for real user invocation is underspecified."
  required_fix: "Specify unpack preconditions and promotion semantics: e.g. refuse if `private/` exists and is non-empty unless index proves clean or `--force` is supplied; define backup/atomic rename behavior and required tests for preserving existing plaintext."
- severity: medium
  category: "checklist inconsistency"
  evidence: "T2 depends on no tasks and can run parallel with T1, but T1's purpose is preserving current WIP before edits. The checklist also says `/do-it` marks each item after verification before starting next sequential step, yet the dependency graph allows T2/T3 edits before preflight evidence is captured."
  required_fix: "Make T2 and T3 depend on T1, or explicitly require `/do-it` to complete T1 before any modifying task despite Wave 1 being otherwise parallel. Update the dependency graph and task table accordingly."
- severity: medium
  category: "weak verification"
  evidence: "Several migration checks rely on `git grep ... || true` and subjective review of remaining references. T7 pass criteria allow 'compatibility/deprecation text' but do not require classifying every remaining match as inactive code versus active hook path. This can miss live script calls with renamed wrappers or indirect execution."
  required_fix: "Add a machine-checkable inventory of active hook/script entrypoints and tests that install/run the hook in a temp repo during unrelated commits. Require any remaining `.encrypted`/recipients references to be listed in an allowlist with file/line and rationale."
- severity: medium
  category: "unsafe execution context"
  evidence: "Plan says `/do-it` can run without manual approval and tests use temp repos, but implementation tasks operate in the live dotfiles repo and include creating `.dolos/authorized_keys` and `.dolos/artifacts/private.tar.gz.age`. No guidance says whether to create a real authorized_keys/artifact in this repo, with placeholder keys, or only generated temp fixtures."
  required_fix: "Clarify repo-local `.dolos` policy for the MVP: whether `.dolos/authorized_keys` is committed now, what keys it may contain, whether the encrypted artifact is generated/committed in this plan, and prohibit generating it from real `private/` during /do-it."
