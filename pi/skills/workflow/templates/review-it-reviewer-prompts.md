### Reviewer task templates

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

Do not launch an extra reviewer with only a generic task like "review this plan as backend-dev". Every extra reviewer must be persona-seeded for the plan.

