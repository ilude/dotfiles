---
name: cross-platform-shell
description: Cross-platform shell scripting for Windows (Git Bash/MSYS2), WSL, and Linux. Covers platform detection, path handling, symlink vs junction, CRLF prevention, and portable patterns. Activate when working with scripts that must run on multiple platforms, OSTYPE checks, Windows path handling, or WSL interop.
---

# Cross-Platform Shell Scripting

Patterns for shell scripts that work on Windows (Git Bash/MSYS2), WSL, and Linux.

## Platform Detection

### Check Windows (Git Bash / MSYS2)

```bash
is_windows() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]
}
```

### Check WSL

```bash
is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}
```

### Check Native Linux

```bash
is_linux() {
    [[ "$OSTYPE" == "linux-gnu"* ]] && ! is_wsl
}
```

### Check macOS

```bash
is_macos() {
    [[ "$OSTYPE" == "darwin"* ]]
}
```

### Combined Detection

```bash
detect_platform() {
    if is_windows; then
        echo "windows"
    elif is_wsl; then
        echo "wsl"
    elif is_macos; then
        echo "macos"
    else
        echo "linux"
    fi
}
```

---

## Path Handling

### Windows Home Path Variations

| Context | Path Format |
|---------|-------------|
| Git Bash | `/c/Users/username` |
| WSL | `/mnt/c/Users/username` |
| PowerShell | `C:\Users\username` |
| Cygwin | `/cygdrive/c/Users/username` |

### Normalize to Tilde

```bash
# Git Bash: /c/Users/mglenn/.dotfiles → ~/.dotfiles
normalize_path() {
    local path="$1"
    local win_home

    if is_windows; then
        win_home="/c/Users/$USER"
        echo "${path/#$win_home/~}"
    elif is_wsl; then
        win_home="/mnt/c/Users/$USER"
        echo "${path/#$win_home/~}"
    else
        echo "${path/#$HOME/~}"
    fi
}
```

### Get Windows Home in WSL

```bash
get_windows_home() {
    if is_wsl; then
        local win_user
        win_user=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
        echo "/mnt/c/Users/$win_user"
    elif is_windows; then
        echo "/c/Users/$USER"
    fi
}
```

### Convert WSL Path to Windows

```bash
wsl_to_windows_path() {
    local path="$1"
    if is_wsl && command -v wslpath >/dev/null 2>&1; then
        wslpath -w "$path"
    else
        echo "$path"
    fi
}
```

---

## Symlinks vs Junctions

### The Problem

- **Linux/macOS**: Use `ln -s` for symlinks
- **Windows**: Symlinks require admin; junctions (`mklink /J`) don't

### Cross-Platform Link Creation

```bash
create_link() {
    local target="$1"  # What to link to
    local link="$2"    # Where to create link

    if [[ -e "$link" ]]; then
        echo "Already exists: $link"
        return 0
    fi

    if is_windows; then
        # Convert to Windows paths for mklink
        local win_target win_link
        win_target=$(cygpath -w "$target")
        win_link=$(cygpath -w "$link")

        # Use junction (no admin required)
        cmd //c "mklink /J \"$win_link\" \"$win_target\"" >/dev/null
    else
        ln -s "$target" "$link"
    fi
}
```

### Check Link Exists

```bash
link_exists() {
    local path="$1"

    if is_windows; then
        # Junctions appear as directories, not symlinks
        [[ -e "$path" ]]
    else
        [[ -L "$path" ]]
    fi
}
```

### Junction Limitations

- Junctions only work for directories (not files)
- Junctions in temp directories may fail
- Use file copy for single files on Windows

---

## CRLF Prevention

### The Problem

Windows tools may save files with CRLF (`\r\n`), which breaks shell scripts:
```
-bash: ./script: /bin/bash^M: bad interpreter
```

### .gitattributes

Force LF for all shell scripts:

```gitattributes
# Shell scripts - MUST be LF
*.sh text eol=lf
*.bash text eol=lf
*.bats text eol=lf
.bashrc text eol=lf
.zshrc text eol=lf
.profile text eol=lf
.bash_profile text eol=lf
.zprofile text eol=lf
install text eol=lf
*-setup text eol=lf

# Batch/PowerShell - can be CRLF
*.bat text eol=crlf
*.cmd text eol=crlf
*.ps1 text eol=crlf
```

