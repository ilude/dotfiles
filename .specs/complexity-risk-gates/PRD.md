---
created: 2026-06-07
status: draft
---

# PRD: Complexity Risk Gates for Agent Workflows

## Problem

Agent-driven development workflows can produce code that passes tests while still
being hard to read, risky to change, or under-tested around important branches.
Current quality gates often check formatting, linting, and test success, but do
not consistently combine structural complexity, cognitive complexity, and
coverage-backed change risk.

The missing capability is a local-first framework that gives fast feedback in
hooks, produces machine-readable findings for repair loops, and escalates the
same findings into CI review artifacts.

## Users / Jobs To Be Done

- Primary users: developers and maintainers using code agents, local hooks, and
  CI quality gates.
- Job/story: as a maintainer, I want changed code to be blocked or flagged when
  it is too complex or risky to change, so review time focuses on meaningful
  risk rather than style debates.
- Current workaround: run language-specific linters manually, inspect coverage
  reports separately, and rely on reviewers to notice high-risk functions.

## Goals

1. Provide a language-aware local gate for Go, Python, TypeScript, and
   JavaScript that checks cyclomatic complexity, cognitive complexity, nesting,
   and coverage-backed risk where supported.
2. Return findings in a stable JSON shape suitable for hooks, CI, and agent
   repair loops.
3. Support changed-code or baseline-aware gating so legacy complexity does not
   block unrelated work.
4. Produce SARIF or equivalent review artifacts for CI while keeping local hook
   output concise.
5. Define a conservative MVP with explicit tool-version checks and documented
   limitations for each ecosystem.

## Non-Goals

- Replacing existing language linters or test runners.
- Building a full metrics dashboard in the first release.
- Enforcing branch coverage in every ecosystem.
- Treating experimental cognitive risk formulas as canonical metrics.
- Automatically rewriting complex code without developer review.

## Research Summary

### Cross-language metric model

- Cyclomatic complexity measures independent control-flow paths and is suited to
  testing burden analysis.
- Cognitive complexity measures reader burden and nesting pressure. Tool
  thresholds are not interchangeable with cyclomatic thresholds. Go `gocognit`
  increments for control structures, labeled jumps, recursion, logical operator
  sequences, and nesting. Source: https://github.com/uudashr/gocognit#rules
- Classic CRAP combines cyclomatic complexity and coverage:

  ```text
  CRAP = CC^2 * (1 - coverage)^3 + CC
  ```

  Fallow documents this canonical formula for its coverage-backed health gate.
  Source: https://docs.fallow.tools/cli/health

### Go findings

- `gocognit` supports `-over N`, returns exit code 1 when findings exist, and
  supports `-json`. Source: https://github.com/uudashr/gocognit#usage
- `gocyclo` supports `-over N` and exits non-zero when functions exceed the
  threshold, but output is text only. Source: https://github.com/fzipp/gocyclo#usage
- `golangci-lint` v2 reference config exposes `linters.settings.gocognit` and
  `linters.settings.cyclop`. Source:
  https://github.com/golangci/golangci-lint/blob/main/.golangci.reference.yml
- `cyclop` supports function and package-average cyclomatic gates. Source:
  https://github.com/bkielbasa/cyclop#usage
- Go coverage is statement/basic-block oriented, not branch coverage. The cover
  tool can miss detail inside compound boolean expressions. Source:
  https://pkg.go.dev/cmd/cover
- `go test -coverprofile` enables coverage profile generation after tests pass.
  Source: https://pkg.go.dev/cmd/go#hdr-Testing_flags

### Python findings

- Radon `cc` computes cyclomatic complexity, supports JSON output with `-j`,
  and ranks blocks A through F. Source:
  https://radon.readthedocs.io/en/latest/commandline.html
- Radon ranks are A=1-5, B=6-10, C=11-20, D=21-30, E=31-40, F=41+. Source:
  https://radon.readthedocs.io/en/latest/commandline.html
- Xenon is Radon-based and exits non-zero when configured thresholds are
  violated. Source: https://xenon.readthedocs.io/en/latest/
