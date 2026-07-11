---
name: approval-aware-operations
description: "Approval-aware planning for Pi damage-control. Use before cleanup or deletion, destructive Git, process termination, package or cache removal, protected file access, network uploads, or cloud, container, cluster, database, and infrastructure mutations that may trigger confirmation. Not for bypassing policy or avoiding an approval required by the task."
---

# Approval-aware operations

**Auto-activate when:** a task may involve cleanup, deletion, protected paths, destructive Git or process control, package or cache removal, network upload, persistence, or external infrastructure mutation.

## Boundary

| Need | Guidance |
| --- | --- |
| Complete work with fewer unnecessary confirmation interruptions | Use this skill |
| Change or test damage-control behavior | Follow the Pi extension and damage-control test guidance |
| Perform a risky effect required by the task | Use the direct operation and allow confirmation |
| Perform the same risky effect through different syntax | Never do this to avoid policy |

## Core principle

Optimize for the correct completed outcome with the least unnecessary risk. Confirmation is an acceptable cost when the risky effect is necessary. Remove incidental risk from the workflow, not safety checks from a required operation.

## Policy model

Pi damage-control evaluates shell commands and protected file operations before execution. The default policy is [`claude/hooks/damage-control/patterns.yaml`](../../../claude/hooks/damage-control/patterns.yaml), loaded by [`pi/extensions/damage-control.ts`](../../extensions/damage-control.ts). An explicit runtime override may select another policy.

Treat outcomes as follows:

- **Allow:** proceed normally.
- **Ask:** the operation may be valid; issue it plainly and let the user decide.
- **Block:** do not attempt the same effect through another command, language, tool, path, or sequence.
- **Protected path:** respect the configured access level. Use an example, schema, redacted metadata, or user-provided input when that can satisfy the task without protected contents.

When uncertain, inspect only the relevant command category or path section in the active policy. Do not rely on a memorized rule list that may be stale.

## Decision process

1. **State the required effect.** Separate the requested outcome from the first command that comes to mind.
2. **Test necessity.** Ask whether the risky effect changes the requested result or merely tidies the workspace, resets incidental state, or follows habit.
3. **Choose the least risky equivalent that preserves the outcome.** Prefer omission, overwriteable scratch output, read-only inspection, dry-runs, narrow targets, graceful operations, and specialized safe tools when they are genuinely equivalent.
4. **Prepare before the prompt.** Gather read-only context, preview targets, and narrow scope before issuing an operation expected to require confirmation.
5. **Execute plainly.** If the risky effect remains necessary, use the normal direct operation. Do not weaken correctness to avoid confirmation.
6. **Respond to the decision.** After denial or a hard block, replan around the prohibited effect. Do not retry spelling, wrapper, alias, encoding, tool, or multi-step variants.

## Preferred patterns

| Situation | Prefer |
| --- | --- |
| Throwaway logs, captures, or generated probes | OS temp or gitignored `.tmp/`; overwrite on the next run and leave in place unless cleanup is required |
| Temporary file created only to feed another command | A pipe, bounded in-memory value, or OS temp file when practical |
| Existing file needs a small change | Targeted `edit`, `text_edit`, or `structured_edit` rather than delete and recreate |
| Recursive cleanup | Inspect exact targets first and narrow the set; if deletion is still required, run it and accept confirmation |
| Requested tracked-file removal | Remove it plainly and accept confirmation; do not empty, rename, or hide it as a substitute |
| Build or package cache issue | Invalidate the smallest project-local scope that solves the problem before considering a global cache clean |
| Process shutdown | Use the normal graceful stop first when it can solve the problem; force termination only when needed |
| Git recovery or history change | Inspect status and diffs first, preserve unrelated work, and use the smallest correct operation even when it requires confirmation |
| Infrastructure, cluster, cloud, or database change | Run read-only status, diff, plan, or preview steps first; for stateful replacement require current backup evidence, restore steps, rollback boundary, and one-service canary scope; then mutate through the normal confirmed path |
| Protected credential or secret path | Use documented examples, schemas, identifiers, or redacted values; ask the user for needed information rather than probing alternate paths |

## Approval discipline

- Do not perform cleanup only to make the workspace look tidy.
- Do not request a separate conversational approval when the established runtime confirmation presents the same exact decision, unless another instruction requires an earlier decision.
- Do not combine unrelated risky effects into one broad command to reduce prompt count.
- Do not omit required teardown, rollback, deletion, or mutation merely because it will prompt.
- If a necessary approval cannot be obtained, report the exact blocked outcome and preserve completed work for continuation.
- Reuse authorization for repeated in-scope, non-destructive recovery. Ask again only when the target, destructive scope, rollback risk, or intended outcome materially changes.
- Do not combine independent stateful replacements into one approval or apply merely because each replacement is individually authorized.

## Failure boundary

After a live mutation fails, stop unrelated mutations and enter incident mode. Preserve healthy targets, diagnose one affected service directly, and do not resume batch rollout until its original endpoint and state checks pass. Confirmation to continue does not replace recovery evidence.

## Forbidden evasions

- Replacing `rm` with Python, Node, Ruby, Perl, PowerShell, or another file API solely to avoid a rule.
- Hiding a command inside a shell wrapper, alias, encoded payload, variable expansion, or generated script.
- Renaming or copying a protected file before accessing it.
- Splitting one prohibited effect across several individually less obvious tool calls.
- Truncating, emptying, or relocating data when the requested operation is deletion.
- Choosing an incorrect or incomplete solution because it happens not to trigger confirmation.

## Quick check

Before a potentially risky call, ask:

1. Is this effect required for the requested outcome?
2. Is there a genuinely equivalent lower-risk approach?
3. Have I previewed and narrowed the target?
4. If it is still risky, am I issuing it directly and allowing confirmation?