### Pre-flight Check

```bash
check_crlf() {
    if command -v file >/dev/null 2>&1; then
        local scripts=(".bashrc" ".zshrc" "install")
        for script in "${scripts[@]}"; do
            if [[ -f "$script" ]] && file "$script" | grep -q CRLF; then
                echo "ERROR: CRLF detected in $script"
                echo "Fix: dos2unix $script"
                return 1
            fi
        done
    fi
    return 0
}
```

### Fix CRLF

```bash
# Single file
dos2unix script.sh

# Or with sed
sed -i 's/\r$//' script.sh

# Or with tr
tr -d '\r' < script.sh > script.sh.tmp && mv script.sh.tmp script.sh
```

---

## Temporary Directories

### Platform Differences

| Platform | Default Temp |
|----------|--------------|
| Linux | `/tmp` |
| macOS | `/var/folders/...` (via `$TMPDIR`) |
| Git Bash | `/tmp` (maps to `C:\Users\...\AppData\Local\Temp`) |
| WSL | `/tmp` |

### Portable Temp Directory

```bash
get_temp_dir() {
    if [[ -n "$TMPDIR" ]]; then
        echo "$TMPDIR"
    elif [[ -d "/tmp" ]]; then
        echo "/tmp"
    else
        echo "."
    fi
}

# Create temp file/dir
temp_file=$(mktemp)
temp_dir=$(mktemp -d)
```

---

## Command Availability

### Check Command Exists

```bash
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Usage
if command_exists git; then
    git status
fi
```

### Platform-Specific Commands

```bash
open_url() {
    local url="$1"

    if is_windows; then
        start "$url"
    elif is_wsl; then
        cmd.exe /c start "$url" 2>/dev/null
    elif is_macos; then
        open "$url"
    else
        xdg-open "$url" 2>/dev/null || echo "Open: $url"
    fi
}

copy_to_clipboard() {
    local text="$1"

    if is_windows || is_wsl; then
        echo -n "$text" | clip.exe
    elif is_macos; then
        echo -n "$text" | pbcopy
    elif command_exists xclip; then
        echo -n "$text" | xclip -selection clipboard
    fi
}
```

---

## SSH and Git

### SSH Key Paths

```bash
get_ssh_dir() {
    if is_wsl; then
        # May want Windows SSH keys
        local win_home
        win_home=$(get_windows_home)
        if [[ -d "$win_home/.ssh" ]]; then
            echo "$win_home/.ssh"
            return
        fi
    fi
    echo "$HOME/.ssh"
}
```

### Git Config Locations

```bash
# Global config
if is_windows; then
    # Git Bash uses Windows home
    git_config="$HOME/.gitconfig"
else
    git_config="$HOME/.gitconfig"
fi
```

---

## Portable Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail

# Platform detection
is_windows() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]
}

is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

# Main logic with platform handling
main() {
    echo "Running on: $(uname -s)"

    if is_windows; then
        echo "Windows (Git Bash/MSYS2)"
        # Windows-specific logic
    elif is_wsl; then
        echo "WSL"
        # WSL-specific logic
    else
        echo "Linux/macOS"
        # Unix logic
    fi
}

