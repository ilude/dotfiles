# AI Rules, Skills, Repos & Resources

Research collected while adding the "Deterministic by Default" rule to `~/.claude/CLAUDE.md`.

## CLAUDE.md Examples & Best Practices

| Resource | URL | Notes |
|----------|-----|-------|
| Anthropic Official Best Practices | https://code.claude.com/docs/en/best-practices | Recommends hooks (deterministic) over CLAUDE.md (advisory) for must-do rules |
| HumanLayer - Writing a Good CLAUDE.md | https://www.humanlayer.dev/blog/writing-a-good-claude-md | Keep under 300 lines; Claude ignores rules in bloated files |
| Claude Code Best Practices (rosmur) | https://rosmur.github.io/claudecode-best-practices/ | Favors "explicit, simple, traceable" over "magical"; labels deterministic workflows as high-level best practice |
| SabrinaRamonov's CLAUDE.md | https://github.com/SabrinaRamonov/ai-coding-rules | "Prefer simple, composable, testable functions" - indirect determinism |
| Marko Mitranic's CLAUDE.md Gist | https://gist.github.com/markomitranic/26dfcf38c5602410ef4c5c81ba27cce1 | Security and code quality focus; no explicit determinism rules |
| awattar/claude-code-best-practices | https://github.com/awattar/claude-code-best-practices | Prompt design and safe automation patterns |
| shanraisshan/claude-code-best-practice | https://github.com/shanraisshan/claude-code-best-practice | Practice-oriented Claude Code guidance |
| ChrisWiles/claude-code-showcase | https://github.com/ChrisWiles/claude-code-showcase | Hooks, skills, agents, commands, and GitHub Actions examples |
| ClaudeLog | https://claudelog.com/ | Community docs, guides, tutorials |
| Shrivu Shankar - How I Use Every Claude Code Feature | https://blog.sshh.io/p/how-i-use-every-claude-code-feature | Practical feature walkthrough |
| kumaran srinivasan - My Claude Code Setup | https://medium.com/@kumaran.isk/my-claude-code-setup-heres-what-i-learned-d0403b1b1fec | Setup lessons learned |

## Deterministic Guardrails & Enforcement

| Resource | URL | Notes |
|----------|-----|-------|
| Codacy - Deterministic Security Guardrails | https://blog.codacy.com/equipping-claude-code-with-deterministic-security-guardrails | Rule-based enforcement independent of AI judgment; "AI can't reliably self-check" |
| Minusx - Decoding Claude Code | https://minusx.ai/blog/decoding-claude-code/ | AgentSys uses deterministic detection (regex, AST) with LLM judgment |

## Cursor Rules & .cursorrules

| Resource | URL | Notes |
|----------|-----|-------|
| awesome-cursorrules | https://github.com/PatrickJS/awesome-cursorrules | Curated .cursorrules collection for many frameworks |
| cursor-rules-java | https://github.com/jabrena/cursor-rules-java | Acknowledges LLM non-determinism; mitigates with "clear goals and validation checkpoints" |
| cursorrules GitHub Topic | https://github.com/topics/cursorrules | Community-maintained cursor rules |
| ivangrynenko/cursorrules | https://github.com/ivangrynenko/cursorrules | PHP, Python, JavaScript, Drupal rules |

## OpenCode & Other AI Coding Tools

| Resource | URL | Notes |
|----------|-----|-------|
| OpenCode Agents Docs | https://opencode.ai/docs/agents/ | Temperature-based determinism: 0.1 for analysis, 0.3 for build, 0.7 for brainstorm |
| OpenCode Main Docs | https://opencode.ai/docs/ | Open source terminal AI coding agent |

## AI Coding Tool Comparisons

