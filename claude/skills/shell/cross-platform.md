# Cross-Platform Shell Scripting

Patterns for shell scripts that work on Windows (Git Bash/MSYS2), WSL, and Linux.

## Platform Detection

```bash
is_windows() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]
}

is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

is_linux() {
    [[ "$OSTYPE" == "linux-gnu"* ]] && ! is_wsl
}

is_macos() {
    [[ "$OSTYPE" == "darwin"* ]]
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

---

## Symlinks vs Junctions

- **Linux/macOS**: Use `ln -s` for symlinks
- **Windows**: Symlinks require admin; junctions (`mklink /J`) don't

```bash
create_link() {
    local target="$1"
    local link="$2"

    if [[ -e "$link" ]]; then
        return 0
    fi

    if is_windows; then
        local win_target win_link
        win_target=$(cygpath -w "$target")
        win_link=$(cygpath -w "$link")
        cmd //c "mklink /J \"$win_link\" \"$win_target\"" >/dev/null
    else
        ln -s "$target" "$link"
    fi
}

link_exists() {
    local path="$1"
    if is_windows; then
        [[ -e "$path" ]]  # Junctions appear as directories
    else
        [[ -L "$path" ]]
    fi
}
```

**Junction limitations:** Only work for directories; may fail in temp directories.

---

## CRLF Prevention

Windows tools may save files with CRLF (`\r\n`), which breaks shell scripts:
```
-bash: ./script: /bin/bash^M: bad interpreter
```

### .gitattributes

```gitattributes
*.sh text eol=lf
*.bash text eol=lf
*.bats text eol=lf
.bashrc text eol=lf
.zshrc text eol=lf
install text eol=lf

# Windows files can be CRLF
*.bat text eol=crlf
*.ps1 text eol=crlf
```

### Fix CRLF

```bash
dos2unix script.sh
# Or
sed -i 's/\r$//' script.sh
```

---

## Platform-Specific Commands

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
        xdg-open "$url" 2>/dev/null
    fi
}

copy_to_clipboard() {
    local text="$1"
    if is_windows || is_wsl; then
        echo -n "$text" | clip.exe
    elif is_macos; then
        echo -n "$text" | pbcopy
    elif command -v xclip >/dev/null; then
        echo -n "$text" | xclip -selection clipboard
    fi
}
```

---

## Git Bash Startup Order

### Login Shell (git-bash.exe)

```
1. /etc/profile -> sources /etc/profile.d/*.sh
2. /etc/bash.bashrc
3. ~/.bash_profile
```

### Non-Login Shell (VS Code, subshells)

```
1. /etc/bash.bashrc
2. ~/.bashrc
```

### MSYS2 vs Git Bash HOME

| Shell | Default HOME |
|-------|--------------|
| Git Bash | `/c/Users/username` |
| MSYS2 zsh | `/home/username` |

When exec'ing to MSYS2 zsh, explicitly set HOME:

```bash
exec env HOME="$(cygpath -u "$USERPROFILE")" ZDOTDIR="$(cygpath -u "$USERPROFILE")" zsh -l
```

---

## Portable Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail

is_windows() {
    [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]
}

is_wsl() {
    [[ -n "$WSL_DISTRO_NAME" ]] || [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]
}

main() {
    if is_windows; then
        # Windows-specific logic
    elif is_wsl; then
        # WSL-specific logic
    else
        # Unix logic
    fi
}

main "$@"
```

---

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| `bad interpreter: ^M` | CRLF line endings | `dos2unix script.sh` |
| Symlink requires admin | Windows restriction | Use junction (`mklink /J`) |
| Path not found | `/c/` vs `/mnt/c/` | Platform detection |
| `$HOME` wrong | WSL vs Windows | Explicit Windows home detection |
| Backtick PS1 in subshells | System git-prompt.sh | Reset PS1 early in ~/.bashrc |
