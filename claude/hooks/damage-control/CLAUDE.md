# Damage Control Hook

Defense-in-depth protection system for Claude Code. Blocks dangerous commands and protects sensitive files via PreToolUse hooks.

## Overview

This hook provides:

- **Command Pattern Blocking**: Blocks dangerous bash commands (rm -rf, git reset --hard, etc.)
- **Ask Patterns**: Triggers confirmation dialog for risky-but-valid operations (`ask: true`)
- **Path Protection Levels**:
  - `zeroAccessPaths` - No access at all (secrets/credentials)
  - `readOnlyPaths` - Read allowed, modifications blocked
  - `noDeletePaths` - All operations except delete
- **Shell Unwrapping**: Detects shell wrapper invocations (bash -c, sh -c) and analyzes inner commands
- **Git Semantic Analysis**: Understands git command semantics (force push, hard reset, reflog deletion)
- **Audit Logging**: Complete JSON logs of all decisions for compliance and analysis

## Structure

```
.claude/hooks/damage-control/
├── CLAUDE.md                        # This file
├── patterns.yaml                    # Shared security patterns (single source of truth)
├── bash-tool-damage-control.py      # Bash command hook
├── edit-tool-damage-control.py      # File edit hook
├── write-tool-damage-control.py     # File write hook
├── test-damage-control.py           # Integration test runner
├── test-hook                        # Quick hook test script
├── benchmark.py                     # Performance benchmarking
├── log_rotate.py                    # Log rotation utility
├── tests/                           # Unit test suite
├── cookbook/                        # Workflow guides
│   ├── install_damage_control_ag_workflow.md
│   ├── modify_damage_control_ag_workflow.md
│   ├── manual_control_damage_control_ag_workflow.md
│   ├── list_damage_controls.md
│   ├── test_damage_control.md
│   ├── view_audit_logs.md
│   └── build_for_windows.md
└── test-prompts/                    # Test prompts for validation
    ├── sentient_v1.md
    ├── sentient_v2.md
    ├── sentient_v3.md
    └── sentient_v4.md
```

## After Installation

The install workflow copies hooks and creates settings based on the chosen level:

### Global Hooks
```
~/.claude/
├── settings.json                      # Hook configuration
└── hooks/
    └── damage-control/
        ├── patterns.yaml
        ├── bash-tool-damage-control.py
        ├── edit-tool-damage-control.py
        └── write-tool-damage-control.py
```

### Project Hooks
```
<project>/
└── .claude/
    ├── settings.json                  # Hook configuration (shared)
    └── hooks/
        └── damage-control/
            ├── patterns.yaml
            ├── bash-tool-damage-control.py
            ├── edit-tool-damage-control.py
            └── write-tool-damage-control.py
```

### Project Personal Hooks
```
<project>/
└── .claude/
    ├── settings.local.json            # Personal overrides (gitignored)
    └── hooks/
        └── damage-control/
            ├── patterns.yaml
            ├── bash-tool-damage-control.py
            ├── edit-tool-damage-control.py
            └── write-tool-damage-control.py
```

---

## Enhanced Features

### Shell Unwrapping

Detects and analyzes commands wrapped in shell invocations:
- Recognizes `bash -c`, `sh -c`, `zsh -c`, etc.
- Extracts and evaluates the inner command
- Blocks if inner command matches dangerous patterns
- Works recursively for deeply nested wrappers

Example: `bash -c 'rm -rf /tmp/data'` -> extracts `rm -rf /tmp/data` -> blocks

### Git Semantic Analysis

Understands git command structure and semantics:
- **Force operations**: `git push --force`, `git push --force-with-lease`
- **Destructive history operations**: `git reset --hard`, `git revert --no-edit`
- **Reflog deletion**: `git reflog delete`, `git reflog expire`
- **Checkout forced operations**: `git checkout -f`
- **Conditional blocking**: Respects `git config safe.directoryRefresh` and `push.default` settings

Example: `git push --force` -> matches git-force pattern -> blocks

### Read-Only Search Pipeline Detection

Prevents false positives from dangerous-looking strings inside search arguments (e.g., `grep "helm upgrade" Makefile` should NOT trigger the `helm upgrade` pattern).

**How it works:**
- Splits commands on `&&`, `||`, `;`, `&` (respecting quoted strings)
- For each segment, checks if the entire pipe chain is read-only:
  - First command must be a read-only tool: search (grep, rg, ag, ack, git grep/log/diff/show), display (echo, printf), or read-only CLI subcommands (kubectl get/describe/logs, helm list/status/get, terraform show/plan/output)
  - All pipe targets must be safe transformers (head, tail, sort, wc, jq, yq, bat, echo, etc.)
- Only skips `bashToolPatterns` — path-based checks (zeroAccessPaths, readOnlyPaths, noDeletePaths) still apply
- If ANY segment is not read-only, the full command is checked normally

