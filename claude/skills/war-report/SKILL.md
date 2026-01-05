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
   - Determine Sunday-Saturday range for the week

2. **Discover git repositories**
   - Scan `C:\Projects\Work\` (or `CLAUDE_WAR_ROOT` env var if set) for all directories containing `.git/`
   - Command: `for dir in /c/Projects/Work/*/; do [ -d "$dir/.git" ] && echo "$dir"; done`
   - This finds all active git projects automatically

3. **Gather commits from each repo**
   - For each discovered repo, run: `git log --since="last Sunday" --until="Saturday" --oneline --all`
   - Skip repos with no commits in the date range
   - Only include repos with activity in the final report

4. **Review prior week's report**
   - List files with: `ls -la ~/.claude/war/` (glob patterns unreliable on Windows)
   - Read the most recent `war-YYYY-MM-DD.md` file
   - Identify ongoing work threads that continued this week
   - Note any work that was started last week and completed/progressed this week

5. **Generate summary**
   - Synthesize commits into accomplishment bullets
   - Group related items under parent bullets when helpful
   - Focus on WHAT was accomplished and WHY it matters

6. **Write report**
   - Create `~/.claude/war/war-YYYY-MM-DD.md` (Friday date)
   - Bullet list only, no header

## Output Format

Scannable in 30 seconds. Target 5-12 top-level items, but clarity trumps count. Sub-bullets (up to 2 levels) OK for grouping related work.

**Good example:**
```
Project A
	Implemented user authentication with OAuth2 integration
	Added role-based access control for admin endpoints
	Expanded test coverage for auth module, completing prior week's test isolation work

Project B Infrastructure
	Completed automated deployment pipeline, completing prior week's CI/CD work
	Added monitoring dashboards for production services
		CloudWatch alarms for error rates
		Grafana dashboards for request latency
```

**Formatting:** Use tabs for indentation, no bullet characters. One tab per indent level.

## Critical Rules

**No AI mentions.** Never include "AI-assisted", "Claude", "generated", "co-authored", or any indication of AI involvement. These are the user's work accomplishments.

**Continuity matters.** Always review last week's report first. If work continues from prior week, integrate it naturally with phrases like "completing prior week's [description] work" within the bullet point itself. Keep the section structure clean without "(continued)" markers in headers.

**Keep it professional.** Be accurate, professional, concise.

## File Storage

Reports stored in `~/.claude/war/` directory:
- Filename: `war-YYYY-MM-DD.md` (Friday date)
- One report per week
- Directory is gitignored (working notes, not deliverables)
