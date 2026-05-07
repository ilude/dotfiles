---
reviewer: qa-engineer
status: changes_requested
---

## Finding 1

- severity: high
- evidence: Multiple acceptance criteria rely on `grep` presence checks, e.g. T3 checks only for `name: "text_edit"`, operation names, and schema terms in `pi/extensions`. This can pass with dead code, comments, or unregistered schemas while runtime behavior remains broken.
- required_fix: Add executable verification for tool registration and invocation paths, either by importing the registered tools in Vitest or running the Pi tool registry path used at runtime and asserting both tools are discoverable with expected schemas.

## Finding 2

- severity: high
- evidence: Dry-run/no-write is required in T3 but only says “covered by T5 tests”; the plan does not require comparing pre/post file content, mtime/hash, or a failed write sentinel. A mock-only summary assertion could pass while the implementation writes during dry-run.
- required_fix: Require tests that create a temp file, capture exact content before invocation, call dryRun for every mutating operation type, then assert content is byte-for-byte unchanged and the summary reports pending changes.

## Finding 3

- severity: high
- evidence: Unsafe path rejection acceptance only mentions `.env` and directory paths. The constraints also require ignored paths and broad unsafe targets, but no test matrix covers gitignored files, path traversal, absolute paths outside repo, symlink escapes, or multi-path/glob expansion.
- required_fix: Add explicit negative tests for `.env`, directory targets, ignored files, `../` traversal, absolute outside-repo paths, symlink-to-outside targets, and broad glob-like path inputs if accepted by schema.

## Finding 4

- severity: medium
- evidence: Match-count behavior says replacement operations “must support `expectedMatches` or `allowZero`,” but tests only grep for `expectedMatches`. No acceptance criterion proves wrong counts fail, zero matches fail by default, or `allowZero` permits no-op without masking nonzero mismatches.
- required_fix: Add tests for exact expected match success, expected count mismatch failure with unchanged content, zero-match default failure, and explicit `allowZero` no-op success.

## Finding 5

- severity: medium
- evidence: JSON correctness criteria only require parsing output and checking values/newline. This misses malformed selector behavior, deletion of missing paths, unsupported formats, arrays/nested objects, and preservation of indentation/final newline options across set/delete combinations.
- required_fix: Add structured_edit tests for nested object and array selectors, missing-path errors or documented no-op semantics, unsupported format rejection, delete behavior, invalid JSON input handling, indent option, and finalNewline true/false.
