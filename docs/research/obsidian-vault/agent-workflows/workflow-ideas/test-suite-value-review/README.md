---
status: research-note
source: local design discussion and linked research
---

# Pi test-suite value review

## Why this matters

The proposed Pi workflow reviews whether a JavaScript or TypeScript test suite provides useful regression protection relative to the maintainer time required to run, understand, investigate, and change it. The main concern is test proliferation: adding many tests can increase coverage and execution cost without adding distinct fault protection.

## Decision artifact

- [PRD: Pi test-suite value review](PRD.md) - current product decisions, requirements, acceptance criteria, and planning handoff.
- [Operating model](operating-model.md) - resume and revision rules, repository boundaries, shared timing samples, and calibration scenarios.

## Research

- [Agentic test-review research](agentic-test-review-research.md) - implementation patterns, academic evidence, Pi architecture options, and evaluation considerations.
- [General testing code smells](general-testing-code-smells.md) - framework-neutral test-effectiveness, isolation, lifecycle, and suite-strategy signals.
- [TypeScript testing smells and performance](typescript-testing-code-smells.md) - JavaScript runtime, TypeScript, ESM, DOM, runner, and performance failure modes.

## Current direction

The first version uses one `/test-review` prompt template, one reusable skill, and one closed-read reviewer agent. The root Pi session owns inventory, local commands, finding verification, state under the Git common directory, and later worktree remediation. No extension is planned until real use demonstrates a deterministic orchestration failure worth solving.

The first trial covers JavaScript and TypeScript runtime and compile-time tests owned by the dotfiles Git repository, not tests owned by submodules or nested independent repositories. Browser E2E tests are inventoried and timed where safe and available, then routed to the dedicated browser-E2E capability. A small known-answer calibration set checks missed defects and unsafe deletion recommendations before the complete real baseline.

Semantic review units share canonical command measurements instead of rerunning or double-counting the same suite. Closeout reconciles all evidence to one final commit and distinguishes fully assessed scope from closed scope with explicit gaps. The trial evaluates useful findings, consolidation opportunities, and developer-facing cost rather than finding count, coverage growth, or a numeric test-value score.

## KISS recommendation

Use the PRD and operating model as inputs to a prospective `/plan-it` run. Plan one complete review loop, bounded calibration, and a full selected-repository baseline before considering more machinery. The documents do not themselves authorize implementation or baseline execution.

## Related notes

- [Evidence-based code review](../../patterns/evidence-based-code-review.md)
- [Agent workflow benchmark loops](../agent-workflow-benchmark-loops.md)
- [Pipelines and policies](../pipelines-and-policies.md)
