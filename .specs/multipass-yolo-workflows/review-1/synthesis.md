---
date: 2026-05-02
status: synthesis-complete
---

# Plan Review Synthesis: multipass-yolo-workflows

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Key area reviewed | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|-------------------|
| Completeness | reviewer | Zero-context executability reviewer | Mandatory reviewer | Assumptions, prerequisites, acceptance criteria | Assume future executor has only the plan and no conversation memory |
| Security red team | security-reviewer | YOLO sandbox and operational hazard reviewer | Mandatory reviewer | VM/container isolation, host mounts, secrets, rollback | Assume bypass-permissions agents will exploit every broad permission |
| Simplicity | product-manager | Scope and MVP reviewer | Mandatory reviewer | Whether docs-only design scope is proportionate | Assume design work can sprawl without producing implementable value |
| Windows VM ops | devops-pro | Multipass/Windows operations reviewer | Plan depends on Multipass on Windows and optional Docker/devcontainers | Hyper-V/VirtualBox prerequisites, mounts, networking, startup, recovery | Assume implementers overpromise sandbox safety and underdocument ops failure modes |
| Infisical boundary | security-reviewer | Machine identity and secret-injection reviewer | Plan depends on Infisical-managed runtime secrets | Token bootstrap, TTL, revocation, env exposure, logs | Assume any secret injected into YOLO can be read or exfiltrated unless constrained |
| Verification realism | qa-engineer | Docs/design validation reviewer | Plan relies on documentation artifacts and grep-heavy checks | False-positive acceptance criteria and coherence checks | Assume grep passes while docs remain shallow or contradictory |

## Standard Reviewer Findings

### reviewer
- The plan is generally executable as a design package, but it assumes future authors know what level of detail each doc must contain.
- Validation relies heavily on keyword greps; those can pass with shallow placeholders.
- Full repo tests/lint in validation gates may be disproportionate for docs-only work and can fail for unrelated reasons.
- The design does not explicitly define source-of-truth boundaries for generated docs versus later implementation artifacts.

### security-reviewer
- Infisical runtime injection into a YOLO process is not safe by default; injected env vars are readable by the agent process.
- Machine identity bootstrap, token TTL, rotation, storage, and revocation are underspecified.
- The plan says to avoid host mounts but does not require an enforceable no-host-mount gate.
- Network egress restrictions are mentioned only indirectly; a YOLO agent with secrets needs explicit egress boundaries.

### product-manager
- Scope is broad for a design-only plan: research, user stories, secret workflow, operations, policy gates, and backlog could become a mini-architecture project.
- The plan could deliver user value faster by creating one canonical workflow document plus a small user-story appendix.
- Requiring full repo validation for docs risks slowing iteration without proving the design is better.
- A future implementation plan should not be blocked by over-detailed speculative docs.

## Additional Expert Findings

### devops-pro
- Windows virtualization prerequisites are missing: Hyper-V availability, admin rights, BIOS virtualization, Multipass driver choice, and interaction with Docker Desktop/WSL.
- Startup and lifecycle expectations are not concrete enough; warm VM vs cold launch vs container start should be specified.
- Mount policy needs explicit verification because Multipass Windows mounts are disabled by default but can be enabled.
- Recovery flow should include how to delete/recreate a broken VM and how to preserve or discard work safely through git.

