# Claude Code Multi-Agent Orchestration

## Overview

Multi-agent orchestration allows a primary Claude Code agent to spawn and coordinate teams of sub-agents working in parallel. Each agent gets its own context window, session ID, and task assignment. A shared task list and peer-to-peer messaging enable coordination.

The core workflow: create team, create tasks, spawn agents, work in parallel, shut down agents, delete team.

## Key Concepts

- **Agent Teams** - A lead agent coordinates teammates that work independently. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- **Task System** - Centralized task list (TaskCreate, TaskList, TaskGet, TaskUpdate) drives agent coordination. Tasks support DAGs where one task can block another.
- **SendMessage** - Agents communicate via direct messages and broadcasts.
- **Tmux/iTerm2 Panes** - Split-pane visualization shows each agent in its own terminal pane. Requires tmux (Linux/macOS) or iTerm2 (macOS). Not natively supported on Windows.
- **In-Process Mode** - Alternative to split panes. Runs all teammates in a single terminal with Shift+Up/Down to switch views. Works everywhere.
- **Agent Sandboxes** - Isolated execution environments (e.g., E2B) where agents can build and run code without affecting the local machine. Enables "best of N" parallel approaches.
- **Observability** - Hook-based event tracking to monitor agent activity, tool calls, and task progress across the swarm.
- **Four Primitives** - Slash commands, MCPs, subagents, and skills are the composable building blocks. Only the main agent spawns subagents (no recursive spawning).

## Windows Compatibility

The agent teams feature itself is cross-platform. The tmux-based pane visualization is Unix-native and does not translate cleanly to Windows. Options:

- **In-process mode** works in any terminal (including Git Bash, MSYS2, Windows Terminal)
- **WSL** provides a smoother path for tmux-based workflows
- **MSYS2 tmux** (`pacman -S tmux`) is available but has known quirks with ConPTY

Third-party tools like claude-flow and ccswarm use git worktree isolation (each agent gets its own working directory), which avoids file conflicts and works cross-platform.

## Practical Tips

- **Model selection**: Use haiku for quick fetch/search, sonnet for well-defined implementation, opus for ambiguous reasoning tasks.
- **Worker preamble**: Start every agent prompt with context stating it's a worker, not an orchestrator, to prevent recursive agent spawning.
- **Cost**: Swarm architecture consumes ~4-15x tokens vs single agent. Reserve for high-value complex tasks.
- **File conflicts**: No built-in file locking. Structure tasks so each agent owns different files.
- **Session limits**: `/resume` and `/rewind` do not restore in-process teammates. Fresh sessions required after resume.
- **Cleanup**: Delete teams and shut down agents when work is done. This forces good context hygiene.
- **One session, one purpose**: Keep agent sessions focused on a single task. Long sessions degrade performance as context accumulates.
- **Context engineering**: Use `/prime` commands to onboard agents with codebase knowledge rather than letting them discover everything from scratch.
- **Spec-driven development**: Create reusable planning templates (problem, approach, architecture, tasks, acceptance criteria) for consistent agent output.
- **Safety hooks**: Use PreToolUse hooks to block destructive commands (rm -rf, force push, credential access) even in autonomous/YOLO mode.
- **Parallel consensus**: For critical decisions, run the same prompt across multiple agents and vote. 5 agents with 3-of-5 majority voting achieves ~99% accuracy from individual 90% accuracy.
- **State isolation**: Each LLM call should receive only current state, not accumulated context, to prevent compounding errors at scale.

## Resources

### Original Video

