---
created: 2026-02-19
completed: 2026-02-19
---

# Team Plan: Test Modernization

## Objective

Convert slow bats tests to fast pytest equivalents and close testing gaps. The two bats files (prompt.bats, git_ssh_setup.bats) take ~37s combined but all 14 prompt tests skip on Windows and the 13 git_ssh_setup tests are pure logic that doesn't need bash. Converting these to pytest will cut test time by ~35s and make tests actually run on Windows.

Additionally, add the highest-value missing test: `install.conf.yaml` ↔ `wsl/install.conf.yaml` sync validation, which CLAUDE.md explicitly warns must stay in sync but has no automated check.

## Project Context
- **Language**: Python (pytest) + Bash (bats)
- **Test command**: `make test`
- **Lint command**: `make lint`

## Scope

### In scope
1. Convert `git_ssh_setup.bats` (13 tests) → pytest in `test/test_git_ssh_setup.py`
2. Convert `prompt.bats` (14 tests) → pytest in `test/test_prompt.py`
3. Add `install.conf.yaml` ↔ `wsl/install.conf.yaml` sync test to `test/test_config_patterns.py`
4. Remove the two `.bats` files and update Makefile
5. For migrated tests on Windows: `test/test_git_ssh_setup.py` has no skips, and `test/test_prompt.py` only skips explicitly bash-dependent git branch tests
6. Update repository testing docs to remove bats-based instructions

### Out of scope (future work)
- `install.ps1` Pester tests
- `scripts/zsh-plugins` tests
- `scripts/claude-mcp-setup` tests
- `zsh/env.d/*` PATH construction tests
- `zsh/rc.d/05-prompt.zsh` (zsh prompt, separate from bash prompt)

## Complexity Analysis

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| T1: Convert git_ssh_setup.bats to pytest | 2 (new test + delete bats) | mechanical | haiku | builder-light |
| T2: Convert prompt.bats to pytest | 2 (new test + delete bats) | mechanical | haiku | builder-light |
| T3: Add install.conf.yaml sync test | 1 (edit existing) | mechanical | haiku | builder-light |
| T4: Update Makefile and cleanup | 2 (Makefile + test_helper.bash) | mechanical | haiku | builder-light |
| T5: Update test docs for pytest-only workflow | 1 (CLAUDE.md) | mechanical | haiku | builder-light |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| test-mod-builder-1 | builder-light | haiku | Convert git_ssh_setup.bats |
| test-mod-builder-2 | builder-light | haiku | Convert prompt.bats |
| test-mod-builder-3 | builder-light | haiku | Add sync test |
| test-mod-validator-1 | validator | haiku | Wave validation |

## Execution Waves

### Wave 1 (parallel)
- T1: Convert git_ssh_setup.bats to pytest [haiku] — builder-light
- T2: Convert prompt.bats to pytest [haiku] — builder-light
- T3: Add install.conf.yaml ↔ wsl/install.conf.yaml sync test [haiku] — builder-light

### Wave 1 Validation
- V1: Validate wave 1 [haiku] — validator, blockedBy: [T1, T2, T3]

### Wave 2
- T4: Update Makefile (remove bats references, delete .bats files, delete test_helper.bash) [haiku] — builder-light, blockedBy: [V1]
- T5: Update docs to pytest-only test workflow [haiku] — builder-light, blockedBy: [V1]

### Wave 2 Validation
- V2: Validate wave 2 [haiku] — validator, blockedBy: [T4, T5]

## Dependency Graph
Wave 1: T1, T2, T3 (parallel) → V1 → Wave 2: T4, T5 (parallel) → V2

## Acceptance Criteria

### T1: Convert git_ssh_setup.bats to pytest
1. [ ] `test/test_git_ssh_setup.py` exists with 13 tests covering all cases from `git_ssh_setup.bats`
    - Verification: `uv run pytest test/test_git_ssh_setup.py -v --tb=short`
    - Expected: exit code `0`; pytest summary contains `13 passed`
