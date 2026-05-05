# Review: <plan title>

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|

## Standard Reviewer Findings
### reviewer
- ...
### security-reviewer
- ...
### product-manager
- ...

## Additional Expert Findings
### <agent>
- ...

## Suggested Additional Reviewers
- <agent> -- <why relevant>
- <agent> -- <why relevant>
- <agent> -- <why relevant>

## Bugs (must fix before execution)
1. ...

## Hardening
1. ...

## Simpler Alternatives / Scope Reductions
1. ...

## Automation Readiness
- Agent-runnable operational steps: ...
- Credential/auth flow clarity: ...
- Evidence and archive gates: ...
- Manual-only steps and justification: ...

## Contested or Dismissed Findings
1. ...

## Verification Notes
1. ...

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| ... | `{review_dir}/reviewer.md` | read | preview truncation, if any, was ignored because artifact was usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | ... | ... |
| Artifact reads | ... | all expected reviewer artifacts read / list missing or unusable artifacts |
| Recovery calls | ... | ... |
| Verification | ... | ... |
| Synthesis | ... | ... |

## Review Artifact
Wrote full synthesis to: `{review_dir}/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- apply selected review fixes to the plan if requested
- execute via `/do-it <path>`
