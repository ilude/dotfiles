---
status: research-archive
source: .tmp/reviews/*.md
---

# Subagent and durable-task review archive

This is an archived, read-only research package assembled from eight role-specific reviews. It is not an approved plan, roadmap, implementation decision, or authorization to change the reviewed systems.

## Contents

- [Consolidated findings and recommendation IDs](findings.md) - all S1-S10, U1-U8, Q1-Q10, M1-M8, and T1-T5 candidates, evidence, recommendations, acceptance checks, and rejected simplifications.
- [Role-specific concerns and review status](role-concerns.md) - provenance, status labels, and concerns that must remain visible when interpreting the consolidation.

## Review boundary

The reviews cover `pi/extensions/subagent/`, durable task storage and commands, workflow runtime behavior, tests, contracts, and operator UX. They explicitly preserve root-owned task lifecycle, trusted project-agent discovery, role and depth limits, canonical scope containment, authenticated tree admission, cancellation, bounded output, and deferred advanced tools.

## Status

Every recommendation remains unresolved research. The review status labels are evidence about review confidence, not implementation approval. The strongest status labels are `confirmed`, `confirmed gap`, `confirmed rule issue`, and `preference`; none means accepted work.

## Source handling

The source Markdown review artifacts remain in `.tmp/reviews/` and are not deleted. Raw session or JSONL content is not copied into this archive, and `.specs/` is not part of this package.

## KISS recommendation

Use this package as historical evidence when a concrete repeated problem is being evaluated. Re-check current source and contracts before promoting any candidate into a separate implementation plan.
