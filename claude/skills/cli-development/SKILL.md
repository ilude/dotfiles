---
name: cli-development
description: Best practices for building CLI applications across languages. Covers CLI design principles (Unix philosophy, command structure, subcommands vs flags), argument parsing (required/optional args, flags, environment variables, config files, precedence), user interface (help text, version info, progress indicators, color output, interactive prompts), output formatting (human-readable vs machine-readable JSON/YAML, exit codes), error handling (clear messages, suggestions, debug mode), cross-platform considerations (paths, line endings, terminal capabilities), testing strategies (integration tests, output verification, exit codes), documentation (README, man pages, built-in help), and language-specific libraries. Activate when working with CLI applications, command-line tools, argument parsing, CLI utilities, argument handling, commands, subcommands, CLI frameworks, or building command-line interfaces.
---

# CLI Development Guidelines

Best practices for designing and implementing command-line interface (CLI) applications.

## CLI Design Principles

### Unix Philosophy

- **Do one thing well** - Single, well-defined responsibility per command
- **Make it composable** - Design output to work as input to other programs
- **Handle text streams** - Work with stdin/stdout/stderr
- **Exit cleanly** - Use appropriate exit codes (0 for success, non-zero for errors)
- **Fail fast** - Detect and report problems immediately
- **Be scriptable** - All functionality accessible non-interactively

### Command Structure

#### Verb-Noun Pattern

```
git add <file>           # verb: add, noun: file
docker run <image>       # verb: run, noun: image
npm install <package>    # verb: install, noun: package
```

#### Subcommands vs Flags

**Use subcommands when:**
- Commands have distinct behaviors or workflows
- Different sets of options apply to different operations

**Use flags when:**
- Modifying behavior of a single operation
- Toggling optional features

```bash
# Subcommand with flags
git branch --delete <name>

# Flags modifying behavior
ls --color --all
```

#### Command Hierarchy

Keep hierarchy shallow (max 2-3 levels):

```bash
# Good: clear, discoverable
aws s3 ls
aws ec2 describe-instances

# Avoid: too deep
cloud provider storage list all buckets
```

## Argument Parsing

### Argument Types

| Type | Description | Example |
|------|-------------|---------|
| Positional (required) | Primary input/object | `cp <source> <dest>` |
| Positional (optional) | With defaults | `npm install [dir]` |
| Short flags | Frequent operations | `-l`, `-r`, `-v` |
| Long flags | Self-documenting | `--verbose`, `--recursive` |

### Flag Conventions

```bash
# Boolean flags
--verbose              # boolean true/false
--color=always         # explicit value

# Flags with values (accept both styles)
--output file.txt      # space-separated
--output=file.txt      # equals-separated
```

### Configuration Precedence

Priority (high to low):
1. **Command-line flags** - Most explicit
2. **Environment variables** - Applies to multiple invocations
3. **Configuration file** - Shared settings
4. **Built-in defaults** - Fallback

```bash
# Flag overrides env var
export TIMEOUT=5
tool --timeout 10       # Uses 10

# Env var overrides config file
export TIMEOUT=5
tool                    # Uses 5 from env
```

### Environment Variables

Convention: `SCREAMING_SNAKE_CASE`

```bash
export DEBUG=1
export LOG_LEVEL=debug
export API_TOKEN=secret
```

### Configuration Files

**Location convention:**
- Linux/macOS: `~/.config/app/config.yaml`
- Windows: `%APPDATA%\App\config.yaml`
- All platforms: `./config.yaml` (highest priority)

**Format preference:** YAML > TOML > JSON > INI

## User Interface

### Help Text Structure

```
$ tool --help
Usage: tool [OPTIONS] COMMAND [ARGS]...

Brief description of what this tool does.

Options:
  -v, --verbose    Increase output verbosity
  -q, --quiet      Suppress non-error output
  -h, --help       Show this message and exit
  --version        Show version and exit

Commands:
  add              Add a new item
  list             List all items
  delete           Delete an item

Examples:
  tool add myitem
  tool list --format json
```

### Version Information

```bash
$ tool --version
tool 1.2.3
```

### Progress Indicators

- **Spinners** - For indeterminate progress
- **Progress bars** - For determinate progress
- Disable in non-interactive environments (piped output)
- Never output progress to stdout (use stderr)
- Respect `--no-progress` flag

### Color Output

