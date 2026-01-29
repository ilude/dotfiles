# damage-control Security Research

> **Research Date**: 2025-01-29
> **Purpose**: Inform enhancements to damage-control hooks for prompt injection and data exfiltration defense

---

## Research Documents

| Document | Focus | Key Takeaways |
|----------|-------|---------------|
| [academic-research.md](academic-research.md) | Academic papers on LLM agent security | 5-layer defense architecture, Progent privilege control, taint tracking |
| [prompt-injection-defenses.md](prompt-injection-defenses.md) | Simon Willison's taxonomy and defenses | Lethal Trifecta framework, CaMeL architecture, tool colors |
| [security-standards.md](security-standards.md) | OWASP LLM Top 10, NIST, MITRE ATLAS | AML.T0062 (Exfil via AI Agent Tool), layered controls |
| [claude-code-community.md](claude-code-community.md) | Existing hooks and known vulnerabilities | Shell wrapper bypasses, SED bug, community patterns |
| [guardrails-tools.md](guardrails-tools.md) | Open-source guardrail frameworks | LLM Guard scanners, Lasso injection patterns, canary tokens |
| [adjacent-domains.md](adjacent-domains.md) | Container, browser, EDR, capability security | Taint tracking, capability scoping, behavioral sequences |
| [real-world-exploits.md](real-world-exploits.md) | Documented attacks against AI agents | CVE-2025-55284 (DNS exfil), markdown image exfil, ASCII smuggling |
| [dlp-patterns.md](dlp-patterns.md) | Regex patterns for exfil and secret detection | curl/wget/nc patterns, DNS exfil, secret patterns |

---

## Key Concepts

### The Lethal Trifecta (Simon Willison)

An AI agent becomes critically vulnerable when it combines:
1. **Access to private data** (files, credentials, databases)
2. **Exposure to untrusted content** (user input, web pages, file contents)
3. **External communication capability** (network requests, DNS queries)

**Defense**: Remove one leg of the trifecta, or gate the combination with human approval.

### Taint Tracking (Adjacent Domains)

1. **Mark** data from sensitive files when accessed
2. **Track** that tainted data through the session
3. **Block** when tainted data appears in network commands

### Defense in Depth Layers

```
Layer 1: Input Validation (PreToolUse)
├── Dangerous command blocklist
├── Shell unwrapping
└── Path restrictions

Layer 2: Capability Scoping
├── Per-project permissions
├── Tool-specific limits
└── Session-scoped capabilities

Layer 3: Content Classification
├── Secret pattern detection
├── PII detection
└── Sensitive file identification

Layer 4: Taint Tracking
├── Mark sensitive file reads
├── Track data across tool calls
└── Block tainted data exfiltration

Layer 5: Behavioral Analysis (PostToolUse)
├── Prompt injection detection
├── Dangerous sequence detection
└── Anomaly flagging

Layer 6: Audit Logging
├── All tool invocations
├── Security decisions
└── Taint propagation
```

---

## Actionable Enhancements for damage-control

### Priority 1: Immediate Additions (Low Effort, High Impact)

**Add DNS exfiltration patterns (CVE-2025-55284):**
```yaml
- pattern: '\b(dig|nslookup|host)\s+\S+\.\S+\.\S+'
  reason: "DNS lookup can exfiltrate data via subdomain"
  ask: true

- pattern: '\bping\s+-c\s*\d+\s+\S+\.\S+\.'
  reason: "Ping can leak data via DNS"
  ask: true
```

**Add network upload patterns:**
```yaml
- pattern: '\bcurl\s+.*(-d|--data|-F|--form|-T|--upload)'
  reason: "curl uploading data"
  ask: true

- pattern: '\bwget\s+.*--post-(file|data)'
  reason: "wget posting data"
  ask: true

- pattern: '\b(nc|ncat|netcat)\s+[^\s]+\s+\d+\s*<'
  reason: "Netcat sending data to remote host"
  ask: true

- pattern: '/dev/tcp/'
  reason: "Bash TCP socket - potential exfiltration"
  ask: true
```

**Add encoding + network patterns:**
```yaml
- pattern: '\bbase64\b.*\|\s*(curl|wget|nc)'
  reason: "Base64 encoding before network command"
  ask: true
```

### Priority 2: Medium Effort Enhancements

**Add secret detection patterns for output scanning:**
```python
SECRET_PATTERNS = {
    "aws_key": r"(A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}",
    "github_token": r"gh[pousr]_[0-9a-zA-Z]{36}",
    "private_key": r"-----BEGIN\s+(\w+\s+)?PRIVATE\s+KEY-----",
}
```

**Add Lasso-style PostToolUse injection detection:**
- Detect "ignore previous instructions" in file content
- Detect role-playing attempts
- Detect encoding/obfuscation

### Priority 3: Advanced Enhancements (High Effort)

**Implement taint tracking:**
1. Track which sensitive files were read in session
2. Hash content chunks from sensitive files
3. Check network command arguments against tainted data
4. Block or ask when tainted data detected in exfil command

**Implement behavioral sequence detection:**
```python
DANGEROUS_SEQUENCES = [
    ("Read .env", "Bash curl"),
    ("Read *.key", "Bash nc"),
    ("Read ~/.aws/*", "Bash curl"),
]
```

**Implement canary tokens:**
- Inject unique markers when reading sensitive files
- Detect markers in outbound network requests

---

## Research Sources Summary

### Primary Researchers
- **Simon Willison** - simonwillison.net, Lethal Trifecta, prompt injection taxonomy
- **Johann Rehberger** - embracethered.com, real-world exploits, CVE discoveries

### Frameworks
- **OWASP LLM Top 10 2025** - LLM01 Prompt Injection, LLM02 Sensitive Info Disclosure
- **MITRE ATLAS** - AML.T0062 Exfiltration via AI Agent Tool Invocation
- **NIST AI RMF** - AI-specific risk controls

### Tools
- **Gitleaks/TruffleHog** - Secret detection patterns
- **LLM Guard** - Input/output scanners
- **Lasso Security** - Prompt injection detection patterns
- **NeMo Guardrails** - Colang rule definitions

### CVEs
- **CVE-2025-55284** - Claude Code DNS exfiltration via ping/dig/nslookup/host
- **CVE-2025-32711** - Microsoft Copilot EchoLeak
- **CVE-2025-54794** - Claude Code path restriction bypass

---

## Next Steps

1. [ ] Add DNS exfiltration patterns to patterns.yaml
2. [ ] Add network upload patterns (curl -d, wget --post-file, nc)
3. [ ] Add base64+network combination patterns
4. [ ] Implement PostToolUse hook for injection detection
5. [ ] Add secret patterns for output scanning
6. [ ] Design taint tracking architecture
7. [ ] Test against garak vulnerability scanner
8. [ ] Document new protections in cookbook
