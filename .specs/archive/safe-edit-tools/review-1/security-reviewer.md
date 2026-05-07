---
reviewer: security-reviewer
status: changes-requested
---

## Finding 1
severity: HIGH
evidence: The plan says tools must avoid secrets, ignored paths, and broad globs, but T1 only requires rejecting `.env` and directory paths. T3 accepts `paths`, and no acceptance criterion proves gitignored/secret-like files or glob expansion are rejected.
required_fix: Add explicit helper requirements and tests for repo-bound path canonicalization, symlink traversal, gitignored files, common secret filenames, and broad glob/multi-path limits before tool registration.

## Finding 2
severity: HIGH
evidence: `structured_edit` plans selector/path syntax for JSON set/delete without defining allowed syntax or prototype-pollution guards. Setting `__proto__`, `constructor`, or `prototype` keys can create unsafe objects if later consumed by JS code.
required_fix: Specify a minimal JSON Pointer-like path grammar and reject dangerous object keys at every segment. Add tests proving these segments are blocked and that arrays/objects are created only by explicit safe rules.

## Finding 3
severity: MEDIUM
evidence: `text_edit` includes `regex_replace`, but acceptance only checks operation names and match counts. There is no requirement for regex safety, size limits, timeout behavior, or binary-file rejection.
required_fix: Require text-only detection, max file size/input limits, bounded regex execution or documented JS regex risk controls, and tests for catastrophic-pattern rejection or safe failure behavior.

## Finding 4
severity: MEDIUM
evidence: Dry-run is required to return a summary, but no evidence artifact is mandated for before/after diff contents, exact target list, or hash/mtime checks proving no writes occurred.
required_fix: Require dry-run output to include resolved paths, operation counts, and a bounded unified diff or preview. Add tests asserting file content and metadata remain unchanged after dry-run.

## Finding 5
severity: MEDIUM
evidence: Rollback is `git restore -- pi/extensions pi/tests docs/... .specs/.../plan.md`, which omits newly-created untracked files and may leave registered tools/tests/docs behind. Archive gate only requires status contains intended changes.
required_fix: Add rollback instructions for untracked artifacts and generated files, plus an archive preflight that records `git status --short`, changed-path inventory, and validation evidence locations before archiving.
