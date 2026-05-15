---
reviewer: adversarial-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  evidence: "T2 asks for tests that exercise the registered damage-control `tool_call` handler, but allows “a local minimal mock” if practical. A mock can assert handler return values without proving the Pi agent-loop prevents tool execution, while Success Criterion 1 claims a pre-execution boundary regression."
  required_fix: "Require a concrete integration-style test or named harness seam that invokes the same registration/runner path used by Pi runtime and proves a sentinel tool body is not called when `{ block: true }` is returned. If impossible, downgrade claims to handler-only coverage."
- severity: high
  evidence: "T1/T3 may patch upstream `C:/Projects/Personal/pi-mono`, but validation only says “run the narrow upstream test identified by T1/T3” and rollback only covers dotfiles paths. No branch/status/preflight, package-manager command, or rollback is specified for the external repo."
  required_fix: "Add explicit upstream preflight (`git -C ... status --short`), allowed files, test/typecheck commands, and rollback/status requirements for `C:/Projects/Personal/pi-mono`, or make upstream edits out of scope and require a separate plan."
- severity: medium
  evidence: "Several pass criteria depend on grep output containing exact or “equivalent current files” paths, but do not define what equivalence means. A /do-it executor with no context can pass based on arbitrary similar matches or fail unnecessarily after harmless refactors."
  required_fix: "Define required evidence fields instead of fuzzy path equivalence: hook registration source, runner emission source, block-to-nonexecution source, and line references. Require recording those in an evidence file before T2/T3 proceeds."
- severity: medium
  evidence: "Repo-wide validation can be replaced when `make check` is “too slow or blocked by unrelated environment prerequisites,” but there is no threshold, required diagnostic, or owner for unrelated failures. This lets final success pass without proving repo-wide health."
  required_fix: "Specify objective fallback conditions: record command, duration/error, why unrelated, and run the exact fallback. Require unresolved repo-wide failures to be listed in execution status with evidence they predate or are unrelated."
- severity: medium
  evidence: "The plan says dangerous probes are safe because they are command strings, but T1/T4 still discuss live probes and disposable repos without a concrete safe wrapper. Commands like `rm -rf` and `git clean -fd` are easy to mis-run from the working tree."
  required_fix: "Add a mandatory helper/script or exact copy-paste commands that create and `cd` into a temp directory/repo, assert the path matches a temp prefix, and only then run live probes. Otherwise prohibit live destructive probes entirely."
