# Claude Code Security: Community Solutions Research

> **Research Date**: 2025-01-29
> **Focus**: Existing hooks, GitHub repos, known vulnerabilities, community discussions
> **Sources**: GitHub, Hacker News, security blogs, official documentation

---

## Executive Summary

The Claude Code community has developed a substantial ecosystem of security solutions, primarily centered around the **PreToolUse hook system**. However, research also reveals significant **known vulnerabilities** and **bypass techniques** that security-conscious users should understand.

---

## 1. Official Anthropic Security Features

### Documentation & Built-in Protections
- [Official Hooks Reference](https://code.claude.com/docs/en/hooks) - Complete documentation of the hook lifecycle system
- [Sandboxing Features](https://www.anthropic.com/engineering/claude-code-sandboxing) - OS-level isolation using Linux bubblewrap and macOS seatbelt

**Key Built-in Features:**
- **Permission-based model**: Read-only by default, explicit approval required for modifications
- **Sandbox isolation**: Filesystem restricted to project directory, network limited to proxy
- **Enterprise controls**: `allowManagedHooksOnly` flag to block user/project/plugin hooks
- **Exit code 2**: The only way to block PreToolUse operations (stderr message shown to Claude)

### Sandboxing Capabilities
Anthropic's sandboxing provides:
- Filesystem isolation (read/write only in current working directory)
- Network isolation (only through Unix domain socket proxy)
- 84% reduction in permission prompts in internal usage
- Protection even against successful prompt injection

---

## 2. Community GitHub Repositories

### Comprehensive Security Frameworks

| Repository | Focus | Key Features |
|------------|-------|--------------|
| [disler/claude-code-damage-control](https://github.com/disler/claude-code-damage-control) | Defense-in-depth | Three-tier path protection (zeroAccess, readOnly, noDelete), dangerous command patterns, ask-before-allow dialogs |
| [RoaringFerrum/claude-code-bash-guardian](https://github.com/RoaringFerrum/claude-code-bash-guardian) | Bash command filtering | AST-based parsing via bashlex, wrapper command detection, script injection prevention, path traversal blocking |
| [kenryu42/claude-code-safety-net](https://github.com/kenryu42/claude-code-safety-net) | Semantic command analysis | 5-level shell wrapper recursion, interpreter one-liner detection, strict/paranoid modes |
| [Dicklesworthstone/destructive_command_guard](https://github.com/Dicklesworthstone/destructive_command_guard) | High-performance protection | 49+ security packs, SIMD-accelerated filtering, sub-millisecond latency, heredoc scanning |
| [fr0gger/nova-claude-code-protector](https://github.com/fr0gger/nova-claude-code-protector) | Prompt injection defense | Three-tier scanning (keywords, semantic ML, LLM), session tracking, PostToolUse warning injection |
| [rulebricks/claude-code-guardrails](https://github.com/rulebricks/claude-code-guardrails) | Real-time rule engine | Rulebricks API integration, allow/deny/ask decisions, instant rule updates without restart |
| [wangbooth/Claude-Code-Guardrails](https://github.com/wangbooth/Claude-Code-Guardrails) | Git safety | Pre-write interception, automatic checkpointing, smart merge archiving |

### Curated Collections
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) - Curated list of skills, hooks, and plugins
- [TheDecipherist/claude-code-mastery](https://github.com/TheDecipherist/claude-code-mastery) - Complete guide including `block-secrets.py` and `block-dangerous-commands.sh` templates
- [karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) - Collection with configurable safety levels (strict, critical, high)
- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) - Demo capturing all 8 hook lifecycle events with JSON payloads

---

## 3. Known Vulnerabilities & Bypass Techniques

### Critical Issues Reported

**SED Command Bypass (Issue #6876)**
- [GitHub Issue #6876](https://github.com/anthropics/claude-code/issues/6876) - SED operations execute despite PreToolUse hooks returning `{"continue": false}`
- Closed as duplicate of #3514 (broader PreToolUse system failure)
- Workaround: Use Docker containerization, frequent git commits, manual vigilance

**CVE-2025-54794 (Path Restriction Bypass)**
- [CVE Details](https://cymulate.com/blog/cve-2025-547954-54795-claude-inverseprompt/) - Arbitrary command injection via improper input sanitization
- Fixed in v0.2.111
- Attack exploited whitelisted command handling

**Hook Hijacking via Plugins**
- [PromptArmor Research](https://www.promptarmor.com/resources/hijacking-claude-code-via-injected-marketplace-plugins) - Attackers can define hooks via metadata files
- `suppressOutput` configuration hides hook activation from chat history
- Auto-approve hooks for curl commands enable data exfiltration

### Prompt Injection Vectors
- [Lasso Security: Hidden Backdoor](https://www.lasso.security/blog/the-hidden-backdoor-in-claude-coding-assistant) - Indirect prompt injection via README files and web content
- **Four attack categories**: Instruction override, role-playing/jailbreaks, encoding/obfuscation, context manipulation
- `--dangerously-skip-permissions` flag amplifies risk by removing human confirmation

### Permission Rule Bypasses
Documented bypass vectors for pattern-matching deny rules:
- Options reordering (`-rf` vs `-f -r`)
- Shell variables (`$cmd`)
- Flag reordering
- Extra whitespace
- Shell wrappers (`bash -c 'dangerous command'`)

---

## 4. Community-Developed Patterns

### Standard PreToolUse Hook Configuration
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/pre-bash-firewall.sh"
          }
        ]
      }
    ]
  }
}
```

### Common Blocked Command Patterns
```bash
deny_patterns=(
  'rm\s+-rf\s+/'
  'git\s+reset\s+--hard'
  'git\s+checkout\s+--'
  'git\s+push\s+--force'
  'git\s+clean\s+-f'
  'DELETE\s+FROM.*(?!WHERE)'
  'curl\s+http'
)
```

### Path Protection Tiers (damage-control approach)
| Tier | Permissions | Example Paths |
|------|-------------|---------------|
| zeroAccessPaths | None | `~/.ssh/`, `~/.aws/`, `~/.gnupg/` |
| readOnlyPaths | Read only | `/etc/`, `~/.bashrc`, `~/.zshrc` |
| noDeletePaths | Read/Write/Edit | `.claude/hooks/`, `.claude/commands/` |

### Exit Code Behavior
| Code | Result |
|------|--------|
| 0 | Allow (stdout shown in verbose mode) |
| 0 + JSON | Decision control (allow/deny/ask) |
| 2 | Block (stderr shown to Claude) |
| Other | Non-blocking error (continues) |

---

## 5. Defense Recommendations

### From Community & Research

**Layered Security Approach:**
1. **PreToolUse hooks** for command-level blocking
2. **PostToolUse hooks** for prompt injection detection (Lasso Defender approach)
3. **OS-level sandboxing** (bubblewrap, Docker, VMs)
4. **Git safety nets** (frequent commits, worktrees)
5. **External SAST/DAST tools** (Semgrep, Codacy MCP integration)

**Enterprise Recommendations:**
- Use `allowManagedHooksOnly` to block user/project/plugin hooks
- Deploy organization-wide managed settings
- Keep transcript retention short (7-14 days)
- Never run as root

**Credential Protection:**
- Default deny for `curl`, `wget`, data exfiltration vectors
- Block access to `.env`, `~/.ssh/`, secrets directories
- Use time-limited, scoped-down credentials (macaroons pattern)
- Store API keys in unified secrets manager

### Tool Philosophy
> "Treat Claude Code as a brilliant but untrusted intern" - Community consensus

---

## 6. Hacker News Discussions

Key discussions:
- [Docker container for dangerously-skip-permissions](https://news.ycombinator.com/item?id=44956002) - Anthropic's official sandboxed container approach
- [Running Claude Code dangerously (safely)](https://news.ycombinator.com/item?id=46690907) - bubblewrap + Landlock LSM + dnsmasq layered sandbox
- [Using proxies to hide secrets](https://news.ycombinator.com/item?id=46605155) - Macaroons for time-limited, scoped credentials
- [Code execution through email](https://news.ycombinator.com/item?id=44590350) - "Attaching a code runner to untrusted input is a terrible idea"

---

## 7. Blog Posts & Tutorials

| Source | Title | Key Insight |
|--------|-------|-------------|
| [DEV Community](https://dev.to/mikelane/building-guardrails-for-ai-coding-assistants-a-pretooluse-hook-system-for-claude-code-ilj) | Building Guardrails for AI Coding Assistants | Complete implementation under 400 lines Python; safety hooks + context injection + workflow reminders |
| [Codacy Blog](https://blog.codacy.com/equipping-claude-code-with-deterministic-security-guardrails) | Equipping Claude Code with Deterministic Security Guardrails | MCP integration for real-time code analysis during generation |
| [paddo.dev](https://paddo.dev/blog/claude-code-hooks-guardrails/) | Claude Code Hooks: Guardrails That Actually Work | Practical implementation guide |
| [Steve Kinney](https://stevekinney.com/courses/ai-development/claude-code-hook-examples) | Claude Code Hook Examples | Course material with working examples |
| [eesel.ai](https://www.eesel.ai/blog/security-claude-code) | A deep dive into security for Claude Code | Comprehensive security analysis |
| [Backslash Security](https://www.backslash.security/blog/claude-code-security-best-practices) | Claude Code Security Best Practices | "Deny-by-default" configuration recommendations |

---

## 8. Real-World Incidents

Documented incidents that drove security development:

1. **Home directory wipe** - Claude ran `git checkout --` on uncommitted work without permission prompt
2. **$30,000 API key leak** - Claude hardcoded Azure OpenAI key in markdown, pushed to public repo
3. **Git reset destruction** - Agent ran `git reset --hard` on files from parallel coding session
4. **SED corruption** - Code files modified despite hooks returning block signal

These incidents demonstrate that:
- CLAUDE.md/AGENTS.md instructions don't prevent execution
- PreToolUse hooks provide mechanical enforcement (when working)
- Git-based recovery (fsck, stash, reflog) is essential fallback

---

## 9. Summary: Current State of Claude Code Security

**What Works:**
- PreToolUse hooks for basic command blocking
- Path restriction patterns
- Enterprise managed hooks policy
- OS-level sandboxing (when properly configured)
- PostToolUse prompt injection detection

**What Remains Problematic:**
- Known hook bypass vectors (shell wrappers, option reordering)
- SED command bypass despite hooks (#6876/#3514)
- Prompt injection in file content (PostToolUse only warns, doesn't block)
- Plugin/hook hijacking via marketplace

**Community Consensus:**
Defense-in-depth is mandatory. No single solution is sufficient. Combine hooks + sandboxing + git safety nets + external tools + human review for production use.

---

## Applicability to damage-control

| Community Pattern | Current Implementation | Gap/Opportunity |
|-------------------|----------------------|-----------------|
| Three-tier paths | zeroAccess, readOnly, noDelete | Already implemented |
| Shell unwrapping | 5-level recursion | Already implemented |
| Ask patterns | `ask: true` in patterns.yaml | Already implemented |
| PostToolUse injection detection | Not implemented | Add prompt injection scanner |
| Session tracking | Not implemented | Track file access for taint |
| Git safety hooks | Not implemented | Auto-commit before dangerous ops |

---

## Source URLs

### Official Documentation
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/security
- https://www.anthropic.com/engineering/claude-code-sandboxing

### GitHub Repositories
- https://github.com/disler/claude-code-damage-control
- https://github.com/RoaringFerrum/claude-code-bash-guardian
- https://github.com/kenryu42/claude-code-safety-net
- https://github.com/Dicklesworthstone/destructive_command_guard
- https://github.com/fr0gger/nova-claude-code-protector
- https://github.com/rulebricks/claude-code-guardrails
- https://github.com/TheDecipherist/claude-code-mastery
- https://github.com/hesreallyhim/awesome-claude-code

### Security Research
- https://www.lasso.security/blog/the-hidden-backdoor-in-claude-coding-assistant
- https://cymulate.com/blog/cve-2025-547954-54795-claude-inverseprompt/
- https://www.promptarmor.com/resources/hijacking-claude-code-via-injected-marketplace-plugins
- https://github.com/anthropics/claude-code/issues/6876

### Tutorials & Analysis
- https://dev.to/mikelane/building-guardrails-for-ai-coding-assistants-a-pretooluse-hook-system-for-claude-code-ilj
- https://blog.codacy.com/equipping-claude-code-with-deterministic-security-guardrails
- https://www.eesel.ai/blog/security-claude-code
- https://www.backslash.security/blog/claude-code-security-best-practices
- https://stevekinney.com/courses/ai-development/claude-code-hook-examples

### Hacker News Discussions
- https://news.ycombinator.com/item?id=44956002
- https://news.ycombinator.com/item?id=46690907
- https://news.ycombinator.com/item?id=46605155
- https://news.ycombinator.com/item?id=44590350
