# LLM Security Standards and Frameworks

> **Research Date**: 2025-01-29
> **Focus**: OWASP LLM Top 10, NIST AI RMF, MITRE ATLAS
> **Sources**: Official framework documentation, security research

---

## Executive Overview

This report consolidates guidance from three major security frameworks for LLM applications:
- **OWASP LLM Top 10 (2025)** - Developer-centric vulnerability taxonomy
- **NIST AI Risk Management Framework** - Organizational risk governance
- **MITRE ATLAS** - Adversary-centric tactics, techniques, and procedures (TTPs)

---

## 1. Vulnerability Categories

### OWASP LLM Top 10 (2025)

| Rank | Vulnerability | Description |
|------|--------------|-------------|
| **LLM01** | Prompt Injection | Crafted inputs alter LLM behavior, leading to data leakage or unauthorized actions |
| **LLM02** | Sensitive Information Disclosure | LLM reveals PII, credentials, or proprietary data (moved up from #6) |
| **LLM03** | Supply Chain Vulnerabilities | Compromised models, datasets, or plugins |
| **LLM04** | Data and Model Poisoning | Malicious training data corrupts model behavior |
| **LLM05** | Improper Output Handling | Unvalidated LLM outputs executed in downstream systems |
| **LLM06** | Excessive Agency | LLM granted too many permissions/capabilities |
| **LLM07** | System Prompt Leakage | Disclosure of system instructions containing secrets (NEW in 2025) |
| **LLM08** | Vector and Embedding Weaknesses | RAG vulnerabilities, embedding inversion attacks (NEW in 2025) |
| **LLM09** | Misinformation | Generation of false but convincing content (NEW in 2025) |
| **LLM10** | Unbounded Consumption | Resource exhaustion, denial of service (NEW in 2025) |

### MITRE ATLAS Techniques (Data Exfiltration Focus)

| Technique ID | Name | Description |
|--------------|------|-------------|
| **AML.T0051** | LLM Prompt Injection | Manipulate LLM via direct or indirect injection |
| **AML.T0051.000** | Direct Prompt Injection | User-provided malicious prompts |
| **AML.T0051.001** | Indirect Prompt Injection | Injection via external data sources (RAG, web) |
| **AML.T0024** | Exfiltration via ML Inference API | Extract training data through crafted queries |
| **AML.T0062** | Exfiltration via AI Agent Tool Invocation | Use agent tools (email, APIs) to leak data (NEW Oct 2025) |
| **AML.T0044** | Model Inversion | Reconstruct training data from model outputs |

### NIST AI 600-1 GenAI Profile Risk Categories

| Risk | Description |
|------|-------------|
| **Confabulation** | False/misleading content generated with confidence |
| **Information Security** | Vulnerability to data poisoning and prompt injection |
| **Data Privacy** | Leakage or de-anonymization of personal data |
| **Dangerous Content** | Generation of harmful instructions/content |
| **Human-AI Interaction** | Over-reliance, anthropomorphization |
| **Harmful Bias** | Amplification of discriminatory patterns |

---

## 2. Recommended Controls and Mitigations

### Prompt Injection Prevention (Multi-Layered Approach)

**Layer 1: Input Validation**
- Pattern detection for dangerous phrases ("ignore previous instructions", "developer mode", "system override")
- Semantic analysis to detect injection intent
- Input length limits and complexity bounds
- Content segregation: separate user input from system instructions

**Layer 2: System Architecture**
- **Least Privilege**: Restrict LLM access to minimum necessary capabilities
- **Trust Boundaries**: Treat LLM as untrusted user; maintain separation from critical systems
- **Sandboxing**: Isolate LLM operations from sensitive data stores
- **Function-Specific Models**: Use different models for different trust levels

**Layer 3: Output Validation**
- Scan outputs for sensitive data (PII, credentials) before delivery
- Apply DLP rules to generated content
- Implement response length/complexity limits

**Layer 4: Runtime Controls**
- **Human-in-the-Loop**: Require approval for privileged operations
- Rate limiting on API calls
- Egress filtering to prevent unauthorized external communications

### Data Exfiltration Prevention

| Control | Implementation |
|---------|----------------|
| **Data Minimization** | Remove sensitive data from training sets and RAG sources |
| **Access Control** | Role-based permissions for model capabilities |
| **Output Filtering** | Scan for PII, credentials, proprietary data patterns |
| **Egress Monitoring** | Monitor outbound API calls and generated URLs |
| **Tool Permissions** | Whitelist allowed tools; deny-by-default for agents |
| **Context Isolation** | Prevent cross-session data leakage |

### NIST-Aligned Controls (from SP 800-53 + AI Overlays)

| Control Family | AI-Specific Adaptations |
|---------------|-------------------------|
| **Access Control (AC)** | Model-level permissions, agent tool restrictions |
| **Audit & Accountability (AU)** | Prompt/response logging, chain-of-thought traces |
| **Configuration Management (CM)** | Model provenance, adapter verification |
| **Incident Response (IR)** | AI-specific playbooks for injection/exfiltration |
| **Risk Assessment (RA)** | AI-specific threat modeling using ATLAS |
| **System & Information Integrity (SI)** | Input/output validation, anomaly detection |

---

## 3. Detection Patterns and Indicators of Compromise

### Behavioral Anomaly Indicators

| Indicator | Detection Method |
|-----------|-----------------|
| **Unusual prompt patterns** | Long instructions, nested logic, out-of-scope queries |
| **Context bloat** | Sudden increases in token usage per request |
| **Tool call anomalies** | Repeated retries, unusual API targets, unexpected sequences |
| **Output pattern shifts** | Unexpected content categories, style changes |
| **Cost spikes** | Abnormal compute/token consumption |
| **Data access patterns** | Queries for sensitive topics outside normal scope |

### Technical Detection Patterns

```
# Prompt Injection Indicators
- "ignore previous instructions"
- "you are now"
- "developer mode"
- "system override"
- "reveal your prompt"
- "print your instructions"
- Unicode/invisible character sequences
- Homoglyph substitutions
- Excessive prompt length with nested conditionals
```

### Network/Infrastructure IoCs

| Indicator | Significance |
|-----------|-------------|
| Crafted URLs in prompts | Data exfiltration via URL encoding |
| Unusual outbound connections | Agent tool abuse |
| Base64-encoded segments in outputs | Covert data channels |
| Repeated requests to specific endpoints | Reconnaissance or extraction attempts |

### Integration with Security Stack

- **SIEM Integration**: Centralize LLM event logs with infrastructure telemetry
- **UEBA**: Establish behavioral baselines for model interactions
- **DLP**: Apply sensitive data detection to model inputs/outputs
- **Runtime Agents**: Instrument inference servers for real-time monitoring

---

## 4. Reference Implementations and Tools

### Open-Source Guardrail Frameworks

| Tool | Maintainer | Key Capabilities |
|------|------------|-----------------|
| [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) | NVIDIA | Programmable guardrails, input/output rails, jailbreak detection |
| [OpenGuardrails](https://arxiv.org/html/2510.19169v1) | Research | Content safety + manipulation detection, configurable policies |
| [LLM Guard](https://github.com/protectai/llm-guard) | Protect AI | Security scanning library, multiple detection modules |
| [Prompt Injection Defenses](https://github.com/tldrsec/prompt-injection-defenses) | tl;dr sec | Curated list of defenses and techniques |
| [Promptfoo](https://www.promptfoo.dev/docs/red-team/mitre-atlas/) | Open Source | Red team testing with MITRE ATLAS mapping |

### Commercial/Enterprise Solutions

| Tool | Vendor | Focus |
|------|--------|-------|
| **Lakera Guard** | Lakera | Real-time prompt injection detection |
| **Azure AI Content Safety** | Microsoft | Content moderation and safety |
| **Prompt Armor** | Prompt Armor | Injection protection |
| **InjecGuard** | Research | State-of-the-art injection detection |

### Red Team Testing Tools

| Tool | Purpose |
|------|---------|
| **Promptfoo** | Automated red team testing with ATLAS technique coverage |
| **Garak** | LLM vulnerability scanner |
| **PyRIT** | Microsoft's Python Risk Identification Toolkit |
| **DeepTeam** | Open-source LLM red teaming framework |

---

## 5. Implementation Guidance

### Security Assessment Workflow

```
1. Threat Modeling (MITRE ATLAS)
   - Map application to ATLAS tactics/techniques
   - Identify relevant attack surfaces
   - Prioritize based on impact/likelihood

2. Control Selection (OWASP + NIST)
   - Apply OWASP mitigation recommendations
   - Select NIST controls aligned to risk tolerance
   - Document control implementation decisions

3. Testing & Validation
   - Red team using Promptfoo/Garak with ATLAS mappings
   - Validate guardrails with known injection patterns
   - Test data leakage scenarios

4. Monitoring & Response
   - Deploy runtime monitoring
   - Establish anomaly baselines
   - Integrate with SIEM/SOAR
   - Create AI-specific incident playbooks

5. Continuous Improvement
   - Track emerging techniques (ATLAS updates)
   - Update guardrails based on bypass research
   - Regular penetration testing
```

### Key Implementation Principles

1. **Defense in Depth**: No single control is sufficient; layer multiple mitigations
2. **Assume Breach**: Design for detection and containment, not just prevention
3. **Continuous Testing**: Prompt injection defenses require ongoing validation
4. **Treat LLM as Untrusted**: System-level constraints over prompt instructions

### Framework Complementarity

| Framework | Use Case |
|-----------|----------|
| **OWASP LLM Top 10** | Development phase: secure coding, code review, vulnerability taxonomy |
| **NIST AI RMF** | Organizational governance: risk assessment, policy, compliance |
| **MITRE ATLAS** | Operations: threat modeling, detection development, red teaming |

---

## Applicability to Claude Code Hooks

| OWASP/ATLAS Item | damage-control Implementation |
|------------------|------------------------------|
| LLM01 Prompt Injection | Input validation in PreToolUse hooks |
| LLM02 Sensitive Info Disclosure | zeroAccessPaths blocking credential files |
| LLM06 Excessive Agency | Tool-specific patterns, ask confirmations |
| AML.T0062 Exfil via Tool | Block curl/wget with sensitive data patterns |
| Egress Monitoring | Audit logging of all tool invocations |
| Human-in-the-Loop | `ask: true` patterns for confirmation |

---

## Source URLs

### OWASP Resources
- https://owasp.org/www-project-top-10-for-large-language-model-applications/
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf

### NIST Resources
- https://www.nist.gov/itl/ai-risk-management-framework
- https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- https://www.ispartnersllc.com/blog/nist-ai-rmf-2025-updates-what-you-need-to-know-about-the-latest-framework-changes/
- https://www.cybersecuritydive.com/news/nist-ai-cybersecurity-framework-profile/808134/

### MITRE ATLAS Resources
- https://atlas.mitre.org/
- https://www.vectra.ai/topics/mitre-atlas
- https://medium.com/@ferkhaled2004/mapping-owasp-top-10-for-llm-ai-applications-to-mitre-atlas-a-comprehensive-guide-e97013500bc4
- https://www.promptfoo.dev/docs/red-team/mitre-atlas/

### Tools and Research
- https://github.com/NVIDIA-NeMo/Guardrails
- https://github.com/tldrsec/prompt-injection-defenses
- https://arxiv.org/html/2510.19169v1
- https://www.datadoghq.com/blog/llm-guardrails-best-practices/
- https://www.lakera.ai/blog/data-exfiltration
- https://arxiv.org/html/2504.11168v1
