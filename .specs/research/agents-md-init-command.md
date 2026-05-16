# AGENTS.md Init Command

Research on designing a `/init` command that creates or updates a project-local `AGENTS.md` file for coding-agent instructions.

## Summary

- `AGENTS.md` is now a broadly recognized, Markdown-only convention: no required schema, root plus nested files, closest instructions generally win.
- OpenCode already documents `/init` as scanning important repo files, asking targeted questions if needed, and creating/updating `AGENTS.md` in place.
- Codex has detailed AGENTS.md discovery semantics: global + project layers, root-to-CWD merge order, override files, fallback filenames, and a default 32 KiB project-doc cap.
- Claude Code still uses `CLAUDE.md`, but its `/init` generates `CLAUDE.md`, reads existing `AGENTS.md` and other agent config files, and can import `AGENTS.md` to avoid duplication.
- A good Pi `/init` should be conservative: inspect deterministic repo signals first, preserve user-authored content, avoid wholesale rewrites, keep output concise, and mark generated sections.

## Sources

| Resource | URL | Notes |
|----------|-----|-------|
| AGENTS.md official site | https://agents.md/ | Open format rationale, example sections, nested AGENTS guidance, no required fields |
| agentsmd/agents.md GitHub repo | https://github.com/agentsmd/agents.md | Source repository and minimal example |
| OpenAI Codex AGENTS.md docs | https://developers.openai.com/codex/guides/agents-md | Discovery, precedence, global/project scopes, overrides, size cap, troubleshooting |
| OpenAI Codex advanced config | https://developers.openai.com/codex/config-advanced#project-instructions-discovery | Project root markers and project config context |
| Claude Code memory docs | https://code.claude.com/docs/en/memory | CLAUDE.md behavior, `/init`, AGENTS.md compatibility via import, instruction-writing guidance |
| OpenCode rules docs | https://opencode.ai/docs/rules/ | Documents `/init` behavior for creating/updating AGENTS.md and OpenCode precedence |

## Key Findings

1. **AGENTS.md is intentionally unstructured Markdown**: tools do not require frontmatter or fixed headings, so `/init` should emit clear conventional sections rather than inventing a strict schema.
2. **Create/update behavior should be in-place, not replace-first**: OpenCode explicitly says `/init` improves an existing `AGENTS.md` instead of blindly replacing it.
3. **Instruction discovery differs by tool**: Codex merges global and project files root-to-CWD; OpenCode uses local AGENTS/CLAUDE plus globals; Claude reads CLAUDE.md and can import AGENTS.md.
4. **Conciseness matters**: Claude recommends under ~200 lines per instruction file; Codex has a 32 KiB default project-doc cap. Generated output should be short and specific.
5. **Useful generated content comes from repo evidence**: build/test/lint commands, package managers, CI workflows, structure, conventions, security gotchas, nested/project-specific notes, and references to existing rules.
6. **Ambiguity handling is part of the product**: OpenCode notes `/init` may ask targeted questions when the codebase cannot answer something. Avoid guessing project policy.
7. **Cross-tool compatibility favors AGENTS.md as canonical**: Claude-specific support can be a small `CLAUDE.md` importing `@AGENTS.md`; Windows users should prefer imports over symlinks.

## Date

Last updated: 2026-05-15