Support `--color` with values: `always`, `auto`, `never`

```bash
NO_COLOR=1 tool       # Disable via environment
FORCE_COLOR=1 tool    # Force color
```

### Interactive Prompts

- Ask for confirmation before destructive operations
- Provide sensible defaults
- Allow bypassing with `--force` flag
- Never prompt in non-interactive contexts

## Output Formatting

### Human-Readable (Default)

```
Name          Status    Modified
────────────────────────────────
Project A     Active    2 hours ago
Project B     Inactive  3 days ago
```

### Machine-Readable

Support `--format` with options: `json`, `yaml`, `csv`

```bash
tool list --format json
tool list --format csv
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Misuse of command syntax |
| 64 | Bad input data |
| 66 | No input file |
| 77 | Permission denied |
| 78 | Configuration error |
| 130 | Terminated by Ctrl+C |

## Error Handling

### Clear Error Messages

```bash
# Good
Error: --priority must be a number (1-10), got 'invalid'

# Bad
Error: Invalid argument

# Good
Error: Item 'nonexistent' not found. Use 'tool list' to see available items.
```

**Format:** `Error: [what happened]. [How to fix it].`

### Suggestions

Provide actionable suggestions with typo corrections:

```
Error: Unknown command 'lst'. Did you mean 'list'?
```

### Debug Mode

```bash
# Normal: user-friendly message
$ tool run
Error: Connection failed
Use --debug to see details

# Debug: full traceback
$ tool --debug run
Error: Connection failed
Traceback (most recent call last):
  ...
```

## Cross-Platform Considerations

### Path Handling

```python
# Use pathlib (Python)
from pathlib import Path
config_path = Path.home() / '.config' / 'app' / 'config.yaml'

# Use os.path for compatibility
import os
config_path = os.path.join(os.path.expanduser('~'), '.config', 'app')
```

```javascript
// Node.js
const path = require('path');
const os = require('os');
const configPath = path.join(os.homedir(), '.config', 'app', 'config.yaml');
```

### Terminal Detection

```python
import sys
import os

def supports_color():
    if os.getenv('NO_COLOR'):
        return False
    if os.getenv('FORCE_COLOR'):
        return True
    return sys.stdout.isatty()
```

## Testing CLI Applications

### Integration Tests

Test the complete CLI, not just functions:

```python
import subprocess

def test_list_command():
    result = subprocess.run(
        ['tool', 'list', '--format', 'json'],
        capture_output=True, text=True
    )
    assert result.returncode == 0
```

### Exit Code Verification

```python
def test_invalid_command():
    result = subprocess.run(['tool', 'invalid'], capture_output=True)
    assert result.returncode != 0

def test_help_success():
    result = subprocess.run(['tool', '--help'], capture_output=True)
    assert result.returncode == 0
```

## Documentation

### README Structure

1. Brief description
2. Installation instructions
3. Basic usage with examples
4. Commands and options reference
5. Configuration (precedence, env vars, file format)
6. Troubleshooting common issues

### Built-in Help

- Comprehensive `--help` at every level
- Per-command help with examples
- Link to detailed documentation

## Quick Reference Tables

### Common Patterns

| Pattern | Example |
|---------|---------|
| Global options | `tool --verbose add item` |
| Subcommand options | `tool add item --priority 5` |
| Piping | `tool list --format json \| jq '.[]'` |
| Force flag | `tool delete --force` |

### Standard Flags

| Flag | Purpose |
|------|---------|
| `-h, --help` | Show help |
| `-v, --verbose` | Verbose output |
| `-q, --quiet` | Suppress output |
| `--version` | Show version |
| `--debug` | Debug mode |
| `--config FILE` | Config file path |
| `--format FMT` | Output format |
| `--force` | Skip confirmations |
| `--dry-run` | Show what would happen |

## Language-Specific Implementation

For detailed patterns with code examples, see the reference docs:

- **Python**: [references/python-cli.md](references/python-cli.md) - Click, Typer, Argparse
- **Node.js**: [references/nodejs-cli.md](references/nodejs-cli.md) - Commander, Yargs, Oclif
- **Go**: [references/go-cli.md](references/go-cli.md) - Cobra
- **Rust**: [references/rust-cli.md](references/rust-cli.md) - Clap

---

**Note:** For project-specific CLI patterns, check `.claude/CLAUDE.md` in the project directory.
