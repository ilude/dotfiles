# Adversarial Review Framework

**Best for**: Red-team attack on plans/systems to find flaws, edge cases, blind spots

**Trigger keywords**: red-team, adversarial review, find flaws, edge cases, blind spots, attack vectors, "what could go wrong", "poke holes in this", critique, challenge.

---

## Core Principle: Prospective Hindsight

**From Gary Klein's research**: Pre-mortem analysis—imagining the project has already failed—increases ability to identify risks by **30%** compared to standard critique.

> **"The project has failed. What went wrong?"**

This reframes psychology: instead of defending ideas, participants demonstrate intelligence by identifying failure scenarios.

### Why Adversarial Review Works

Research on devil's advocacy shows:
- **23% improvement** in decision quality over consensus groups
- **32% increase** in diversity of ideas discussed
- **33% improvement** in meeting effectiveness

**But**: Authentic dissent (genuine opposing views) outperforms assigned devil's advocacy. When possible, seek real disagreement.

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
   - A NetworkPolicy allowing `0.0.0.0/0` egress is security theater
   - An input validator that doesn't reject malicious input is theater
   - A "security" feature that's always disabled in practice is theater

4. **Is the operational cost worth the security benefit?**
   - Adding Cilium "for NetworkPolicy" caused recurring DNS outages
   - The NetworkPolicies provided zero real security value
   - Net result: negative security (availability is part of security)

### The Security Theater Litmus Test

> "If I remove this control, what specific attack becomes possible that wasn't possible before?"

If the answer is vague ("defense in depth", "best practices"), the control may be theater.

---

## Template (6 Phases)

### Phase 1: Pre-Mortem

**Start here** - most valuable phase for risk identification.

> "It's 6 months from now. This project/design/plan has failed catastrophically. What went wrong?"

- List 5-10 plausible failure scenarios
- Don't censor—even "unlikely" scenarios
- Focus on what would make YOU look foolish for not anticipating

### Phase 2: Challenge Assumptions

- What assumptions does this make?
- Which assumptions are most likely wrong?
- What happens if each assumption fails?
- **Consider the opposite**: What evidence would contradict our beliefs?

### Phase 3: Edge Case Mining

- Boundary conditions (empty, null, max, negative)
- Timing issues (race conditions, ordering)
- Environment variations (OS, versions, permissions)
- Data quality issues (malformed, missing, duplicate)

### Phase 4: Failure Mode Analysis

For each critical component, assess:

| Failure Mode | Severity (1-10) | Likelihood (H/M/L) | Detection (Easy/Hard) |
|--------------|-----------------|--------------------|-----------------------|
| [What fails] | [Impact] | [How often] | [Can we catch it?] |

**Priority rule**: High severity + Hard to detect = Highest priority

*Note: This aligns with FMEA (Failure Mode Effects Analysis) methodology used in safety-critical industries.*

### Phase 5: Attack Vectors & Blind Spots

- What did we not consider?
- What expertise are we missing?
- Where could malicious input cause issues?
- What would break this in production?

**For security contexts, use STRIDE**:
- **S**poofing identity
- **T**ampering with data
- **R**epudiation
- **I**nformation disclosure
- **D**enial of service
- **E**levation of privilege

### Phase 6: Mitigation Value Assessment (REQUIRED)

**For EVERY mitigation suggested in Phases 1-5, answer:**

| Question | Answer Required |
|----------|-----------------|
| What specific attack/failure does this prevent? | Name it, not "defense in depth" |
| Is this threat realistic for THIS system? | Consider: single vs multi-tenant, trusted vs untrusted users |
| Is this already mitigated elsewhere? | Check: VPC, SGs, IAM, app-level auth |
| What's the operational cost? | Complexity, failure modes, maintenance burden |
| What happens if we DON'T add this? | Quantify the actual risk |

**If you can't answer these clearly, the mitigation may be security theater.**

---

## Anti-Patterns This Framework Can Cause

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| Checkbox security | "Add NetworkPolicy because Kubernetes best practices" | Adds complexity without threat modeling |
| Hypothetical hardening | "An attacker could pivot from pod A to pod B" | Ignores that pods A and B are the same app |
| Compensating controls theater | "Add WAF rules for defense in depth" | WAF rules that don't match actual attack patterns |
| Complexity-as-security | "Use mTLS between all services" | In a single-tenant app where TLS termination is at edge |

---

## Principles

Be adversarial. If you don't find issues, you weren't critical enough.

**BUT ALSO:**

Be skeptical of your own findings. If every finding leads to "add more controls," you may be creating security theater. The goal is **appropriate security**, not **maximum security**.

> "The question isn't 'could this be more secure?' - it's 'is this secure ENOUGH for its context?'"

### Authentic vs Assigned Dissent

| Authentic Dissent | Assigned Devil's Advocacy |
|-------------------|---------------------------|
| Genuine opposing views | Role-playing opposition |
| More effective (research) | Can trigger defensive responses |
| Stimulates divergent thought | May feel "destructive" |
| Harder to find | Easy to assign |

**Guidance**: When possible, seek people who genuinely disagree. When that's not available, assign the devil's advocate role—it's still better than no challenge.

---

## Quick Reference

1. **Start with pre-mortem**: "It failed. What went wrong?"
2. **Challenge assumptions**: What would prove us wrong?
3. **Mine edge cases**: Boundaries, timing, environment
4. **Assess failure modes**: Severity × Likelihood × Detection difficulty
5. **Check attack vectors**: STRIDE for security
6. **Validate mitigations**: Is each one worth its cost?

---

## Sources

### Academic Foundations
- [Gary Klein: Pre-Mortem Method](https://www.gary-klein.com/premortem) - 30% improvement in risk forecasting
- [Devil's Advocacy Meta-Analysis](https://www.sciencedirect.com/science/article/abs/pii/074959789090051A) - 23% decision quality improvement
- [Nemeth: Authentic vs Devil's Advocate Dissent](https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.58) - Authentic dissent more effective
- [Constructive Controversy (Johnson & Johnson)](https://www.mindtools.com/absml9b/constructive-controversy/) - Effect size 0.70-0.76 over consensus

### Security Frameworks
- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling_Process)
- [STRIDE Model](https://en.wikipedia.org/wiki/STRIDE_model) - Microsoft threat taxonomy
- [FMEA: Failure Mode Effects Analysis](https://asq.org/quality-resources/fmea) - Industry standard risk assessment
