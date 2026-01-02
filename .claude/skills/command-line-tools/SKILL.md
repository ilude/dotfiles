# Command Line Tools

Modern CLI tools available on all platforms (Windows, WSL, Linux).

## Activation

Activate when:
- Searching files or content
- Viewing file contents
- Navigating directories
- Monitoring system resources
- Processing JSON data
- Looking up command documentation

## Available Tools

### ripgrep (rg) - Fast Content Search

Faster than grep, respects .gitignore by default.

```bash
# Search for pattern in current directory
rg "pattern"

# Search specific file types
rg "TODO" --type py
rg "function" --type js

# Case insensitive
rg -i "error"

# Show context lines
rg -C 3 "pattern"      # 3 lines before and after
rg -B 2 -A 2 "pattern" # 2 before, 2 after

# Search hidden files and ignored files
rg --hidden --no-ignore "pattern"

# Count matches
rg -c "pattern"

# Files with matches only
rg -l "pattern"

# Fixed string (no regex)
rg -F "exact.match"

# Multiline search
rg -U "start.*\n.*end"
```

### fd - Fast File Finder

Faster than find, respects .gitignore, simpler syntax.

```bash
# Find files by name pattern
fd "pattern"
fd "\.py$"           # Python files
fd "test"            # Files containing "test"

# Find by extension
fd -e py             # .py files
fd -e js -e ts       # .js and .ts files

# Find directories only
fd -t d "src"

# Find files only
fd -t f "config"

# Include hidden files
fd -H "pattern"

# Include ignored files
fd -I "pattern"

# Execute command on results
fd -e py -x wc -l    # Count lines in each Python file
fd -e js -X prettier --write  # Format all JS files

# Exclude patterns
fd -E "node_modules" -E "*.min.js" "pattern"

# Search from specific directory
fd "pattern" /path/to/search
```

### bat - Better cat

Syntax highlighting, line numbers, git integration.

```bash
# View file with syntax highlighting
bat file.py

# Show line numbers (default)
bat -n file.py

# Show non-printable characters
bat -A file.py

# No paging (plain output)
bat --paging=never file.py

# Specific language highlighting
bat -l json data.txt

# Show only line range
bat --line-range 10:20 file.py

# Diff mode (shows git changes)
bat --diff file.py

# Multiple files
bat file1.py file2.py
```

### eza - Modern ls

Colorful, git-aware directory listings.

```bash
# Basic listing
eza

# Long format with details
eza -l

# Include hidden files
eza -la

# Tree view
eza --tree
eza --tree --level=2

# Git status integration
eza -l --git

# Sort by modified time
eza -l --sort=modified

# Group directories first
eza -l --group-directories-first

# Icons (if font supports)
eza -l --icons

# Human readable sizes
eza -lh
```

### fzf - Fuzzy Finder

Interactive filtering for any list.

```bash
# Find file interactively
fzf

# Pipe any command through fzf
cat file.txt | fzf
history | fzf

# Preview files while selecting
fzf --preview 'bat --color=always {}'

# Multi-select with Tab
fzf -m

# Search in specific directory
fd -t f | fzf

# Use with other commands
vim $(fzf)
cd $(fd -t d | fzf)

# Exact match (not fuzzy)
fzf -e
```

### zoxide - Smart cd

Learns your most used directories.

```bash
# Jump to best match
z projects
z dotfiles

# Interactive selection
zi

# Add directory to database
zoxide add /path/to/dir

# List known directories
zoxide query -l

# Remove directory from database
zoxide remove /path/to/dir
```

### jq - JSON Processor

Query and transform JSON data.

```bash
# Pretty print JSON
cat file.json | jq .

# Extract field
cat file.json | jq '.name'
cat file.json | jq '.users[0].email'

# Filter array
cat file.json | jq '.items[] | select(.active == true)'

# Transform output
cat file.json | jq '{name: .title, count: .items | length}'

# Raw output (no quotes)
cat file.json | jq -r '.name'

# Multiple filters
cat file.json | jq '.name, .email'

# Compact output
cat file.json | jq -c '.items[]'

# Create JSON from scratch
echo '{}' | jq --arg name "test" '. + {name: $name}'
```

### btop - System Monitor

Interactive system resource monitor.

```bash
# Launch interactive monitor
btop

# Update interval in ms
btop -t 500
```

### tldr - Simplified Man Pages

Community-maintained command examples.

```bash
# Get quick examples
tldr tar
tldr git-rebase
tldr docker-compose

# Update local cache
tldr --update

# List all available pages
tldr --list
```

## Platform Notes

### Ubuntu/WSL Aliases

Ubuntu packages some tools with different names:
- `fd-find` → Use `fd` (aliased in wsl-packages)
- `batcat` → Use `bat` (aliased in wsl-packages)

### Windows

All tools available via winget in `install.ps1`. Some notes:
- ripgrep uses MSVC build (`BurntSushi.ripgrep.MSVC`)
- btop uses btop4win port (`aristocratos.btop4win`)
- tldr uses tlrc implementation (`tldr-pages.tlrc`)

## Common Workflows

### Find and Edit Files
```bash
# Find file and open in editor
code $(fd -t f "config" | fzf)
```

### Search and Replace Preview
```bash
# Find all occurrences before replacing
rg "oldPattern" --files-with-matches | xargs bat
```

### Explore Project Structure
```bash
# Tree with git status
eza --tree --level=3 --git

# Find large files
fd -t f -x du -h {} | sort -rh | head -20
```

### JSON API Exploration
```bash
# Fetch and explore API response
curl -s https://api.example.com/data | jq '.results[] | {id, name}'
```

### Git-Aware Search
```bash
# Search only tracked files
rg "pattern"  # respects .gitignore by default

# Search including ignored files
rg --no-ignore "pattern"
```
