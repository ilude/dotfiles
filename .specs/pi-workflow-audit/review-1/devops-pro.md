# DevOps Review: Pi Workflow Audit Plan

## Findings

### 1. Severity: High — `/do-it` has no executable entrypoint or wrapper contract for reproducible inventory generation

**Evidence:** The plan says to “Build a data inventory” and “Save the file/path list used as the data inventory,” but does not specify the command, script location, arguments, output format, or read-only execution mode. It also lists broad sources such as `~/.pi/agent/sessions/**`, `~/.pi/agent/traces/**`, and `.specs/**` without defining how `/do-it` should enumerate them safely.

**required_fix:** Add a concrete audit runner contract, e.g. `scripts/pi-workflow-audit inventory --output .specs/pi-workflow-audit/artifacts/inventory.jsonl --read-only`, or specify the exact shell commands if no wrapper will be created. Define expected exit behavior, output schema, and immutable/read-only guarantees.

### 2. Severity: High — Artifact naming and directory layout are under-specified, risking overwritten or untraceable audit evidence

**Evidence:** Required verification asks to save inventory, timeline, candidate episode index, coding schema, coded episodes, and quantitative methods, but the plan only names the final report structure. It does not define paths, filenames, timestamp/session IDs, or whether artifacts are append-only.

**required_fix:** Define an artifact layout before execution, for example `.specs/pi-workflow-audit/artifacts/{run-id}/inventory.jsonl`, `git-timeline.csv`, `candidate-episodes.jsonl`, `coding-schema.yaml`, `coded-episodes.jsonl`, and `queries/`. Require all report claims to cite these artifact paths.

### 3. Severity: Medium — Resume safety is missing for long-running local log scans

**Evidence:** The plan scans local sessions, traces, metrics, multi-team logs, repo artifacts, and git history across projects, but does not define checkpoints, idempotency, partial-run recovery, or how already-coded episodes are skipped on rerun.

**required_fix:** Add checkpoint files keyed by stable identifiers such as normalized absolute path plus file size/mtime/hash. Require the runner to write atomically to temp files then rename, and to support `--resume` and `--force` semantics so interrupted audits do not duplicate rows or corrupt evidence.

### 4. Severity: Medium — Cross-platform path handling is ambiguous for Windows, MSYS2/Git Bash, WSL, and home-directory expansion

**Evidence:** Sources use Unix-style paths like `~/.pi/agent/sessions/**` while the repo is cross-platform and current project rules warn about Git Bash/MSYS2 and WSL path normalization. The plan does not state whether paths in artifacts should be native Windows paths, POSIX paths, URI-style paths, or repo-relative paths.

**required_fix:** Specify canonical path normalization for persisted artifacts: use absolute, resolved filesystem paths plus a separate display path, preserve repo-relative paths for in-repo artifacts, and record source platform/shell. Require comparisons to normalize case where appropriate on Windows/WSL.

### 5. Severity: Medium — Performance controls for broad JSONL/log scans are not explicit enough

**Evidence:** The taxonomy includes performance smells like “unnecessary full-repo scans” and “low-value trace/log reading,” but the execution plan itself requires discovery across multiple large glob trees without bounding file size, date ranges, grep patterns, indexing strategy, or staged filtering.

**required_fix:** Add a two-pass scan strategy: first collect metadata and candidate hits using bounded streaming grep/ripgrep patterns and date filters; then deep-read only selected candidate sessions. Define max file size handling, binary/compressed-file policy, concurrency limits, and metrics to record scan time/files/bytes processed.
