# Product Manager Review

## Findings

### 1. Severity: High — MVP scope still bundles too many product surfaces
**Evidence:** Objective includes schema evolution, dependency DAG, redaction, rendering/settings, five LLM tools, slash-command upgrades, docs, and evidence capture across 7 implementation tasks.
**Required fix:** Split MVP into “registry + list/get/update/create + /tasks list/show” first. Move dependency DAG, TaskCreateMany intra-batch dependencies, renderer modes, and stats to follow-up unless explicitly required for first user value.

### 2. Severity: High — execution tasks are oversized and cross-cutting
**Evidence:** T1 changes registry schema, lifecycle, persistence outcomes, stats, tombstones, operator-state, and fixtures in one task. T6 combines renderer adoption, terminal filtering, multiple state commands, settings/help, and retry semantics.
**Required fix:** Break T1 and T6 into smaller independently verifiable tasks or narrow acceptance to one cohesive behavior per task.

### 3. Severity: Medium — product value is diluted by infrastructure-first sequencing
**Evidence:** Users will not see callable tools until Wave 3 after registry/security/dependency/rendering foundations all pass.
**Required fix:** Sequence a thin vertical slice earlier: TaskCreate/TaskList against existing registry with minimal lifecycle validation, then iterate dependencies/security/rendering as hardening.

### 4. Severity: Medium — secret redaction scope may create false MVP complexity
**Evidence:** T2 requires prompt, metadata, and output-like scanning despite MVP explicitly deferring output tools and prompt injection.
**Required fix:** Limit MVP security to metadata/title/description fields that are actually persisted/rendered now. Defer output-like redaction until output capture exists.

### 5. Severity: Low — validation plan is repetitive and may slow iteration
**Evidence:** Many acceptance criteria require narrow `-t` runs, then wave tests, then full tests, then repo wrapper, with evidence logs at multiple stages.
**Required fix:** Keep task-specific tests for development, but require only wave gate logs plus final typecheck/full test logs for completion evidence.
