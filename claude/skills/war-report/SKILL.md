---
name: war-report
description: Generate weekly activity reports (WAR) from git commits. Analyzes commits Sunday-Saturday, creates bullet summaries. Activate when user mentions "war report", "weekly report", "activity report", "WAR", or asks about weekly work accomplishments.
---

# War Report Generator

**Auto-activate when:** User mentions war report, weekly report, WAR, activity report, weekly accomplishments, or asks what was worked on this week.

**Purpose:** Generate concise weekly activity summaries from git commit history.

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
   - Synthesize commits into high-level accomplishment bullets
   - Be brief: 1 line per major item, avoid sub-bullets unless essential
   - Focus on WHAT was accomplished, not implementation details

6. **Write report**
   - Create `~/.claude/war/war-YYYY-MM-DD.md` (Friday date)
   - Bullet list only, no header

## Output Format

Scannable in 30 seconds. Target 5-10 top-level items, but clarity trumps count. Prefer fewer, broader bullets over many granular ones. Sub-bullets only when truly necessary.

**Good example:**
```
Project A
	Implemented user authentication with OAuth2 integration
	Added role-based access control for admin endpoints

Project B Infrastructure
	Completed automated deployment pipeline with monitoring dashboards
```

**Formatting:** Use tabs for indentation, no bullet characters. One tab per indent level.

## Critical Rules

**No AI mentions.** Never include "AI-assisted", "Claude", "generated", "co-authored", or any indication of AI involvement. These are the user's work accomplishments.

**Continuity matters.** Always review last week's report first. If work continues from prior week, integrate it naturally with phrases like "completing prior week's [description] work" within the bullet point itself. Keep the section structure clean without "(continued)" markers in headers.

**Keep it brief.** Consolidate related commits into single bullets. Avoid excessive detail.

## File Storage

Reports stored in `~/.claude/war/` directory:
- Filename: `war-YYYY-MM-DD.md` (Friday date)
- One report per week
- Directory is gitignored (working notes, not deliverables)
