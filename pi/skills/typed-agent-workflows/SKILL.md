---
name: typed-agent-workflows
description: "Pi defineAgent, typed semantic stages, or code-plus-agent workflows using pi/lib/typed-agent.ts. Not for delegation, extension hooks, or command UX."
---

# Typed Agent Workflows

## Boundary

| Need | Use |
| --- | --- |
| Typed semantic stage implementation | `typed-agent-workflows` |
| Pi hooks, commands, tools, or status UI | `pi-extension` |
| Public command UX | `workflow-design` |
| Broad architecture strategy | `development-philosophy` |

## Core Model

Use three actors deliberately:

1. Deterministic code owns discovery, routing, policy, validation, and mutation.
2. Typed agents handle classification, planning, synthesis, and other judgment-heavy work.
3. The operator owns subjective decisions and consequential approval boundaries.

Keep workflow control in ordinary TypeScript. Do not introduce a workflow DSL for simple sequencing or branching.

## Minimal API

```typescript
import { Type } from "@sinclair/typebox";
import { defineAgent } from "../../lib/typed-agent.js";

const InputSchema = Type.Object({ candidate: Type.String() });
const OutputSchema = Type.Object({
  decision: Type.Union([
    Type.Literal("accept"),
    Type.Literal("reject"),
    Type.Literal("ambiguous"),
  ]),
  reason: Type.String(),
});

const reviewer = defineAgent({
  id: "candidate-reviewer",
  instructions: "Classify the supplied candidate.",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  resolveModel,
  prompt: ({ candidate }) => `Review this candidate:\n${candidate}`,
});

const { output } = await reviewer.run({ candidate }, ctx);
```

## Implementation Rules

- Give each agent one judgment responsibility.
- Validate inputs before model execution and outputs before policy decisions.
- Supply known context directly; do not add tools when deterministic code can gather it first.
- Use an isolated in-memory Pi SDK session with no tools by default.
- Resolve models through Pi's model registry so existing provider authentication remains authoritative.
- Propagate `ctx.signal` and always dispose the nested session.
- Keep correction retries bounded. The MVP permits one output-correction retry.
- Treat schema validity as necessary but insufficient. Apply domain invariants afterward in deterministic code.
- Never let model output directly stage, commit, push, delete, deploy, or bypass approval policy.
- Test the agent boundary with a fake session, then validate the exact command workflow.

## Workflow Design Checks

- Before automating an unfamiliar multi-stage workflow, inspect its intended entrypoint and identify deterministic inputs, semantic judgments, validation signals, and operator approval boundaries. Exercise it end to end only through an isolated safe fixture; do not run a stateful or external entrypoint solely for discovery.
- Run linters, type checks, tests, and pass/fail routing in deterministic code. When a typed stage owns remediation, pass only bounded diagnostics back as explicit input; code still owns retry limits and the final validation decision.

## Deferred Capabilities

Read [roadmap.md](roadmap.md) only when a concrete workflow cannot be implemented cleanly with the minimal API. Each capability is an independent increment with an evidence trigger, explicit exclusions, and acceptance checks.

## Anti-Patterns

- Rebuilding a general workflow framework around one command.
- One agent with unrelated responsibilities and a large tool set.
- Model-controlled routing when a deterministic condition exists.
- Silent fallback from a failed typed stage to an older unvalidated path.
- Unbounded correction loops.
- Persistent state without a restart or human-wait requirement.
- Adding parallelism without independent steps and measured latency pressure.

## Validation

1. Focused unit tests for input validation, output validation, correction, cancellation, and disposal.
2. Focused tests for deterministic policy after validated output.
3. Pi extension typecheck.
4. The exact user-facing command in an isolated repository or equivalent safe fixture.
