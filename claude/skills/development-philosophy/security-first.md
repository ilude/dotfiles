# Security-First Design

Systematically evaluate security implications before implementation.

---

## CRITICAL: Avoid Security Theater

**Finding problems is easy. Finding problems WORTH SOLVING is hard.**

Before recommending ANY security control, ask:

1. **Is this a real threat or a hypothetical one?**
   - "An attacker could..." vs "An attacker would realistically..."
   - What's the actual attack path? Who is the attacker?

2. **Is the mitigation already covered elsewhere?**
   - Network segmentation at VPC/firewall level?
   - Authentication/authorization at app level?
   - Don't add defense-in-depth that defends against nothing

3. **Does the mitigation actually mitigate?**
   - A security control that's always disabled in practice is theater
   - An input validator that doesn't reject malicious input is theater

4. **Is the operational cost worth the security benefit?**
   - Complexity has security costs (harder to audit, more failure modes)
   - Availability is part of security

### The Security Theater Litmus Test

> "If I remove this control, what specific attack becomes possible that wasn't possible before?"

If the answer is vague ("defense in depth", "best practices"), the control may be theater.

### Anti-Patterns to Avoid

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| **Checkbox security** | "Add mTLS because best practices" | Adds complexity without threat modeling |
| **Hypothetical hardening** | "An attacker could pivot from service A to B" | Ignores that A and B are the same app |
| **Complexity-as-security** | "Encrypt all internal traffic" | In a single-tenant app where TLS terminates at edge |

---

## When to Apply

- Designing new authentication/authorization systems
- Building APIs that handle sensitive data
- Implementing user input handling
- Reviewing security concerns in existing code
- Planning features with security requirements

## Framework

Five-phase security analysis framework:

1. **Attack Surface Mapping** - Identify all external inputs, resource access, privileges, data handling, and authentication needs
2. **Threat Modeling** - Evaluate injection attacks, authentication bypass, authorization bypass, data exposure, and denial of service vectors
3. **Secret Management Audit** - Verify API keys, credentials, .gitignore rules, logging, and encryption
4. **Input Validation Design** - Establish whitelist validation, type/length/format checks, sanitization, and escaping
5. **Security Checklist** - Verify no secrets in code, input validation coverage, least privilege, safe error messages, dependency scanning, and documented risks

## Usage

Apply this framework when security is a primary design concern. Work through phases sequentially, documenting findings and mitigations at each stage.

---

## Security Analysis Template

Use this checklist when performing security analysis:

```
Phase 1: Attack Surface Mapping
- What external inputs exist?
- What resources are accessed?
- What privileges are required?
- What data is stored/transmitted?
- What authentication is needed?

Phase 2: Threat Modeling
- **Injection attacks**: SQL, command, XSS, path traversal
- **Authentication bypass**: Default credentials, weak tokens
- **Authorization bypass**: IDOR, privilege escalation
- **Data exposure**: Secrets in logs, error messages, commits
- **Denial of service**: Resource exhaustion, infinite loops

Phase 3: Secret Management Audit
- Are API keys in environment variables?
- Are credentials hardcoded anywhere?
- Is .env in .gitignore?
- Are secrets logged accidentally?
- Is sensitive data encrypted at rest?

Phase 4: Input Validation Design
- Whitelist valid inputs (not blacklist)
- Validate types, lengths, formats
- Sanitize before use in commands/queries
- Escape before rendering in UI
- Reject malformed data early

Phase 5: Security Checklist
- [ ] No secrets in code/commits
- [ ] Input validation on all external data
- [ ] Principle of least privilege applied
- [ ] Error messages don't leak info
- [ ] Dependencies scanned for vulnerabilities
- [ ] Authentication/authorization correct
- [ ] Remaining risks documented with mitigations
```
