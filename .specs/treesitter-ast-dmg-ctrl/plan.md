---
created: 2026-02-24
completed:
---

# Team Plan: Tree-Sitter AST Analysis for Damage-Control Hooks

## Objective

Add tree-sitter bash AST parsing as a veto-only second pass in the damage-control bash hook pipeline. Regex stays as primary filter; AST catches bypass vectors (variable expansion, command substitution, eval wrapping, quote obfuscation) that regex misses. AST can escalate allowed→blocked/ask but never downgrade blocked→allowed. Graceful fallback if tree-sitter not installed.

Reference: [Destructive Command Guard](https://github.com/Dicklesworthstone/destructive_command_guard) uses a similar tiered approach.

## Project Context
- **Language**: Python (PEP 723 inline script metadata)
- **Test command**: `uv run pytest claude/hooks/damage-control/tests/ -v`
- **Lint command**: `uv run ruff check`
- **Hook entry**: `claude/hooks/damage-control/bash-tool-damage-control.py` (1321 lines)
- **Existing tests**: 8 test files, 3232 lines total in `claude/hooks/damage-control/tests/`
- **Config**: `claude/hooks/damage-control/patterns.yaml`

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Create ast_analyzer.py foundation | 1 new | feature | sonnet | builder |
| T2: Add astAnalysis config to patterns.yaml | 1 | mechanical | haiku | builder-light |
| T3: Integrate AST into bash hook + add deps | 1 | feature | sonnet | builder |
| T4: Write foundation test suite | 1 new | feature | sonnet | builder |
| T5: Deep command extraction (subshells, pipes, heredocs) | 1 | feature | sonnet | builder |
| T6: Variable expansion detection | 1 | feature | sonnet | builder |
| T7: Eval/source detection with recursive parsing | 1 | feature | sonnet | builder |
| T8: Tests for extraction, expansion, eval | 1 | feature | sonnet | builder |
| T9: Performance tuning + benchmarks | 2 | feature | sonnet | builder |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| ast-builder-1 | builder | sonnet | Core module + integration |
| ast-builder-2 | builder | sonnet | Analysis features + tests |
| ast-validator-1 | validator-heavy | sonnet | Wave validation |

## Execution Waves

### Wave 1: Foundation (parallel)
- **T1**: Create `ast_analyzer.py` with lazy parser init, `is_available()`, and stub `analyze_command_ast()` that always returns allow [sonnet] — ast-builder-1
  - AC: File exists at `claude/hooks/damage-control/ast_analyzer.py`
  - AC: `is_available()` returns bool based on tree-sitter import
  - AC: `analyze_command_ast(command, config)` returns `{"decision": "allow"}` stub
  - AC: Parser initialized lazily (not at import time)
  - AC: `uv run ruff check claude/hooks/damage-control/ast_analyzer.py` passes
  - Verification (from `claude/hooks/damage-control`): `uv run python -c "from ast_analyzer import ASTAnalyzer; a = ASTAnalyzer(); print(a.is_available())"`
  - Verification (repo-root fallback): `uv run python -c "import importlib.util, pathlib; p = pathlib.Path('claude/hooks/damage-control/ast_analyzer.py'); s = importlib.util.spec_from_file_location('ast_analyzer', p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.ASTAnalyzer().is_available())"`

- **T2**: Add `astAnalysis` config section to `patterns.yaml` [haiku] — ast-builder-2
  - AC: New `astAnalysis` section with keys: `enabled: true`, `safeCommands` list, `dangerousCommands` list, `timeoutMs: 50`
  - AC: `safeCommands` includes: ls, echo, cat, grep, head, tail, wc, date, pwd, whoami, git status, git log, git diff, git branch
  - AC: `dangerousCommands` includes: rm, mv, dd, mkfs, chmod, chown, kill, pkill, shutdown, reboot
  - AC: YAML validates (no syntax errors): `uv run python -c "import yaml; yaml.safe_load(open('claude/hooks/damage-control/patterns.yaml'))"`
  - Verification: Parse and print the new section

- **T3**: Integrate AST call into `bash-tool-damage-control.py` [sonnet] — ast-builder-1
  - AC: PEP 723 deps include `tree-sitter>=0.23.0` and `tree-sitter-bash>=0.23.0`
  - AC: Integration point at end of `check_command()` (before final allow return), wrapped in try/except
  - AC: AST only called when regex allows (veto-only — never downgrades blocks)
  - AC: `astAnalysis.enabled` config flag respected (skip if false)
  - AC: Graceful fallback: if tree-sitter not installed or AST errors, allow through
  - AC: All existing tests pass: `uv run pytest claude/hooks/damage-control/tests/ -v`
  - Verification: Run existing test suite — zero regressions

- **T4**: Write foundation test suite [sonnet] — ast-builder-2
  - AC: File at `claude/hooks/damage-control/tests/test_ast_analyzer.py`
  - AC: Tests cover: `is_available()` true/false, graceful fallback when tree-sitter missing, config loading (enabled/disabled), stub returns allow, safe-command fast path
  - AC: Tests pass: `uv run pytest claude/hooks/damage-control/tests/test_ast_analyzer.py -v`
  - Verification: Run test file in isolation

### Wave 1 Validation
- **V1**: Validate wave 1 [sonnet] — ast-validator-1, blockedBy: [T1, T2, T3, T4]
  - Run: `uv run ruff check claude/hooks/damage-control/`
  - Run: `uv run pytest claude/hooks/damage-control/tests/ -v` (all 90+ existing + new tests pass)
  - Run: `uv run python claude/hooks/damage-control/test-damage-control.py --test-suite all` (smoke tests)
  - Verify: ast_analyzer.py imports cleanly from bash-tool-damage-control.py
  - Verify: patterns.yaml parses without errors

### Wave 2: Analysis Features (sequential)
- **T5**: Deep command extraction in ast_analyzer.py [sonnet] — ast-builder-1, blockedBy: [V1]
  - Walk full AST extracting every `command` node from: `command_substitution`, `subshell`, `pipeline`, `heredoc_body`, function bodies
  - Re-run extracted commands through existing regex pattern matching (import and call `check_patterns()`)
  - Quote stripping handled automatically by tree-sitter tokenization
  - AC: `bash -c 'rm -rf /'` → extracts inner `rm -rf /` → blocked
  - AC: `(rm -rf /)` subshell → blocked
  - AC: `echo hello | rm -rf /` pipeline → blocked
  - AC: `'rm' -rf /` quote obfuscation → blocked
  - AC: `echo "hello world"` → allowed (no false positives)
  - Verification: Unit tests for each case

- **T6**: Variable expansion detection in ast_analyzer.py [sonnet] — ast-builder-2, blockedBy: [T5]
  - Detect `expansion`/`simple_expansion` AST nodes in arguments of dangerous commands
  - Escalate to `ask` (not block — variable value unknown at static analysis)
  - Skip known-safe variables: $HOME, $PWD, $USER, $PATH, $SHELL, $TERM
  - AC: `rm $FLAG /` → ask
  - AC: `rm -rf $UNKNOWN_VAR` → ask
  - AC: `echo $VAR` → allow (echo is safe command)
  - AC: `ls $HOME` → allow (safe variable + safe command)
  - AC: `rm $HOME/file.txt` → allow (safe variable, specific path)
  - Verification: Unit tests for each case

- **T7**: Eval/source detection in ast_analyzer.py [sonnet] — ast-builder-1, blockedBy: [T6]
  - Detect `eval`, `source`, `.` as command names
  - Recursively parse string arguments as bash, analyze inner AST
  - AC: `eval 'rm -rf /'` → blocked
  - AC: `eval 'echo hello'` → allowed
  - AC: `source /etc/profile` → allowed (known safe)
  - AC: `eval "$DYNAMIC"` → ask (can't know variable value)
  - Verification: Unit tests for each case

- **T8**: Tests for extraction, expansion, eval [sonnet] — ast-builder-2, blockedBy: [T7]
  - Add tests to `test_ast_analyzer.py` covering all T5/T6/T7 acceptance criteria
  - AC: At least 25 new test cases
  - AC: All tests pass: `uv run pytest claude/hooks/damage-control/tests/test_ast_analyzer.py -v`
  - Verification: Run test file

### Wave 2 Validation
- **V2**: Validate wave 2 [sonnet] — ast-validator-1, blockedBy: [T5, T6, T7, T8]
  - Run: `uv run ruff check claude/hooks/damage-control/`
  - Run: `uv run pytest claude/hooks/damage-control/tests/ -v` (all tests pass)
  - Run: `uv run python claude/hooks/damage-control/test-damage-control.py --test-suite all` (smoke tests)
  - Verify: No false positives on common commands (ls, git status, echo, cat, grep)
  - Verify: All bypass vectors from plan are caught

### Wave 3: Performance + Polish
- **T9**: Performance tuning + benchmarks [sonnet] — ast-builder-1, blockedBy: [V2]
  - Add safe-command fast path (skip AST for commands in `safeCommands` list)
  - Add configurable timeout via `timeoutMs` config
  - Update `benchmark.py` with AST corpus (regex-only vs regex+AST comparison)
  - AC: Safe commands (ls, echo, cat, grep) skip AST entirely
  - AC: `timeoutMs` config respected — AST analysis aborts if exceeded
  - AC: `uv run python claude/hooks/damage-control/benchmark.py` runs and reports timings
  - AC: All tests still pass
  - Verification: Run benchmark, verify safe commands show ~0ms AST time

### Wave 3 Validation
- **V3**: Final validation [sonnet] — ast-validator-1, blockedBy: [T9]
  - Run: `uv run ruff check claude/hooks/damage-control/`
  - Run: `uv run pytest claude/hooks/damage-control/tests/ -v`
  - Run: `uv run python claude/hooks/damage-control/test-damage-control.py --test-suite all`
  - Run: `uv run python claude/hooks/damage-control/benchmark.py`
  - Verify: Benchmark shows acceptable overhead (warm path <5ms)

## AST Config Contract

- Policy precedence: regex (`check_patterns()`) remains the primary decision authority.
- AST is veto-only: it may escalate `allow -> ask|block`, and must never downgrade `block -> ask|allow`.
- `astAnalysis.enabled` gates AST execution; when false, skip AST entirely.
- `astAnalysis.safeCommands` is an AST fast-path only (skip AST analysis for configured safe commands).
- `astAnalysis.dangerousCommands` is an AST heuristic input for ambiguous cases when regex does not already decide.
- Command matching normalization: use normalized command name plus optional subcommand tuple (for entries like `git status`).
- `astAnalysis.timeoutMs` bounds AST analysis duration; timeout yields graceful fallback to regex-only outcome.

## Dependency Graph

```
Wave 1: T1, T2, T3, T4 (parallel) → V1
Wave 2: T5 → T6 → T7 → T8 (sequential) → V2
Wave 3: T9 → V3
```

## Key Files

| File | Action |
|------|--------|
| `claude/hooks/damage-control/ast_analyzer.py` | NEW — core AST analysis module |
| `claude/hooks/damage-control/bash-tool-damage-control.py` | MODIFY — add PEP 723 deps, integration point |
| `claude/hooks/damage-control/patterns.yaml` | MODIFY — add astAnalysis config section |
| `claude/hooks/damage-control/tests/test_ast_analyzer.py` | NEW — AST test suite |
| `claude/hooks/damage-control/benchmark.py` | MODIFY — add AST benchmark corpus |
| `claude/hooks/damage-control/tests/conftest.py` | MODIFY — shared fixtures for AST tests |

## Out of Scope

- Symlink traversal (requires filesystem access, not static analysis)
- Interpreter string concatenation (better handled by enhancing `extract_system_call()`)
- Dynamic analysis (tree-sitter is static only)
