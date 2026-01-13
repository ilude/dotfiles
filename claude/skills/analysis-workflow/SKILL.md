---
name: analysis-workflow
description: Unified analysis skill combining structured analysis, systematic debugging, and adversarial review. Provides frameworks for code review, debugging, validation, and red-team critique.
---

# Analysis Workflow Skill

**Auto-activate when:** User mentions analyze, review, validate, critique, debug, troubleshoot, red-team, adversarial, "what could go wrong", test failure, error, unexpected behavior, or asks to evaluate plans, systems, code, or architecture.

This skill provides three complementary analysis approaches:

| Approach | Use When | File |
|----------|----------|------|
| [Structured Analysis](structured-analysis.md) | Evaluating plans, designs, prompts, architecture | Frameworks for systematic evaluation |
| [Debugging](debugging.md) | Errors, test failures, unexpected behavior | Systematic root cause analysis |
| [Adversarial Review](adversarial.md) | Red-team critique, finding blind spots | Attack-oriented flaw discovery |

---

## CRITICAL: Avoid Analysis Theater

**Finding problems is easy. Finding problems WORTH SOLVING is the real skill.**

### The Trap

Analysis frameworks bias toward "find issue -> recommend mitigation." This creates:
- **Security theater**: Controls that look secure but provide no real protection
- **Complexity theater**: Abstractions added to feel thorough but add no value

### The Litmus Tests

Before recommending ANY mitigation or addition:

> **Security**: "If I remove this control, what specific attack becomes possible?"
>
> **Complexity**: "If I remove this abstraction, what real problem occurs?"

If the answer is vague ("defense in depth", "best practices", "might need it later"), the recommendation may be theater.

### Real-World Example

A GitLab deployment added Cilium CNI "for NetworkPolicy support" after security analysis recommended pod segmentation. The NetworkPolicies:
- Allowed egress to `0.0.0.0/0` (everything)
- Didn't segment workloads (single-tenant app)
- Provided zero actual security value

The cost: DNS outages during every infrastructure change, hours of debugging.

**The analysis found a "gap" (no NetworkPolicy) without asking "does this deployment need NetworkPolicy?"**

### Strong Analysis Indicators

- Finds real problems (not hypothetical)
- Confidence varies appropriately
- Some recommendations are "don't add this"
- Scope gets trimmed (not expanded)
- Mitigations have clear cost-benefit justification

### Weak Analysis Indicators (Theater Warning)

- Every finding leads to "add more controls"
- No recommendations rejected as not worth the cost
- "Defense in depth" used without specific threat
- Complexity always increases, never decreases

**The best analysis sometimes concludes: "This is already secure/good enough for its context."**

---

## Decision Guide: Which Approach?

```
Is there an error/failure/unexpected behavior?
├─ YES → Use debugging.md (systematic debugging)
└─ NO
   └─ Are you reviewing/validating a plan or design?
      ├─ YES → Need to find flaws/attack vectors?
      │        ├─ YES → Use adversarial.md (red-team)
      │        └─ NO  → Use structured-analysis.md (frameworks)
      └─ NO → Use structured-analysis.md (general analysis)
```

### Quick Reference

| Trigger | Approach |
|---------|----------|
| Test failure, error, bug, "doesn't work" | debugging.md |
| "Find flaws", "what could go wrong", "poke holes" | adversarial.md |
| "Review this", "analyze", "evaluate" | structured-analysis.md |
| Security review, threat modeling | adversarial.md + structured-analysis.md |
| Code review, architecture review | structured-analysis.md |

---

## Sub-Files

- **[structured-analysis.md](structured-analysis.md)** - 12 analytical frameworks in 3 tiers
- **[debugging.md](debugging.md)** - Systematic debugging methodology
- **[adversarial.md](adversarial.md)** - Red-team attack framework

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Over-engineering | deep-analyze for trivial questions | Match complexity to importance |
| Random fix attempts | Trying permutations without understanding | Use systematic debugging |
| Verification theater | Finding nothing wrong | Genuine critique required |
| Security theater | Adding controls for hypothetical threats | Ask: "What specific attack?" |
| Complexity theater | Adding abstractions to feel thorough | Ask: "What breaks if removed?" |
| Scope creep | "While we're at it..." | MVP first, defer nice-to-haves |
