---
status: ready
slug: onclave-a2a-message-refactor
---

# Onclave A2A Message Refactor

## Objective

Replace Onclave's custom performative, polling, and delegation-grant protocol with a small A2A 1.0-derived message and immutable task model for communication between independent Pi instances, while retaining Onclave-owned durable RabbitMQ delivery, presence, trust policy, budgets, and Pi turn handling.

## Completion Evidence

- Evidence: The shared contract represents messages, contexts, immutable tasks, task status events, and the agreed task states; the Pi adapter exposes only `onclave_instances` and `onclave_message`; `ask`, asynchronous `request`, and non-triggering `inform` follow their defined behavior; task updates return durably to the originating instance without polling; mixed protocol versions fail explicitly; and focused unit plus broker integration tests prove reconnect, continuation, terminal immutability, policy, and budget behavior.
- Fails when: Onclave still exposes agent/worker or delegation-grant semantics, a model must manage acknowledgements or callbacks, `inform` can trigger a turn, terminal tasks can reopen, follow-up work cannot reuse a context, transport acknowledgement is confused with task acceptance, peer messages inherit operator authority, events are lost across a tested disconnect, the tool schema depends on provider-specific root unions, or the refactor blocks future authenticated webhook event ingress for Pi and Hermes adapters.

## Boundaries

- The domain contains independent Onclave instances, messages, contexts, tasks, task status events, and adapters. Pi-local subagents are outside Onclave and are never described as Onclave workers.
- Adopt only the high-value A2A 1.0 subset: `Message`, `Task`, `contextId`, `taskId`, task status events, and the states `submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`, and `rejected`. Defer `auth-required` until Onclave has an executable cross-instance authentication workflow.
- `submitted` is application-level acceptance for tracking. RabbitMQ acknowledgements remain transport-only. The model does not acknowledge, subscribe, register callbacks, poll, grant authority, or select capability labels.
- Terminal tasks are immutable. Input replies may continue an `input-required` nonterminal task. Refinement after a terminal state creates a new task in the same context and may explicitly reference the prior task.
- `ask` sends a turn-triggering message and waits until a direct response or an interrupted/terminal task result, bounded by `timeout_ms`; timeout does not cancel a created task. `request` publishes asynchronously and returns its message and context identifiers; the receiver later creates the task and emits `submitted` with the receiver-created task ID. `inform` is point-to-point or broadcast, creates no task, expects no response, and cannot trigger a turn.
- The model-facing `onclave_message` schema uses one required `type` enum and a flat provider-portable object with deterministic conditional validation. It does not rely on root-level `oneOf` support.
- Existing cross-host confirmation, provenance framing, deduplication, hop and exchange limits, advisory token budgets, audit redaction, offline delivery, and adapter-independent core ownership remain enforced. A peer request is untrusted peer input and does not inherit operator authority.
- Onclave's private registry remains the source for `onclave_instances`; do not add public Agent Card discovery, skills, artifacts, multimodal parts, SSE, gRPC, webhook callbacks, task search, or a complete A2A server in this change.
- Preserve a future authenticated webhook-ingress seam: external sources can later submit idempotent events that server-side policy classifies as `inform` or `request` for Pi or Hermes adapters. Do not implement webhook ingress in this plan.
- No live deployment, broker cutover, infrastructure change, dotfiles loader change, or `pi/AGENTS.md` change is included. Keep the Onclave checkout on `origin/feature/v2-broker-core`.

## Tasks

- [ ] **T1: Replace the shared envelope and core conversation contract with the bounded A2A model**
  - Files: `packages/envelope/src/`, `packages/envelope/tests/`, `services/core/src/conversations.ts`, `services/core/src/rpc.ts`, `services/core/src/agent-delivery.ts`, `services/core/src/dead-letter.ts`, `services/core/src/service.ts`, core configuration/audit modules, and focused core tests.
  - Change: Define strict versioned `Message`, `Task`, `TaskStatus`, and status-event contracts with message, context, task, origin, destination, timestamps, hop/TTL, usage, schema, and trace fields required by retained behavior. Replace performatives, reply correlation, and delegation grants with deterministic task transitions and origin event routing. Map `ask` to wait-for-result behavior; make `request` return after durable publication, then require the receiving adapter to create a task and emit `submitted`; and keep `inform` outside the task lifecycle. Persist contexts, tasks, status, budget counters, and origin routing needed for restart-safe delivery in a new versioned state boundary that does not overwrite the legacy conversation store; make duplicate messages and repeated terminal events idempotent; reject illegal transitions, continuation of terminal tasks, and incompatible protocol versions. Remove unused delegation/action/scope contracts rather than preserving fallback paths. Reserve a versioned internal event classification seam for later authenticated webhook ingress without adding an endpoint.
  - Done when: The core can create and resume contexts, create tracked tasks, interrupt and resume nonterminal tasks, reject terminal continuation, create follow-up tasks in an existing context, route status events to the origin, enforce budgets and trust boundaries, and recover persisted nonterminal state after restart; legacy protocol peers fail with an explicit version mismatch and legacy state remains untouched because live cutover is out of scope.
  - Verify: Run focused envelope, AMQP mapping, task-state, conversation persistence, RPC, delivery, dead-letter, budget, audit, deduplication, incompatible-version, and restart tests. Use a table-driven transition test covering every allowed and rejected state edge, plus an executable broker slice proving duplicate-safe status delivery, origin routing, disconnect/reconnect retention, timeout without cancellation, and no dirty terminal resurrection.

