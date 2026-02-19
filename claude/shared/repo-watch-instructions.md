# Repo-Watch System

Track external GitHub repos and review them for features to incorporate into your Claude Code setup.

Scripts are in `~/.claude/repo-watch/`. All use PEP 723 inline dependencies - run with `uv run`.

## Commands

### `/repo-watch list`

Show all tracked repos with update status.

```bash
uv run ~/.claude/repo-watch/list_repos.py
```

Use `--json` for machine-readable output.

### `/repo-watch add <url>`

Add a new repo to track.

1. **Add the repo:**
   ```bash
   uv run ~/.claude/repo-watch/add_repo.py <url>
   ```
   This auto-detects category and returns JSON with repo info and key files.

2. **Clone for analysis:**
   ```bash
   uv run ~/.claude/repo-watch/review_repo.py <owner/repo>
   ```
   Returns local_path to cloned repo and list of files.

3. **Analyze with Task subagent (sonnet):**
   Read key files from the repo (README, main source files). Identify valuable features that could enhance the user's setup. Return a structured list of features with:
   - name: Short feature name
   - description: What it does
   - priority: High/Medium/Low
   - files: Which files implement it

4. **Present features via AskUserQuestion:**
   Use multiSelect: true. Put high-priority items first with "(Recommended)" suffix.
   Filter out any features already in `ignored_features` from the repo config.

   Example:
   ```
   question: "Which features do you want to implement from owner/repo?"
   header: "Features"
   options:
     - label: "Xargs analysis (Recommended)"
       description: "Blocks xargs rm -rf patterns - High priority"
     - label: "Find -delete detection"
       description: "Catches find -delete commands - Medium priority"
   ```

5. **Process user selection:**
   - **Unchecked items:** Add to ignored_features:
     ```bash
     uv run ~/.claude/repo-watch/update_ignored.py <owner/repo> --add "Feature name 1" "Feature name 2"
     ```
   - **Checked items:** Proceed to implementation planning

6. **Mark as reviewed:**
   ```bash
   uv run ~/.claude/repo-watch/mark_reviewed.py <owner/repo>
   ```

7. **Implement selected features** using appropriate sub-agents based on category.

### `/repo-watch review <owner/repo>`

Review an existing tracked repo for new features.

Same flow as `add`, but for repos already in tracking. The `review_repo.py` script:
- Updates the local clone
- Returns `ignored_features` list
- Filter these out when presenting options

### `/repo-watch all`

Review all repos that have updates.

1. **Get repos needing review:**
   ```bash
   uv run ~/.claude/repo-watch/list_repos.py --json
   ```
   Filter for repos where `has_updates: true`

2. **Parallel analysis:**
   Launch Task subagents (sonnet) in parallel to analyze each repo that needs review.

3. **Combined checkbox:**
   Group all features by repo in a single AskUserQuestion.

4. **Process selections:**
   - Unchecked → Add to ignored_features per repo
   - Checked → Generate combined implementation plan

5. **Mark all as reviewed.**

## Category Mappings

Features are categorized to determine where implementations belong:

| Category | Local Path | Description |
|----------|------------|-------------|
| skills | ~/.claude/skills | Claude Code skills |
| damage-control | ~/.claude/hooks/damage-control | Security patterns |
| hooks | ~/.claude/hooks | Event hooks |
| commands | ~/.claude/commands | Slash commands |
| dotfiles | ~/.dotfiles | Shell/system configs |

## Cache Location

Cloned repos are stored in `~/.cache/repo-watch/` (not version controlled).

## repos.yaml Schema

```yaml
repos:
  - url: https://github.com/owner/repo
    category: damage-control
    description: "What this repo does"
    last_reviewed_commit: abc123...
    last_reviewed_at: 2026-01-20T12:00:00Z
    ignored_features:
      - "Feature we don't want"
      - "Another skipped feature"
```

## Key Behavior

- **Auto-ignore unchecked:** When user deselects features in the checkbox, they're automatically added to `ignored_features` and won't be shown in future reviews.
- **Filter ignored:** When presenting features, always filter out items in `ignored_features`.
- **Mark reviewed:** After processing, update `last_reviewed_commit` so the repo shows as current until new commits appear.
