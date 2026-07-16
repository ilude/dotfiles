# Pi Improve Feature Context

Status: Curated feature dossier
Last reviewed: 2026-07-16
Feature ID: `pi-improve`

This dossier records durable context for the `/improve` workflow. It is curated repository source, not an automatic dump of local runtime events. Current code, tests, and operator instructions remain authoritative.

## Current behavior

- `/improve` discusses the highest-ranked unresolved candidate.
- `/improve list` emits a numbered candidate list into the transcript without starting an extra provider turn.
- The emitted list is a stable session snapshot. `/improve select <number>` resolves against that displayed snapshot rather than a newly ranked list. An unavailable or stale snapshot requires a refreshed list.
- `/improve select <id>` accepts a unique candidate ID prefix.
- A selected candidate remains in `discussing` state until `/improve decide apply`, `/improve decide edit <change>`, or `/improve decide skip <reason>` captures a choice.
- Ordinary conversation never changes authorization state. Edit and Skip require nonempty details.
- `learning_candidate_decide` is the internal persistence boundary for applied or skipped decisions. It records the captured command directly. Applied decisions require changed paths, validation evidence, and rollback instructions.
- Workflow-friction capture and review records remain local and append-only. Tracked source is never changed automatically from a review or memory event.

## Accepted decisions

1. Keep `/improve` as the only public improvement workflow. Do not restore the retired capture or review aliases.
2. Preserve the stable ordinal snapshot contract: a displayed number identifies the candidate from that exact session list, not the current ranking at selection time.
3. Keep list and selection output in the transcript so later turns can inspect what the operator saw.
4. Require explicit decisions. Questions, objections, and ordinary discussion must not be interpreted as Apply, Edit, or Skip.
5. Use the explicit `/improve decide <apply|edit|skip>` command boundary. The command captures the operator choice deterministically, while `learning_candidate_decide` remains the narrow internal recording tool after required implementation and validation work.
6. Keep runtime feature events separate from this dossier. Runtime capture may inform later curation but must not rewrite tracked decisions.

## Rejected alternatives

- Recomputing the ranked list when an ordinal is selected. This can make a displayed number identify a different candidate.
- Treating free-form follow-up language as an implicit decision. This makes questions and corrections unsafe state transitions.
- Returning list or selection state only through transient notifications. That removes the operator-visible snapshot from later context.
- Letting local event capture modify this tracked dossier automatically. Local observations can be stale, incomplete, or superseded.
- Recording raw transcripts as feature memory. Durable feature events must contain only bounded summaries and supporting paths.

## Evidence

- `pi/extensions/workflow-friction-review.ts` owns candidate ranking, the session list snapshot, command dispatch, discussion state, and `learning_candidate_decide`.
- `pi/tests/workflow-friction.test.ts` covers ordinal selection, transcript-visible output, explicit decision handling, and decision persistence boundaries.
- `pi/README.md` documents the public `/improve` command surface and the local workflow-friction stores.
- The adversarial review identified ordinal drift, transcript invisibility, and ambiguous decision capture as the main operator-facing failure modes. The stable snapshot and explicit decide-command direction address those boundaries without expanding automatic mutation.

## Open questions

- Should a decision command be rejected unless its candidate is the currently discussed candidate, or should it accept an explicit candidate ID for recovery?
- Which runtime evidence should be promoted into this dossier, and what review cadence should mark stale entries as superseded?
- Should stable list snapshots survive session resume, or should resumed sessions require `/improve list` before ordinal selection?

## Next refinements

1. Define deterministic resume behavior for list snapshots and active discussions.
2. Compare the public docs, command help, prompt guidance, and tests so decision terminology is identical across every surface.
3. Curate validated local evidence into this dossier only through an explicit tracked change, recording superseded conclusions rather than deleting their history.

## Rollback context

The feature-memory layer can be rolled back by removing its extension, registry, loader, tests, and this dossier entry, then reloading Pi. Local `events.jsonl` can be retained because no tracked runtime depends on it. If local events must be removed, first stop Pi writers, verify the exact configured feature-memory directory, and remove only that local file.
