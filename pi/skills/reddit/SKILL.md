---
name: reddit
description: Reddit public .json search, subreddit listings, or a specific post.
---

# Reddit

Routing card for public Reddit `.json` access. No API key required.

```bash
node SKILL_DIR/reddit.js search "query" --limit 5
node SKILL_DIR/reddit.js top python --limit 3 --time month
node SKILL_DIR/reddit.js post https://www.reddit.com/r/Python/comments/abc123/ --depth 5
```

Resolve `SKILL_DIR` to this skill directory. Use `read` on `reddit.js` for full options.

## Boundaries

- Use for Reddit-specific retrieval only; use web search for general web docs.
- Public endpoints can fail or be rate-limited; report partial results.
- Do not treat Reddit comments as authoritative without caveats.