2. [ ] Tests cover: find_personal_key (4 cases), find_work_key (4 cases), build_ssh_command (2 cases), write_local_config (3 cases)
    - Verification: `uv run pytest test/test_git_ssh_setup.py -v --tb=short`
    - Expected: exactly 13 test cases collected/executed for this file
3. [ ] Tests use pure Python logic and fixtures only (no shell subprocess, no `eval`/`sed` extraction)
    - Verification: `uv run python -c "from pathlib import Path; import re; t=Path('test/test_git_ssh_setup.py').read_text(); print(len(re.findall(r'subprocess|eval\\(|\\bsed\\b', t)))"`
    - Expected: 0

### T2: Convert prompt.bats to pytest
1. [ ] `test/test_prompt.py` exists with tests covering all 14 cases from `prompt.bats`
    - Verification: `uv run pytest test/test_prompt.py -v --tb=short`
    - Expected: exit code `0`; pytest output shows 14 tests with no unexpected skips
2. [ ] Path normalization tests (12 cases) work as pure Python string tests — no bash subprocess needed
    - Verification: `uv run pytest test/test_prompt.py -v -k "not git_branch"`
    - Expected: exit code `0`; summary contains `12 passed`; summary contains no `skipped`
3. [ ] Git branch tests are the only bash-dependent tests in this file and are validated behaviorally
    - Verification (Windows): `uv run pytest test/test_prompt.py -v -k "git_branch" -r s`
    - Expected (Windows): exit code `0`; summary contains `2 skipped`; both skip reasons mention bash dependency
    - Verification (bash-capable env): `uv run pytest test/test_prompt.py -v -k "git_branch"`
    - Expected (bash-capable env): exit code `0`; summary contains `2 passed`

### T3: Add install.conf.yaml ↔ wsl/install.conf.yaml sync test
1. [ ] Test validates that all shared, unconditional symlink targets in `install.conf.yaml` appear in `wsl/install.conf.yaml`
    - Scope rules:
      - Include only link entries without `if:` conditions
      - Exclude platform-conditional desktop/tooling links (PowerShell profile and VS Code user paths)
    - Verification: `uv run pytest test/test_config_patterns.py -v -k "sync"`
    - Expected: exit code `0`; summary contains `passed`; at least one selected test executed
2. [ ] Test identifies which links are missing from wsl config (for debugging) via automated negative-path test
    - Verification: `uv run pytest test/test_config_patterns.py -v -k "sync and missing"`
    - Expected: exit code `0`; selected negative-path test passes; assertion checks missing-link name in failure text

### V1: Validate wave 1
1. [ ] Validate T1 scope and count
    - Verification: `uv run pytest test/test_git_ssh_setup.py -v --tb=short`
    - Expected: exit code `0`; summary contains `13 passed`; summary contains no `skipped`
2. [ ] Validate T2 behavior split
    - Verification: `uv run pytest test/test_prompt.py -v --tb=short`
    - Expected: exit code `0`; output shows exactly 14 tests; only `git_branch` tests may be skipped on Windows
3. [ ] Validate T3 sync coverage and diagnostics
    - Verification: `uv run pytest test/test_config_patterns.py -v -k "sync"`
    - Expected: exit code `0`; both shared-link and missing-link sync tests pass
4. [ ] Validation evidence captured
    - Verification artifact: command output snippets attached to PR or task log
    - Expected: output includes pass/fail counts for each command above

### T4: Update Makefile and cleanup
1. [ ] `test/prompt.bats` and `test/git_ssh_setup.bats` deleted
    - Verification: `uv run python -c "import glob; print(glob.glob('test/*.bats'))"`
    - Expected: `[]`
2. [ ] `test/test_helper.bash` deleted
    - Verification: `uv run python -c "from pathlib import Path; print(Path('test/test_helper.bash').exists())"`
    - Expected: `False`
3. [ ] Makefile contains no bats references
    - Verification: `uv run python -c "from pathlib import Path; lines=Path('Makefile').read_text().splitlines(); print([i+1 for i,l in enumerate(lines) if 'bats' in l])"`
    - Expected: `[]`
