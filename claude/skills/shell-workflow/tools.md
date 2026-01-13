# Command Line Tools

Modern CLI tools available on all platforms (Windows, WSL, Linux).

## ripgrep (rg) - Fast Content Search

Faster than grep, respects .gitignore by default.

```bash
rg "pattern"                    # Search current directory
rg "TODO" --type py             # Search Python files
rg -i "error"                   # Case insensitive
rg -C 3 "pattern"               # 3 lines context
rg -l "pattern"                 # Files with matches only
rg -F "exact.match"             # Fixed string (no regex)
rg --hidden --no-ignore "pat"   # Include hidden/ignored
```

---

## fd - Fast File Finder

Faster than find, respects .gitignore, simpler syntax.

```bash
fd "pattern"                    # Find by name pattern
fd -e py                        # .py files only
fd -t d "src"                   # Directories only
fd -t f "config"                # Files only
fd -H "pattern"                 # Include hidden
fd -e py -x wc -l               # Execute on each result
fd -E "node_modules" "pattern"  # Exclude patterns
```

---

## bat - Better cat

Syntax highlighting, line numbers, git integration.

```bash
bat file.py                     # View with highlighting
bat --paging=never file.py      # No pager
bat -l json data.txt            # Force language
bat --line-range 10:20 file.py  # Line range only
bat --diff file.py              # Show git changes
```

---

## eza - Modern ls

Colorful, git-aware directory listings.

```bash
eza                             # Basic listing
eza -la                         # Long with hidden
eza --tree --level=2            # Tree view
eza -l --git                    # Git status
eza -l --sort=modified          # Sort by time
```

---

## fzf - Fuzzy Finder

Interactive filtering for any list.

```bash
fzf                             # Find file interactively
cat file.txt | fzf              # Filter any input
fzf --preview 'bat {}'          # Preview while selecting
fzf -m                          # Multi-select with Tab
vim $(fzf)                      # Use selection
```

---

## zoxide - Smart cd

Learns your most used directories.

```bash
z projects                      # Jump to best match
zi                              # Interactive selection
zoxide query -l                 # List known dirs
```

---

## jq - JSON Processor

```bash
cat file.json | jq .            # Pretty print
cat file.json | jq '.name'      # Extract field
cat file.json | jq -r '.name'   # Raw output (no quotes)
cat file.json | jq '.items[] | select(.active == true)'
```

---

## btop - System Monitor

```bash
btop                            # Launch monitor
```

---

## tldr - Simplified Man Pages

```bash
tldr tar                        # Quick examples
tldr --update                   # Update cache
```

---

## Platform Notes

### Ubuntu/WSL

Some tools have different package names:
- `fd-find` -> alias to `fd`
- `batcat` -> alias to `bat`

### Windows

All available via winget. Some use different implementations:
- btop: `aristocratos.btop4win`
- tldr: `tldr-pages.tlrc`

---

## Common Workflows

```bash
# Find and edit
code $(fd -t f "config" | fzf)

# Search before replace
rg "oldPattern" --files-with-matches | xargs bat

# Explore project
eza --tree --level=3 --git

# API exploration
curl -s https://api.example.com/data | jq '.results[] | {id, name}'
```
