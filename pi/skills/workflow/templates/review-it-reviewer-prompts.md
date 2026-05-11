### Reviewer task templates

#### Required file-backed output contract
Every independent reviewer prompt must include these fields:
- `Plan path: <path>`
- `Review output directory: <review_dir>`
- `Reviewer artifact path: <review_dir>/<unique-reviewer-name>.md`

Preferred artifact path: if a constrained `review_artifact_write` tool is available, the reviewer must call that tool with at most 5 structured findings instead of using general file-write tools. If the tool is not available, the reviewer may use the narrowest available file-write mechanism, but only for the assigned reviewer artifact path.

Every independent reviewer must write its full findings to the reviewer artifact path using this shape:

```markdown
---
reviewer: <agent-or-persona-name>
status: complete
---

# Findings

- severity: <critical|high|medium|low>
  evidence: <specific plan section, file, command, or quoted text>
  required_fix: <concrete change required before execution or hardening recommendation>
```

Rules:
- Write at most 5 findings.
- Each finding must include `severity`, `evidence`, and `required_fix`.
- Keep each finding under 120 words.
- Do not include praise, plan restatement, or generic commentary.
- After writing the artifact, read/verify it if the available tool surface permits, then return only: `WROTE: <reviewer_artifact_path>`.
- If `review_artifact_write` is available but rejects the artifact, return only: `FAILED_TO_WRITE: <reason>` with no long inline dump unless explicitly requested by the coordinator.
- If writing the artifact is impossible because no constrained artifact tool or file-write mechanism is available, return only: `FAILED_TO_WRITE: <reason>` plus the same at-most-5 findings inline. The coordinator must treat this as a recovery/exception path, not the normal source of truth.


#### Standard reviewer 1 -- `reviewer`
Task shape:
- review the plan for missing assumptions, hidden prerequisites, ambiguous instructions, and weak verification
- identify where the plan cannot be executed safely by someone with no conversation context
- flag acceptance criteria that are vague or pass without proving behavior
- check whether operational steps are automated enough for `/do-it` to run without hidden manual context

#### Standard reviewer 2 -- `security-reviewer`
Task shape:
- review the plan adversarially for realistic failure modes, safety issues, permission risks, rollback gaps, and operational hazards
- prefer realistic breakage over hypothetical theater
- identify where the plan could damage state, widen permissions, or fail under realistic conditions
- scrutinize credential flows, evidence artifacts, redaction, and archive gates for secret or operational safety gaps

#### Standard reviewer 3 -- `product-manager`
Task shape:
- challenge whether the plan is the right size and shape for the problem
- look for smaller solutions, simpler implementation paths, or reuse of what already exists
- call out speculative abstractions or complexity that is not justified by the stated constraints
- challenge manual-only process where a small wrapper, script, or playbook would make execution simpler

#### Additional domain reviewers
For each additional reviewer, tailor the task to:
- the specific domain they own
- the specific expert persona they are playing for this plan
- the specific plan sections they should scrutinize
- a skeptical lens aimed at finding implementation or validation issues in that domain
- the exact failure modes or blind spots they should try to expose

Examples:
- `backend-dev` as `API and state-transition reviewer` -> API and data flow flaws, hidden coupling, backward compatibility breaks
- `frontend-dev` as `workflow and operator-friction reviewer` -> UI-state, workflow, usability, and integration gaps
- `qa-engineer` as `verification realism reviewer` -> false-positive acceptance criteria, weak tests, missing regression coverage
- `devops-pro` as `rollout and operational safety reviewer` -> rollout, CI, deployment, environment pitfalls, partial-failure recovery
- `typescript-pro` as `type/build/toolchain reviewer` -> typing, module/runtime, and TS build constraints

Do not launch an extra reviewer with only a generic task like "review this plan as backend-dev". Every extra reviewer must be persona-seeded for the plan and given a unique reviewer artifact path.
