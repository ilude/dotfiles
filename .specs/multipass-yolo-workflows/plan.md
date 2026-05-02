---
created: 2026-05-02
status: draft
completed:
---

# Plan: Multipass + Infisical Pi/Claude YOLO Workflow User Stories

## Context & Motivation

We researched whether Ubuntu Multipass on Windows can provide a safer local sandbox for running Pi and Claude Code in YOLO / bypass-permissions mode. Reputable sources support the core architecture: Canonical documents Multipass as a cross-platform Ubuntu VM manager for Windows/macOS/Linux and explicitly describes it as useful for sandboxing; Canonical also notes Windows mounts are disabled by default for security reasons. Anthropic's Claude Code devcontainer docs state that bypass permissions can be used when Claude runs as a non-root user inside an isolated container, but warn that bind-mounted workspace files and allowed network access remain reachable. Infisical's docs support injecting secrets into local development commands, VMs, Docker containers, and Docker Compose services using `infisical run`, Docker entrypoints, or machine identities.

The intended outcome is not to immediately build the full sandbox. The next step is to create a concrete user-story and workflow design for a Multipass-hosted Pi/Claude environment that can run high-risk agent workflows with stronger isolation than the Windows host. This should cover VM lifecycle, Docker/devcontainer options, Infisical secret delivery, repo handoff via git, policy gates, run receipts, and safety constraints.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Keep secrets out of git; never modify or commit `.env` files.
- Prefer cloning repos inside the Multipass VM over mounting Windows host directories for YOLO runs.
- Treat Multipass as an outer sandbox; optionally use Docker/devcontainers inside it as an inner sandbox.
- Infisical should inject narrowly scoped, least-privilege secrets at runtime; do not copy host secret files into the VM/container.
- Use git as the primary boundary for moving changes back to the host.
- For YOLO runs, Windows host mounts are forbidden by default; any exception must be explicit, reviewed, and never include host home, `.env`, SSH, cloud credentials, or password-manager exports.
- Infisical design must cover machine identity bootstrap, token TTL, rotation, revocation, runtime env exposure, and redaction of logs/artifacts.
- This plan produces a minimum viable design package first; implementation scripts come later.
- Local research notes live at `.specs/pipelines-n-policies/notes.md`.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Run Pi/Claude YOLO directly on Windows | Fastest startup and easiest access to current files | Weak isolation; agents can mutate host files and access host credentials; poor fit for bypass-permissions mode | Rejected: violates safety goal |
| Use WSL only | Good dev UX, fast startup, Linux environment | Weaker boundary than a dedicated VM; still easy to over-share host filesystem/credentials | Rejected for YOLO default; acceptable for normal supervised dev |
| Multipass VM with repo cloned inside VM | Stronger host boundary; Ubuntu-native; easy to delete/recreate; no host mount required | VM startup cost and duplicate repo/auth setup | **Selected baseline**: best balance for Windows YOLO sandboxing |
| Multipass VM + Docker/devcontainer | Stronger layered isolation; aligns with Anthropic devcontainer guidance; per-task containers can be disposable | More setup complexity; Docker inside VM adds operational overhead | **Selected advanced workflow**: use when task risk justifies it |
| Docker Desktop alone | Smooth Windows integration and devcontainer UX | Docker Desktop is not a full VM workflow design; bind mounts can expose host repo; licensing/UI concerns | Rejected as the primary sandbox; may still be useful for normal container work |
| Fresh Multipass VM per task | Strongest clean-room isolation | Slow first-run setup; expensive for daily use | Rejected for default; keep as high-risk option |

## Objective

Create a minimum viable, self-contained design package under `.specs/multipass-yolo-workflows/` that defines user stories, a canonical workflow, safety policies, and validation criteria for running Pi/Claude in a Multipass-based YOLO sandbox on Windows with Infisical-managed secrets. The design should be concrete enough for a later implementation plan to add scripts, cloud-init, docs, and policy checks without overdesigning speculative implementation details.

## Project Context

- **Language**: Python/shell dotfiles repo with TypeScript under `pi/`
- **Test command**: `make test-pytest`
- **Lint command**: `make lint`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Document source findings and assumptions | 1 | mechanical | small | planning-lead | -- |
| T2 | Write Multipass sandbox user stories | 1 | feature | medium | product-manager | -- |
| T3 | Design Infisical secret-delivery and threat model | 1 | feature | medium | security-reviewer | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1, T2, T3 |
| T4 | Define canonical workflow, policy gates, and safety model | 3 | feature | medium | devops-pro | V1 |
| T5 | Define implementation backlog and open questions | 1 | feature | medium | engineering-lead | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T4, T5 |

## Execution Waves

### Wave 1 (parallel)