| Resource | URL | Notes |
|----------|-----|-------|
| CodeAnt - Cursor vs Windsurf vs Copilot | https://www.codeant.ai/blogs/best-ai-code-editor-cursor-vs-windsurf-vs-copilot | 2025 showdown |
| Faros AI - Best AI Coding Agents 2026 | https://www.faros.ai/blog/best-ai-coding-agents-2026 | "Reliability and Verification Loops matter more than feature checklists" |
| Shakudo - Best AI Coding Assistants 2026 | https://www.shakudo.io/blog/best-ai-coding-assistants | Current landscape overview |
| The Unwind AI - Best Open-Source AI Coding Agents | https://www.theunwindai.com/p/best-open-source-ai-coding-agents-what-teams-can-actually-ship-with-in-2026 | Team-focused comparison |

## Curated Collections

| Resource | URL | Notes |
|----------|-----|-------|
| awesome-claude-code | https://github.com/hesreallyhim/awesome-claude-code | Skills, hooks, slash-commands, agent orchestrators, plugins |
| ProductTalk - Claude Code Features Guide | https://www.producttalk.org/how-to-use-claude-code-features/ | Slash commands, agents, skills, plug-ins |
| anthropics/claude-code (Official) | https://github.com/anthropics/claude-code | Official repo |

## Cross-Platform Dotfile References

| Resource | URL | Notes |
|----------|-----|-------|
| Reproducible Builds | https://reproducible-builds.org/ | Software practices for verifiable source-to-binary paths |
| nanomaoli/llm_reproducibility | https://github.com/nanomaoli/llm_reproducibility | LLM reproducibility research |

## AI Hallucination Prevention & Verification

