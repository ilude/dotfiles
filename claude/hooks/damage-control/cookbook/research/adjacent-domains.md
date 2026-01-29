# Security Approaches from Adjacent Domains

> **Research Date**: 2025-01-29
> **Focus**: Container security, browser isolation, EDR/XDR, CASB/DLP, WAF, restricted shells, capability-based security, taint tracking
> **Goal**: Adapt patterns for Claude Code hook-based exfiltration prevention

---

## Executive Summary

This research explores security solutions from eight adjacent domains to identify patterns adaptable to Claude Code hook-based data exfiltration prevention.

---

## 1. Container Security (Docker/Kubernetes)

### Relevant Techniques

**Seccomp (Secure Computing Mode)**
- Restricts which system calls a container can execute
- Default Docker profile blocks ~44 of 300+ syscalls

**AppArmor**
- Fine-grained file/path access control via profiles
- Can restrict specific file operations on specified paths

### Adaptable Patterns

| Container Pattern | Claude Code Hook Adaptation |
|------------------|---------------------------|
| Syscall allowlist | Tool operation allowlist (which tools, which arguments) |
| Path restriction profiles | File path allowlist/blocklist in hooks |
| Network policy egress rules | Block network tools to unapproved destinations |
| Default-deny policies | Block all tool calls by default, allow specific patterns |

### References
- https://docs.docker.com/engine/security/seccomp/
- https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html
- https://securitylabs.datadoghq.com/articles/container-security-fundamentals-part-6/

---

## 2. Browser Extension Security

### Relevant Techniques

**Content Security Policy (CSP)**
- Restricts script execution, data loading, form submissions
- Sandbox directive isolates content in restricted origin

**Chrome Extension Isolation**
- Extensions have separate sandboxed pages with no API access
- Site Isolation prevents cross-origin data access

### Adaptable Patterns

| Browser Pattern | Claude Code Hook Adaptation |
|----------------|---------------------------|
| `connect-src` directive | Restrict URLs in network tool calls |
| `script-src 'self'` | Only allow bash commands from project scripts |
| Sandbox isolation | Run tool operations in restricted context |
| Permission scope limits | Limit tool capabilities per session/project |

### References
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html

---

## 3. EDR/XDR (Endpoint Detection & Response)

### Relevant Techniques

**Behavioral Analytics**
- Baseline normal behavior, flag anomalies
- Track process/file/network activity patterns

**Automated Response**
- Instant isolation when threat detected
- Block data transfers during active incident

### Adaptable Patterns

| EDR/XDR Pattern | Claude Code Hook Adaptation |
|-----------------|---------------------------|
| Behavioral baseline | Track normal tool usage per project, flag anomalies |
| File access patterns | Alert on unusual file access (reading .env, /etc/passwd) |
| Network anomaly detection | Flag large data uploads, unusual destinations |
| Automated containment | Block suspicious tool chains mid-execution |

**Example Suspicious Sequences:**
```python
EXFIL_INDICATORS = [
    ("Read", ".env") -> ("Bash", "curl"),  # Read secrets then POST
    ("Read", "*.key") -> ("Write", "/tmp/*"),  # Copy credentials
]
```

### References
- https://www.fortinet.com/resources/cyberglossary/what-is-edr
- https://www.paloaltonetworks.com/blog/security-operations/tracking-down-malicious-communication-with-advanced-xdr-detection-tactics/

---

## 4. CASB (Cloud Access Security Broker) / DLP

### Relevant Techniques

**Content Inspection & Classification**
- Classify data by sensitivity (PII, credentials, financial)
- Detect patterns: credit cards, SSNs, API keys

**Policy-Based Enforcement**
- Policies per application, user role, data type
- Block unauthorized sharing of sensitive data

### Adaptable Patterns

| CASB/DLP Pattern | Claude Code Hook Adaptation |
|------------------|---------------------------|
| Content classification | Scan tool inputs/outputs for sensitive patterns |
| Pattern detection (regex) | Detect API keys, passwords, PII in file content |
| Encryption at rest/transit | Warn when writing secrets to unencrypted files |
| Shadow IT discovery | Log all tool invocations for audit |

**Sensitive Data Patterns:**
```python
SENSITIVE_PATTERNS = [
    r"AKIA[0-9A-Z]{16}",  # AWS Access Key
    r"ghp_[a-zA-Z0-9]{36}",  # GitHub PAT
    r"-----BEGIN (RSA |EC )?PRIVATE KEY-----",
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",  # Email
]
```