- [Claude Code Multi-Agent Orchestration with Opus 4.6, Tmux and Agent Sandboxes](https://www.youtube.com/watch?v=RpUTF_U4kiw) - IndyDevDan's walkthrough of multi-agent orchestration, observability, and E2B sandboxes

### Official Documentation

- [Claude Code Agent Teams (Anthropic docs)](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Sandboxing (Anthropic docs)](https://code.claude.com/docs/en/sandboxing)

---

### IndyDevDan - YouTube Videos

Organized by recency. Recent videos cover specific implementations with current tooling. Older videos contain general concepts that remain valuable even as tools change.

#### Recent (Last ~3 months)

| Video | Topic | Repo |
|-------|-------|------|
| [Multi-Agent Orchestration with Opus 4.6](https://youtu.be/RpUTF_U4kiw) | Agent teams, tmux panes, E2B sandboxes, observability | [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) |
| "The Claude Code Feature Senior Engineers KEEP MISSING" (Jan 2026) | Agent threads, task list system | [claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) |
| "How I SHIP like Boris Cherny" / "Ralph Wiggum in Claude Code" (Jan 2026) | RALPH loop pattern, infinite agent loops | [infinite-agentic-loop](https://github.com/disler/infinite-agentic-loop) |
| "Claude Code is Amazing... Until It DELETES Production" (Jan 2026) | Damage control hooks, PreToolUse safety | [claude-code-damage-control](https://github.com/disler/claude-code-damage-control) |
| "Install and Maintain" (Jan 2026) | Deterministic + agentic install patterns | [install-and-maintain](https://github.com/disler/install-and-maintain) |

#### Mid-range (3-6 months)

| Video | Topic | Repo |
|-------|-------|------|
| [Fork Repository Skill](https://youtu.be/X2ciJedw2vU) (Dec 2025) | Fork terminal N times, branch engineering work | [fork-repository-skill](https://github.com/disler/fork-repository-skill) |
| [Agent Sandbox - Gemini 3](https://youtu.be/V5IhsHEHXOg) / [Opus 4.5](https://youtu.be/3kgx0YxCriM) (Nov 2025) | E2B sandbox skill, isolated execution | [agent-sandbox-skill](https://github.com/disler/agent-sandbox-skill) |
| [Beyond MCP](https://youtu.be/OIKTsVjTVJE) (Nov 2025) | MCP vs CLI vs skills vs filesystem scripts | [beyond-mcp](https://github.com/disler/beyond-mcp) |
| [Big 3 Super Agent](https://youtu.be/Ur3TJm0BckQ) (Oct 2025) | Gemini + OpenAI + Claude multi-agent experiment | [big-3-super-agent](https://github.com/disler/big-3-super-agent) |

#### Older (6+ months) - General concepts, tools have changed

| Video | Topic | Repo |
|-------|-------|------|
| [I'm HOOKED on Claude Code Hooks](https://recapio.com/digest/im-hooked-on-claude-code-hooks-advanced-agentic-coding-by-indydevdan) (~2025) | Hooks fundamentals, observability basics | [claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) |
| [Claude Code is Programmable](https://youtu.be/2TIXl2rlA6Q) (Jun 2025) | PTC, programmatic tool calling | [claude-code-is-programmable](https://github.com/disler/claude-code-is-programmable) |
| [Voice-Enabled Claude Code](https://youtu.be/LvkZuY7rJOM) (Jun 2025) | Voice-to-agent interaction | [claude-code-is-programmable](https://github.com/disler/claude-code-is-programmable) |
| [Infinite Agentic Loop](https://youtu.be/9ipM_vDwflI) (Jun 2025) | Two-prompt infinite loop pattern | [infinite-agentic-loop](https://github.com/disler/infinite-agentic-loop) |
| [Single File Agents](https://youtu.be/YAIJV48QlXc) (Apr 2025) | One-file agent pattern, prompt engineering | [single-file-agents](https://github.com/disler/single-file-agents) |
| [Agentic Prompt Engineering](https://ytscribe.com/v/luqKnexhpFs) (~2025) | 7 prompt formats, composable sections | - |

---

### IndyDevDan - Blog (the-agentic-engineer.com)

His technical blog at [the-agentic-engineer.com](https://www.the-agentic-engineer.com/) covers the concepts behind his videos in written form. His older personal blog at [indydevdan.com](https://indydevdan.com/) is solopreneur content, not technical.

#### Directly Relevant to Multi-Agent Orchestration

- [AI Sandbox Environments: Safe AI Code Execution](https://www.the-agentic-engineer.com/blog/2025-12-18-ai-sandbox-environments-safe-code-execution) - The orchestrator pattern: local agent coordinates work across distributed E2B sandboxes. Parallel consensus, "best of N" approach.
- [Building Reliable AI Workflows: Millions of Iterations](https://www.the-agentic-engineer.com/blog/2025-12-11-building-reliable-ai-workflows-millions-iterations) - State-based isolation, structured validation with retry, git-based quality gates, parallel consensus voting (5 agents, 3-of-5 majority = ~99% accuracy).
- [4 Claude Code Primitives Guide](https://www.the-agentic-engineer.com/blog/2025-12-01-claude-code-primitives-guide) - Commands, MCPs, subagents, skills as composable building blocks. Constraint: only main agent spawns subagents.
- [One Session, One Purpose](https://www.the-agentic-engineer.com/blog/2025-11-13-one-session-one-purpose) - Context isolation per session, parallel workflows via git worktrees, `/clear` between phases. Auto-compact reserves ~22.5% of context window.

#### Supporting Concepts (Context Engineering, Safety, Tooling)

- [Skills: One Agent Toolbox That Ends MCP Micromanagement](https://www.the-agentic-engineer.com/blog/2025-12-29-skills-unified-agent-toolbox) - Zero-context-overhead skills architecture. Skills consume no tokens until invoked vs MCPs that preload all descriptions.
- [Skills Over MCPs: Context-Efficient Agent Capabilities](https://www.the-agentic-engineer.com/blog/2025-12-04-skills-over-mcps-context-efficiency) - When to use skills (optional, 10+ tools, infrequent) vs MCPs (always-needed, real-time). PEP 723 inline deps for self-contained scripts.
- [Escape AI Platform Lock-In with a Portable CLI Toolkit](https://www.the-agentic-engineer.com/blog/2026-01-19-ai-toolkit-escape-ecosystem-lock-in) - Build standalone CLI tools (Python + Click + uv) that work with any agent that can run bash. Platform-agnostic agent capabilities.
- [Taming Claude YOLO Mode with Safety Hooks](https://www.the-agentic-engineer.com/blog/2025-10-13-taming-claude-yolo-mode) - PreToolUse hooks to block destructive commands, credential access, force pushes. Defense-in-depth for autonomous agents.
- [Packaging Expertise Through Context Engineering](https://www.the-agentic-engineer.com/blog/2025-10-24-packaging-expertise-context-engineering) - The `/prime` command pattern for agent onboarding. Treat agents like new hires that need architecture context.
- [Spec-Driven Development: Planning Templates](https://www.the-agentic-engineer.com/blog/2025-11-10-spec-driven-development-planning-templates) - Reusable planning templates (problem, approach, architecture, tasks, acceptance criteria) for consistent agent output.
- [Beat Developer Burnout with AI-Powered Task Scoping](https://www.the-agentic-engineer.com/blog/2026-01-26-ai-agents-beat-developer-burnout) - Single-agent task pipeline automation. Agent listens for task board events and auto-populates analysis.

#### Big Picture

- [2025: The Year AI Development Grew Up](https://www.the-agentic-engineer.com/blog/2026-01-01-2025-year-ai-development-grew-up) - Shift from model-centric to agent-centric development. "We stopped caring which model and started caring which harness." The harness (tools, context, workflows) matters more than the engine (model).

---

### IndyDevDan - GitHub Repositories

Sorted by most recently updated. Each repo typically has a companion YouTube video.

| Repo | Description | Updated |
|------|-------------|---------|
| [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Real-time monitoring for Claude Code agents (1k stars) | Feb 2026 |
| [claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) | Master Claude Code Hooks (2.8k stars) | Feb 2026 |
| [install-and-maintain](https://github.com/disler/install-and-maintain) | Deterministic and agentic install/maintain patterns | Jan 2026 |
| [claude-code-damage-control](https://github.com/disler/claude-code-damage-control) | PreToolUse hooks to block destructive commands | Jan 2026 |
| [fork-repository-skill](https://github.com/disler/fork-repository-skill) | Fork terminal N times to branch engineering work | Dec 2025 |
| [agent-sandbox-skill](https://github.com/disler/agent-sandbox-skill) | E2B isolated execution environments for agents | Nov 2025 |
| [agent-sandboxes](https://github.com/disler/agent-sandboxes) | Agent sandbox examples | Nov 2025 |
| [beyond-mcp](https://github.com/disler/beyond-mcp) | MCP vs CLI vs skills vs filesystem scripts | Nov 2025 |
| [big-3-super-agent](https://github.com/disler/big-3-super-agent) | Gemini + OpenAI + Claude multi-agent experiment | Oct 2025 |
| [infinite-agentic-loop](https://github.com/disler/infinite-agentic-loop) | Two-prompt infinite loop with Claude Code | Jun 2025 |
| [claude-code-is-programmable](https://github.com/disler/claude-code-is-programmable) | PTC - Claude Code as a programmable agentic tool | Jun 2025 |
| [single-file-agents](https://github.com/disler/single-file-agents) | Single-purpose agents in single Python files | Apr 2025 |

---

### Community Blog Posts & Guides

- [Addy Osmani - Claude Code Swarms](https://addyosmani.com/blog/claude-code-agent-teams/) - Overview from Chrome DevRel lead
- [paddo.dev - Claude Code's Hidden Multi-Agent System](https://paddo.dev/blog/claude-code-hidden-swarm/) - Deep dive into internals
- [alexop.dev - From Tasks to Swarms](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/) - Single-agent to teams progression
- [Marco Patzelt - Agent Teams Setup Guide](https://www.marc0.dev/en/blog/claude-code-agent-teams-multiple-ai-agents-working-in-parallel-setup-guide-1770317684454) - Step-by-step setup
- [claudefast - Multi-Session Orchestration](https://claudefa.st/blog/guide/agents/agent-teams) - Practical orchestration patterns
- [Scott Spence - Unlock Swarm Mode](https://scottspence.com/posts/unlock-swarm-mode-in-claude-code) - Early exploration
- [Shipyard - Multi-agent orchestration in 2026](https://shipyard.build/blog/claude-code-multi-agent/) - Production perspective
- [re:cinq - BMAD, Claude Flow, and Gas Town](https://re-cinq.com/blog/multi-agent-orchestration-bmad-claude-flow-gastown) - Framework comparison (Gas Town uses git as persistence, ephemeral "Polecat" worker agents)
- [State of AI Coding: Engineering with Exponentials](https://agenticengineer.com/state-of-ai-coding/engineering-with-exponentials) - IndyDevDan's "compute advantage equation" framework

### Third-Party Orchestration Tools

| Repo | Description |
|------|-------------|
| [ruvnet/claude-flow](https://github.com/ruvnet/claude-flow) | Full orchestration platform, 12.9k stars, 60+ agents, SONA self-learning |
| [nwiizo/ccswarm](https://github.com/nwiizo/ccswarm) | Rust-native orchestration with git worktree isolation per agent |
| [wshobson/agents](https://github.com/wshobson/agents) | Multi-agent automation for Claude Code |
| [rivet-dev/sandbox-agent](https://github.com/rivet-dev/sandbox-agent) | Run coding agents (Claude Code, Codex, Amp) in sandboxes over HTTP |
| [kieranklaassen's gist](https://gist.github.com/kieranklaassen/4f2aba89594a4aea4ad64d753984b2ea) | Complete swarm orchestration skill reference |

### Community Discussion

- [Hacker News - Claude Code's new hidden feature: Swarms](https://news.ycombinator.com/item?id=46743908)
