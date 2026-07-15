---
reviewer: security-reviewer
status: complete
finding_count: 4
---

# Findings

- severity: high
  category: "task-registry mutation safety / partial writes"
  confidence: high
  evidence: "T1 requires validation before the first task file, but the plan explicitly defers crash-atomic multi-file commits. Existing registry writes each record with writeTaskFile, then maintainReverseEdges writes blocker files separately (pi/lib/task-registry.ts:280-287, 300-325). A process or disk failure during a batch can leave some task records and reverse edges persisted, so a deterministic retry can produce a corrupted or misleading DAG. Severity is high because this is durable state corruption, not merely a failed request."
  required_fix: "Define and test a failure-safe batch commit boundary: preflight all target paths and permissions, write through a journal/manifest with recovery or perform a verified rollback of every created/updated file, including reverse edges. Add an injected write/rename failure test proving no partial graph remains and document recovery behavior before enabling the public batch action."
- severity: high
  category: "permission boundary / workspace isolation"
  confidence: high
  evidence: "The new execute_many accepts supplied IDs, but the plan does not require current-workspace authorization or an explicit all-workspaces gate. Existing coordinator.start only loads getTask(taskId) and starts it without checking workspace (pi/extensions/tasks/execution.ts:220-243), while the tool's list/ready filtering is workspace-aware. A caller holding an ID can therefore start an executable task belonging to another workspace and execute its stored prompt/cwd. Severity is high because this crosses the existing task visibility boundary and can run work in an unintended repository."
  required_fix: "Make execute_many and await enforce the same workspace/session ownership boundary as list/ready, with an explicit, separately authorized cross-workspace mode if needed. Validate the execution cwd against the task workspace or an approved workspace root, and add tests proving foreign IDs are rejected without state changes or runner invocation."
- severity: medium
  category: "path and output exposure"
  confidence: high
  evidence: "T4/T5 require artifact references, but the existing output result exposes the absolute execution.outputPath in model-visible metadata (pi/extensions/tasks.ts:490-510), and executionFrom accepts an arbitrary caller-provided cwd (pi/extensions/tasks.ts:405-435). The plan adds new compact execute_many/await envelopes without specifying whether paths are normalized, constrained, or redacted. Severity is medium because absolute paths reveal local topology and unconstrained cwd expands the filesystem boundary; the risk is higher when task IDs can cross workspaces."
  required_fix: "Specify an artifact-reference contract that returns only a workspace-relative or opaque reference in model-visible content, while retaining the full path only for trusted renderer details. Reject or constrain execution cwd to the resolved task workspace (and document symlink handling), and test traversal, foreign-root, and path-leak cases."
- severity: medium
  category: "evidence redaction and archive safety"
  confidence: medium
  evidence: "The plan promises that evidence never stores prompts, transcripts, tokens, or unredacted sensitive output, but its acceptance tests cover bounded size/artifact references rather than redaction failures. Existing sanitizeTaskValue uses a finite regex list (pi/lib/task-security.ts:1-28), while saveOutput writes sanitized content but returns outputError text and outputPath metadata; no plan step audits generated task artifacts or review/archive inputs. Severity is medium because a secret format not matched by the regexes can persist in the task output artifact and later be copied or archived despite the stated evidence contract."
  required_fix: "Add focused tests for secrets in prompts, metadata, worker output, errors, and artifact-backed await results, including representative non-regex credentials; define whether redaction is best-effort or a hard evidence gate. Before archive, enumerate and exclude task output/temp files and verify only sanitized, intended plan/review artifacts are eligible, including after frozen-install validation."
