---
created: 2026-09-15
status: ready
completed: null
---

# Build simple asynchronous Onclave channels

## Goal and scope

Replace the current point-to-point `ask` / `request` / `inform` interface with one asynchronous channel-message system for communication among one or more independent Pi instances.

User requirements and settled decisions:

- A channel behaves like an SMS thread. Instances post messages and receive later messages as they arrive. No outbound tool call waits for another instance.
- Messages have semantic kinds:
  - `request`: a response is expected from named recipients;
  - `response`: answers a request;
  - `note`: information only, with no response expected.
- A request sent to one instance expects that instance to respond. A request sent to several instances defaults to satisfaction by `any` one of them; the sender specifies `all` only when every recipient must respond.
- Responses and notes are ordinary channel messages using the same durable asynchronous delivery path.
- The common model interface must be simple. For new outbound communication, the model normally supplies `kind`, `to`, and `body`. For a response during an active inbound request turn, the model supplies only `body`; the adapter infers response kind, channel, destination, and original message.
- The runtime creates or reuses an open channel for the exact participant set, resolves aliases to full instance IDs, and generates channel/message IDs, origin, timestamps, sequence, and broker routing metadata.
- A request to an instance triggers its Pi turn. Responses and notes notify their recipients without automatically triggering another model turn. This keeps delivery visible without creating response loops.
- Remove hidden automatic publication of arbitrary assistant final text. Network publication occurs only through the explicit channel-message path. This prevents accidental replies and response loops.
- Request satisfaction is objective channel state, not a task outcome or operator approval. Existing task primitives remain separate and are not redesigned by this work.
- Preserve full session IDs as routing identities, short aliases for operator/model use, existing authentication, untrusted-peer framing, durable offline delivery, deduplication, delivery leases, and audit redaction.

Non-goals:

- Separate note inbox or mailbox protocol.
- Model-facing channel creation, participant administration, unread cursors, cancellation workflows, deadlines, history-management tools, or synchronous waits.
- General task-system redesign, MCP/Hermes adapters, public discovery, exactly-once claims, live deployment, or broker cutover.
- Compatibility with protocol version 1. Core and adapters change together at one explicit protocol boundary.

Authorization: planning only. Implementation, push, and deployment are not authorized by this plan request.

## Fresh-context handoff

All paths are relative to the dotfiles repository root. Read `AGENTS.md` and `modules/onclave/AGENTS.md` before acting.

- Coordinating repository: dotfiles owns this plan, the thin `pi/extensions/onclave-pi.ts` loader, and the Onclave gitlink.
- Owning implementation repository: `modules/onclave/` owns shared contracts, core service, RabbitMQ mapping, Pi adapter, tests, and product documentation. Make implementation commits there first, then update the parent gitlink separately.
- Required reading:
  - `modules/onclave/docs/extensions/onclave-pi/PRD.md`
  - `modules/onclave/docs/extensions/onclave-pi/implementation-plan.md`
  - `modules/onclave/docs/extensions/onclave-pi/status.md`
  - `modules/onclave/packages/envelope/src/a2a.ts`
  - `modules/onclave/packages/envelope/src/amqp.ts`
  - `modules/onclave/packages/envelope/src/protocol.ts`
  - `modules/onclave/services/core/src/rpc.ts`
  - `modules/onclave/services/core/src/agent-delivery.ts`
  - `modules/onclave/services/core/src/task-store.ts`
  - `modules/onclave/extensions/onclave-pi/src/onclave-pi.ts`
  - `modules/onclave/extensions/onclave-pi/src/lib/delivery.ts`
  - `modules/onclave/extensions/onclave-pi/src/lib/correlation.ts`
  - `modules/onclave/extensions/onclave-pi/src/lib/framing.ts`
- Verified starting behavior in the Onclave module at `a8fadb5`:
  - protocol version 1 uses point-to-point `ask`, `request`, and `inform` messages coupled to optional task IDs;
  - `ask` waits, `request` returns after publication, and `inform` is inert;
  - the receiving adapter silently converts settled assistant output into an outbound `inform` and task status;
  - RabbitMQ routes directly to durable `agent.<instance-id>` queues;
  - the adapter exposes `onclave_instances` and a flat `onclave_message` tool;
  - full session IDs provide routing identity and short aliases resolve locally.
