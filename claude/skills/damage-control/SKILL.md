---
name: damage-control
description: |
  Install, configure, and manage the Claude Code Damage Control security hooks system.
  Trigger keywords: damage control, security hooks, protected paths, blocked commands, install security, modify protection settings.
---

# Damage Control Skill

Defense-in-depth protection system for Claude Code. Blocks dangerous commands and protects sensitive files via PreToolUse hooks.

## Overview

This skill helps users deploy and manage the Damage Control security system, which provides:

- **Command Pattern Blocking**: Blocks dangerous bash commands (rm -rf, git reset --hard, etc.)
- **Ask Patterns**: Triggers confirmation dialog for risky-but-valid operations (`ask: true`)
- **Path Protection Levels**:
  - `zeroAccessPaths` - No access at all (secrets/credentials)
  - `readOnlyPaths` - Read allowed, modifications blocked
  - `noDeletePaths` - All operations except delete
- **Shell Unwrapping**: Detects shell wrapper invocations (bash -c, sh -c) and analyzes inner commands
- **Git Semantic Analysis**: Understands git command semantics (force push, hard reset, reflog deletion)
- **Audit Logging**: Complete JSON logs of all decisions for compliance and analysis

## Skill Structure

```
.claude/skills/damage-control/
├── SKILL.md                     # This file
├── patterns.yaml                # Shared security patterns (single source of truth)
├── cookbook/
│   ├── install_damage_control_ag_workflow.md
│   ├── modify_damage_control_ag_workflow.md
│   ├── manual_control_damage_control_ag_workflow.md
│   ├── list_damage_controls.md
│   ├── test_damage_control.md
│   ├── view_audit_logs.md       # New: Audit log analysis guide
│   └── build_for_windows.md
├── hooks/
│   ├── damage-control-python/   # Python/UV implementation
│   │   ├── bash-tool-damage-control.py
│   │   ├── edit-tool-damage-control.py
│   │   ├── write-tool-damage-control.py
│   │   ├── python-settings.json
│   │   ├── test-damage-control.py
│   │   └── tests/               # Comprehensive test suite
│   │       ├── test_integration.py
│   │       ├── test_git_semantic.py
│   │       └── conftest.py
│   └── damage-control-typescript/  # Bun/TypeScript implementation
│       ├── bash-tool-damage-control.ts
│       ├── edit-tool-damage-control.ts
│       ├── write-tool-damage-control.ts
│       ├── typescript-settings.json
│       └── test-damage-control.ts
└── test-prompts/                # Test prompts for validation
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
        ├── bash-tool-damage-control.py (or .ts)
        ├── edit-tool-damage-control.py
        └── write-tool-damage-control.py
```

### Project Hooks
```
<agents current working directory>/
└── .claude/
    ├── settings.json                  # Hook configuration (shared)
    └── hooks/
        └── damage-control/
            ├── patterns.yaml
            ├── bash-tool-damage-control.py (or .ts)
            ├── edit-tool-damage-control.py
            └── write-tool-damage-control.py
```

### Project Personal Hooks
```
<agents current working directory>/
└── .claude/
    ├── settings.local.json            # Personal overrides (gitignored)
    └── hooks/
        └── damage-control/
            ├── patterns.yaml
            ├── bash-tool-damage-control.py (or .ts)
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

Example: `bash -c 'rm -rf /tmp/data'` → extracts `rm -rf /tmp/data` → blocks

### Git Semantic Analysis

Understands git command structure and semantics:
- **Force operations**: `git push --force`, `git push --force-with-lease`
- **Destructive history operations**: `git reset --hard`, `git revert --no-edit`
- **Reflog deletion**: `git reflog delete`, `git reflog expire`
- **Checkout forced operations**: `git checkout -f`
- **Conditional blocking**: Respects `git config safe.directoryRefresh` and `push.default` settings

Example: `git push --force` → matches git-force pattern → blocks

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
- "add ~/.credentials to zero access paths" → Edit patterns.yaml directly
- "block the command 'npm publish'" → Add pattern to bashToolPatterns
- "make /var/log read only" → Add to readOnlyPaths

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

### Runtime Requirements

| Implementation | Runtime     | Install Command                                             |
| -------------- | ----------- | ----------------------------------------------------------- |
| Python         | UV (Astral) | `curl -LsSf https://astral.sh/uv/install.sh \| sh`          |
| TypeScript     | Bun         | `curl -fsSL https://bun.sh/install \| bash && bun add yaml` |

### Exit Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 0    | Allow operation                      |
| 0    | Ask (JSON output triggers dialog)    |
| 2    | Block operation                      |

---

## Testing

### Smoke Tests (Quick Validation)

Fast validation of hook installation and basic functionality:
```bash
cd ~/.dotfiles
make test-damage-control
```

Individual smoke tests:
```bash
bats test/damage-control.bats
```

### Unit Tests (Comprehensive)

94 pytest tests covering all edge cases and features:
```bash
cd ~/.dotfiles
make test-damage-control-unit
# or directly:
uv run pytest claude/hooks/damage-control/tests/ -v
```

### Integration Tests (Full Test Runner)

42 integration test cases via the Python test runner:
```bash
cd ~/.dotfiles
make test-damage-control-integration
```

Test specific features:
```bash
# Test shell unwrapping
uv run test-damage-control.py --test-suite unwrap

# Test git semantic analysis
uv run test-damage-control.py --test-suite git

# Test audit logging
uv run test-damage-control.py --test-suite logging

# Test all features
uv run test-damage-control.py --test-suite all
```

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
- [hooks/damage-control-python/](hooks/damage-control-python/) - Python implementation
- [hooks/damage-control-typescript/](hooks/damage-control-typescript/) - TypeScript implementation