**Examples:**
| Command | Result | Why |
|---------|--------|-----|
| `grep "helm upgrade" Makefile \| head -20` | Allow | Search piped to safe transformer |
| `rg "terraform destroy" .` | Allow | Read-only search tool |
| `grep "helm upgrade" && helm upgrade release` | Ask | Second segment is dangerous |
| `grep "helm upgrade" \| xargs helm upgrade` | Ask | Pipe target `xargs` not in safe list |
| `grep "pattern" & rm -rf /` | Block | Background `&` splits segments; `rm -rf /` is dangerous |

### Audit Logging

Comprehensive JSON logging of all security decisions:
- Location: `~/.claude/logs/damage-control/`
- Per-tool logs: `bash-tool.log`, `edit-tool.log`, `write-tool.log`
- Queryable JSON format for analysis and compliance
- Includes timestamp, decision, matched pattern, confidence

View logs:
```bash
cat ~/.claude/logs/damage-control/*.log | jq
```

For detailed analysis examples, see [cookbook/view_audit_logs.md](cookbook/view_audit_logs.md).

---

## Cookbook

This section defines the decision tree for handling user requests. Based on what the user says, read and execute the appropriate workflow prompt.

### Installation Pathway

**Trigger phrases**: "install damage control", "setup security hooks", "deploy damage control", "add protection"

**Workflow**: Read and execute [cookbook/install_damage_control_ag_workflow.md](cookbook/install_damage_control_ag_workflow.md)

### Modification Pathway

**Trigger phrases**: "help me modify damage control", "update protection", "change blocked paths", "add restricted directory"

**Workflow**: Read and execute [cookbook/modify_damage_control_ag_workflow.md](cookbook/modify_damage_control_ag_workflow.md)

### Manual Control Pathway

**Trigger phrases**: "how do I manually update", "explain damage control config", "show me the settings"

**Workflow**: Read and execute [cookbook/manual_control_damage_control_ag_workflow.md](cookbook/manual_control_damage_control_ag_workflow.md)

### Testing Pathway

**Trigger phrases**:
    - "test damage control",
    - "run damage control tests",
    - "verify hooks are working"
    - "damage control test this command <x>"
    - "damage control test this read to this path <x>"
    - "damage control test this write to this path <x>"
    - "damage control test this delete to this path <x>"
    - "damage control test this run this command <x>"

**Workflow**: Read and execute [cookbook/test_damage_control.md](cookbook/test_damage_control.md)

**What it does**:
- Reads patterns.yaml to get all configured patterns and paths
- Tests PreToolUse hooks (bash, edit, write) with exit code validation
- Tests ask patterns with JSON output validation
- Reports pass/fail for each test case
- Provides summary of all results

### Windows Build Pathway

**Trigger phrases**: "build for windows", "add windows patterns", "convert to windows", "windows damage control"

**Workflow**: Read and execute [cookbook/build_for_windows.md](cookbook/build_for_windows.md)

**What it does**:
- Checks for existing installation
- Adds Windows PowerShell and cmd patterns alongside Unix patterns
- Creates cross-platform patterns.yaml that works on both systems

### Direct Command Pathway

**Trigger phrases**: "update global read only paths to include X", "add /secret to zero access paths", "block command Y"

**Action**: Execute immediately without prompts - the user knows the system.

**Examples**:
- "add ~/.credentials to zero access paths" -> Edit patterns.yaml directly
- "block the command 'npm publish'" -> Add pattern to bashToolPatterns
- "make /var/log read only" -> Add to readOnlyPaths

---

## Quick Reference

### Settings File Locations

| Level            | Path                          | Scope                      |
| ---------------- | ----------------------------- | -------------------------- |
| Global           | `~/.claude/settings.json`     | All projects               |
| Project          | `.claude/settings.json`       | Current project (shared)   |
| Project Personal | `.claude/settings.local.json` | Current project (personal) |

### Path Protection Levels

| Type              | Read | Write | Edit | Delete | Use Case                |
| ----------------- | ---- | ----- | ---- | ------ | ----------------------- |
| `zeroAccessPaths` | No   | No    | No   | No     | Secrets, credentials    |
| `readOnlyPaths`   | Yes  | No    | No   | No     | System configs, history |
| `noDeletePaths`   | Yes  | Yes   | Yes  | No     | Important project files |

### CLI Tool Coverage

| Tool | Patterns | Risk Levels |
|------|----------|-------------|
| git | Force push, reset --hard, filter-branch, reflog, rm | Block + Ask |
| glab | API DELETE, project/repo/MR/issue/CI/release delete, merge, approve | Block + Ask |
| gh | repo delete | Block |
| aws | S3, EC2, RDS, IAM, Lambda, EKS, DynamoDB, CloudFormation, KMS, Secrets Manager, Route53, SQS, SNS, ElastiCache, ECS, Backup, Organizations | Block + Ask |
| helm | uninstall/delete, install, upgrade, rollback, repo remove, dangerous flags (--no-hooks, --reset-values, --force) | Ask |
| kubectl | delete, apply, exec, drain, cordon, create secret | Ask |
| terraform | destroy, apply, state rm/mv, import, taint, workspace delete, force-unlock, -auto-approve variants | Block + Ask |
| tofu | Full parity with terraform patterns | Block + Ask |
| pulumi | destroy | Ask |
| serverless/sls | remove | Ask |
| docker | system prune, rm -f, rmi -f, volume rm | Ask |
| npm | unpublish | Block |
| Database CLIs | redis FLUSHALL/FLUSHDB, mongo dropDatabase, dropdb, mysqladmin drop | Block |
| SQL | DELETE without WHERE, TRUNCATE TABLE, DROP TABLE/DATABASE | Block + Ask |

