---
name: reddit
description: Browse Reddit via public .json endpoints (no API key required). Use when the user asks to search Reddit, view a subreddit, or read a specific post.
---

# Reddit Skill

Browse Reddit from the agent using public `.json` endpoints. No API key is required.

## Runtime

From the skill directory, run:

```bash
node SKILL_DIR/reddit.js <command> [options]
```

When resolving `SKILL_DIR`, use the directory containing this `SKILL.md`.

## Commands

| Command | Purpose | Key options |
|---|---|---|
| `search <query>` | Search all of Reddit | `--limit N` (default 10), `--sort` (relevance, hot, new, top, comments) |
| `top <subreddit>` | View top posts in a subreddit | `--limit N`, `--time` (hour, day, week, month, year, all) |
| `post <url-or-id>` | Read a single post + comments | `--depth N` (comment depth, default 5) |

## Examples

```bash
node SKILL_DIR/reddit.js search "AI agents" --limit 5
node SKILL_DIR/reddit.js top python --limit 3 --time month
node SKILL_DIR/reddit.js post https://www.reddit.com/r/Python/comments/abc123/
```

## Notes

- Uses public `.json` endpoints; no credentials needed.
- Output is line-oriented text so the agent can parse results cleanly.
- Use `read` tool on the script for full option details if needed.