- Motivation evidence: an agent handling an inbound ask manually called the outbound tool with an invalid `inform` plus task ID because the inbound framing, flat conditional schema, and hidden automatic reply path did not make the intended lifecycle clear.
- Work to preserve: stable full IDs and aliases from `a8fadb5`, vault integration, registration/liveness, authentication, provenance framing, delivery leases, offline queues, bounded deduplication, and audit behavior.
- Worktree and integration target: create a dedicated Onclave worktree from `modules/onclave/` branch `feature/v2-broker-core`, proposed branch `task/asynchronous-channel-messaging`; record actual values before editing. Keep this coordinating plan in the dotfiles checkout.
- Planning profile: default Pi profile on 2026-09-15. Intended execution profile: default. No live broker, multi-instance, attached-UI, or model-adherence behavior was tested while planning.

## Decisions and implementation contract

### Shared channel contract

Introduce a new incompatible protocol version with one channel-message envelope:

```ts
type ChannelMessage = {
  protocol_version: number;
  channel_id: string;
  message_id: string;
  sequence: number;
  kind: "request" | "response" | "note";
  origin: A2AOrigin;
  participants: string[];
  body: string;
  sent_at: string;
  response_requested_from?: string[];
  response_policy?: "any" | "all";
  in_reply_to?: string;
  usage?: A2AUsage;
  schema?: string;
};
```

Rules:

- Full registered instance IDs are used on the wire. Short aliases resolve before posting.
- The core creates or reuses an open channel for the exact normalized participant set. A caller may pass a returned `channel_id` to continue that channel, but ordinary direct/group sends do not require one.
- A `request` resolves `response_requested_from` from `to`. One recipient defaults to `all`; several recipients default to `any`. An explicit `response_policy` overrides only the multi-recipient default.
- A `response` requires a valid request relationship. During the active inbound request turn, the adapter infers `channel_id`, `in_reply_to`, destination, and `kind: response`; the model supplies only `body`. Outside that context, explicit correlation fields may be accepted as an advanced path but must not burden ordinary tool guidance.
- A `note` carries no response expectation or response policy.
- A named responder counts once toward satisfaction. Under `any`, the first counted response satisfies the request. Under `all`, every named responder must answer. Additional or unexpected responses remain channel history but do not satisfy another participant's obligation.
- There is no default timeout, deadline, or cancellation workflow in this milestone.
- Channel sequence is monotonic and assigned by the core. RabbitMQ delivery remains at least once; consumers deduplicate by message ID and can identify gaps from sequence.

Persist only state needed for this contract:

- channel identity and normalized participants;
- next sequence;
- accepted messages needed for response linkage and bounded history/restart correctness;
- each request's expected responders, policy, responders received, and open/satisfied state.

Do not add unread cursors, user-managed membership, channel administration, or a separate inbox.

### Simple model-facing interface

Keep `onclave_instances` for peer discovery. Refactor `onclave_message` rather than adding a channel-management tool.

Ordinary new request:

```json
{
  "kind": "request",
  "to": ["pi-a"],
  "body": "Check the deployment status."
}
```

Ordinary group request, satisfied by any responder by default:

```json
{
  "kind": "request",
  "to": ["pi-a", "pi-b"],
  "body": "Can either of you identify the failure?"
}
```

Request requiring every recipient:

```json
{
  "kind": "request",
  "to": ["pi-a", "pi-b"],
  "response_policy": "all",
  "body": "Each instance should report its validation result."
}
```

Ordinary note:

```json
{
  "kind": "note",
  "to": ["pi-a"],
  "body": "Deployment completed."
}
```

Response during an active inbound request turn:

```json
{
  "body": "Deployment is healthy."
}
```

Defaults and inference:

- `body` is always required.
- `kind` and `to` are required for new outbound communication.
- In an active inbound request turn, omitted `kind`, `to`, channel, and reply IDs mean “respond to this request.”
- `response_policy` is optional and normally omitted.
- Models never supply sender identity, origin metadata, message ID, timestamp, sequence, task ID, trace ID, or RabbitMQ routing details.
- Tool descriptions and inbound framing must state these defaults directly. Invalid combinations fail before publication with an error naming the valid ordinary form.

### Actor and RabbitMQ mapping

- Each Pi instance remains an actor with durable mailbox queue `agent.<full-instance-id>`.
- A channel is a logical core aggregate, not a model-managed object and not a dedicated process or RabbitMQ exchange.
- Posts go through a core operation that authenticates the sender, resolves/validates participants, serializes mutation by channel, assigns sequence, persists message and response state, and fans out one event per participant through the existing direct agent exchange.
- Do not create per-channel exchanges or dynamic participant queue bindings. Application-owned fan-out keeps authorization and offline delivery with existing agent mailboxes.
- Persist before acknowledging the post. Do not claim exactly-once delivery.

### Pi activation and response behavior

