# Structured Analysis Frameworks

Apply structured analytical frameworks to ANY artifact: prompts, systems, documents, code, architecture.

---

## Core Principle: Externalize Reasoning

**From Richards Heuer (CIA)**: Structured analytic techniques "externalize internal thought processes so they can be shared, built on, and critiqued."

This principle explains WHY frameworks work:
- Makes assumptions visible and challengeable
- Enables collaboration on reasoning, not just conclusions
- Creates audit trail for decisions

---

## Debiasing Techniques (Use Throughout)

### Consider the Opposite

**Most effective single debiasing technique** (reduces confirmation bias, overconfidence, anchoring):

> "What evidence would prove my conclusion WRONG?"

Apply at each analysis phase.

### Outside View / Reference Class Forecasting

**From Kahneman & Lovallo** (Nobel Prize-winning work):

Instead of detailed project analysis (inside view), ask:
1. What similar projects/decisions existed before?
2. What were their actual outcomes (not plans)?
3. Where does this case fit in that distribution?

> "Ignore the specifics. What usually happens in cases like this?"

### Calibration

When expressing confidence:
- Use explicit probabilities (70%, not "probably")
- Track your predictions vs outcomes
- Calibration goal: If you say 80%, you should be right ~80% of the time

---

## Framework Tiers

### Tier 1: Core Frameworks (Use Most Often)
- **deep-analyze**: Verification, gaps, adversarial review
- **reasoning-scaffold**: Systematic decisions with clear criteria
- **scope-boundary**: Prevent scope creep, MVP validation
- **pre-mortem**: Risk identification (see adversarial.md)

### Tier 2: Auto-Invoke (Triggered by Context)
- **zero-warning-verification**: Pre-commit quality gate
- **security-first-design**: Auth/secrets/external data
- **idempotency-audit**: Scripts/setup/migrations

### Tier 3: On-Demand (Explicit Request Only)
- **multi-perspective**: Multiple conflicting viewpoints
- **evidence-based-optimization**: Require proof before optimizing

---

## Core Framework Templates

### deep-analyze

**Best for**: High-stakes decisions, security analysis, confidence calibration

```
Phase 1: Initial Analysis
Provide thorough analysis.

Phase 2: Chain of Verification
1. Incompleteness Check: 3 ways analysis might be incomplete/biased
2. Consider the Opposite: What would prove this wrong?
3. Outside View: What usually happens in similar cases?
4. Revised Findings: What changed or introduced new uncertainties
5. Confidence Calibration: 0-100% with explicit justification

Phase 3: Pre-Mortem
"This analysis led to a bad decision. What did we miss?"
1. 5 Failure Modes: Severity (1-10) × Likelihood (H/M/L)
2. Top 3 Vulnerabilities: Prioritize by severity × likelihood
3. Mitigations: Only if they pass the theater litmus test

Phase 4: Final Synthesis
- Core findings (with confidence levels)
- Key uncertainties (what we don't know)
- Recommended actions (with cost-benefit)

Be self-critical. If verification doesn't find problems, analysis wasn't rigorous enough.
```

### reasoning-scaffold

**Best for**: Systematic decisions, reproducible analysis

```
Step 1: Core Question
[Fundamental question being asked]

Step 2: Outside View
[What usually happens in similar situations? Reference class?]

Step 3: Key Components
[Essential variables, entities, components]

Step 4: Relationships
[Dependencies and interactions between components]

Step 5: Possible Approaches
[3-5 approaches with Description, Pros, Cons]

Step 6: Decision Criteria
[Criteria with relative weights/importance]

Step 7: Consider the Opposite
[For each approach: What would make this the WRONG choice?]

Step 8: Optimal Approach
[Selection justified against criteria]

Step 9: Pre-Mortem
[If this fails, what went wrong?]

Step 10: Final Recommendation
[Recommendation, confidence 0-100%, justification]
```

### scope-boundary

**Best for**: Preventing scope creep, validating MVP, feature prioritization

```
Phase 1: Core vs Nice-to-Have
- What is the ABSOLUTE minimum to solve the problem?
- What features are "just in case" rather than "must have"?
- What can be deferred to v2?

Phase 2: YAGNI Audit
- What abstractions/patterns aren't justified yet?
- What configuration/flexibility isn't required?
- What edge cases can be handled later?

Phase 3: Dependency Bloat
- What libraries/tools add unnecessary complexity?
- What can be done with stdlib/built-ins?

Phase 4: Simplification Opportunities
- Can this be split into smaller, independent pieces?
- What's the simplest implementation that works?

Phase 5: Scope Recommendation
- Keep: Essential features (justify each)
- Defer: Nice-to-have for later
- Remove: YAGNI, premature optimization

Bias toward simplicity. Complexity requires strong justification.
```

---

## Auto-Invoke Framework Templates

### zero-warning-verification

**Best for**: Pre-commit quality gate, test validation

```
Phase 1: Warning Audit
- Run relevant quality checks (make test, lint, type-check)
- Document ALL warnings (not just errors)
- Zero warnings is the requirement

Phase 2: Test Coverage
- Are new code paths tested?
- Do tests actually verify behavior?
- Are edge cases covered?

Phase 3: Hidden Quality Issues
- Commented-out code to remove
- Debug prints to clean up
- TODOs that should be addressed

Phase 4: Quality Gate
- PASS: Zero warnings, tests pass, coverage adequate
- FAIL: Document specific issues blocking commit

`make test` showing warnings/failures is ALWAYS a blocking issue.
```

