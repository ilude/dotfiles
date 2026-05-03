---
created: 2026-05-02
status: research-note
source: .specs/multipass-yolo-workflows/
---

# Multipass YOLO Sandboxes

## Core idea

Use an Ubuntu Multipass VM on Windows as an outer sandbox for high-risk Pi/Claude Code runs in YOLO or bypass-permissions mode. Prefer cloning repos inside the VM and moving changes back through git rather than mounting the Windows host filesystem.

Optional advanced mode adds Docker/devcontainers inside the VM as an inner sandbox when the task risk justifies the extra complexity.

## Motivation

Direct YOLO runs on Windows have weak isolation: agents can mutate host files and may access host credentials. WSL is useful for normal supervised development but is not the preferred boundary for bypass-permissions work. Multipass provides a disposable Ubuntu environment with clearer lifecycle controls.

## Baseline workflow

1. Start or create a named Multipass VM.
2. Clone the target repo inside the VM.
3. Bootstrap only the minimum toolchain required for Pi/Claude.
4. Inject narrowly scoped secrets at runtime via Infisical.
5. Run the agent task inside the VM.
6. Validate and review changes in the VM.
7. Push a branch or export a patch through git.
8. Review/merge from the host.
9. Delete/rebuild the VM when trust or state is uncertain.

## Safety rules

- Windows host mounts are forbidden by default for YOLO runs.
- Any mount exception must be explicit and reviewed.
- Never mount host home, `.env`, SSH keys, cloud credentials, password-manager exports, or broad secrets.
- Infisical should provide least-privilege, short-lived, revocable runtime secrets.
- Do not copy host secret files into the VM/container.
- Logs, ledgers, and artifacts must redact env vars, tokens, full secret-bearing command lines, and Infisical output.
- Use git as the main boundary for returning work to the host.

## Infisical boundary

The design should separate:

- setup/provisioning secrets
- agent runtime secrets
- machine identity bootstrap material
- short-lived task tokens

The threat model must assume any secret injected into the YOLO process is readable by that process. Therefore scopes, TTLs, revocation, rotation, and egress expectations matter more than the injection mechanism itself.

## Required design artifacts

The spec proposes a minimum viable design package:

- research brief for Multipass, Windows prerequisites, cloud-init, devcontainers, and Infisical
- user stories for developer/operator/reviewer/secret-admin/recovery roles
- Infisical secret-delivery and threat model
- canonical operations workflow
- policy gates and run receipts
- safety model/risk matrix
- implementation backlog and open questions

## Review lessons

The review produced reusable guidance:

- Keyword-grep acceptance criteria are weak for docs; require headings, examples, matrices, and concrete checklists.
- Full repo tests/lint are disproportionate for docs-only design unless code changed.
- Windows VM prerequisites must be explicit: Hyper-V/VirtualBox driver, BIOS virtualization, admin rights, privileged mounts, Docker Desktop/WSL interactions, startup expectations.
- A no-host-mount policy should have an enforceable verification gate.
- Run ledgers need redaction policy from day one.

## KISS recommendation

Start with one canonical happy path: warm Multipass VM, repo cloned inside VM, `infisical run`, Pi/Claude execution, git handoff. Add Docker/devcontainer nesting, egress controls, dashboards, and per-task VM automation only after the simple flow proves valuable.
