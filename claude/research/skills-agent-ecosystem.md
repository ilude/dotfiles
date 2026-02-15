# Skills Agent Ecosystem Research

Research conducted 2026-02-15 for creating a skills-engineer agent/skill/command.

## Summary

Comprehensive research into Claude Code skills, OpenCode agents, the Agent Skills open standard, skill creation tools, and meta-prompting research. Used to inform the design of a skills-engineer agent that reviews, writes, and optimizes skills for both Claude Code and OpenCode.

## Official Documentation

| Resource | URL | Notes |
|----------|-----|-------|
| Claude Code Skills Docs | https://code.claude.com/docs/en/skills | Official skill format, progressive disclosure, invocation control |
| Claude Code Subagents Docs | https://code.claude.com/docs/en/sub-agents | Agent configuration format |
| Agent Skills Specification | https://agentskills.io/specification | Open standard for cross-tool skills |
| OpenCode Agents Docs | https://opencode.ai/docs/agents/ | Agent configuration, markdown format, temperature settings |
| OpenCode Skills Docs | https://opencode.ai/docs/skills | Reads .claude/skills/ as fallback |
| OpenCode Rules Docs | https://opencode.ai/docs/rules/ | AGENTS.md format, CLAUDE.md fallback |

## Major Repositories

| Resource | URL | Notes |
|----------|-----|-------|
| anthropics/skills | https://github.com/anthropics/skills | Official skill examples, template/, spec/ |
| obra/superpowers | https://github.com/obra/superpowers | TDD-based skill creation; `writing-skills` meta-skill |
| VoltAgent/awesome-agent-skills | https://github.com/VoltAgent/awesome-agent-skills | 380+ skills from official teams and community |
| hesreallyhim/awesome-claude-code | https://github.com/hesreallyhim/awesome-claude-code | 700+ resources across categories |
| travisvn/awesome-claude-skills | https://github.com/travisvn/awesome-claude-skills | Curated by category |
| blader/Claudeception | https://github.com/blader/Claudeception | Autonomous skill extraction from debugging |
| alirezarezvani/claude-code-skill-factory | https://github.com/alirezarezvani/claude-code-skill-factory | 4 specialist agents + 7 commands for skill generation |
| levnikolaevich/claude-code-skills | https://github.com/levnikolaevich/claude-code-skills | 102 skills, Orchestrator-Worker hierarchy (L0-L3) |
| daymade/claude-code-skills | https://github.com/daymade/claude-code-skills | 37 skills including skill-creator meta-skill |
| agentskills/agentskills | https://github.com/agentskills/agentskills | Spec repo, skills-ref validation library |
| vercel-labs/skills | https://github.com/vercel-labs/skills | npx skills CLI, skills.sh marketplace |

## Skill Marketplaces

| Resource | URL | Notes |
|----------|-----|-------|
| skills.sh | https://skills.sh/ | 37,000+ skills directory, CLI: npx skills |
| SkillsMP | https://skillsmp.com/ | Agent Skills Marketplace |
| SkillHub | https://www.skillhub.club/ | Skills Marketplace |
| Awesome Claude | https://awesomeclaude.ai/ | Visual directory |

## Blog Posts & Deep Dives

| Resource | URL | Notes |
|----------|-----|-------|
| Superpowers blog | https://blog.fsck.com/2025/10/09/superpowers/ | Software dev methodology built on composable skills |
| First Principles Deep Dive | https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/ | Internal mechanics, dual-message injection, LLM-based selection |
| Skills Activate Reliably | https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably | Forced eval hook = 84% activation rate |
| Skills Auto-Activation Hooks | https://paddo.dev/blog/claude-skills-hooks-solution/ | Hook-based activation guarantee |
| Claude to OpenCode Conversion | https://gist.github.com/RichardHightower/827c4b655f894a1dd2d14b15be6a33c0 | Format mapping between tools |
| Skills Factory Guide | https://alirezarezvani.medium.com/the-claude-skills-factory-how-you-can-generate-production-ready-ai-tools-in-15-minutes-eb0b86087f31 | Production skill generation workflow |

## Academic Research

| Paper | Year | Key Contribution |
|-------|------|------------------|
| Meta Prompting for AI Systems (arXiv:2311.11482) | 2023 | Framework for elevating LLM reasoning via formal structure |
| Reflexion (Shinn et al.) | 2023 | Self-reflection improves agent performance |
| Voyager (Wang et al.) | 2023 | Persistent skill libraries for game-playing agents |
| CASCADE | 2024 | Meta-skills: skills for acquiring skills |
| SEAgent | 2025 | Learning software environments through trial and error |
| System Prompt Optimization (arXiv:2505.09666) | 2025 | Bilevel meta-learning for system prompts |
| Promptomatix (arXiv:2507.14241) | 2025 | Automatic prompt optimization without manual tuning |
| SAMMO | 2025 | DAG-based prompt optimization; 13-100% gains |

## Cross-Platform Compatibility

| Tool | Project Path | Global Path |
|------|-------------|-------------|
| Claude Code | .claude/skills/ | ~/.claude/skills/ |
| OpenCode | .opencode/skills/ | ~/.config/opencode/skills/ |
| Cursor | .cursor/skills/ | ~/.cursor/skills/ |
| GitHub Copilot | .github/skills/ | ~/.copilot/skills/ |
| Gemini CLI | .gemini/skills/ | ~/.gemini/skills/ |
| Windsurf | .windsurf/skills/ | ~/.codeium/windsurf/skills/ |

OpenCode reads .claude/skills/ as fallback — same SKILL.md works for both tools.

## Key Findings

1. **Agent Skills open standard** enables cross-tool compatibility — same SKILL.md works in Claude Code, OpenCode, Cursor, Copilot, Gemini CLI, Windsurf
2. **TDD for skills** (obra/superpowers) treats skill creation like code: write test, watch fail, write skill, watch pass, refactor
3. **Auto-activation is unreliable** (~20% baseline); forced eval hooks boost to 84%
4. **Progressive disclosure** is critical: metadata (~100 tokens) always loaded, full instructions (<5000 tokens) on activation, resources as needed
5. **Sweet spot is 250-400 lines** for main skills, 100-250 for sub-skills
6. **Meta-skills exist** but none combine review + write + optimize in a single comprehensive agent
7. **The 15,000-char budget** for skill descriptions (2% of context window) means concise descriptions are essential
8. **Academic grounding** (from CASCADE, Reflexion, Voyager papers) validates the approach of persistent, composable skill libraries

See also: [AI Rules & Skills](AI-RULES-SKILLS-REPOS-RESOURCES.md)
