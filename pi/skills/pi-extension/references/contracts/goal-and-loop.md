# Goal and Loop Execution

- Foreground goals: ordinary `/goal` work remains interactive and session-owned. A plan is required only when explicitly supplied or when material risk or unresolved ambiguity makes direct work unsafe.
- Unattended goals: `/goal --unattended` requires one reviewed canonical plan, one durable root-task graph, a clean committed baseline, and one detached loop owner for the workspace.
- Readiness: materialize unique task keys and hard dependency edges before modification. The task registry determines dependency readiness; independent ready work remains eligible when another item blocks.
- Attempt authority: unattended modification requires a current process-owned attempt. Interrupted or stale attempts never authorize replay; reconcile observed worktree and task state first.
- Recovery: record errors, inconclusive results, invalid schemas, verifier contradictions, missing results, infrastructure failures, permission boundaries, and operator waits explicitly. Recovery attempts are bounded and must change a deterministic strategy component.
- Safety: permission denial and hard blocks are never bypassed. A failed live mutation enters incident recovery for that boundary. Resume does not replay a partially observed mutation.
- Persistence: persist objective identity, plan links, task mapping, attempts, outcomes, blockers, validation, artifacts, process identity, and repository baseline under the loop job. Process-local child state is not recovered after process loss.
- Completion: require every required plan item and linked root task to be complete, bounded task outcomes, validation observed after task completion, artifact consistency with the final diff, and satisfied goal conditions. A summary alone cannot complete the goal.
- Closeout: archive the canonical spec in the owned workflow worktree, commit the archive and in-scope artifacts, merge with `--no-ff` into the currently checked-out clean primary branch, verify merged HEAD, then remove only the owned worktree and branch before clearing unattended state. Preserve the recovery worktree on any dirty, branch-changed, unmerged, merge-conflict, or cleanup failure.
- Terminal state: completed goals are immutable. Stop and resume may operate on active or waiting work, not restart completed work.