### References
- https://www.microsoft.com/en-us/security/business/security-101/what-is-a-cloud-access-security-broker-casb
- https://www.forcepoint.com/blog/insights/dlp-in-casbs-protect-cloud-data

---

## 5. WAF (Web Application Firewall) Rules

### Relevant Techniques

**Outbound Data Leakage Prevention**
- Scan HTTP responses for PII, financial data
- Mask or block sensitive data before it leaves

**Signature & Anomaly Detection**
- Regex patterns for known attack/leak patterns
- Baseline traffic, flag deviations

### Adaptable Patterns

| WAF Pattern | Claude Code Hook Adaptation |
|-------------|---------------------------|
| Response body scanning | Scan tool outputs for sensitive data |
| PII masking | Redact sensitive data from logs/output |
| HTTP status filtering | Block specific error patterns that leak info |
| Request validation | Validate tool input parameters |

### References
- https://developers.cloudflare.com/waf/managed-rules/reference/sensitive-data-detection/
- https://www.alibabacloud.com/help/en/waf/web-application-firewall-2-0/user-guide/configure-data-leakage-prevention

---

## 6. Restricted Shells (rbash, rzsh)

### Relevant Techniques

**Command Restrictions**
- Block `cd`, output redirection (`>`, `>>`), path commands containing `/`
- Block environment variable modification

**Known Bypass Vectors**
- Editors with shell escape (`:!bash` in vim)
- Programming language interpreters (python, perl)
- Pagers with shell commands (less, more)

### Adaptable Patterns

| Restricted Shell Pattern | Claude Code Hook Adaptation |
|-------------------------|---------------------------|
| Block `/` in commands | Block absolute paths in Bash tool |
| Block redirection | Block `>`, `>>`, `|` to external commands |
| Block shell escapes | Block `:!`, `system()`, `exec()` in tool input |
| Allowlist commands | Only allow specific bash commands |

**Blocked Patterns:**
```python
BLOCKED_PATTERNS = [
    r"\|\s*(curl|wget|nc|netcat)",  # Pipe to network tools
    r">\s*/dev/tcp/",  # Bash /dev/tcp exfil
    r"base64.*\|",  # Encoding before piping
    r"curl.*-d\s+@",  # curl POST from file
]
```

### Lessons from Bypasses

1. Don't rely on command name blocking alone (aliases, symlinks bypass)
2. Block escape vectors in allowed tools (editors, interpreters)
3. Consider the full command chain, not individual commands

### References
- https://www.hackingarticles.in/multiple-methods-to-bypass-restricted-shell/
- https://0xffsec.com/handbook/shells/restricted-shells/

---

## 7. Capability-Based Security

### Relevant Techniques

**seL4 Microkernel Capabilities**
- Every operation requires an explicit capability token
- Capabilities encode both object reference AND access rights

**Capsicum (FreeBSD)**
- Hybrid UNIX + capability model
- Capability mode disables ambient authority (no global namespaces)

**Principle of Least Authority (POLA)**
- Components only get privileges needed for their job
- Support delegation of reduced privileges

### Adaptable Patterns

| Capability Pattern | Claude Code Hook Adaptation |
|-------------------|---------------------------|
| Capability tokens | Generate scoped tokens for each tool call |
| No ambient authority | Block tools from using global paths/namespaces |
| Least privilege | Grant minimum tool permissions per task |
| Capability delegation | Allow safe subsets of permissions |

**Session-Scoped Capabilities:**
```python
SESSION_CAPABILITIES = {
    "Edit": {"paths": ["~/projects/current/*"]},
    "Write": {"paths": ["~/projects/current/*"], "size_limit_kb": 100},
    "Bash": {"commands": ["git", "npm", "uv"], "network": False},
    "Read": {"paths": ["~/projects/current/*", "~/.gitconfig"]},
}
```

### The "Confused Deputy" Problem

The AI agent is the "deputy." Without capability controls, it can be prompt-injected to misuse its file/network access.

### References
- https://sel4.systems/About/seL4-whitepaper.pdf
- https://www.usenix.org/legacy/event/sec10/tech/full_papers/Watson.pdf
- https://en.wikipedia.org/wiki/Capability-based_security

---

## 8. Taint Tracking

### Relevant Techniques

**Dynamic Taint Analysis**
- Mark sensitive data as "tainted"
- Track propagation through program execution
- Block tainted data from reaching dangerous sinks

**Language Support**
- **Perl**: Built-in taint mode (`-T` flag), tracks external input
- **Ruby**: Taint levels with `taint`, `tainted?`, `untaint` methods

### Adaptable Patterns

