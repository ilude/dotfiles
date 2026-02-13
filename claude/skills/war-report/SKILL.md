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
   - Scan `C:\Projects\Work\` (or `CLAUDE_WAR_ROOT` env var if set) for all directories containing `.git/`
   - Use: `find /c/Projects/Work/Gitlab /c/Projects/Work/Github -name ".git" -type d 2>/dev/null | sed 's|/.git$||'`
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

Date-prefixed chronological entries. Each entry is a self-contained summary of related work for that day. Group related commits from the same day into a single entry. Multiple entries per day are fine when the work is distinct.

**Format:** `Month DD: Summary sentence(s).`

**Good example:**
```
February 09: Developed edit models for onboarding applications and implemented update functionality with improvements to data parsing and service calls. Resolved several issues including unit test failures, dirty state persistence, and handling of null groups.
February 09: Refactored the AppSettings and related configuration files to improve clarity and maintainability. Consolidated configuration logic and removed redundant entries across multiple files.
February 10: Developed a typeahead filter box for actions within the transaction log, and corrected associated functions and HTML elements. Integrated angular spec test logic and cleaned up existing code to ensure proper functionality.
February 10: Rewrote the SQL Trusted Agent data deletion action and implemented a retrieval function. The controller now utilizes GUID identifiers for Trusted Agent deletion.
February 11: Fixed a routing error that caused the "Manage Apps" page to return a 404 error. Updated the application configuration to correctly map the route and resolve the issue.
```

**Formatting rules:**
- No project grouping headers
- No indentation or bullet characters
- Each line starts with the date (e.g., "February 11:")
- Each entry is 1-2 sentences describing what was accomplished
- Entries are ordered chronologically by date
- Use past tense action verbs (Developed, Implemented, Refactored, Fixed, Integrated, Resolved)
- Focus on WHAT was accomplished, not implementation details

## Critical Rules

**No AI mentions or AI-related work.** Never include AI-related commits, work items, or tooling in the report. Filter out:
- Any commits mentioning "Claude", "AI", "Bedrock", "OpenCode", or similar tools
- Developer setup scripts for AI tools
- AI tooling configuration, hooks, or integrations
- Documentation related to AI development workflows

These are internal development tools and should not appear in work accomplishment reports. Focus only on business deliverables and infrastructure work.

**Continuity matters.** Always review last week's report first. If work continues from prior week, integrate it naturally with phrases like "completing prior week's [description] work" within the bullet point itself. Keep the section structure clean without "(continued)" markers in headers.

**Keep it brief.** Consolidate related commits from the same day into single entries. Each entry should be 1-2 sentences max.

## File Storage

Reports stored in `~/.claude/war/` directory:
- Filename: `war-YYYY-MM-DD.md` (Friday date)
- One report per week
- Directory is gitignored (working notes, not deliverables)