### Runtime Requirements

| Implementation | Runtime     | Install Command                                    |
| -------------- | ----------- | -------------------------------------------------- |
| Python         | UV (Astral) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

### Exit Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 0    | Allow operation                      |
| 0    | Ask (JSON output triggers dialog)    |
| 2    | Block operation                      |

### patterns.yaml Syntax

**YAML interprets certain characters as special syntax.** Always quote values containing:

| Character | YAML Meaning | Example Fix |
|-----------|--------------|-------------|
| `*` at start | Alias reference | `reason: "*.env files..."` |
| `&` at start | Anchor definition | `reason: "&& chained..."` |
| `:` followed by space | Key-value separator | `reason: "Note: this..."` |
| `#` | Comment | `pattern: "foo#bar"` |
| `@`, `` ` `` | Reserved | Quote if at start |

**Common mistake:**
```yaml
# WRONG - YAML interprets * as alias
reason: *.env file may contain secrets

# RIGHT - quoted string
reason: "*.env file may contain secrets"
```

---

## Testing

### Development Methodology: Red-Green-Refactor

All damage-control changes MUST follow red-green-refactor (TDD):

1. **Red** — Write a failing test, then **run it and confirm it actually fails**. If the test passes immediately, it proves nothing — fix the test or your assumptions before moving on
2. **Green** — Write the minimal code to make the test pass, then **run it and confirm it passes**
3. **Refactor** — Clean up while keeping tests green

**Why this matters for security hooks:** A passing test suite is the proof that patterns work. If you can't write a test for a behavior, you can't prove it's protected. A test you never ran red is a test you can't trust.

**Workflow:**
```bash
# 1. Write your test in claude/hooks/damage-control/tests/
# 2. Run it — CONFIRM it fails (red). If it passes, your test is wrong.
uv run pytest claude/hooks/damage-control/tests/test_your_file.py -v -k test_name

# 3. Implement the fix
# 4. Run it — CONFIRM it passes (green)
uv run pytest claude/hooks/damage-control/tests/test_your_file.py -v -k test_name

# 5. Run full suite — confirm no regressions
uv run pytest claude/hooks/damage-control/tests/ -v
```

### Running Tests

```bash
# Full unit test suite (pytest)
cd ~/.dotfiles
make test-damage-control-unit
# or directly:
uv run pytest claude/hooks/damage-control/tests/ -v

# Smoke tests (bats)
make test-damage-control
bats test/damage-control.bats

# Integration tests (Python test runner)
make test-damage-control-integration

# Test specific features
uv run test-damage-control.py --test-suite unwrap   # Shell unwrapping
uv run test-damage-control.py --test-suite git       # Git semantic analysis
uv run test-damage-control.py --test-suite logging   # Audit logging
uv run test-damage-control.py --test-suite all       # All features
```

### Test File Organization

| Test File | Covers |
|-----------|--------|
| `test_integration.py` | Git semantic + check_command integration |
| `test_git_semantic.py` | Git command analysis |
| `test_semantic_analysis.py` | Unwrapping, audit logging, end-to-end |
| `test_readonly_search.py` | Read-only search pipeline detection |
| `test_context_detection.py` | Context-aware relaxation |
| `test_exfil_patterns.py` | Data exfiltration patterns |
| `test_injection_detection.py` | Command injection detection |
| `test_ast_analyzer.py` | AST-based analysis |
| `test_sequence_detection.py` | Multi-step attack sequences |
| `test_log_rotate.py` | Log rotation utility |

### Manual Testing with Test Prompts

Use the test prompts in [test-prompts/](test-prompts/) to validate the hooks:

- `sentient_v1.md` - Tests `rm -rf` blocking (bashToolPatterns)
- `sentient_v2.md` - Tests `find -delete` blocking (noDeletePaths)
- `sentient_v3.md` - Tests ask patterns (SQL DELETE with ID)
- `sentient_v4.md` - Tests simple command blocking

Run a test:
```
/project:test-prompts/sentient_v1
```

---

## Related Files

- [cookbook/install_damage_control_ag_workflow.md](cookbook/install_damage_control_ag_workflow.md) - Installation workflow
- [cookbook/modify_damage_control_ag_workflow.md](cookbook/modify_damage_control_ag_workflow.md) - Modification workflow
- [cookbook/manual_control_damage_control_ag_workflow.md](cookbook/manual_control_damage_control_ag_workflow.md) - Manual guidance
- [cookbook/list_damage_controls.md](cookbook/list_damage_controls.md) - List all configurations
- [cookbook/test_damage_control.md](cookbook/test_damage_control.md) - Test all hooks
- [cookbook/view_audit_logs.md](cookbook/view_audit_logs.md) - View and analyze audit logs
- [cookbook/build_for_windows.md](cookbook/build_for_windows.md) - Add Windows patterns
