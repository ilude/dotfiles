#!/bin/bash
# SessionStart hook: warn about repo sync status and uncommitted changes
# stdout → Claude context, /dev/tty → user terminal (if available)

# Skip if not in a git repo
git rev-parse --is-inside-work-tree &>/dev/null || exit 0

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || exit 0
warnings=()

# --- Check for uncommitted local changes ---
staged=$(git diff --cached --name-only 2>/dev/null | wc -l)
unstaged=$(git diff --name-only 2>/dev/null | wc -l)
untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l)

if [[ "$staged" -gt 0 || "$unstaged" -gt 0 || "$untracked" -gt 0 ]]; then
    parts=()
    [[ "$staged" -gt 0 ]] && parts+=("$staged staged")
    [[ "$unstaged" -gt 0 ]] && parts+=("$unstaged modified")
    [[ "$untracked" -gt 0 ]] && parts+=("$untracked untracked")
    summary=$(IFS=', '; echo "${parts[*]}")
    warnings+=("Uncommitted changes on '$branch': $summary. Consider committing before starting new work.")
fi

# --- Check if branch is behind remote ---
# Fetch latest remote state (quiet, with timeout to avoid hanging)
timeout 10 git fetch --quiet 2>/dev/null

upstream=$(git rev-parse --abbrev-ref "@{upstream}" 2>/dev/null)
if [[ -n "$upstream" ]]; then
    local_hash=$(git rev-parse HEAD 2>/dev/null)
    remote_hash=$(git rev-parse "$upstream" 2>/dev/null)

    if [[ -n "$remote_hash" && "$local_hash" != "$remote_hash" ]]; then
        behind=$(git rev-list --count "HEAD..$upstream" 2>/dev/null)
        ahead=$(git rev-list --count "$upstream..HEAD" 2>/dev/null)

        if [[ "$behind" -gt 0 && "$ahead" -gt 0 ]]; then
            warnings+=("Branch '$branch' has diverged from '$upstream' ($ahead ahead, $behind behind). Consider: git pull --rebase")
        elif [[ "$behind" -gt 0 ]]; then
            warnings+=("Branch '$branch' is $behind commit(s) behind '$upstream'. Run: git pull")
        fi
    fi
fi

# --- Output warnings ---
if [[ ${#warnings[@]} -gt 0 ]]; then
    for w in "${warnings[@]}"; do
        line="⚠️  $w"
        echo "$line"                     # stdout → Claude context
        echo "$line" > /dev/tty 2>/dev/null  # terminal → user sees it
    done
fi

exit 0
