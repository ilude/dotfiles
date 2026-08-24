---
status: research-note
source: https://blog.cloudflare.com/astro-issue-triage/
---

# Cloudflare and Astro issue triage

## Why this matters

Cloudflare describes a production issue-triage workflow used on Astro that
reproduces reports in sandboxes, diagnoses root causes, classifies behavior,
produces fixes, and asks the original reporter to verify preview releases. The
case provides concrete evidence for phase isolation, artifact-based handoffs,
host-native workflow state, and converting recurring failures into repository
improvements.

## Sources

- [Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/)
- [withastro/triagebot-action](https://github.com/withastro/triagebot-action)
- [Astro triage skill](https://github.com/withastro/astro/tree/main/.agents/skills/triage)
- [Astro reproduction phase](https://github.com/withastro/astro/blob/main/.agents/skills/triage/reproduce.md)
- [Flue Astro triage example](https://github.com/withastro/flue/tree/main/examples/astro-triage-cf)

## Useful signals

### Separate evidence stages before mutation

The repository-owned triage skill follows four stages:

1. Reproduce the reported behavior.
2. Diagnose its cause.
3. Verify whether it is a defect or intended behavior.
4. Convert the reproduction into tests and attempt a fix.

Each stage runs in an isolated context and passes a compiled `report.md` to the
next stage. The reproduction instructions require a report even when the issue
cannot be reproduced, an error occurs, or the stage must be skipped. This makes
failure a first-class outcome and prevents downstream work from silently
assuming success. See the [Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/)
and [Astro reproduction phase](https://github.com/withastro/astro/blob/main/.agents/skills/triage/reproduce.md).

### Use visible host artifacts as workflow state

The automation uses GitHub labels as state transitions and issue comments as
its durable record. It reconstructs progress from those artifacts rather than
keeping a separate hidden state database. Preview package releases, reports,
logs, and reporter instructions remain attached to the issue. This is useful
when the host platform already provides durable, auditable state, but it is not
a replacement for task or goal storage where dependencies and cross-process
execution state are required. See the [Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/).

### Keep external verification distinct

A generated fix is published as a preview release for the original reporter to
test against the affected project. The automation opens a pull request only
after the reporter confirms the preview. This separates repository tests from
verification of the external workflow that produced the issue. See the
[Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/).

### Treat repeated failures as repository signals

Cloudflare classifies recurring incorrect fixes as possible evidence of opaque
component boundaries, missing implementation rationale, or insufficient tests.
In the reported HMR example, agents repeatedly changed a condition in a way
that fixed one symptom but caused regressions. Adding rationale and regression
coverage changed later behavior. The response was to improve the repository's
interface to maintainers and tools, not only to change models. See the
[Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/).

### Prove the skill locally before automating it

Maintainers first developed the triage process as a local skill, then reused it
inside GitHub Actions. The action was later separated from Astro into
[withastro/triagebot-action](https://github.com/withastro/triagebot-action) so
workflow changes could be tested without modifying the primary repository's
live automation.

## Possible Pi fit

- Use separate reproduce, diagnose, classify, and fix packages when a workflow
  repeatedly forces solutions before establishing that a defect exists.
- Require a bounded artifact at every transition, including inconclusive and
  failed stages.
- Convert recurring failures into minimized fixtures that encode the missing
  invariant rather than preserving raw sessions as benchmark truth.
- Distinguish local validation from external user or service verification.
- Prefer existing visible state surfaces when they satisfy the required
  lifecycle, while retaining Pi goals and tasks for their owning domains.
- Measure whether each additional stage reduces false fixes or maintainer work
  enough to justify its pipeline cost.

## Evidence limits

Cloudflare reports that Astro's open issue count fell from more than 200 to
about 30 over several months, with zero still expected rather than achieved at
the publication date. The article does not provide incoming issue volume,
closure categories, false-fix or revert rates, maintainer intervention time, or
a controlled manual baseline. Its reference to resolving the "vast majority"
of issues is a philosophy rather than a published success rate. Public reports
and logs expose artifacts and operational steps, not hidden model reasoning.

## Risks / reasons not to build yet

- One repository case does not establish that the same phase structure is
  economical for other task classes.
- Labels and comments can become ambiguous when workflows need dependencies,
  leases, cancellation, or cross-system recovery.
- Automated issue fixing can amplify invalid reports or unsafe reproductions if
  classification and sandbox boundaries are weak.
- Adopting Flue would add a framework before a local repeated failure proves a
  need that current Pi workflows cannot satisfy.
- Improving comments for tool behavior can create noise unless the rationale is
  also valuable to human maintainers.

## KISS recommendation

Keep this as an operational case study. Borrow the failure-report artifact,
explicit classification gate, and external verification distinction when a
specific recurring workflow needs them. Do not adopt Flue or build a general
issue factory from this source alone.

## Related notes

- [Agent workflow benchmark loops](../workflow-ideas/agent-workflow-benchmark-loops.md)
- [Pipelines and policies](../workflow-ideas/pipelines-and-policies.md)
- [Self-healing harnesses](../patterns/self-healing-harnesses.md)
- [Adaptive plan review telemetry](../workflow-ideas/adaptive-plan-review-telemetry.md)
- [Sandboxed agent runtimes](../patterns/sandboxed-agent-runtimes.md)
