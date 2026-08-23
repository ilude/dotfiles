# Orchestration State Migration and Rollback

## Supported migration

`OrchestrationTaskRegistry` accepts persisted document schema versions 1 and 2. Loading schema version 1 validates every program with the current graph invariants, then projects it to schema version 2 with an empty `mailboxes` object. The first later mutation persists schema version 2 through the registry's serialized temp-file plus atomic-rename writer.

Migration does not reinterpret package identity, dependencies, attempts, acceptance, or topology revisions. Unknown document, envelope, result, and compaction-handoff schema versions fail before mutation.

## Validation

Before accepting migrated state:

1. Parse the complete document.
2. Validate every program and dependency graph, including missing targets and cycles.
3. Validate mailbox envelopes and outbox events when present.
4. Refuse the mutation if the expected revision does not match.
5. Write the complete schema version 2 document to a temporary sibling and atomically rename it over the state path.

A failed parse, validation, write, or rename leaves the prior state file as the authoritative document.

## Rollback boundary

The rollback boundary is the first successful schema version 2 mutation. Before that mutation, restarting the prior Pi generation reads the unchanged schema version 1 document. After that mutation, rollback requires restoring the operator's pre-migration state snapshot; the older generation must not be started against schema version 2 data.

Do not hand-edit, partially downgrade, or delete orchestration state. Stop active orchestration, preserve the rejected schema version 2 file for diagnosis, restore the complete pre-migration document to the same path, then start the prior Pi generation and validate program topology before assigning work.