- Flake8 `--max-complexity` gates McCabe complexity and can be configured as
  `max-complexity`. Source:
  https://flake8.pycqa.org/en/latest/user/options.html#cmdoption-flake8-max-complexity
- Flake8 project config is INI-based in `.flake8`, `setup.cfg`, or `tox.ini`.
  Source: https://flake8.pycqa.org/en/latest/user/configuration.html
- `flake8-cognitive-complexity` provides error code `CCR001` and
  `--max-cognitive-complexity`, but its latest PyPI release is 0.1.0 from 2020.
  Sources: https://github.com/Melevir/flake8-cognitive-complexity/blob/master/README.md
  and https://pypi.org/project/flake8-cognitive-complexity/
- `coverage json` is the preferred coverage input for function-aware gates.
  Coverage.py 7.6.0 added function and class data to JSON, and 7.13.1 added
  `start_line` for those regions. Sources:
  https://coverage.readthedocs.io/en/latest/commands/cmd_json.html and
  https://coverage.readthedocs.io/en/latest/changes.html

### TypeScript and JavaScript findings

- ESLint `complexity` gates cyclomatic complexity. Its default maximum is 20,
  and the rule supports `classic` and `modified` variants. Source:
  https://eslint.org/docs/latest/rules/complexity
- ESLint `max-depth` gates nested block depth. Source:
  https://eslint.org/docs/latest/rules/max-depth
- `eslint-plugin-sonarjs` moved current development to the SonarJS repository;
  the older repository is only current through version 1.x. Source:
  https://github.com/SonarSource/eslint-plugin-sonarjs
- SonarJS cognitive complexity is exposed as `sonarjs/cognitive-complexity`,
  with a default threshold of 15. Sources:
  https://raw.githubusercontent.com/SonarSource/eslint-plugin-sonarjs/master/docs/rules/cognitive-complexity.md
  and https://raw.githubusercontent.com/SonarSource/SonarJS/master/packages/analysis/src/jsts/rules/S3776/config.ts
- Istanbul/nyc can emit `coverage-final.json`, `coverage-summary.json`, LCOV,
  and other reporters. Source:
  https://istanbul.js.org/docs/advanced/alternative-reporters/
- For per-function risk joins, Istanbul JSON coverage maps are preferable to
  LCOV because they include function maps and counters. Source:
  https://istanbul.js.org/docs/advanced/alternative-reporters/
- Fallow `health` supports `--max-cyclomatic`, `--max-cognitive`, `--max-crap`,
  and `--coverage` using Istanbul-format `coverage-final.json`. Source:
  https://docs.fallow.tools/cli/health

### Hooks, MCP, and CI findings

- Git `pre-commit` exits non-zero to abort a commit and can be bypassed with
  `--no-verify`. Git `pre-push` receives remote information and pushed refs,
  and exits non-zero to abort a push. Source: https://git-scm.com/docs/githooks
- The pre-commit framework installs hooks into `.git/hooks/pre-commit` and can
  run on selected stages such as `pre-commit` and `pre-push`. Source:
  https://pre-commit.com/
- MCP servers expose tools through `capabilities.tools`, support `tools/list`
  and `tools/call`, and can return `structuredContent` validated by an optional
  `outputSchema`. Source:
  https://modelcontextprotocol.io/specification/2025-06-18/server/tools.md
- SARIF 2.1.0 is a standard format for static analysis results. Source:
  https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
- GitHub code scanning accepts SARIF 2.1.0 with documented limits and display
  behavior. Sources:
  https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support
  and https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github
- SonarQube documents a new-code model for PR and quality-gate enforcement,
  which supports the requirement to gate changed code separately from legacy
  code. Sources:
  https://docs.sonarsource.com/sonarqube-server/user-guide/about-new-code.md
  and https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction-to-quality-gates.md
- Semgrep supports `--baseline-commit` for showing only findings not present in
  a baseline commit, but baseline workflows have git-state constraints. Source:
  https://semgrep.dev/docs/cli-reference.md

