# Agent workflow idea backlog

## Candidate next slices

### 1. Task status artifacts

Create a minimal `.pi/tasks/` convention and a read-only status command.

Why: aligns zellij cockpit, cmux, test orchestrator, and Pi workflow hardening ideas.

### 2. Reviewed helper workspace

Create a narrow place for agent-proposed helper scripts and notes.

Why: borrows Browser Harness learning without allowing core harness mutation.

### 3. Memory promotion notes

Create candidate/accepted/rejected notes for durable workflow lessons.

Why: aligns Pi memory follow-ups, menos knowledge compiler, and Markdown memory patterns.

### 4. Platform guide template

Create a reusable template for platform-specific rules/examples/validation.

Why: adapts Convex agent plugin structure into repo-native Markdown before automation.

### 5. Sandbox decision checklist

Create a checklist for when to use local execution vs Multipass/Daytona-like sandboxing.

Why: keeps YOLO workflows safe without making every task heavy.

### 6. Adaptive plan review telemetry eval

Use collected workflow telemetry to decide when `/review-it` can be embedded into
`/plan-it` and how many reviewers each plan profile needs.

Why: lowers command count only after reviewer yield and execution-outcome data
show the embedded review policy is safe.

### 7. Goal closeout handoff

Make `/goal` completion emit a compact closeout report with outcome, validation,
current state, and next steps before the goal stops.

Why: preserves handoff context without requiring the user to remember a separate
summarize command.

## Parking lot

- Full Zellij/Pi cockpit UI.
- Continuous LSP diagnostics.
- Automatic memory promotion.
- Large generic skill packs.
- Always-on background ingestion/backfill without a visible status/kill switch.
