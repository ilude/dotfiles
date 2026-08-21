# Scheduler and Lifecycle Review

Source run: `f130d571-c379-4126-b472-a5f45e24e04c`

## Findings

1. Role-aware capacity is incomplete. Coordinators and leaves are counted identically by `activeDescendantCount()` in `pi/extensions/subagent/tree-runtime.ts:665-675`. At capacity 1, a coordinator consumes the only slot and its leaf remains queued. Existing tests cover only sufficient capacity in `pi/tests/subagent-tree-runtime.test.ts:429-450,937-984`.
2. Coordinator and leaf admission passes. Parent-role and depth rules are explicit in `tree-runtime.ts:207-250` and tested in `subagent-tree-runtime.test.ts:384-427`. `index.ts` also limits depth and removes delegation tools from leaves.
3. Descendant settlement is incomplete. Broker release recursively cancels descendants and waits in `tree-runtime.ts:463-496`, but `runSingleAgent()` marks the run settled before broker release completes in `index.ts:1856-1881`.
4. Lease cleanup is incomplete. Cancellation retains leases until settlement in `tree-runtime.ts:430-446,651-694`, but stale cleanup has no automatic caller.
5. Cancellation is incomplete. Broker cancellation and run-manager aborts are separate and linked asynchronously rather than atomically in `tree-runtime.ts:498-512,637-675` and `run-manager.ts:622-651`.
6. Per-result delivery is incomplete. Delivery is retained and retried in `run-manager.ts:318-371` and `index.ts:2390-2424`, but it is keyed by orchestration and aggregated before delivery in `index.ts:2440-2472`, rather than independently keyed per result.
7. Deadlock and starvation safety fails. FIFO dispatch has no coordinator reservation, leaf reservation, role partition, or bypass rule in `tree-runtime.ts:608-625`. Capacity-1 and all-coordinator saturation can deadlock.
8. Stale lease recovery is incomplete. `reconcileOrphans()` exists and is tested in `tree-runtime.ts:533-545` and `subagent-tree-runtime.test.ts:533-574`, but has no production caller.

## Required Direction

- Replace capacity behavior with suspension-based fork-join so waiting teamleads consume no execution slot or write lease.
- Run automatic orphan reconciliation.
- Require dispatcher settlement before run-manager completion.
- Retain and deliver results by result ID.
- Establish one authoritative lifecycle owner instead of dispatcher and run-manager disagreement.
- Route UI cancellation through the authoritative dispatcher.

## Recommendation

Fail. Do not integrate the current lifecycle changes. Correct capacity and deadlock behavior, settlement ordering, stale recovery, cancellation authority, and result-keyed delivery.