## Requirements

### Functional Requirements

- FR1: The framework shall detect the repository languages in scope: Go,
  Python, TypeScript, and JavaScript.
- FR2: The framework shall run the native complexity tools for each detected
  language.
- FR3: The framework shall normalize findings into a shared JSON schema.
- FR4: The framework shall support local pre-commit and pre-push execution.
- FR5: The framework shall support CI execution with SARIF output.
- FR6: The framework shall support changed-code or baseline-aware gating.
- FR7: The framework shall produce concise terminal output with file, line,
  function, metric, actual value, threshold, and suggested next action.
- FR8: The framework shall expose an optional MCP tool that returns structured
  findings.
- FR9: The framework shall avoid blocking on legacy findings when the gate is
  configured for changed-code mode.
- FR10: The framework shall document language-specific limitations, especially
  function-level coverage precision.

### Non-Functional Requirements

- NFR1: Hook execution should be deterministic and reproducible from the CLI.
- NFR2: Tool versions must be pinned or reported in the gate output.
- NFR3: JSON output must be stable enough for automated repair loops.
- NFR4: Local hook output must remain short enough for terminal use.
- NFR5: CI output must use stable rule IDs and file paths for deduplication.
- NFR6: Failures must be explicit. The framework must not silently skip a
  detected language because a tool is missing.
- NFR7: Suppressions must be auditable and require a reason.

## Proposed Design

### Architecture

```text
changed files or baseline
        |
        v
language detector
        |
        v
language adapters: go, python, js-ts
        |
        v
normalizer: shared finding schema
        |
        +--> terminal reporter
        +--> JSON artifact
        +--> SARIF artifact
        +--> MCP tool response
        +--> non-zero exit for blocking findings
```

### Shared finding schema

```json
{
  "schema_version": "1.0",
  "status": "fail",
  "summary": {
    "files_scanned": 0,
    "blocking_findings": 0,
    "warnings": 0
  },
  "findings": [
    {
      "rule_id": "complexity.cognitive",
      "severity": "error",
      "language": "python",
      "file": "src/example.py",
      "function": "parse_request",
      "line": 42,
      "end_line": 88,
      "metric": "cognitive",
      "actual": 18,
      "threshold": 12,
      "coverage": 0.72,
      "risk_score": 25.41,
      "message": "Function exceeds cognitive complexity threshold.",
      "suggested_actions": [
        "Extract nested validation into a helper",
        "Prefer guard clauses for early failures",
        "Add tests for changed branches"
      ]
    }
  ]
}
```

### Default thresholds

```yaml
thresholds:
  cyclomatic:
    warn: 10
    block: 15
  cognitive:
    warn: 12
    block: 15
  nesting:
    block: 3
  crap:
    warn: 20
    block: 30
  coverage:
    complex_function_min: 0.80
```

### Language adapters

#### Go adapter

MVP commands:

```bash
golangci-lint run ./...
gocognit -json -over 12 ./... > reports/go-cognitive.json
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out
```

Implementation notes:

- Use `golangci-lint` for standard local gating.
- Use `gocognit -json` for normalized JSON findings.
- Treat Go coverage-backed CRAP as approximate until function-range joining is
  implemented and validated.
- Use `-coverpkg` when gates need coverage across imported packages.

#### Python adapter

MVP commands:

```bash
radon cc . -j -s > reports/python-radon-cc.json
xenon --max-absolute B --max-modules B --max-average A .
flake8 --max-complexity=10 --max-cognitive-complexity=12 .
coverage run -m pytest
coverage json -o reports/python-coverage.json
```

Implementation notes:

- Use Radon JSON as the source of cyclomatic findings.
- Use Xenon as a simple pass/fail CI gate.
- Use `flake8-cognitive-complexity` only behind a version and syntax-support
  check because the package appears stale.
- Prefer coverage.py JSON over XML for function-aware coverage joins.
- Require coverage.py 7.13.1 or newer for function and class `start_line` data.