**T1: Document source findings and assumptions** [small] -- planning-lead
- Description: Create a research brief summarizing the credible findings used by this design: Canonical Multipass sandboxing and Windows mount caveat, cloud-init support, Anthropic devcontainer YOLO guidance, and Infisical secret injection methods. Include Windows prerequisites and failure modes: Hyper-V/VirtualBox driver choice, BIOS virtualization, admin rights, privileged mounts, Docker Desktop/WSL interactions, startup-time expectations, and local notes references.
- Files: `.specs/multipass-yolo-workflows/research-brief.md`
- Acceptance Criteria:
  1. [ ] Research brief cites the relevant sources and captures assumptions.
     - Verify: `grep -E "Multipass|Anthropic|Infisical|cloud-init|Windows mounts|Hyper-V|VirtualBox|BIOS virtualization|privileged mounts" .specs/multipass-yolo-workflows/research-brief.md`
     - Pass: Output includes all named topics, source URLs, and Windows prerequisite/failure-mode notes.
     - Fail: Add missing source/assumption coverage before validation.
  2. [ ] Research brief has required sections.
     - Verify: `grep -E "^## Sources|^## Windows prerequisites|^## Startup and lifecycle assumptions|^## Safety assumptions" .specs/multipass-yolo-workflows/research-brief.md`
     - Pass: All required section headings exist with substantive content under each.
     - Fail: Add the missing sections before validation.

**T2: Write Multipass sandbox user stories** [medium] -- product-manager
- Description: Define user stories for the workflow personas: local developer, YOLO agent operator, reviewer/merger, secret administrator, and recovery operator. Include acceptance criteria for VM setup, repo clone, running Pi/Claude, reviewing changes, and discarding/rebuilding the sandbox.
- Files: `.specs/multipass-yolo-workflows/user-stories.md`
- Acceptance Criteria:
  1. [ ] User stories cover at least five personas and include acceptance criteria.
     - Verify: `grep -E "As a .*I want|Acceptance Criteria|developer|operator|secret" .specs/multipass-yolo-workflows/user-stories.md`
     - Pass: Each persona has concrete workflow expectations and success/failure notes.
     - Fail: Add missing personas or acceptance criteria.

