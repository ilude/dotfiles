# Migration Patterns

Treat migrations as versioned, reviewable production changes.

## Authoring

- Use the repository's migration tool and naming convention. Names should describe one schema or data change.
- Keep migrations atomic and document why a non-obvious change exists.
- Do not edit an applied migration. Add a forward migration to correct it.
- Separate schema changes from large data backfills so each has an observable rollout and failure boundary.

## Compatibility and Rollout

- Use expand-contract changes for deployed applications: add compatible schema, deploy readers and writers, backfill, switch reads, then remove old schema in a later release.
- Test against production-like schema, data volume, permissions, and engine version before deployment.
- Assess lock behavior, transaction duration, index-build behavior, and replication impact for every production migration.
- Schedule or batch large backfills, make progress resumable, and monitor errors and lag.

## Rollback

- Prefer forward fixes in production when rollback could discard data or conflict with newer writes.
- Provide a down migration only when reversal is safe, tested, and consistent with the deployment plan.
- Before an irreversible change, verify backups and a restore path.

## Idempotency and Safety

- Match idempotency to the migration runner. Repeated application must not silently conceal drift.
- Guard destructive operations with a reviewed compatibility plan and an explicit data-retention decision.
- Add constraints only after existing data satisfies them, or include a controlled remediation step.

## Common Failure Modes

| Failure | Prevention |
|---------|------------|
| Old application code meets removed schema | Use expand-contract rollout |
| Long lock or outage | Test lock behavior and split or schedule work |
| Failed data backfill | Batch, checkpoint, and make restart safe |
| Unsafe rollback | Prefer a forward fix and verify restore capability |
| Ambiguous migration history | Use immutable, ordered migration files |