- [ ] **T2: Collapse the Pi adapter to instance discovery and one message tool**
  - Depends on: T1.
  - Files: `extensions/onclave-pi/src/onclave-pi.ts`, `extensions/onclave-pi/src/lib/`, `extensions/onclave-pi/tests/`, and parsed tool-schema fixtures.
  - Change: Rename `onclave_agents` to parameterless `onclave_instances` returning live registered Pi instances and evidence-backed status only. Replace `onclave_send`, `onclave_delegate`, `onclave_inform`, `onclave_get`, and `onclave_await` with `onclave_message` using `type: ask | request | inform`, `to`, `body`, and only the applicable optional `context_id`, `task_id`, and `timeout_ms`. Enforce conditional arguments in code with actionable errors. Automatically correlate Pi runs to inbound messages, emit task transitions and replies, deliver origin events without model polling, and trigger caller turns only for input-required or terminal outcomes. Preserve display-only inform delivery and cross-host confirmation. Remove delegation framing and use provenance framing that consistently names independent instances and peer authority limits.
  - Done when: Only the two agreed tools are registered; summaries and prompt guidance explain when each message type applies and that Onclave connects independent instances rather than subagents; ask waits once, request returns after durable publication without claiming receiver acceptance, inform never starts a turn, callbacks require no model action, interrupted tasks accept explicit continuation, terminal follow-ups create new tasks in the same context, and invalid field combinations fail without publishing.
  - Verify: Run parsed-schema and adapter tests for all message types, absent and invalid fields, direct and broadcast inform, ask direct response, ask timeout with later event delivery, asynchronous request lifecycle, input-required continuation, terminal refinement, duplicate events, unmatched Pi runs, remote confirmation accept/decline, budgets, reconnect, and malformed input. Add a focused model-tool fixture or deterministic schema example for each `type`; do not claim semantic model selection from schema validation alone.

- [ ] **T3: Align documentation and prove the integrated protocol boundary**
  - Depends on: T1 and T2.
  - Files: `README.md`, `docs/extensions/onclave-pi/PRD.md`, `docs/extensions/onclave-pi/implementation-plan.md`, `docs/extensions/onclave-pi/status.md`, focused operator/development guidance, and broker integration tests.
  - Change: Document the bounded context, A2A-derived subset, task lifecycle, message-type behavior, transport-versus-application acknowledgement, authority boundary, protocol-version break, and removal of the six legacy tools. State that MCP remains tool/context integration, A2A semantics govern independent-instance communication, and Pi subagents remain local. Record authenticated webhook ingress for external events and future Hermes consumption as an evolution trigger, not delivered functionality. Update examples and status claims to match executable behavior.
  - Done when: Documentation and active tool prompts use `instance`, `message`, `context`, and `task` consistently; no active surface advertises grants, action arrays, scope, polling, stale-instance parameters, or Onclave workers; maintainers can trace the protocol break and future webhook-ingress seam; and the complete local core-plus-adapter workflow satisfies the Completion Evidence without a live deployment.
  - Verify: Run `just check` and `just test-integration` from `modules/onclave/`, plus package-script equivalents required by repository policy. Exercise two disposable registered Pi adapter harnesses through the broker for ask, request, inform, interruption/resumption, terminal refinement, budget termination, incompatible-version rejection, and reconnect delivery. Manually inspect the registered tool schemas, protocol documentation, and active terminology; run `git diff --check` in the Onclave repository.

## Validation

- [ ] Focused shared-contract, state-machine, persistence, core, adapter, and schema tests pass.
- [ ] Broker integration proves durable origin events, reconnect delivery, idempotence, budgets, and all three message types.
- [ ] `just check`, `just test-integration`, package-script equivalents, and `git diff --check` pass in `modules/onclave/`.
- [ ] Active tools and documentation contain only the agreed bounded context and explicitly retain the future authenticated webhook-ingress evolution seam.

## Retention

Keep incomplete work at `.specs/onclave-a2a-message-refactor/plan.md`. After every task and validation item passes, `/do-it` archives the entire directory to `.specs/archive/onclave-a2a-message-refactor/`.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: `/do-it .specs/onclave-a2a-message-refactor/plan.md`
