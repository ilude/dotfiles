---
name: shell-workflow
description: Shell script workflow guidelines. Activate when working with shell scripts (.sh), bash scripts, Makefiles, bats tests, or cross-platform scripting.
location: user
---

# Shell Script Workflow

## Related Documentation

- [CLI Development](cli-development.md) - CLI design principles and best practices
- [PowerShell](powershell.md) - Windows automation and scripting
- [Makefile Best Practices](makefile.md) - Build automation and task runners
- [Bats Testing](testing/bats.md) - Shell script testing framework
- [Cross-Platform Scripting](cross-platform.md) - Windows/WSL/Linux patterns
- [CLI Tools](tools.md) - Modern command-line utilities (rg, fd, bat, etc.)
- [WinGet Workflow](winget.md) - Windows package management with winget

---

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | shellcheck | `shellcheck *.sh` |
| Format | shfmt | `shfmt -w *.sh` |
| Security | shellharden | `shellharden --check *.sh` |
| POSIX check | checkbashisms | `checkbashisms *.sh` |
| Test | bats | `bats test/` |

---

## Shebang

Scripts MUST use the portable shebang:

```bash
#!/usr/bin/env bash
```

POSIX-only scripts MAY use `#!/bin/sh` when bash features are not needed.

---

## Strict Mode

All bash scripts MUST enable strict mode:

```bash
set -euo pipefail
```

| Flag | Meaning |
|------|---------|
| `-e` | Exit on error |
| `-u` | Error on undefined variables |
| `-o pipefail` | Fail on pipe errors |

---

## Variable Quoting

Variables MUST be quoted to prevent word splitting:

```bash
# Correct
echo "$variable"
cp "$source" "$destination"

# Incorrect
echo $variable
```

Arrays MUST use proper expansion:

```bash
"${array[@]}"     # Each element as separate word
"${array[*]}"     # All elements as single string
```

---

## Variable Naming

| Scope | Convention | Example |
|-------|------------|---------|
| Environment/Global | UPPER_CASE | `LOG_LEVEL`, `CONFIG_PATH` |
| Local/Script | lower_case | `file_count`, `temp_dir` |
| Constants | UPPER_CASE + readonly | `readonly MAX_RETRIES=3` |

---

## Test Syntax

In bash scripts, `[[ ]]` MUST be used over `[ ]`:

```bash
if [[ -f "$file" ]]; then
    echo "File exists"
fi

if [[ "$string" =~ ^[0-9]+$ ]]; then
    echo "Numeric"
fi
```

POSIX scripts MUST use `[ ]` for compatibility.

---

## Functions

Functions MUST use `local` for internal variables:

```bash
my_function() {
    local input="$1"
    local result=""

    result=$(process "$input")
    echo "$result"
}
```

Naming: snake_case, prefix private functions with underscore: `_helper_function`

---

## Temporary Files

Temporary files MUST be created with `mktemp`:

```bash
temp_file=$(mktemp)
temp_dir=$(mktemp -d)
```

Cleanup MUST be ensured with `trap`:

```bash
cleanup() {
    rm -f "$temp_file"
    rm -rf "$temp_dir"
}
trap cleanup EXIT
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Misuse (invalid arguments, missing dependencies) |

```bash
main() {
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <argument>" >&2
        exit 2
    fi

    if ! process_data "$1"; then
        echo "Error: Processing failed" >&2
        exit 1
    fi
}
```

---

## Error Handling

```bash
# Continue on optional failure
rm -f "$optional_file" || true

# Exit on critical failure
cd "$required_dir" || exit 1

# Custom error message
command_that_might_fail || {
    echo "Error: command failed" >&2
    exit 1
}
```

---

## POSIX vs Bash

| Feature | POSIX | Bash |
|---------|-------|------|
| Test syntax | `[ ]` | `[[ ]]` |
| Arrays | Not available | Supported |
| `local` | Not standard | Supported |
| `source` | Use `.` | Both work |
| Process substitution | Not available | `<(cmd)` |

---

## Input Validation

```bash
validate_input() {
    local input="$1"

    if [[ -z "$input" ]]; then
        echo "Error: Input cannot be empty" >&2
        return 1
    fi

    if [[ ! "$input" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "Error: Invalid characters" >&2
        return 1
    fi
}
```

---

## Command Substitution

Modern syntax MUST be used:

```bash
# Correct
result=$(command)

# Incorrect - MUST NOT use backticks
result=`command`
```

---

## Logging

```bash
log_info() {
    echo "[INFO] $*"
}

log_error() {
    echo "[ERROR] $*" >&2
}

log_debug() {
    [[ "${DEBUG:-0}" == "1" ]] && echo "[DEBUG] $*"
}
```

---

## Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "$0")"

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [options] <argument>

Options:
    -h, --help    Show this help message
    -v, --verbose Enable verbose output
EOF
}

main() {
    local verbose=0

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                usage
                exit 0
                ;;
            -v|--verbose)
                verbose=1
                shift
                ;;
            *)
                break
                ;;
        esac
    done

    if [[ $# -lt 1 ]]; then
        usage >&2
        exit 2
    fi

    # Script logic here
}

main "$@"
```

---

## Size Limit

Scripts SHOULD NOT exceed 100 lines (excluding comments/blanks).

When a script exceeds 100 lines:
- Refactor into smaller functions
- Consider converting to Python for maintainability
