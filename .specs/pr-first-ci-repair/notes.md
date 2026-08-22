# PR-first CI validation and repair notes

Status: follow-up topic, intentionally outside the remote workspace PRD

## Origin

This topic emerged while discussing an exe.dev-like remote agent platform in:

- [`.specs/remote-agent-platform/notes.md`](../remote-agent-platform/notes.md)

The current remote-agent-platform discussion remains focused on the remote workspace product. This document preserves the separate CI workflow idea for later grilling and PRD work.

## Problem

Local coding agents often run focused tests successfully but then consume workstation CPU and time running complete repository validation suites. Repository `AGENTS.md` instructions and the current workflow require relevant full unit-test and validation gates before completion. When those broad checks expose unforeseen failures, local agents can enter repeated diagnosis, repair, and revalidation cycles that create churn and encourage overengineered fixes outside the original change. A PR-first workflow could move the authoritative merge gate and its resource cost to remote CI while retaining cheap, directly relevant checks locally. A bounded repair workflow could address legitimate broader failures without making every local change session own the complete repair loop.

## Candidate workflow

```text
local agent
  -> implement change
  -> run focused checks
  -> commit feature branch
  -> push and open or update PR
  -> Forgejo Actions runs complete validation
  -> failure event triggers bounded diagnosis or repair
  -> repair agent updates only the PR branch
  -> CI reruns
  -> merge policy handles a green result
```

## Potential responsibility split

### Local agent

- Implement the requested change.
- Run focused checks that directly exercise it.
- Commit and push a feature branch.
- Open or update the PR.

### CI

- Own the authoritative complete validation gate.
- Produce structured status and bounded failure evidence.
- Prevent merge while required checks fail.

### Deterministic coordinator

- Receive verified Forgejo workflow events.
- Correlate repository, PR, head commit, and failed run.
- Enforce retry and repair policy.
- Start a repair attempt and retain its outcome.

### Repair agent

- Check out the exact failed PR head.
- Diagnose the reported failure.
- Apply an in-scope repair.
- Run focused validation.
- Push only to the PR branch.

### Optional Hermes role

Hermes may provide notification, summary, and operator decisions. No decision has been made to use Hermes as the coordinator or coding runtime.

## Safety questions

- Which repositories require PRs and protected `main`?
- Which checks remain local and which become authoritative CI gates?
- May a repair agent push to a contributor branch?
- Who or what may merge after CI passes?
- How many repair attempts are allowed per PR head?
- How are repeated unchanged failures detected?
- Which failure classes stop without an agent attempt?
- How is weakening or bypassing validation prevented?
- What happens when the PR head changes during repair?
- What evidence must be retained for each repair attempt?

## Existing foundation to inspect later

- Forgejo and the Forgejo Actions runner managed by `modules/homelab-infra/`.
- Repository-specific validation entrypoints.
- Branch-protection capabilities and current policies.
- Possible use of the remote workspace platform as a future repair executor.

## Follow-up boundary

Do not pull this workflow into the remote workspace PRD merely because a future CI repair service might consume remote workspaces. Develop it as a separate requirement set after the workspace product boundary is settled.