main "$@"
```

---

## Known Regression Areas

### Prompt Format Display

The shell prompt (`~/.dotfiles[main]>`) is a **frequent regression point**. After ANY changes to:
- `.zshrc`, `.bashrc`, `.zprofile`, `.profile`
- Prompt-related functions
- Path normalization code

**Verify these cases work:**

| Platform | In Home Dir | In Git Repo | Expected Prompt |
|----------|-------------|-------------|-----------------|
| Git Bash | `~/.dotfiles` | yes | `~/.dotfiles[main]>` |
| WSL | `/mnt/c/Users/name/.dotfiles` | yes | `~/.dotfiles[main]>` |
| Linux | `~/.dotfiles` | yes | `~/.dotfiles[main]>` |

**Common failures:**
- Shows `/mnt/c/Users/...` instead of `~/...`
- Shows `/c/Users/...` instead of `~/...`
- Missing or wrong bracket colors

**Run prompt tests after shell config changes:** `bats test/prompt_format.bats`

---

## Git Bash Startup Order

Understanding the initialization order is critical for debugging shell issues on Windows.

### Login Shell (git-bash.exe)

```
1. /etc/profile
   ├── Sets PATH, MSYSTEM, MINGW_MOUNT_POINT
   ├── Defines profile_d() function
   ├── Sources /etc/profile.d/*.sh (in LC_COLLATE=C order):
   │   ├── aliases.sh      - Default aliases
   │   ├── bash_profile.sh - Creates ~/.bash_profile if missing
   │   ├── env.sh          - Environment setup
   │   ├── git-prompt.sh   - Sets PS1 with __git_ps1, stores MSYS2_PS1
   │   ├── lang.sh         - Locale settings
   │   └── perlbin.sh      - Perl paths
   └── Sources /etc/bash.bashrc

2. /etc/bash.bashrc
   ├── Uses MSYS2_PS1 if set (from git-prompt.sh)
   └── Sets default PS1 if not exported

3. ~/.bash_profile (USER FILE)
   └── Typically sources ~/.bashrc or execs to zsh
```

### Non-Login Shell (VS Code terminal, subshells, Claude Code)

```
1. /etc/bash.bashrc
   ├── Checks for MSYS2_PS1 from parent environment
   └── Last line: shopt -q login_shell || . /etc/profile.d/git-prompt.sh
       ↑ Sources git-prompt.sh for non-login shells!

2. ~/.bashrc (USER FILE)
```

### Key Files

| File | Purpose |
|------|---------|
| `/etc/profile` | System login shell init, PATH setup, sources profile.d |
| `/etc/bash.bashrc` | System interactive shell init |
| `/etc/profile.d/git-prompt.sh` | Sets PS1 with backtick __git_ps1, stores MSYS2_PS1 |
| `/mingw64/share/git/completion/git-prompt.sh` | Full __git_ps1 function (21KB) |
| `~/.bash_profile` | User login shell (runs after /etc/profile) |
| `~/.bashrc` | User interactive shell (runs after /etc/bash.bashrc) |

### The Backtick PS1 Issue

The system git-prompt.sh sets PS1 using backtick command substitution:

```bash
PS1="$PS1"'`__git_ps1`'   # Evaluated on each prompt
```

This is stored in MSYS2_PS1 and can leak into subshells. If your ~/.bashrc uses PROMPT_COMMAND to rebuild PS1, it overrides this. But tools capturing shell state between /etc/bash.bashrc and ~/.bashrc may see the backtick version.

**Workaround** - reset PS1 early in ~/.bashrc:

```bash
# Clear backtick-based PS1 before it can be captured
PS1='$ '
unset MSYS2_PS1
```

### MSYS2 vs Git Bash HOME

| Shell | Default HOME |
|-------|--------------|
| Git Bash | `/c/Users/username` (Windows home) |
| MSYS2 zsh | `/home/username` (MSYS2 home) |

When exec'ing from Git Bash to MSYS2 zsh, explicitly set HOME:

```bash
exec env HOME="$(cygpath -u "$USERPROFILE")" ZDOTDIR="$(cygpath -u "$USERPROFILE")" zsh -l
```

---

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| `bad interpreter: ^M` | CRLF line endings | `dos2unix script.sh` |
| Symlink requires admin | Windows symlink restrictions | Use junction (`mklink /J`) |
| Path not found | `/c/` vs `/mnt/c/` confusion | Use platform detection |
| `command not found` | Different tool names | Check with `command -v` first |
| Temp file issues | Junctions fail in temp dirs | Use file copy instead |
| `$HOME` wrong | WSL vs Windows home | Explicitly detect Windows home |
| Backtick PS1 in subshells | System git-prompt.sh | Reset PS1 early in ~/.bashrc |
| MSYS2 zsh wrong HOME | Different HOME defaults | Pass HOME via env in exec |