**T3: Design Infisical secret-delivery and threat model** [medium] -- security-reviewer
- Description: Define how secrets enter the Multipass/devcontainer environment safely. Cover `infisical run`, machine identities, least privilege, token scope, TTL, rotation, revocation, bootstrap storage for `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, and `INFISICAL_TOKEN`, env exposure to Pi/Claude commands, log/artifact redaction, and what must never be mounted/copied. Include a threat model and misuse cases.
- Files: `.specs/multipass-yolo-workflows/infisical-secrets.md`
- Acceptance Criteria:
  1. [ ] Secret workflow defines allowed and forbidden patterns.
     - Verify: `grep -E "infisical run|machine identity|least privilege|forbidden|\.env|mount|TTL|rotation|revocation|redaction" .specs/multipass-yolo-workflows/infisical-secrets.md`
     - Pass: Document explains runtime injection and explicitly forbids copying host `.env`/broad credentials into YOLO sandboxes.
     - Fail: Add missing safety boundaries before validation.
  2. [ ] Threat model covers credential exposure and recovery.
     - Verify: `grep -E "^## Threat model|^## Bootstrap storage|^## Token lifecycle|^## Redaction policy|^## Revocation" .specs/multipass-yolo-workflows/infisical-secrets.md`
     - Pass: Required sections exist and define concrete mitigations for env-var exposure, logs/artifacts, and compromised tokens.
     - Fail: Add missing threat-model sections before validation.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run acceptance criteria for T1, T2, and T3.
  2. Docs-focused structural validation: required headings from T1 and T3 exist and are non-empty.
  3. Optional sanity check: `make test-quick` -- run only if recent code changes occurred in the same session; unrelated failures should not block docs-only execution.
  4. Optional sanity check: `make lint-python` -- run only if Python files changed.
  5. Cross-task integration: confirm user stories reference the same safety assumptions as the research and Infisical docs using a short consistency checklist in the validation report.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T4: Define canonical workflow, policy gates, and safety model** [medium] -- devops-pro
- Blocked by: V1
- Description: Write the minimum viable operational design: one canonical happy path first (warm Multipass VM, repo cloned inside VM, `infisical run`, Pi/Claude execution, git handoff), then advanced optional Docker/devcontainer nesting. Include cold setup, daily start, per-task sandboxing, teardown/rebuild, emergency recovery, startup tradeoffs, and policy gates/run receipts influenced by `.specs/pipelines-n-policies/notes.md`. Add a safety model mapping risks to mitigations and future implementation tasks.
- Files: `.specs/multipass-yolo-workflows/operations.md`, `.specs/multipass-yolo-workflows/policy-gates.md`, `.specs/multipass-yolo-workflows/safety-model.md`
- Acceptance Criteria:
  1. [ ] Operations doc distinguishes cold setup, warm daily use, per-task isolation, and teardown.
     - Verify: `grep -E "^## Canonical happy path|^## Cold setup|^## Daily warm start|^## Per-task isolation|^## Teardown and rebuild|^## Emergency recovery|Docker|devcontainer|git" .specs/multipass-yolo-workflows/operations.md`
     - Pass: Workflows are executable as prose and identify expected startup tradeoffs.
     - Fail: Add missing workflow sections.
  2. [ ] Policy gates doc defines deterministic checks, run receipts, no-host-mount gate, and redaction.
     - Verify: `grep -E "run ledger|policy gate|receipt|no host mount|no secrets|archive|redact|INFISICAL|mount" .specs/multipass-yolo-workflows/policy-gates.md`
     - Pass: Policy gates map to concrete checks/artifacts and include no-host-mount plus log/artifact redaction rules.
     - Fail: Add missing policy gates or artifact names.
  3. [ ] Safety model maps risks to mitigations and future tasks.
     - Verify: `grep -E "^## Risk matrix|host mount|secret exfiltration|network egress|VM escape|recovery|mitigation|future task" .specs/multipass-yolo-workflows/safety-model.md`
     - Pass: Safety model contains a risk/mitigation/task matrix.
     - Fail: Add missing risk rows or mitigation details.

**T5: Define implementation backlog and open questions** [medium] -- engineering-lead
- Blocked by: V1
- Description: Convert the design into an implementation backlog for a future plan: cloud-init file, Multipass commands, Docker/devcontainer option, Infisical bootstrap, docs, tests, and policy scripts. Include unresolved decisions with recommended defaults.
- Files: `.specs/multipass-yolo-workflows/implementation-backlog.md`
- Acceptance Criteria:
  1. [ ] Backlog is ordered and identifies dependencies/open questions.
     - Verify: `grep -E "P0|P1|P2|Open Questions|Recommended default|cloud-init|Multipass|Infisical" .specs/multipass-yolo-workflows/implementation-backlog.md`
     - Pass: Future executor can create an implementation plan without rereading this conversation.
     - Fail: Add missing priority/dependency/open-question detail.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T4, T5
- Checks:
  1. Run acceptance criteria for T4 and T5.
  2. Docs-focused structural validation: required headings from T4 and T5 exist and are non-empty.
  3. Optional sanity check: `make test-pytest` -- run only if code changed in the same session; unrelated failures should not block docs-only execution.
  4. Optional sanity check: `make lint` -- run only if code or linted files changed.
  5. Cross-task integration: verify research, user stories, Infisical workflow, operations, policy gates, safety model, and backlog agree on the same safety model using a documented consistency matrix.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```text
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4, T5 (parallel, both blocked by V1) → V2
```

## Success Criteria

The plan succeeds when `.specs/multipass-yolo-workflows/` contains a complete design package for a future Multipass + Infisical + Pi/Claude YOLO sandbox implementation.

1. [ ] All design artifacts exist and reference the same architecture.
   - Verify: `find .specs/multipass-yolo-workflows -maxdepth 1 -type f -name '*.md' -print | sort`
   - Pass: Includes `plan.md`, `research-brief.md`, `user-stories.md`, `infisical-secrets.md`, `operations.md`, `policy-gates.md`, `safety-model.md`, and `implementation-backlog.md`.
2. [ ] Safety model is explicit and testable.
   - Verify: `grep -R "no host mount\|least privilege\|infisical run\|run ledger\|policy gate\|redaction\|revocation\|network egress" .specs/multipass-yolo-workflows`
   - Pass: Output shows concrete policies across the design docs.
3. [ ] Design package is structurally complete.
   - Verify: `grep -R "^## Threat model\|^## Canonical happy path\|^## Risk matrix\|^## Open Questions" .specs/multipass-yolo-workflows`
   - Pass: Required design sections exist in the expected artifacts.
4. [ ] Repo validation is clean if code changed.
   - Verify: `git diff --name-only | grep -E '\.(py|sh|zsh|ps1|ts|js)$' && make test-pytest && make lint || true`
   - Pass: If executable code changed, tests/lint pass; if only Markdown changed, docs structural checks are sufficient.
   - Fail: Fix code/lint regressions or document unrelated pre-existing failures.

## Handoff Notes

- This is a design/user-story plan, not the implementation of the Multipass VM or Infisical integration.
- Do not edit `.env` files while executing this plan.
- Prefer documenting commands and safety boundaries over running privileged Multipass/Docker setup during this plan.
- Later implementation should be reviewed before execution because it will touch VM provisioning, secrets, and possibly credential workflows.
