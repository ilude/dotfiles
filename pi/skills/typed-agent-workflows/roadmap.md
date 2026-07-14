# Deferred Capability Specifications

These are options, not commitments. Implement one increment only when its trigger is demonstrated by a real workflow. Each increment must preserve the rule that deterministic code owns routing, policy, and mutation.

## 1. Configurable Output Retry Budget

**Trigger:** Two typed agents require different correction budgets based on observed invalid-output rates.

**Minimum addition:**
- Add an integer `outputRetries` configuration with a small enforced maximum.
- Keep transport retries separate from output-correction retries.
- Report attempts in the run result.

**Excluded:** Backoff policy, provider failover, and unbounded retry loops.

**Acceptance:** Tests cover zero, default, maximum, exhaustion, and cancellation during correction.

## 2. Read-Only Agent Tools

**Trigger:** A semantic stage repeatedly needs information that cannot be gathered efficiently before the run.

**Minimum addition:**
- Add an explicit tool allowlist to one agent definition.
- Start with read-only tools.
- Validate tool inputs and bound outputs.
- Preserve cancellation through tool execution.

**Excluded:** Mutation tools, implicit inherited tools, and unrestricted shell access.

**Acceptance:** Tests prove unavailable tools cannot be called and allowed tool output is bounded.

## 3. Per-Step Model Policy

**Trigger:** Measurements show one semantic stage needs a different model size or reasoning level for acceptable quality or cost.

**Minimum addition:**
- Add a model resolver and fixed reasoning setting per agent definition.
- Record selected provider/model and usage in the result.

**Excluded:** Automatic model racing, silent provider fallback, and adaptive routing without evaluation data.

**Acceptance:** Tests prove deterministic selection from a fixed registry and explicit failure when no matching model exists.

## 4. Independent Parallel Stages

**Trigger:** Two or more stages have no data or mutation dependency and measured latency materially affects the workflow.

**Minimum addition:**
- Use `Promise.all` at the workflow call site.
- Give each stage an independent input and cancellation path.
- Join results before policy or mutation.

**Excluded:** A generic scheduler, speculative execution, and parallel mutation.

**Acceptance:** Tests prove independence, deterministic result ordering, cancellation, and no partial mutation.

## 5. Reusable Branch Helper

**Trigger:** Three workflows repeat the same typed decision followed by deterministic branch selection.

**Minimum addition:**
- Add one pure helper that maps a validated discriminator to an exhaustive handler table.
- Require compile-time and runtime exhaustiveness.

**Excluded:** Fluent workflow builders, graph syntax, and model-selected branch names.

**Acceptance:** Tests cover every discriminator and reject unknown values before side effects.

## 6. Persistent Run State

**Trigger:** A workflow must survive process restart or wait for operator input beyond the active command lifetime.

**Minimum addition:**
- Define a versioned run-state schema.
- Persist with locked read-modify-write and atomic rename.
- Store completed step IDs, validated outputs, and pending decision only.
- Provide an exact reset scope.

**Excluded:** General memory, transcript duplication, hidden fallback state, and persistence for short commands.

**Acceptance:** Tests cover restart, stale version rejection, concurrent writes, resume idempotence, and exact reset.

## 7. Suspend and Resume

**Trigger:** Persistent state exists and a real workflow requires a delayed approval or external event.

**Minimum addition:**
- Add explicit suspended and resumed states.
- Bind resumption to a run ID and expected pending step.
- Revalidate external state before continuing.

**Excluded:** Background polling, implicit auto-resume, and approval reuse across changed targets.

**Acceptance:** Tests cover valid resume, wrong run ID, changed target, repeated resume, and cancellation.

## 8. Nested Workflow Composition

**Trigger:** Two production workflows reuse the same multi-step sequence with identical contracts.

**Minimum addition:**
- Extract a normal typed function returning a validated result.
- Preserve parent cancellation and error identity.

**Excluded:** Workflow registries, dynamic loading, and graph visualization.

**Acceptance:** Tests prove standalone and nested behavior parity.

## 9. Step Telemetry

**Trigger:** A quality, latency, or cost decision cannot be made from existing command telemetry.

**Minimum addition:**
- Emit stable step ID, agent ID, model, attempts, duration, outcome, and token usage when available.
- Never record prompts, credentials, or unredacted candidate content by default.

**Excluded:** New databases, dashboards, and retention services before local event data proves the need.

**Acceptance:** Tests cover success, validation failure, cancellation, redaction, and deterministic identifiers.

## 10. External Framework Evaluation

**Trigger:** At least three workflows require several of persistence, suspend/resume, nested composition, graph inspection, or replay, and local primitives are becoming duplicated infrastructure.

**Minimum evaluation:**
- Compare the current Pi SDK layer with maintained TypeScript workflow frameworks.
- Prototype one existing workflow without changing its public command.
- Measure dependency weight, authentication fit, startup cost, testability, and migration risk.

**Excluded:** Framework adoption based on feature lists or hypothetical future use.

**Acceptance:** A written decision cites measured parity, gaps, operational cost, and rollback path.
