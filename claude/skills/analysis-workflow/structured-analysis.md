# Structured Analysis Frameworks

Apply structured analytical frameworks to ANY artifact: prompts, systems, documents, code, architecture.

**12 Total Frameworks** organized in 3 tiers for easy selection.

---

## Framework Tiers

### Tier 1: Core Frameworks (Use Most Often)
- **deep-analyze**: Verification, gaps, adversarial review
- **reasoning-scaffold**: Systematic decisions with clear criteria
- **scope-boundary**: Prevent scope creep, MVP validation
- **adversarial-review**: Red-team attack to find flaws/blind spots

### Tier 2: Auto-Invoke (Triggered by Context)
- **zero-warning-verification**: Pre-commit quality gate
- **security-first-design**: Auth/secrets/external data
- **idempotency-audit**: Scripts/setup/migrations

### Tier 3: On-Demand (Explicit Request Only)
- **meta-prompting**: Design optimal prompts
- **recursive-review**: 3-pass refinement
- **multi-perspective**: Multiple conflicting viewpoints
- **evidence-based-optimization**: Require proof before optimizing
- **deliberate-detail**: Comprehensive documentation

---

## Core Framework Templates

### deep-analyze

**Best for**: High-stakes decisions, security analysis, confidence calibration

```
Phase 1: Initial Analysis
Provide thorough analysis.

Phase 2: Chain of Verification
1. Incompleteness Check: 3 ways analysis might be incomplete/biased
2. Challenging Evidence: Counter-examples, alternative interpretations
3. Revised Findings: What changed or introduced new uncertainties
4. Confidence Calibration: 0-100% with justification

Phase 3: Adversarial Review
1. 5 Failure Modes: Likelihood (L/M/H) and Impact (1-10)
2. Top 3 Vulnerabilities: Prioritize by importance
3. Mitigations: Strengthening strategies

Phase 4: Final Synthesis
- Core findings (with confidence levels)
- Key uncertainties
- Recommended actions

Be self-critical. If verification doesn't find problems, analysis wasn't rigorous enough.
```

### reasoning-scaffold

**Best for**: Systematic decisions, reproducible analysis

```
Step 1: Core Question
[Fundamental question being asked]

Step 2: Key Components
[Essential variables, entities, components]

Step 3: Relationships
[Dependencies and interactions between components]

Step 4: Possible Approaches
[3-5 approaches with Description, Pros, Cons]

Step 5: Decision Criteria
[Criteria with relative weights/importance]

Step 6: Optimal Approach
[Selection justified against criteria]

Step 7: Risk Analysis
[Risks and mitigation strategies]

Step 8: Final Recommendation
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

Phase 2: OWASP Top 10 Review
- Injection, broken auth, data exposure, XXE
- Access control, misconfig, XSS, deserialization
- Vulnerable components, insufficient logging

Phase 3: Secret Management
- Where are secrets stored? (NEVER in code/git)
- How are secrets accessed?
- Are secrets rotatable?

Phase 4: Context-Aware Assessment
- Is this single-tenant or multi-tenant?
- Are users trusted or untrusted?
- What's protected at infrastructure layer?
- What's the realistic threat model?

Phase 5: Security Recommendations (with justification)
For each recommendation:
- Issue: [Specific vulnerability]
- Severity: CRITICAL/HIGH/MEDIUM
- Threat: [Who exploits this, realistic?]
- Already mitigated?: [Check infra/app layers]
- Recommendation: [Control, IF justified]

Skip MEDIUM recommendations if threat is hypothetical or already mitigated.
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
Round 2: Critiques
Round 3: Refinement

Synthesis:
- Points of Agreement
- Irreconcilable Differences
- Recommended Balanced Solution

Personas must have genuine tension.
```

### evidence-based-optimization

**Best for**: Performance work, refactoring, architectural changes

```
Phase 1: Problem Validation
- What specific problem does this solve?
- What evidence shows this is a problem?

Phase 2: Baseline Measurement
- What's the current performance?
- Is the measurement methodology valid?

Phase 3: Alternative Solutions
- Approach, Complexity, Expected Impact, Risks

Phase 4: Proof Requirement
- What benchmarks prove this works?
- Expected improvement (quantified)?

NEVER optimize without measuring. Premature optimization is evil.
```

---

## Technique Combinations

- `deep-analyze,multi-perspective` - Rigorous multi-angle analysis
- `reasoning-scaffold,deliberate-detail` - Structured exploration with depth
- `adversarial-review,scope-boundary` - Challenge plan, trim scope
- `security-first-design,adversarial-review` - Security review with red-team

---

## Framework-Specific Theater Risks

| Framework | Theater Risk | Mitigation |
|-----------|--------------|------------|
| adversarial-review | Finds hypothetical attacks | Ask: "Is this threat realistic?" |
| security-first-design | Recommends OWASP controls without context | Ask: "Already mitigated at VPC/IAM/app?" |
| deep-analyze | Every finding gets a mitigation | Ask: "What's the cost of NOT mitigating?" |
| scope-boundary | (Good) - Actually prevents theater | Use to counter-balance other frameworks |