#### TypeScript and JavaScript adapter

MVP commands:

```bash
pnpm eslint .
pnpm test -- --coverage
pnpm fallow health --coverage coverage/coverage-final.json --max-cyclomatic 10 --max-cognitive 12 --max-crap 30 --format json
```

Implementation notes:

- Use ESLint `complexity`, `max-depth`, and `sonarjs/cognitive-complexity` for
  fast local gating.
- Use Istanbul JSON coverage maps for per-function risk joins.
- Treat Fallow as optional in MVP until CLI flags and output schema are pinned
  for the target package version.

### Hook strategy

- Pre-commit: fast changed-file complexity checks, no full test suite by
  default.
- Pre-push: run tests and coverage-backed risk checks.
- CI: run full repository analysis, changed-code gate, and SARIF upload.

Example `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: complexity-gate
        name: Complexity gate
        entry: bash scripts/complexity-gate.sh
        language: system
        pass_filenames: false
        stages: [pre-commit]
      - id: coverage-risk-gate
        name: Coverage risk gate
        entry: bash scripts/coverage-risk-gate.sh
        language: system
        pass_filenames: false
        stages: [pre-push]
```

### MCP tool strategy

Expose one primary tool:

```json
{
  "name": "complexity_check",
  "title": "Complexity Check",
  "description": "Run local complexity and coverage-risk checks.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "root": { "type": "string" },
      "changedOnly": { "type": "boolean", "default": true },
      "languages": {
        "type": "array",
        "items": { "enum": ["go", "python", "javascript", "typescript"] }
      },
      "format": { "enum": ["json", "summary"], "default": "json" }
    },
    "required": ["root"]
  },
  "outputSchema": {
    "type": "object",
    "required": ["schema_version", "status", "summary", "findings"],
    "properties": {
      "schema_version": { "type": "string" },
      "status": { "enum": ["pass", "fail", "error"] },
      "summary": { "type": "object" },
      "findings": { "type": "array" }
    }
  }
}
```

Tool behavior:

- Return `structuredContent` matching `outputSchema`.
- Return `isError: true` only for execution failures, invalid input, or missing
  required tools.
- Cap finding count and include a summary if output is too large.
- Validate `root` against allowed workspace paths.

## Acceptance Criteria

1. [ ] The Go adapter reports cognitive complexity findings from `gocognit`.
   - Verify: run `gocognit -json -over 12 ./...` against a fixture project.
   - Pass: JSON findings include file, line, function, and complexity.
   - Fail: findings cannot be mapped to source locations.

2. [ ] The Go adapter runs a cyclomatic gate through `golangci-lint` or
   `cyclop`.
   - Verify: introduce a fixture function above the threshold.
   - Pass: the gate exits non-zero and reports the function.
   - Fail: the gate passes or reports only package-level data.

3. [ ] The Python adapter reports Radon cyclomatic findings.
   - Verify: run `radon cc . -j -s` against a fixture project.
   - Pass: normalized output includes numeric complexity and rank.
   - Fail: only text output is available to the normalizer.

4. [ ] The Python adapter supports coverage.py JSON for function-aware joins.
   - Verify: run `coverage json` with coverage.py 7.13.1 or newer.
   - Pass: function or class regions include enough line data to map findings.
   - Fail: coverage output cannot identify function regions.

5. [ ] The TypeScript and JavaScript adapter gates ESLint complexity and nesting.
   - Verify: run ESLint against a fixture with high cyclomatic complexity and
     nested blocks.
   - Pass: `complexity` and `max-depth` findings are emitted.
   - Fail: either rule is not active or cannot parse the fixture.

6. [ ] The TypeScript and JavaScript adapter can consume Istanbul JSON coverage.
   - Verify: generate `coverage/coverage-final.json` and parse `fnMap` and
     counters.
   - Pass: at least one function-level coverage value is mapped to a function.
   - Fail: only file-level coverage is available.

