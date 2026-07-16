# Adaptive Reviewer Prompt Contract

Build each reviewer assignment from the artifact's actual risks and the capabilities discovered in the current runtime. Do not require a particular agent name, provider, model, model size, or organization structure.

## Assignment Shape

Every reviewer assignment must state:

- artifact path;
- relevant repository scope;
- assigned review perspective;
- why that perspective is independently useful;
- sections, commands, or risks to inspect;
- skeptical angle and likely failure modes;
- output location and format available in the current runtime;
- instruction to inspect but not modify implementation files.

A perspective can combine related concerns. Do not add reviewers whose coverage duplicates another assignment.

Useful coverage dimensions include:

- completeness and fresh-session usability;
- correctness, safety, rollback, and failure handling;
- simplicity, proportionality, scope, and reuse;
- validation realism, automation, and evidence;
- domain-specific implementation or operational behavior.

These are coverage dimensions, not required reviewer names.

## Finding Contract

Return at most five findings. Each finding must include:

- `category`: must-fix defect, required hardening, optional improvement, duplicate, or false positive;
- `severity`: critical, high, medium, or low;
- `severity_rationale`: realistic likelihood and impact;
- `evidence`: a specific artifact section, repository path, command, or observed fact;
- `required_fix`: the smallest concrete correction;
- `confidence`: high, medium, or low.

Rules:

- Verify critical and high claims with repository evidence when possible.
- Do not quote or restate the artifact.
- Do not include praise or generic best practices.
- Do not elevate optional hardening into a defect.
- Reject findings already handled by the artifact.
- Keep each finding under 120 words.
- Stay within the assigned scope unless an adjacent defect changes the verdict.

## Output

When a constrained review-artifact writer is available, use it with the assigned review directory and unique artifact name. When another narrow file-output mechanism is available, write only the assigned artifact. Otherwise return the bounded findings inline and state that file output was unavailable.

For file-backed output, use this structure when the available writer does not impose its own schema:

```markdown
---
reviewer: <perspective>
status: complete
---

# Findings

- category: <category>
  severity: <severity>
  severity_rationale: <rationale>
  evidence: <evidence>
  required_fix: <fix>
  confidence: <confidence>
```

After writing, verify the artifact when possible and return only its path. Do not return the full findings again.