- A request triggers turns only for instances named in `response_requested_from`. Other channel participants receive display/notification only.
- A response notifies the original requester without automatically triggering a model turn or network response.
- A note is display-only and never triggers a turn.
- Inbound request framing says objectively that a response is expected from this instance and gives the default response tool form (`body` only).
- Inbound response framing identifies the answered request and current `any`/`all` satisfaction state.
- Inbound note framing says no response is expected.
- Remove synchronous waiters and hidden `agent_settled` publication. Explicit `onclave_message` execution is the only model-originated channel send.

## Execution guidance

Create or resume the recorded dedicated worktree for the `modules/onclave/` repository and branch. Record its actual path, branch, and originating integration target before editing. Preserve unrelated work. Keep this plan in the dotfiles checkout; do not copy it into the module worktree as a second canonical plan.

Implement one coordinated incompatible boundary across envelope, core, adapter, tests, and documentation. Do not deploy mixed versions. Adapt routine code organization to repository patterns, but do not add channel management, inbox state, deadlines, new storage infrastructure, compatibility translation, or task redesign.

Continue independent tasks around blockers. Ask only if repository evidence forces a consequential change to the settled message semantics, defaults, activation behavior, persistence ownership, or acceptance. Keep checkbox evidence and blockers accurate. Stop when finite checks pass and task-related defects established by those checks are fixed.

## Tasks

- [ ] **T1: Define the minimal asynchronous channel contract**
  - Depends on: none.
  - Files/inputs: `modules/onclave/packages/envelope/src/a2a.ts`, `modules/onclave/packages/envelope/src/amqp.ts`, `modules/onclave/packages/envelope/src/protocol.ts`, package tests.
  - Change: replace point-to-point message types with protocol-versioned channel messages, semantic kinds, participant sets, request defaults, response linkage, satisfaction state, and core operations needed to post and retrieve delivery events. Keep task types separately compilable but remove task IDs from channel messages.
  - Verify: focused envelope/protocol/AMQP tests for direct and group requests, one/all defaults, notes, responses, invalid combinations, alias-resolved full IDs at the adapter boundary, and protocol mismatch.
  - Done when: the shared package expresses the settled contract without synchronous waits, model-supplied transport metadata, or channel-management requirements.
  - If blocked: ask only if preserving the independent task contract requires a broader product decision.
  - Evidence: Not started.

- [ ] **T2: Implement the channel aggregate and RabbitMQ fan-out**
  - Depends on: T1.
  - Files/inputs: proposed `modules/onclave/services/core/src/channel-store.ts`, `modules/onclave/services/core/src/rpc.ts`, `modules/onclave/services/core/src/service.ts`, `modules/onclave/services/core/src/agent-delivery.ts`, existing state/store patterns, core tests.
  - Change: atomically create/reuse channels by exact participant set, serialize posts, assign sequence, persist bounded message/request state, compute `any`/`all` satisfaction, authenticate participants, and fan out to existing durable agent queues. Preserve delivery leases, dead-letter handling, offline delivery, and idempotency.
  - Verify: focused tests for direct/group reuse, concurrent ordering, duplicate posts, one/all satisfaction, unexpected/duplicate responders, restart restoration, unauthorized posting, offline fan-out, and redelivery.
  - Done when: participants receive canonical channel events through their existing mailboxes and the core persists only state required by the settled contract.
  - If blocked: use the existing atomic state abstraction; do not introduce a new database or broker topology without approval.
  - Evidence: Not started.

- [ ] **T3: Refactor the Pi adapter to one intuitive message tool**
  - Depends on: T1, T2.
  - Files/inputs: `modules/onclave/extensions/onclave-pi/src/onclave-pi.ts`, `modules/onclave/extensions/onclave-pi/src/lib/delivery.ts`, and sibling `correlation.ts`, `framing.ts`, `http-client.ts`; adapter tests.
  - Change: keep `onclave_instances`; refactor `onclave_message` to the ordinary forms above; infer active-request responses from session-owned inbound context; resolve aliases; remove synchronous waits and automatic settled-run publication; apply request/response/note activation behavior and objective framing.
  - Verify: focused tests prove minimal parameters, one/all defaults, active response inference, explicit advanced correlation only when outside active context, notes and responses notifying without triggering model turns, no automatic publication on `agent_settled`, reload/session ownership, aliases, and invalid-call diagnostics.
  - Done when: ordinary requests/notes require only `kind`, `to`, and `body`, ordinary responses require only `body`, and no hidden network send occurs.
  - If blocked: preserve explicit sending and simple defaults; ask before adding another model-facing tool or required parameter.
  - Evidence: Not started.

