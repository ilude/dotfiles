# Vendored Skills Provenance

This file tracks skills imported verbatim from third-party repos so we can audit them against upstream changes.

To check for upstream changes:

```bash
# Compare a vendored SKILL.md against the pinned upstream commit
curl -fsSL "https://raw.githubusercontent.com/<repo>/<sha>/<path>" | diff - claude/skills/<name>/SKILL.md

# Or fetch the latest upstream commit and compare
curl -fsSL "https://raw.githubusercontent.com/<repo>/main/<path>" | diff - claude/skills/<name>/SKILL.md
```

When importing a new vendored skill or refreshing an existing one, update both the `SKILL.md` and the row in this file (commit SHA, import date).

## mattpocock/skills

- Repo: https://github.com/mattpocock/skills
- Imported at upstream commit: `f71bb975bfae2dc0d31c529c7dd4a8479ecc3748`
- Commit date: 2026-04-29
- Import date: 2026-04-29
- License: see upstream repo

| Local skill | Upstream path | Notes |
|-------------|---------------|-------|
| `claude/skills/grill-me/SKILL.md` | `skills/productivity/grill-me/SKILL.md` | Aggressive plan interrogation; recommended-answer-per-question is the load-bearing line |
| `claude/skills/zoom-out/SKILL.md` | `skills/engineering/zoom-out/SKILL.md` | One-shot "map modules + callers" prompt; `disable-model-invocation: true` (user-invoked only) |
| `claude/skills/caveman/SKILL.md` | `skills/productivity/caveman/SKILL.md` | Toggleable terse-mode; persists until "stop caveman" / "normal mode" |
