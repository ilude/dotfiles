---
status: research-note
source: local design discussion and linked research
---

# Pi test-suite value review

## Why this matters

The proposed Pi workflow reviews whether a JavaScript or TypeScript test suite provides useful regression protection relative to the maintainer time required to run, understand, investigate, and change it. The main concern is test proliferation: adding many tests can increase coverage and execution cost without adding distinct fault protection.

## Decision artifact

- [PRD: Pi test-suite value review](PRD.md) - current product decisions, requirements, acceptance criteria, and first-trial scope.

## Research

- [Agentic test-review research](agentic-test-review-research.md) - implementation patterns, academic evidence, Pi architecture options, and evaluation considerations.
- [General testing code smells](general-testing-code-smells.md) - framework-neutral test-effectiveness, isolation, lifecycle, and suite-strategy signals.
- [TypeScript testing smells and performance](typescript-testing-code-smells.md) - JavaScript runtime, TypeScript, ESM, DOM, runner, and performance failure modes.

## Current direction

The first version uses one `/test-review` prompt template, one reusable skill, and one closed-read reviewer agent. The root Pi session owns inventory, local commands, finding verification, state under the Git common directory, and later worktree remediation. No extension is planned until real use demonstrates a deterministic orchestration failure worth solving.

The first trial covers all JavaScript and TypeScript unit, integration, contract, and component tests in the dotfiles repository. Browser E2E tests are inventoried and timed where available, then routed to the Playwright E2E capability for semantic review. The trial evaluates useful findings, consolidation opportunities, and developer-facing time savings rather than finding count, coverage growth, or a numeric test-value score.

## KISS recommendation

Implement the prompt, skill, and reviewer; run one complete baseline; then use observed false positives, user dispositions, and orchestration failures to decide whether any additional machinery is justified.

## Related notes

- [Evidence-based code review](../../patterns/evidence-based-code-review.md)
- [Agent workflow benchmark loops](../agent-workflow-benchmark-loops.md)
- [Pipelines and policies](../pipelines-and-policies.md)