- [ ] **T4: Remove obsolete communication coupling and align documentation**
  - Depends on: T1-T3.
  - Files/inputs: old wait/correlation/run-summary paths, task-status communication coupling, `modules/onclave/docs/extensions/onclave-pi/{PRD,implementation-plan,status}.md`, `modules/onclave/README.md`, tests.
  - Change: remove code used only for `ask` waits, automatic `inform` replies, and automatic task creation/completion from peer messages. Preserve independently useful task APIs. Rewrite product documentation around async channels, semantic kinds, defaults, actor/RabbitMQ mapping, authority, and the explicit protocol break.
  - Verify: repository search finds retired `ask`/legacy `request`/`inform` communication assumptions only in clearly historical material; independent task tests still pass; documentation matches exported names and tool schemas.
  - Done when: the active implementation and documentation expose one coherent channel model without broad task redesign.
  - If blocked: identify exact independently consumed task coupling and ask before deleting or redesigning it.
  - Evidence: Not started.

- [ ] **T5: Run bounded acceptance and integrate**
  - Depends on: T1-T4.
  - Files/inputs: `modules/onclave/package.json`, `modules/onclave/justfile`, changed packages and tests.
  - Change: from the Onclave repository/worktree root, run focused checks during implementation, then `just check`; run `just test-integration` when its existing documented RabbitMQ prerequisites are available. Inspect the effective local Pi tool catalog without deploying services.
  - Verify: `just check`; applicable integration command and exact result; `git diff --check`; final diff and status limited to task-owned changes.
  - Done when: checks pass, limits are recorded, the Onclave implementation branch is merged into its recorded originating branch, and the dotfiles checkout records the updated gitlink plus archived coordinating plan under the closeout contract.
  - If blocked: retain the worktree and report the exact prerequisite, next action, and owner. Push and deployment remain unauthorized.
  - Evidence: Not started.

## Agreed validation and current handoff

Finite agent-owned acceptance:

- Shared-contract tests prove `request`, `response`, and `note`, one/many defaults, explicit `all`, response linkage, invalid combinations, and protocol mismatch.
- Core tests prove channel reuse, serialization, persisted sequence/response state, restart restoration, idempotency, authenticated participant fan-out, offline delivery, and request satisfaction.
- Adapter tests prove ordinary parameter defaults, active response inference, explicit publication, objective framing, request/response/note activation, alias resolution, and absence of hidden final-answer publication.
- Existing registration, identity, authentication, delivery lease, deduplication, dead-letter, audit, vault, and independent task checks remain passing where affected.
- `just check` passes. Broker-backed integration runs only with its existing documented prerequisites; unavailable infrastructure is recorded as a verification limit rather than replaced with new workflow.
- Live deployment and attached multi-instance operator testing are post-completion verification limits, not implementation closeout gates.

- Status: ready for implementation after separate execution authorization.
- Completed work and evidence: plan revised to remove channel administration, inbox/unread state, cancellation, deadlines, synchronous waits, hidden responses, and an unnecessary second model-facing tool.
- Next: create the dedicated Onclave task worktree, record actual path/branch, and execute T1 from the module repository root.
- Blockers/open decisions: none.
- Verification limits: no live RabbitMQ, multi-instance channel, attached Pi UI, or model-adherence run occurred during planning.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Commit the implementation in the Onclave task worktree. Unless explicitly disabled, merge that branch into its recorded `feature/v2-broker-core` checkout without stashing, discarding, or committing unrelated changes. Resolve routine merge conflicts within settled intent. If module integration is blocked, retain the worktree and report implementation/checks separately from pending delivery.

After the Onclave merge succeeds, return to the dotfiles checkout. Verify the parent now points at the intended Onclave commit. Confirm `.specs/archive/asynchronous-channel-messaging/` does not already contain another plan, move this entire coordinating spec directory there, set the archived plan's `status: completed` and `completed: YYYY-MM-DD`, and record module integration evidence. Commit the updated Onclave gitlink and archived plan together in dotfiles. Never include module files directly in the dotfiles commit.

Verify both repositories contain their intended commits and no active plan copy remains. Rerun affected checks only if conflict resolution changed checked content. Remove the Onclave task worktree only when module integration succeeded and it has no uncommitted or unmerged work. Push and deployment require explicit user authorization. Operator manual/live testing does not block closeout.

### Final response

Start with one overall outcome:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed but integration is blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes were committed under an explicit no-merge instruction.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on the target but worktree cleanup remains.

For blocked or cleanup-pending outcomes, immediately state **Reason** and **Action needed**, naming the owner and exact next action before successful checks. Then report concise checks, spec path, branch/commits, merge result, and retained worktree if any. Do not imply automatic resumption or declare completion before integration and cleanup are verified.
