# Post-change product review

## Finding 1
- **Severity:** required
- **Area:** MVP scope and execution boundary
- **Evidence:** The constraints say not to rewrite currently modified `CHANGELOG.md` or `pi/AGENTS.md`, while T2 requires edits to `pi/AGENTS.md` and T4 requires a `CHANGELOG.md` update. Both files are also named as unrelated working-tree changes in Handoff Notes.
- **User impact:** The plan cannot complete its stated documentation outcome without violating its preservation boundary. This creates unnecessary execution ambiguity unrelated to the mixed-DAG user outcome.
- **Required change:** Choose one consistent boundary: either explicitly authorize narrowly targeted, conflict-safe edits to these files, or defer their updates and remove them from T2/T4 acceptance criteria. For the smallest MVP, keep the runtime behavior and exact workflow test; defer changelog and broad guidance edits until the existing changes are resolved.

## Finding 2
- **Severity:** required
- **Area:** Public graph-batch contract
- **Evidence:** `execute_many` and `await` cap IDs at eight, but graph-aware `batch` has no stated maximum task count. Its success content returns every created task and its implementation must validate and publish the entire prospective graph.
- **User impact:** A caller can submit an arbitrarily large graph through the same public tool, defeating the stated bounded-result/context goal and turning an MVP convenience action into an unbounded durability and recovery surface.
- **Required change:** Add an explicit, small maximum `tasks[]` count to the batch schema and runtime validation, with a deterministic rejection and test. State the matching compact-output behavior. This keeps graph creation aligned with the bounded fan-out and one-shot-wait vocabulary.

## Finding 3
- **Severity:** required
- **Area:** User-value verification
- **Evidence:** T4 proves a fixed sequence through an action spy, but it does not require an assertion that the caller can use the returned `batch` aliases to supply the later `update`, `ready`, `execute_many`, and `await` IDs. The value proposition is same-call graph construction without create-then-update UUID round trips.
- **User impact:** The test can pass while the public batch response is not actionable enough for the documented no-poll workflow, leaving callers to inspect details or add a read action to discover IDs.
- **Required change:** In T4, drive all subsequent public actions from the batch response's key-to-ID aliases and assert the returned aliases cover every requested key. Retain the no-read-action assertion. This proves the caller outcome rather than only the internal action order.