7. [ ] The shared JSON schema is stable across all adapters.
   - Verify: run fixtures for each language and validate against schema.
   - Pass: all adapters emit valid schema version 1.0 output.
   - Fail: fields differ by language without documented optionality.

8. [ ] Changed-code mode does not block unrelated legacy findings.
   - Verify: create one legacy complex function and one clean changed function.
   - Pass: changed-code mode passes or reports only changed-code findings.
   - Fail: legacy findings block the change.

9. [ ] Pre-commit and pre-push hooks fail with concise diagnostics.
   - Verify: run hooks locally with one blocking fixture.
   - Pass: hook exits non-zero and prints file, line, function, metric, actual,
     and threshold.
   - Fail: hook output is too verbose or lacks actionable location data.

10. [ ] CI can upload SARIF findings.
    - Verify: run CI on a fixture branch and upload SARIF.
    - Pass: findings appear with stable rule IDs and source locations.
    - Fail: SARIF is rejected or findings cannot be deduplicated.

11. [ ] MCP tool returns structured findings.
    - Verify: call `complexity_check` with `changedOnly=true`.
    - Pass: response includes `structuredContent` matching `outputSchema`.
    - Fail: response is unstructured text only.

12. [ ] Missing tools fail explicitly.
    - Verify: remove or hide one required tool from PATH.
    - Pass: the gate names the missing tool and exits non-zero.
    - Fail: the language is silently skipped.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Linter-only gates | Simple and fast | Does not combine coverage-backed risk | Use for MVP local checks |
| Full custom AST analyzer | One schema and consistent behavior | High implementation cost and parser maintenance | Defer |
| SonarQube-only | Mature new-code and quality-gate model | Adds server dependency and less local repair feedback | Reference model, not MVP dependency |
| SARIF-only output | Standard CI format | Poor local terminal UX and verbose for repair loops | Generate alongside JSON |
| Fallow for JS/TS risk | Strong health and CRAP support | Newer tool, schema/version stability must be pinned | Optional adapter |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Function-level coverage is inconsistent across languages | CRAP scores may be misleading | Label approximations, require fixture validation, prefer native function maps where available |
| Cognitive risk formula is experimental | False confidence in non-standard metric | Report it as supplemental and keep classic CRAP canonical |
| Legacy code blocks adoption | Teams disable the gate | Support changed-code and baseline modes from the start |
| Tool versions change config schemas | Hooks break unexpectedly | Pin versions and print versions in reports |
| Hook bypass | Risk reaches remote branches | Enforce same gate in CI |
| Large outputs overwhelm repair loops | Agent repair loses focus | Cap findings, sort by severity, include top contributors only |
| Stale Python cognitive plugin | Misses modern syntax or breaks linting | Version-gate, test syntax fixtures, allow Radon-only fallback with explicit warning |

## Open Questions

- Which repository should host the first implementation?
- Should the MVP block on warnings, or only on hard thresholds?
- Should changed-code detection use staged files, merge-base diff, or a stored
  baseline artifact?
- Should Fallow be included in the default JS/TS path or remain optional until
  version-pinned?
- What suppression format should be allowed, and where should justifications be
  recorded?

## Implementation Milestones

1. Build schema and report normalizer.
2. Add Go, Python, and JS/TS adapters with fixture projects.
3. Add pre-commit and pre-push scripts.
4. Add changed-code mode.
5. Add coverage-backed risk joins for Python and JS/TS.
6. Add approximate Go coverage join with documented limitations.
7. Add SARIF output.
8. Add MCP tool wrapper.
9. Add CI workflow example and release docs.

## Plan Handoff

- Recommended next command:

  ```bash
  /plan-it .specs/complexity-risk-gates/PRD.md
  ```

- Review command:

  ```bash
  /review-it .specs/complexity-risk-gates/PRD.md
  ```

- Notes for planner:
  - Treat function-level coverage mapping as the highest-risk implementation
    item.
  - Build fixtures before real repository rollout.
  - Keep classic CRAP separate from experimental cognitive risk scoring.
  - Start with changed-code-only gating to avoid legacy adoption failures.