| Resource | URL | Notes |
|----------|-----|-------|
| Anthropic: Reduce Hallucinations | https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations | Official: allow "I don't know", direct quotes, verify with citations, chain-of-thought |
| Claude Code Best Practices | https://code.claude.com/docs/en/best-practices | "Trust-then-verify gap" anti-pattern; prefer deterministic tools over LLM reasoning |
| Trust But Verify (Addy Osmani) | https://addyo.substack.com/p/the-trust-but-verify-pattern-for | AI as copilot not autopilot; mandatory review; verify APIs/packages exist |
| Stop Hallucinations in Cursor (HackerNoon) | https://hackernoon.com/how-i-use-cursor-rules-to-stop-hallucinations-in-production | "Code real code, no fakes"; module memory pattern |
| Minimize Hallucinations 90% (Dabrowski) | https://damiandabrowski.medium.com/day-80-of-100-days-agentic-engineer-challenge-how-to-minimize-ai-hallucinations-in-cursor-by-90-e2687a82e5ac | .cursorrules knowledge base; never code outside provided context |
| When AI Hallucinates (31 Days of Vibe Coding) | https://31daysofvibecoding.com/2026/01/14/when-ai-hallucinates/ | Red flags: methods you've never seen, too-perfect solutions |
| Anti-Hallucination Prompt (Vibe Code Directory) | https://vibecodedirectory.beehiiv.com/p/cursor-ai-hallucinations-killing-your-code-the-ultimate-anti-hallucination-prompt-that-forces-planni | Forces planning before coding; claims 70% error reduction |
| HumanLayer - Writing a Good CLAUDE.md | https://www.humanlayer.dev/blog/writing-a-good-claude-md | "Never send an LLM to do a linter's job"; prefer deterministic tools |
| Stop AI Hallucinations Guide (Infomineo) | https://infomineo.com/artificial-intelligence/stop-ai-hallucinations-detection-prevention-verification-guide-2025/ | AI as information processor not fact creator; confidence flagging |
| LLM Output Validation (Medium) | https://manuspandey.medium.com/llm-output-validation-never-trust-always-verify-0b1835b95dda | Structured validation patterns; never trust without verification |
| AI Is Confidently Wrong (AIQA Research) | https://research.aiqa.io/your-ai-assistant-is-confidently-wrong-and-thats-more-dangerous-than-you-think-2/ | AI avoids "I don't know" due to training bias |
| Teaching AI to Admit Uncertainty (Johns Hopkins) | https://hub.jhu.edu/2025/06/26/teaching-ai-to-admit-uncertainty/ | Confidence scores; crucial for high-stakes domains |
| Citation-Grounded Code Comprehension (arXiv) | https://arxiv.html/2512.12117v1 | Negative correlation between self-citation rate and hallucination rate |
| Deterministic Quoting for Healthcare LLMs | https://mattyyeung.github.io/deterministic-quoting | Ensures quotations are verbatim, not hallucinated |
| Custom ESLint Rules for AI Determinism | https://understandingdata.com/posts/custom-eslint-rules-determinism/ | Encode architectural decisions as deterministic constraints |
| NIST AI 600-1: GenAI Risk Management | https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf | Confabulation as formal risk; traceable high-integrity info |
| AI Hallucination Report 2026 (AllAboutAI) | https://www.allaboutai.com/resources/ai-statistics/ai-hallucinations/ | Best models still ~0.7% hallucination; financial institutions affected |
| steipete/agent-rules (GitHub) | https://github.com/steipete/agent-rules | "No inventions — don't invent changes other than what's explicitly requested" |
| 0xdevalias: AI Agent Rule Files Survey | https://gist.github.com/0xdevalias/f40bc5a6f84c4c5ad862e314894b2fa6 | Comprehensive survey of CLAUDE.md, AGENTS.md, .cursorrules formats |
| RayFernando1337/llm-cursor-rules | https://github.com/RayFernando1337/llm-cursor-rules/blob/main/generate-claude.md | CLAUDE.md as authoritative source; concrete validation steps |
| Claude Keeps Making Same Mistakes (Medium) | https://medium.com/@elliotJL/your-ai-has-infinite-knowledge-and-zero-habits-heres-the-fix-e279215d478d | Anti-hallucination: no generating stats, no referencing unnamed studies |
| Controlling LLM Hallucinations (Parasoft) | https://www.parasoft.com/blog/controlling-llm-hallucinations-application-level-best-practices/ | Zero tolerance for fabricated content; fabricated URLs = reject |
| Keep Hallucinations Out of Code (InfoWorld) | https://www.infoworld.com/article/3822251/how-to-keep-ai-hallucinations-out-of-your-code.html | Hallucinated packages = slopsquatting attack vector |
| AI Accuracy != Truth (UN University) | https://unu.edu/article/never-assume-accuracy-artificial-intelligence-information-equals-truth | Verification against authoritative sources mandatory |
| Vibe Coding != AI-Assisted Engineering (Osmani) | https://medium.com/@addyosmani/vibe-coding-is-not-the-same-as-ai-assisted-engineering-3f81088d5b98 | Never ship code you don't understand; domain knowledge is human's job |

## Key Findings

1. **No one has an explicit "prefer deterministic" CLAUDE.md rule** - the concept appears indirectly through "prefer explicit over implicit", "composable/testable functions", and hook-based enforcement
2. **Community consensus**: deterministic enforcement (hooks, linters, formatters) > advisory rules (CLAUDE.md) for must-do behaviors
3. **Context window matters**: research suggests frontier models follow ~150-200 instructions consistently; beyond that, instruction-following degrades uniformly
4. **Temperature tuning** (OpenCode) is the only tool-level approach to determinism found; all others treat it as a code quality concern
5. **The "Deterministic by Default" rule we added is novel** as an explicit coding philosophy instruction to the model about the code it generates
6. **Hallucination is universal**: best models still hallucinate ~0.7% of the time; financial institutions report hallucinated regulatory frameworks and metrics
7. **"I don't know" is undertrained**: LLMs are biased toward generating complete-sounding answers over expressing uncertainty due to training incentives
8. **Slopsquatting is real**: hallucinated package names become attack vectors when developers blindly install AI suggestions
9. **Verification must be architectural**: rules alone (CLAUDE.md, .cursorrules) are advisory; deterministic enforcement (hooks, linters, tests) is required for reliability
10. **AI as processor, not source**: the consistent recommendation across all sources is to use AI to transform/query/format data, never to generate authoritative data
