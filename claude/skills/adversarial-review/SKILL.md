---
name: adversarial-review
description: |
  Red-team attack framework for plans/systems to find flaws, edge cases, and blind spots.
  Trigger keywords: red-team, adversarial review, find flaws, edge cases, blind spots, attack vectors, "what could go wrong", "poke holes in this", critique, challenge.
---

# Adversarial Review Framework

**Auto-activate when:** User mentions red-team, adversarial review, find flaws, edge cases, blind spots, attack vectors, "what could go wrong", "poke holes in this", or asks to critique/challenge a plan or design.

**Best for**: Red-team attack on plans/systems to find flaws, edge cases, blind spots

---

## CRITICAL: Avoid Security Theater

**Finding problems is easy. Finding problems WORTH SOLVING is hard.**

Before recommending ANY mitigation, ask:

1. **Is this a real threat or a hypothetical one?**
   - "An attacker could..." vs "An attacker would realistically..."
   - What's the actual attack path? Who is the attacker?

2. **Is the mitigation already covered elsewhere?**
   - Network segmentation at VPC/firewall level?
   - Authentication/authorization at app level?
   - Don't add defense-in-depth that defends against nothing

3. **Does the mitigation actually mitigate?**
   - A NetworkPolicy allowing \ egress is security theater
   - An input validator that doesn't reject malicious input is theater
   - A "security" feature that's always disabled in practice is theater

4. **Is the operational cost worth the security benefit?**
   - Adding Cilium "for NetworkPolicy" caused recurring DNS outages
   - The NetworkPolicies provided zero real security value
   - Net result: negative security (availability is part of security)

### The Security Theater Litmus Test

> "If I remove this control, what specific attack becomes possible that wasn't possible before?"

If the answer is vague ("defense in depth", "best practices"), the control may be theater.

### Anti-Patterns This Framework Can Cause

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| **Checkbox security** | "Add NetworkPolicy because Kubernetes best practices" | Adds complexity without threat modeling |
| **Hypothetical hardening** | "An attacker could pivot from pod A to pod B" | Ignores that pods A and B are the same app |
| **Compensating controls theater** | "Add WAF rules for defense in depth" | WAF rules that don't match actual attack patterns |
| **Complexity-as-security** | "Use mTLS between all services" | In a single-tenant app where TLS termination is at the edge |

---

## Template (6 Phases)

### {BASE_TARGET}

#### Phase 1: Challenge Assumptions
- What assumptions does this make?
- Which assumptions are most likely wrong?
- What happens if each assumption fails?

#### Phase 2: Edge Case Mining
- Boundary conditions (empty, null, max, negative)
- Timing issues (race conditions, ordering)
- Environment variations (OS, versions, permissions)
- Data quality issues (malformed, missing, duplicate)

#### Phase 3: Failure Mode Analysis
- List 5 ways this could fail
- For each: Likelihood (H/M/L), Impact (1-10), Mitigation
- Which failures are catastrophic?

#### Phase 4: Hidden Dependencies
- Undocumented state assumptions
- External service dependencies
- Implicit ordering requirements
- Configuration assumptions

#### Phase 5: Attack Vectors & Blind Spots
- What did we not consider?
- What expertise are we missing?
- Where could malicious input cause issues?
- What would break this in production?

#### Phase 6: Mitigation Value Assessment (REQUIRED)

**For EVERY mitigation suggested in Phases 1-5, answer:**

| Question | Answer Required |
|----------|-----------------|
| What specific attack does this prevent? | Name the attack, not "defense in depth" |
| Is this threat realistic for THIS system? | Consider: single vs multi-tenant, trusted vs untrusted users |
| Is this already mitigated elsewhere? | Check: VPC, SGs, IAM, app-level auth |
| What's the operational cost? | Complexity, failure modes, maintenance burden |
| What happens if we DON'T add this? | Quantify the actual risk |

**If you can't answer these clearly, the mitigation may be security theater.**

---

## Principles

Be adversarial. If you don't find issues, you weren't critical enough.

**BUT ALSO:**

Be skeptical of your own findings. If every finding leads to "add more controls," you may be creating security theater. The goal is **appropriate security**, not **maximum security**.

> "The question isn't 'could this be more secure?' - it's 'is this secure ENOUGH for its context?'"

### Real-World Lesson

A GitLab deployment added Cilium CNI "for NetworkPolicy support." The NetworkPolicies:
- Allowed egress to \ (everything)
- Didn't segment workloads (single app)
- Provided zero actual security value

The cost:
- DNS outages during every infrastructure change
- Hours of debugging
- Operational complexity

The lesson: An adversarial review that recommended "add NetworkPolicy for pod segmentation" without asking "does this deployment need pod segmentation?" caused net negative security.
