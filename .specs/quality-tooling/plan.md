---
created: 2026-07-16
status: draft
completed:
---

# Plan: Quality tooling ownership

## Goal

Make every blocking code-quality tool repository-owned (pinned, configured,
available from documented fresh setup) and give routine edits a fast
changed-file validation path, so full suites run only at integration gates.

## Why

Ruff, ShellCheck, TypeScript, and Vitest are repository-owned today. Biome is
only incidentally installed on this workstation; Lizard is hook-time only;
shfmt mutates but has no non-mutating check. Meanwhile routine edits either
re-run broad suites or reconstruct ad hoc validation commands.

## Evidence base

- `.specs/workflow-test-rationalization/research/repo-state.md` (quality-tool
  verification notes in `plan.md` Context of the superseded plan).
- Existing shared runner: `claude/hooks/quality-validation/validators.yaml` and
  the quality-validation hook â€” reuse before building anything new.

## Boundaries

- A tool becomes blocking only after fresh `pnpm install --frozen-lockfile` /
  `uv sync` provides it and baseline debt on existing files is known. Until
  then it is nonblocking or scoped to changed files.
- Each tool guards its own defect class (format, lint, types, complexity) â€”
  never prompt wording or policy prose.
- One changed-file entrypoint, argument arrays (no shell-string eval), explicit
  diagnostics for missing tools â€” no silent skips, no auto-install.
- Measure before/after: at least one routine path gets faster; any slowdown
  must name the distinct protection it adds.
- `make check` remains the authoritative full gate. Update `CHANGELOG.md`.
  Do not commit or push unless asked.

## Tasks

### T1: Pin and configure tools

Add Biome as a pinned Pi devDependency with config, only after verifying it
works under pnpm with the current TypeScript. Add a non-mutating shfmt check.
Decide Lizard ownership: pin via uv tooling or document the installer as
authoritative. Establish baseline-debt counts before anything new blocks.

Done when: an isolated fresh setup provides every blocking tool; each tool
fails an intentional bad fixture of its defect class with an actionable
diagnostic.

### T2: One changed-file validation entrypoint

Expose one repository CLI (reusing the quality-validation config/runner where
practical) that runs the applicable pinned validators for an explicit file
list, with deterministic routing, bounded parallelism, and stable exit codes.

Done when: fixtures for Python, shell, Pi TypeScript, unsupported files,
missing tool, paths with spaces, and multiple failures all behave as
documented.

### T3: Split Make targets

`make check-changed` (changed-file quality), `make check-fast` (fast static
quality), existing focused test entrypoints, `make check` (full). Update help
text; no duplicated work within one invocation.

Done when: command graph and a three-run median timing comparison show distinct
scopes and at least one faster routine path.

## Dependencies

T1 -> T2 -> T3.

## Validation

1. Per task: run the new entrypoints against compliant and failing fixtures.
2. `make lint` and focused tests after each task.
3. `make check` once at the end.
4. Record before/after timing medians for the routine paths.

## Out of scope

- Making Lizard/Biome block historical files before baseline debt is measured.
- Test deletion/migration (other two plans).

## Execution status

- **Classification:** planned, not started
- **Next:** T1
- **Resume:** `/do-it .specs/quality-tooling/plan.md`
