---
name: analysis-workflow
description: Activate when user mentions analyze, review, validate, critique, debug, troubleshoot, red-team, adversarial, or "what could go wrong". Use for code review, debugging, validation, and error investigation.
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

## Core Principle: Structured Beats Ad-Hoc

**From cognitive science research**: Technological aids (frameworks, checklists, structured processes) are **2x more effective** than pure cognitive strategies for reducing bias. Build analysis into systems, don't rely on willpower.

> **You cannot think your way out of biases you don't know you have.**

This explains WHY frameworks matter: they externalize reasoning so it can be examined, challenged, and improved.

---

## CRITICAL: Avoid Analysis Theater

**Finding problems is easy. Finding problems WORTH SOLVING is the real skill.**

### The Trap

Analysis frameworks bias toward "find issue → recommend mitigation." This creates:
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

### Strong vs Weak Analysis Indicators

| Strong Analysis | Weak Analysis (Theater Warning) |
|-----------------|--------------------------------|
| Finds real problems (not hypothetical) | Every finding leads to "add more controls" |
| Confidence varies appropriately | No recommendations rejected as not worth cost |
| Some recommendations are "don't add this" | "Defense in depth" without specific threat |
| Scope gets trimmed (not expanded) | Complexity always increases, never decreases |
| Mitigations have clear cost-benefit | Generic best practices applied without context |

**The best analysis sometimes concludes: "This is already good enough for its context."**

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

## Key Cognitive Biases to Counter

Research shows these biases most affect technical analysis:

| Bias | Description | Counter |
|------|-------------|---------|
| **Confirmation bias** | Seeking evidence that confirms, not refutes | "Consider the opposite" |
| **Overconfidence** | Overestimating abilities/likelihood of success | Pre-mortem, calibration |
| **Anchoring** | Early info disproportionately influences | Outside view, reference class |
| **Availability** | Recent examples dominate over statistics | Base rates, systematic search |
| **Planning fallacy** | Underestimate time/cost despite history | Reference class forecasting |

---

## Sub-Files

- **[structured-analysis.md](structured-analysis.md)** - Core analytical frameworks with debiasing
- **[debugging.md](debugging.md)** - Scientific debugging methodology
- **[adversarial.md](adversarial.md)** - Red-team attack framework with pre-mortem

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

---

## Sources

### Academic Foundations
- [Richards Heuer: Psychology of Intelligence Analysis](https://archive.org/details/PsychologyOfIntelligenceAnalysis) - CIA tradecraft
- [Gary Klein: Pre-Mortem Method](https://www.gary-klein.com/premortem) - 30% improvement in risk identification
- [Kahneman & Lovallo: Delusions of Success](https://hbr.org/2003/07/delusions-of-success-how-optimism-undermines-executives-decisions) - Outside view
- [Zeller: Why Programs Fail](https://dl.acm.org/doi/10.5555/1077048) - Scientific debugging

### Research Evidence
- [Devil's Advocacy Meta-Analysis](https://www.sciencedirect.com/science/article/abs/pii/074959789090051A) - 23% decision quality improvement
- [Debiasing Meta-Analysis (Nature, 2025)](https://www.nature.com/articles/s41562-025-02253-y) - Technological aids 2x more effective
- [Hypothesizer Study](https://dl.acm.org/doi/10.1145/3586183.3606781) - 5x debugging success with hypothesis-driven approach