### idempotency-audit

**Best for**: Scripts, setup, migrations, state-changing operations

```
Phase 1: Re-run Analysis
- What happens if this runs twice?
- What operations are not idempotent?
- What state does it assume?

Phase 2: Failure Recovery
- If this fails halfway, what's left broken?
- Can it be safely retried?
- What cleanup is needed?

Phase 3: Detection Patterns
- Check-then-act (if not exists, create)
- Declarative operations (set to X, not increment)
- Cleanup old state before creating new

Phase 4: Idempotency Issues
- Operation: [What it does]
- Problem: [Why it fails on re-run]
- Fix: [How to make it idempotent]

All setup/install/migration scripts MUST be safely re-runnable.
```

### security-first-design

**Best for**: Authentication, secrets, external data, user input

```
Phase 1: Attack Surface
- What user input is accepted?
- What external data sources are used?
- What authentication/authorization is needed?
- What secrets/credentials are involved?

Phase 2: STRIDE Analysis
- Spoofing: Can identity be faked?
- Tampering: Can data be modified?
- Repudiation: Can actions be denied?
- Information disclosure: Can data leak?
- Denial of service: Can availability be attacked?
- Elevation of privilege: Can access be escalated?

Phase 3: Secret Management
- Where are secrets stored? (NEVER in code/git)
- How are secrets accessed?
- Are secrets rotatable?

Phase 4: Context-Aware Assessment
- Is this single-tenant or multi-tenant?
- Are users trusted or untrusted?
- What's protected at infrastructure layer?
- What's the realistic threat model?

Phase 5: Security Recommendations (with theater check)
For each recommendation, answer:
- Issue: [Specific vulnerability]
- Severity: CRITICAL/HIGH/MEDIUM
- Threat: [Who exploits this? Realistic?]
- Already mitigated?: [Check infra/app layers]
- Recommendation: [Control, IF justified]
- Litmus test: "If removed, what specific attack becomes possible?"

Skip recommendations if threat is hypothetical or already mitigated.
```

---

## On-Demand Framework Templates

### multi-perspective

**Best for**: Complex trade-offs, stakeholder alignment

```
Define 3 Expert Personas with conflicting priorities:
- Persona 1: [Role] - Priority: [X]
- Persona 2: [Role] - Priority: [Y conflicts with X]
- Persona 3: [Role] - Priority: [Z conflicts with X,Y]

Round 1: Opening Arguments
Round 2: Critiques (each critiques the others)
Round 3: Consider the Opposite (each argues opposing view)
Round 4: Refinement

Synthesis:
- Points of Agreement
- Irreconcilable Differences (acknowledge, don't force consensus)
- Recommended Balanced Solution

Personas must have genuine tension.
```

### evidence-based-optimization

**Best for**: Performance work, refactoring, architectural changes

```
Phase 1: Problem Validation
- What specific problem does this solve?
- What evidence shows this is a problem? (not assumption)

Phase 2: Baseline Measurement
- What's the current performance?
- Is the measurement methodology valid?

Phase 3: Outside View
- What do similar systems achieve?
- Is our baseline typical or unusual?

Phase 4: Alternative Solutions
- Approach, Complexity, Expected Impact, Risks

Phase 5: Proof Requirement
- What benchmarks prove this works?
- Expected improvement (quantified)?

NEVER optimize without measuring. Premature optimization is evil.
```

---

## Technique Combinations

- `deep-analyze,pre-mortem` - Rigorous analysis with risk identification
- `reasoning-scaffold,outside-view` - Structured decision with base rates
- `scope-boundary,evidence-based` - MVP validation with measurement
- `security-first-design,STRIDE` - Security review with systematic threat enumeration

---

## Framework-Specific Theater Risks

| Framework | Theater Risk | Counter |
|-----------|--------------|---------|
| deep-analyze | Every finding gets a mitigation | Ask: "What's the cost of NOT mitigating?" |
| security-first-design | Recommends OWASP controls without context | Ask: "Already mitigated at VPC/IAM/app?" |
| multi-perspective | Fake conflict for show | Ensure genuine tension in personas |
| scope-boundary | (Good) - Actually prevents theater | Use to counter-balance other frameworks |

---

## Sources

### Academic Foundations
- [Richards Heuer: Psychology of Intelligence Analysis](https://archive.org/details/PsychologyOfIntelligenceAnalysis) - CIA structured analytic techniques
- [Kahneman & Lovallo: Outside View](https://hbr.org/2003/07/delusions-of-success-how-optimism-undermines-executives-decisions) - Reference class forecasting
- [Consider the Opposite Research](https://www.sciencedirect.com/science/article/abs/pii/S0361476X20300096) - Debiasing effectiveness

### Industry Frameworks
- [STRIDE Model](https://en.wikipedia.org/wiki/STRIDE_model) - Microsoft threat taxonomy
- [RAND: Structured Analytic Techniques](https://www.rand.org/pubs/research_reports/RR1408.html) - Intelligence community assessment
