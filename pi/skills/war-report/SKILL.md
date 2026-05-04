---
name: war-report
description: Generate weekly activity reports (WAR) from git commits. Analyzes commits Sunday-Saturday, creates bullet summaries. Activate when user mentions "war report", "weekly report", "activity report", "WAR", or asks about weekly work accomplishments.
---

# War Report Generator

## Process

1. **Get date context**
   - Run `date` to get current date
   - Calculate the Friday date for the report filename
   - Determine Sunday-Saturday range for the week (e.g., "2026-01-12" to "2026-01-18 23:59:59")

2. **Discover git repositories**
   - Scan `C:\Projects\Work\Gitlab\` (or `CLAUDE_WAR_ROOT` env var if set) for all directories containing `.git/`
   - Use: `find /c/Projects/Work/Gitlab -name ".git" -type d 2>/dev/null | sed 's|/.git$||'`
   - **Only scan GitLab repositories.** GitHub repos (e.g., `C:\Projects\Work\Github\`) are personal/non-TEAMS projects and must NOT be included in WAR reports
   - This finds all active git projects automatically

3. **Gather commits from each repo**
   - Use the `get-user-commits.py` script for exact email matching
   - Command: `python ~/.claude/skills/war-report/get-user-commits.py <repo_path> "<since_date>" "<until_date>"`
   - Script automatically gets user email and filters to exact matches only
   - Skip repos with no commits in the date range
   - Only include repos with activity in the final report

4. **Review prior week's report**
   - List files with: `ls -la ~/.claude/war/` (glob patterns unreliable on Windows)
   - Read the most recent `war-YYYY-MM-DD.md` file
   - Identify ongoing work threads that continued this week
   - Note any work that was started last week and completed/progressed this week

5. **Generate summary**
   - Synthesize commits into date-prefixed chronological entries
   - Group related commits from the same day into a single entry
   - Multiple entries per day are fine when the work is distinct
   - Focus on WHAT was accomplished, not implementation details

6. **Write report**
   - Create `~/.claude/war/war-YYYY-MM-DD.md` (Friday date)
   - Date-prefixed entries only, no header

## Output Format

Date-prefixed chronological entries in active voice with no trailing periods. Each entry is a self-contained summary of related work for that day. Group related commits from the same day into a single entry. Multiple entries per day are fine when the work is distinct. Every entry must be specific — name the feature, component, or system affected.

**Format:** `DD Mon: Summary sentence(s)` (no trailing period, no zero-padded days)

**Good example:**
```
9 Feb: Developed edit models for onboarding applications and implemented update functionality with improvements to data parsing and service calls
9 Feb: Resolved unit test failures caused by dirty state persistence and null group handling in the onboarding workflow
9 Feb: Refactored AppSettings configuration to consolidate redundant entries across multiple files, improving clarity and maintainability
10 Feb: Developed a typeahead filter box for transaction log actions and integrated Angular spec test coverage for the new component
10 Feb: Rewrote the Trusted Agent data deletion action to use GUID identifiers and implemented a corresponding retrieval function
11 Feb: Fixed a routing misconfiguration that caused the "Manage Apps" page to return a 404 by correcting the route mapping in the application config
```

**Bad example (too generic — never write entries like these):**
```
9 Feb: Troubleshot and resolved a bug
10 Feb: Made improvements to the codebase
10 Feb: Fixed several issues
11 Feb: Updated configuration files
```
These are useless because they don't say WHAT was fixed, WHERE, or WHY it mattered. Every entry must name the specific thing worked on and the specific outcome.

**Formatting rules:**
- No project grouping headers
- No indentation or bullet characters
- Each line starts with the date (e.g., "11 Feb:")
- Each entry is 1-2 sentences describing what was accomplished
- **No periods at the end of entries**
- Entries are ordered chronologically by date
- **Use active voice** with past tense action verbs (Developed, Implemented, Refactored, Fixed, Integrated, Resolved)
- **Be specific, not generic** — name the feature, component, or system affected. "Fixed a bug" is never acceptable; "Fixed a null reference in the onboarding form validation" is
- Focus on WHAT was accomplished, not implementation details

**Write for managers, not engineers.** The audience is leadership reviewing weekly accomplishments. Keep language high-level and outcome-focused:
- NO version numbers (e.g., "v1.2.0", "3.8.1")
- NO instance types or resource specs (e.g., "t3.xlarge", "m5.large")
- NO plugin/package names (e.g., "fleeting-plugin-aws", "zsh-autosuggestions")
- NO file paths, config keys, or CLI flags
- NO Git internals (SHA hashes, branch names, submodule refs)
- Say "upsized cluster nodes" not "migrated from t3.large to t3.xlarge"
- Say "improved spot instance resilience" not "upgraded fleeting-plugin-aws to v1.2.0"
- Say "standardized CI pipeline" not "renamed .gitlab-ci-repo.yml to .gitlab-ci.yml"

## Critical Rules

**No AI mentions or AI-related work.** Never include AI-related commits, work items, or tooling in the report. Filter out:
- Any commits mentioning "Claude", "AI", "Bedrock", "OpenCode", or similar tools
- Developer setup scripts for AI tools
- AI tooling configuration, hooks, or integrations
- Documentation related to AI development workflows

These are internal development tools and should not appear in work accomplishment reports. Focus only on business deliverables and infrastructure work.

**Continuity matters.** Always review last week's report first. If work continues from prior week, integrate it naturally with phrases like "completing prior week's [description] work" within the bullet point itself. Keep the section structure clean without "(continued)" markers in headers.

**Keep it brief but specific.** Consolidate related commits from the same day into single entries. Each entry should be 1-2 sentences max. Every entry must name the specific feature, component, or system — never write generic statements like "fixed a bug" or "made improvements".

## File Storage

Reports stored in `~/.claude/war/` directory:
- Filename: `war-YYYY-MM-DD.md` (Friday date)
- One report per week
- Directory is gitignored (working notes, not deliverables)