4. [ ] `make test` passes with all pytest-only test suite
    - Verification: `make test`
    - Expected: exit code `0`; output contains no `bats` command execution
5. [ ] Makefile removes `test-bats` target and `preflight` bats check, updates `test-quick` to pytest-only
    - Verification: `uv run python -c "from pathlib import Path; import re; lines=Path('Makefile').read_text().splitlines(); print([i+1 for i,l in enumerate(lines) if re.search(r'test-bats|preflight.*bats', l)])"`
    - Expected: `[]`

### T5: Update docs for pytest-only workflow
1. [ ] `CLAUDE.md` testing section no longer instructs running bats for core test workflow
    - Verification: `uv run python -c "from pathlib import Path; import re; lines=Path('CLAUDE.md').read_text().splitlines(); print([i+1 for i,l in enumerate(lines) if re.search(r'bats test/prompt.bats|Run bats tests|pytest \\+ bats', l)])"`
    - Expected: `[]`
2. [ ] `CLAUDE.md` test commands reflect pytest-only local workflow
    - Verification: `uv run python -c "from pathlib import Path; import re; lines=Path('CLAUDE.md').read_text().splitlines(); make_test=[i+1 for i,l in enumerate(lines) if 'make test' in l]; pytest_bats=[i+1 for i,l in enumerate(lines) if re.search(r'pytest \\+ bats|Run bats tests', l)]; print({'make_test': make_test, 'pytest_plus_bats': pytest_bats})"`
    - Expected: `make_test` is non-empty; `pytest_plus_bats` is `[]`

### V2: Validate wave 2
1. [ ] Validate cleanup and docs updates
    - Verification: `uv run pytest test/ -v --tb=short`
    - Expected: exit code `0`; summary contains `passed`
2. [ ] Validate end-to-end command behavior
    - Verification: `make test`
    - Expected: exit code `0`; output contains no `bats` command execution
3. [ ] Validate modernization performance objective
    - Verification method: measure `make test` runtime on same machine/config before and after migration; run 3 times each and compare medians
    - Expected: `median_after <= median_before - 30s`

## Verification Runner (single-pass checklist)

Run these in order after implementation to validate all gates deterministically.

```bash
# T1
uv run pytest test/test_git_ssh_setup.py -v --tb=short
uv run python -c "from pathlib import Path; import re; t=Path('test/test_git_ssh_setup.py').read_text(); print(len(re.findall(r'subprocess|eval\\(|\\bsed\\b', t)))"

# T2
uv run pytest test/test_prompt.py -v --tb=short
uv run pytest test/test_prompt.py -v -k "not git_branch"
uv run pytest test/test_prompt.py -v -k "git_branch" -r s

# T3
uv run pytest test/test_config_patterns.py -v -k "sync"
uv run pytest test/test_config_patterns.py -v -k "sync and missing"

# T4
uv run python -c "import glob; print(glob.glob('test/*.bats'))"
uv run python -c "from pathlib import Path; print(Path('test/test_helper.bash').exists())"
uv run python -c "from pathlib import Path; lines=Path('Makefile').read_text().splitlines(); print([i+1 for i,l in enumerate(lines) if 'bats' in l])"
uv run python -c "from pathlib import Path; import re; lines=Path('Makefile').read_text().splitlines(); print([i+1 for i,l in enumerate(lines) if re.search(r'test-bats|preflight.*bats', l)])"

# T5
uv run python -c "from pathlib import Path; import re; lines=Path('CLAUDE.md').read_text().splitlines(); print([i+1 for i,l in enumerate(lines) if re.search(r'bats test/prompt.bats|Run bats tests|pytest \\+ bats', l)])"
uv run python -c "from pathlib import Path; import re; lines=Path('CLAUDE.md').read_text().splitlines(); make_test=[i+1 for i,l in enumerate(lines) if 'make test' in l]; pytest_bats=[i+1 for i,l in enumerate(lines) if re.search(r'pytest \\+ bats|Run bats tests', l)]; print({'make_test': make_test, 'pytest_plus_bats': pytest_bats})"

# V2 end-to-end
uv run pytest test/ -v --tb=short
make test
```