| Taint Pattern | Claude Code Hook Adaptation |
|---------------|---------------------------|
| Mark external input | Tag file contents from sensitive paths |
| Track propagation | Track when sensitive data appears in tool calls |
| Sink blocking | Block network tools when tainted data present |
| Sanitization | Allow explicit "declassification" operations |

**Taint Tracking Implementation:**
```python
# Track tainted data across tool calls
TAINTED_DATA = {}  # session state

def on_read(file_path, content):
    if is_sensitive_file(file_path):
        # Hash content chunks to track
        for chunk in extract_sensitive_chunks(content):
            TAINTED_DATA[hash(chunk)] = file_path

def on_network_tool(data_being_sent):
    for chunk_hash, source in TAINTED_DATA.items():
        if hash_present_in(chunk_hash, data_being_sent):
            block(f"Attempting to exfil data from {source}")
```

### References
- https://en.wikipedia.org/wiki/Taint_checking
- https://perldoc.perl.org/perlsec

---

## Bonus: eBPF Runtime Security (Falco/Tetragon)

### Relevant Techniques

**System Call Observability**
- Trace syscalls with minimal overhead (<1%)
- Detect anomalous patterns in real-time

**Runtime Enforcement**
- Block operations in kernel space (not just alert)
- Process lifecycle tracking

### Adaptable Patterns

**Falco-Inspired Rule Format:**
```yaml
- rule: Detect credential file read followed by network
  desc: Possible exfiltration of credentials
  condition: >
    tool_sequence(
      Read(path matches "*.pem|*.key|.env|credentials*"),
      Bash(command matches "*curl*|*wget*|*nc*")
    )
  output: "Potential credential exfil: read %read.path then %bash.command"
  priority: CRITICAL
  action: block
```

### References
- https://falco.org/blog/tracing-syscalls-using-ebpf-part-1/
- https://github.com/cilium/tetragon

---

## Synthesis: Recommended Hook Architecture

### Layer 1: Input Validation (PreToolUse)
*Inspired by: WAF rules, restricted shells, CSP*

```python
PATTERNS_TO_BLOCK = {
    "Bash": [
        r"curl.*-d\s+@",      # curl POST from file
        r"\|\s*(nc|netcat)",  # pipe to netcat
        r">\s*/dev/tcp/",     # bash TCP redirect
    ],
}
```

### Layer 2: Capability Scoping
*Inspired by: seL4 capabilities, Capsicum, CASB policies*

```python
TOOL_CAPABILITIES = {
    "current_project": {
        "Edit": ["./src/*", "./tests/*"],
        "Bash": {"commands": ["git", "npm", "pytest"], "network": False}
    }
}
```

### Layer 3: Content Classification
*Inspired by: CASB/DLP, WAF data leakage prevention*

```python
SENSITIVE_PATTERNS = [
    (r"AKIA[0-9A-Z]{16}", "AWS Key"),
    (r"ghp_[a-zA-Z0-9]{36}", "GitHub PAT"),
]
```

### Layer 4: Taint Tracking
*Inspired by: Perl/Ruby taint modes, information flow control*

```python
def on_read(path, content):
    if matches_sensitive_pattern(path):
        SESSION_TAINT[content_hash] = path

def on_network(data):
    if any_tainted_in(data, SESSION_TAINT):
        block("Tainted data in network request")
```

### Layer 5: Behavioral Analysis (PostToolUse)
*Inspired by: EDR/XDR, Falco/Tetragon*

```python
DANGEROUS_SEQUENCES = [
    ("Read .env", "Bash curl"),
    ("Read *.key", "Write /tmp/*"),
]
```

### Layer 6: Audit Logging
*Inspired by: CASB logging, EDR telemetry*

---

## Implementation Priority

| Priority | Pattern | Complexity | Impact |
|----------|---------|------------|--------|
| 1 | Dangerous command blocklist | Low | High |
| 2 | Sensitive file path allowlist | Low | High |
| 3 | Content pattern detection | Medium | High |
| 4 | Capability scoping | Medium | Medium |
| 5 | Taint tracking | High | High |
| 6 | Behavioral sequence detection | High | Medium |

---

## Applicability to damage-control

| Adjacent Domain Pattern | Current State | Enhancement |
|------------------------|---------------|-------------|
| Command blocklist | Implemented | Add exfil-specific patterns |
| Path restrictions | Implemented | Already comprehensive |
| Content classification | Partial | Add AWS/GitHub key patterns |
| Capability scoping | Not implemented | Add per-project permissions |
| Taint tracking | Not implemented | Track sensitive file reads |
| Sequence detection | Not implemented | Detect read→network chains |
