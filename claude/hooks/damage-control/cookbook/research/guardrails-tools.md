# AI Agent Security Tools & Guardrails

> **Research Date**: 2025-01-29
> **Focus**: Open-source guardrail frameworks and their approaches
> **Sources**: GitHub repositories, official documentation

---

## Overview

This research covers open-source tools and frameworks for securing AI agents, with focus on approaches applicable to Claude Code hooks.

---

## 1. Guardrails AI

**Repository:** [guardrails-ai/guardrails](https://github.com/guardrails-ai/guardrails)
**Website:** [guardrailsai.com](https://www.guardrailsai.com/)

### Architecture
- **Input/Output Guards**: Intercept LLM inputs and outputs for validation
- **Validator Hub**: 100+ community-contributed validators
- **Dual mode**: Open-source core + Guardrails Pro (managed service)

### Key Validators (from [Guardrails Hub](https://guardrailsai.com/hub))
| Category | Validators |
|----------|-----------|
| PII | `GuardrailsPII` - Uses Presidio + GLiNER; detects phone, email, SSN, etc. |
| Toxic Content | `toxic_language` - Configurable threshold, sentence-level validation |
| Secrets | Regex-based API key/credential detection |
| Jailbreak | Embedding similarity against Arize AI jailbreak dataset |
| Bias | Age, gender, ethnicity, religion bias detection |
| Hallucination | Semantic similarity against ground truth |

### Integration Pattern
```python
from guardrails.hub import GuardrailsPII
guard = Guard().use(GuardrailsPII(entities=["phone_number", "email", "ssn"], on_fail="fix"))
```

### Adaptable for Claude Code Hooks
- **PreToolUse**: Validate inputs before file writes or commands
- **PostToolUse**: Scan outputs for PII/secrets before displaying
- Validators can run as standalone Python functions

---

## 2. garak (NVIDIA)

**Repository:** [NVIDIA/garak](https://github.com/NVIDIA/garak)
**Website:** [garak.ai](https://garak.ai/)

### Architecture (4 Components)
1. **Generators**: Connect to target LLMs (OpenAI, HuggingFace, Ollama)
2. **Probes**: Attack payloads targeting specific vulnerabilities
3. **Detectors**: Analyze responses (string matching, ML classifiers, LLM-as-judge)
4. **Buffs**: Input mutation/fuzzing modules

### Attack Categories Tested
| Category | Description |
|----------|-------------|
| Prompt Injection | Malicious instruction insertion |
| Data Leakage | Training data/confidential info exposure |
| Hallucinations | Factually incorrect generation |
| Toxicity | Offensive/harmful language |
| Jailbreaks | Safety mechanism bypass |
| Encoding Attacks | Base64, Unicode obfuscation |
| XSS | Cross-site scripting in outputs |

### Use for Claude Code
- **Testing hooks**: Run garak against hook-protected Claude Code to validate defenses
- **Pattern library**: Extract probe patterns for input validation regex
- **Red-team automation**: Continuous security testing

---

## 3. LLM Guard (Protect AI)

**Repository:** [protectai/llm-guard](https://github.com/protectai/llm-guard)
**Website:** [protectai.com/llm-guard](https://protectai.com/llm-guard)

### Architecture
- **Dual-gate model**: Input scanners + Output scanners
- **36 scanners** total
- **Common interface**: `scan()` returns `(sanitized_text, is_valid, risk_score)`
- **REST API service**: `llm-guard-api` for HTTP integration

### Scanner Categories

**Input Scanners:**
| Scanner | Function |
|---------|----------|
| `Anonymize` | PII detection/redaction (English, Chinese) |
| `Secrets` | API keys, credentials, tokens |
| `PromptInjection` | Injection attack detection |
| `Toxicity` | Harmful content filtering |
| `BanTopics` | Topic restriction |

**Output Scanners:**
| Scanner | Function |
|---------|----------|
| `Sensitive` | PII in responses |
| `Relevance` | Response-to-prompt alignment |
| `FactualConsistency` | Hallucination detection |
| `NoRefusal` | Detect unhelpful refusals |

### Adaptable for Claude Code Hooks
```python
from llm_guard.input_scanners import Anonymize, Secrets
from llm_guard.output_scanners import Sensitive

# PreToolUse hook
sanitized, is_valid, score = Anonymize().scan(prompt)
if not is_valid or score > 0.7:
    sys.exit(2)  # Block operation
```

---

## 4. Rebuff (Protect AI)

**Repository:** [protectai/rebuff](https://github.com/protectai/rebuff)

### Multi-Layer Defense Architecture
1. **Heuristics**: Pattern-based filtering (fast, first pass)
2. **LLM-based detection**: Dedicated LLM analyzes prompts
3. **VectorDB**: Embeddings of previous attacks for similarity matching
4. **Canary tokens**: Detect data leakage by injecting traceable tokens

### Key Insight for Claude Code
- **Self-hardening**: System learns from attacks over time
- **Canary approach**: Could inject markers in sensitive file reads to detect exfiltration
- **Layered defense**: Combine fast heuristics with deeper ML analysis

### Limitations
- Still a prototype, not 100% protection
- Skilled attackers can bypass

---

## 5. NeMo Guardrails (NVIDIA)

**Repository:** [NVIDIA-NeMo/Guardrails](https://github.com/NVIDIA-NeMo/Guardrails)
**Docs:** [docs.nvidia.com/nemo/guardrails](https://docs.nvidia.com/nemo/guardrails/latest/index.html)

### Architecture (Event-Driven)
- **Event loop**: Processes events, generates responses
- **Canonical forms**: User intent extraction via vector search + LLM
- **Flow-based**: Dialog paths control behavior

### Five Rail Types
| Rail Type | Purpose |
|-----------|---------|
| **Input rails** | Validate/sanitize user input; can reject or mask |
| **Output rails** | Filter/modify LLM responses |
| **Dialog rails** | Control conversation flow, prompt construction |
| **Retrieval rails** | Filter RAG chunks before prompting |
| **Execution rails** | Control action execution |

### Key Capabilities
- **Colang**: Domain-specific language for defining rails
- **Self-checking**: Built-in hallucination detection, fact-checking
- **LangGraph integration**: Multi-agent workflow support (recent)
- **Performance**: 5 parallel guardrails add only ~0.5s latency

### Adaptable for Claude Code
- **Dialog rails concept**: Define allowed command patterns
- **Retrieval rails pattern**: Filter file content before Claude processes
- **Modular architecture**: Rails can be enabled/disabled per context

---

## 6. LlamaFirewall (Meta)

**Paper:** [arxiv.org/abs/2505.03574](https://arxiv.org/abs/2505.03574)
**Website:** [llama.com/llama-protections](https://www.llama.com/llama-protections/)

### Three Core Components

| Component | Function | Model Size |
|-----------|----------|------------|
| **PromptGuard 2** | Jailbreak/injection detection | 86M (full) / 22M (lite) |
| **AlignmentCheck** | Chain-of-thought auditing for goal hijacking | Llama 4 Maverick |
| **CodeShield** | Static analysis of generated code | Semgrep + regex rules |

### Performance (AgentDojo Benchmark)
- PromptGuard 2 alone: Attack success rate 17.6% → 7.5%
- Combined system: 90% reduction in ASR (down to 1.75%)
- CodeShield: 96% precision, 79% recall for insecure code

### Adaptable for Claude Code
- **PromptGuard 2**: Run on tool outputs before Claude processes (PostToolUse)
- **CodeShield**: Pre-commit hook for generated code
- **AlignmentCheck concept**: Audit Claude's reasoning for injection artifacts

---

## 7. LangChain Security Patterns

**Docs:** [docs.langchain.com/oss/python/langchain/guardrails](https://docs.langchain.com/oss/python/langchain/guardrails)

### Implementation Approaches
1. **Rule-based**: Regex patterns, keyword matching, explicit checks (fast, predictable)
2. **LLM-based**: Semantic validation via classifier/LLM (slower, catches nuance)

### Built-in Middleware
- **PII detection**: Emails, credit cards, IP addresses
- **Human-in-the-loop**: Approval gates
- **Output validation**: JSON schema, token limits, regex patterns

### Zero-Latency Guardrail Patterns (9 patterns)
1. Schema validation
2. Constrained decoding
3. Argument sanitizers
4. RBAC filters
5. Budget limits
6. Safe defaults
7. Output parsers
8. Retry with validation
9. Structured output

---

## 8. Lasso Security Defender

**Repository:** [lasso-security/claude-hooks](https://github.com/lasso-security/claude-hooks)

Detects 5 attack categories in tool outputs:
1. **Instruction Override** ("ignore previous", "new system prompt")
2. **Role-Playing/DAN attacks**
3. **Encoding/Obfuscation** (Base64, leetspeak, homoglyphs)
4. **Context Manipulation** (fake authority, hidden comments)
5. **Instruction Smuggling** (hidden in HTML/code comments)

---

## Data Exfiltration Prevention Patterns

### Detection Techniques
| Technique | Description |
|-----------|-------------|
| **DLP Systems** | Monitor data movement, generate risk scores |
| **UEBA** | Behavioral analytics for anomaly detection |
| **Pattern matching** | Regex for credit cards, SSN, API keys |
| **Runtime monitoring** | Real-time anomaly detection |

### Prevention Techniques
| Technique | Description |
|-----------|-------------|
| **Input sanitization** | Remove/mask sensitive data before LLM |
| **Output filtering** | Scan responses before displaying |
| **Canary tokens** | Detect when sensitive content is accessed |
| **Network isolation** | Block outbound connections |

### Challenges
- Obfuscation attacks (Base64, Unicode, Morse code, reverse order)
- Exfiltration via legitimate services (subdomain tunneling)
- Detection difficulty without SSL inspection

---

## Recommendations for Claude Code Hooks

### Architecture (Layered Defense)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER PROMPT                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: UserPromptSubmit Hook                              │
│ - Fast heuristics (regex patterns from garak probes)        │
│ - Jailbreak phrase detection (Rebuff patterns)              │
│ - PII in prompt detection (LLM Guard Anonymize)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: PreToolUse Hook                                    │
│ - Command validation (dangerous command blocklist)          │
│ - Path validation (prevent access to sensitive dirs)        │
│ - Argument sanitization (remove shell metacharacters)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Tool Execution (Sandboxed)                         │
│ - Filesystem isolation                                       │
│ - Network isolation                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: PostToolUse Hook                                   │
│ - Prompt injection detection in outputs (Lasso patterns)    │
│ - PII/secrets in file content (LLM Guard Sensitive)         │
│ - Exfiltration canary detection                              │
└─────────────────────────────────────────────────────────────┘
```

### Specific Tool Adaptations

| Tool | What to Adapt | Hook Type |
|------|---------------|-----------|
| **garak** | Probe patterns as detection regex | UserPromptSubmit |
| **LLM Guard** | Anonymize/Secrets scanners | PreToolUse, PostToolUse |
| **Rebuff** | Heuristic patterns + canary tokens | UserPromptSubmit, PostToolUse |
| **Guardrails AI** | PII/toxic validators | PostToolUse |
| **LlamaFirewall** | PromptGuard 2 model (22M lite) | PostToolUse |
| **NeMo** | Colang-style rule definitions | Configuration |
| **Lasso** | 5 attack category patterns | PostToolUse |

### Priority Implementation

1. **High Impact, Low Effort:**
   - Dangerous command blocklist (rm -rf, curl to external, etc.)
   - Sensitive path protection (~/.ssh, ~/.aws, .env files)
   - Basic prompt injection patterns (regex from Lasso)

2. **Medium Effort:**
   - LLM Guard scanner integration (pip installable)
   - PII detection before file writes
   - Secrets scanning in outputs

3. **Advanced:**
   - PromptGuard 2 model integration
   - VectorDB for attack similarity (Rebuff pattern)
   - Canary token injection for exfiltration detection

---

## Applicability to damage-control

| Tool Concept | Current State | Enhancement Opportunity |
|--------------|---------------|------------------------|
| Command blocklist | Implemented | Add more cloud CLI patterns |
| Path protection | Implemented | Already comprehensive |
| Shell unwrapping | Implemented | Verify against garak probes |
| PostToolUse scanning | Not implemented | Add Lasso-style injection detection |
| Canary tokens | Not implemented | Inject markers in sensitive reads |
| PII detection | Not implemented | Integrate LLM Guard scanners |

---

## Source URLs

- https://github.com/guardrails-ai/guardrails
- https://guardrailsai.com/hub
- https://github.com/NVIDIA/garak
- https://github.com/protectai/llm-guard
- https://protectai.github.io/llm-guard/input_scanners/anonymize/
- https://github.com/protectai/rebuff
- https://github.com/NVIDIA-NeMo/Guardrails
- https://github.com/NVIDIA-NeMo/Guardrails/blob/main/docs/architecture/README.md
- https://arxiv.org/abs/2505.03574
- https://docs.langchain.com/oss/python/langchain/guardrails
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sandboxing
- https://github.com/lasso-security/claude-hooks
- https://www.lakera.ai/blog/data-exfiltration
- https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/
