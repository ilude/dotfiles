---
name: security-first-design
description: |
  Systematically evaluate security implications before implementation.
  Trigger keywords: authentication, authorization, API security, secrets, encryption, security review.
---

# Security-First-Design Skill

**Auto-activate when:** User mentions authentication, authorization, API security, sensitive data, user input, secrets management, encryption, security review, or when working with `.env$` (actual env files, not examples), `credentials.json`, `secrets.yaml`, API keys, authentication systems, or security-critical features.

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

## When to Activate

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