### security-reviewer as Infisical boundary reviewer
- The secret workflow must define where `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, and `INFISICAL_TOKEN` live during bootstrap.
- The design should separate secrets needed by the agent from secrets needed by setup scripts.
- Logs/artifacts/run ledgers must explicitly redact env vars, tokens, command lines, and Infisical output.
- The plan should require least-privilege Infisical project/env/path scoping and short-lived tokens.

### qa-engineer
- Grep checks can pass if documents merely contain the words `Infisical`, `mount`, or `policy gate` without actionable content.
- Acceptance criteria need structural checks, e.g. required headings and examples, not only keyword matches.
- Coherence across documents needs a checklist or matrix, not manual “confirm agreement.”
- Test/lint commands do not verify Markdown quality; add markdown/link checks if available or keep validation scoped to docs.

## Suggested Additional Reviewers

- devops-pro -- relevant for Multipass, Windows virtualization, Docker/devcontainer nesting, cloud-init, and operational lifecycle.
- security-reviewer -- relevant for Infisical machine identities, runtime secret injection, host mount boundaries, and YOLO-mode threat modeling.
- qa-engineer -- relevant because this is a design/docs plan with grep-heavy acceptance criteria that can pass falsely.

## Bugs (must fix before execution)

1. **HIGH — Infisical secret boundary is not concrete enough.**  
   The plan asks T3 to cover machine identities and least privilege, but does not require TTL, rotation/revocation, bootstrap storage, env-var exposure, or log redaction. Add these as explicit T3 acceptance criteria.

2. **HIGH — No enforceable host-mount prohibition.**  
   The constraints prefer repo clones inside the VM, but T4/T5 do not require a concrete no-host-mount policy or verification command. Add a policy gate requiring no Windows host mounts for YOLO runs unless explicitly approved.

3. **HIGH — Windows Multipass prerequisites are missing.**  
   The plan does not require documenting Hyper-V/VirtualBox driver choice, admin/BIOS virtualization prerequisites, privileged mounts, or Windows-specific failure modes. Add them to T1/T4.

4. **HIGH — Acceptance criteria are mostly grep-only and can pass with shallow docs.**  
   Replace or supplement greps with required headings, examples, threat-model tables, workflow diagrams/checklists, and cross-document consistency matrices.

5. **MEDIUM — Full repo tests/lint are disproportionate for docs-only design work.**  
   `make test-pytest` and `make lint` can fail for unrelated reasons and do not prove doc quality. Keep quick sanity checks optional or add docs-focused validation; reserve full validation for implementation plans.

## Hardening

1. Add a `safety-model.md` or matrix tying each risk to mitigation, artifact, and future implementation task.
2. Require an explicit startup-time/lifecycle section: first launch, warm VM start, container start, teardown, rebuild.
3. Add a future implementation decision record for whether to use Multipass-only or Multipass + Docker/devcontainer by default.
4. Add a run-ledger redaction policy: never log env, tokens, full command lines containing credentials, or secret values.
5. Add a “minimum viable design package” definition to prevent speculative overdocumentation.

## Simpler Alternatives / Scope Reductions

1. Collapse `operations.md` and `policy-gates.md` into one `workflow.md` for the first pass if the design feels too fragmented.
2. Make T1 research brief a short appendix in `user-stories.md` instead of a separate artifact unless citations need to be extensive.
3. Produce one canonical happy-path workflow first: warm Multipass VM, repo cloned inside VM, Infisical `run`, git handoff. Defer Docker/devcontainer nesting to an advanced section.

## Contested or Dismissed Findings

1. **Dismissed: “The plan should implement the sandbox now.”** The plan explicitly scopes itself to design/user stories first, which is appropriate for a secrets + VM + YOLO workflow.
2. **Downgraded: “Docker Desktop must be included.”** Docker Desktop can be mentioned as an alternative, but the selected architecture intentionally avoids it as the primary sandbox.

## Verification Notes

1. Verified the plan currently only mentions Windows mounts in context and grep criteria, not as an enforceable no-host-mount policy: `.specs/multipass-yolo-workflows/plan.md` lines 11, 33, 154.
2. Verified T3 mentions machine identity and least privilege but not TTL/rotation/revocation/log redaction: `.specs/multipass-yolo-workflows/plan.md` lines 83-89.
3. Verified validation gates include full repo commands despite docs-only scope: `.specs/multipass-yolo-workflows/plan.md` lines 97-98 and 134-135.
4. Verified multiple acceptance criteria use `grep -E` keyword checks: `.specs/multipass-yolo-workflows/plan.md` lines 69, 78, 87, 110, 119, 124, 154.

## Review Artifact

Wrote full synthesis to: `.specs/multipass-yolo-workflows/review-1/synthesis.md`

## Overall Verdict

**Fix bugs first**

## Recommended Next Step

- revise the plan
- rerun `/review-it .specs/multipass-yolo-workflows/plan.md`
- then execute via `/do-it .specs/multipass-yolo-workflows/plan.md`
