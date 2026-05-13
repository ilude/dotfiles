---
created: 2026-05-13
status: draft
---

# PRD: Hermes Deploy

## Problem

We want a future-ready Hermes Agent deployment that can be installed, configured, secured, and validated without re-watching the source videos. The deploy should prove Hermes can operate as more than a chat CLI: an agent runtime with provider routing, gateway/webhooks, Kanban coordination, and cost-aware auxiliary models.

## Users / Jobs To Be Done

- Primary user: technical operator/developer deploying Hermes for personal or team automation.
- Job/story: "When I need agentic workflows later, I want a repeatable Hermes deploy path so I can run agents, trigger them from external systems, and monitor delegated work safely."
- Current workaround: ad hoc local install, manual config, and scattered video notes.

## Goals

1. Produce a repeatable Hermes install/configuration path for the chosen target environment.
2. Validate core runtime capabilities: CLI, provider/model access, gateway, webhooks, and Kanban/task coordination.
3. Document secure defaults for secrets, dashboard exposure, webhook authentication, and model cost controls.

## Non-Goals

- Build every possible Hermes integration or messaging platform on day one.
- Replace a broad messaging gateway if the real requirement is maximum channel coverage.
- Commit `.env`, API keys, webhook secrets, local sessions, or generated runtime state.

## Requirements

### Functional Requirements

- Install Hermes on the target host.
  - macOS/Linux should run natively.
  - Windows should use WSL2 and run Hermes inside the Linux distro.
  - Capture dependencies such as Python, Git, Node.js/build tooling, and sudo requirements.
- Run full initial setup and document selected values:
  - primary provider/model,
  - fallback credentials/model behavior,
  - max tool calls,
  - tool progress visibility,
  - compression threshold,
  - reset behavior,
  - browser/search/image providers.
- Keep runtime config discoverable:
  - behavior/routes/models in Hermes config,
  - secrets in `.env`,
  - persistent memory/context in the intended memory files,
  - no manual edits to session internals.
- Start and validate the Hermes gateway.
- Configure at least one inbound webhook route:
  - enable webhooks,
  - set webhook port,
  - generate/store shared secret,
  - define route path and prompt/rendering behavior,
  - deliver result to a configured channel or local output.
- Configure at least one outbound webhook/job flow where Hermes posts JSON to an external endpoint using a shared secret.
- Validate Kanban/task-board workflow:
  - create task,
  - assign to named/specialized agent profile,
  - show worker activity,
  - mark blocked/retry/complete,
  - inspect result.
- Configure auxiliary models separately from the main chat model for high-frequency background work where appropriate:
  - compression,
  - web extraction/summarization,
  - vision/image analysis,
  - memory flushing,
  - skill/tool matching or dispatch,
  - approval/risk classification.

### Non-Functional Requirements

- Security:
  - `.env` and generated secrets must remain uncommitted and redacted from logs.
  - Webhook routes must validate a shared secret/signature.
  - Dashboard/Kanban must bind to localhost by default or have explicit auth/network controls before any public exposure.
- Reliability:
  - Gateway must be restartable and have clear health checks.
  - Inbound webhook production URLs must not depend on a rotating free tunnel.
- Cost control:
  - Avoid accidentally using frontier models for every auxiliary task.
  - Document model/provider choices and expected tradeoffs.
- Observability:
  - Capture doctor/health-check output, gateway status, webhook delivery status, and Kanban task state during validation.

## Acceptance Criteria

1. [ ] Fresh deploy completes on the selected target OS.
   - Verify: run the chosen install procedure from a clean environment or documented baseline.
   - Pass: Hermes executable/config directory is created and CLI opens successfully.
   - Fail: missing dependencies, unsupported platform path, or unclear manual steps.

2. [ ] Provider/model health checks pass.
   - Verify: run `hermes doctor` or equivalent provider/model validation.
   - Pass: primary provider/model and fallback behavior are validated.
   - Fail: invalid keys, unavailable model, or untested fallback.

3. [ ] Gateway starts and is operational.
   - Verify: start Hermes gateway and check logs/status/port.
   - Pass: gateway accepts local requests and remains running through a basic smoke test.
   - Fail: gateway crashes, port conflict unresolved, or no status signal.

4. [ ] Inbound webhook works end-to-end.
   - Verify: send a signed HTTP POST to the configured route.
   - Pass: Hermes receives event, renders prompt, runs agent, and emits expected response/delivery.
   - Fail: unsigned requests accepted, signed requests rejected, or no visible agent result.

5. [ ] Outbound webhook/job works end-to-end.
   - Verify: trigger Hermes to POST JSON to a test endpoint with shared secret.
   - Pass: endpoint receives expected payload and returns successful HTTP status.
   - Fail: missing auth, malformed payload, or no retry/error handling notes.

6. [ ] Kanban workflow is demonstrably usable.
   - Verify: create/assign/retry/complete at least one task through the dashboard/task board.
   - Pass: named worker/profile activity and task state transitions are visible.
   - Fail: task state unclear, worker cannot pick up tasks, or dashboard is insecurely exposed.

7. [ ] Auxiliary model policy is documented and applied.
   - Verify: inspect config for main model vs auxiliary task model assignments.
   - Pass: expensive models are reserved for high-value work; cheaper/local/multimodal models are assigned where appropriate.
   - Fail: all auxiliary tasks inherit the frontier model without an explicit cost decision.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Hermes-only deployment | Best fit for agent runtime, provider flexibility, Kanban, and autonomous execution | May not cover every messaging channel as well as a dedicated gateway | Preferred initial scope |
| OpenClaw or similar messaging gateway | Stronger broad channel/gateway orientation | Less focused on Hermes-style agent runtime/work coordination | Consider only if channel coverage is the primary requirement |
| Hybrid gateway + Hermes execution | Broad messaging plus Hermes as execution backend | More moving parts, more auth/routing failure modes | Future option if channel needs exceed Hermes-native integrations |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Secrets committed or logged | Credential compromise | Keep `.env` gitignored, redact outputs, use secret scan before commits |
| Webhook tunnel/gateway downtime | External automations silently fail | Use stable production URL, monitor gateway, document restart path |
| Dashboard binds publicly | Unauthorized operational control | Default to localhost; require auth/reverse proxy/firewall for remote access |
| Auxiliary models inherit expensive main model | Unexpected API spend | Explicit auxiliary model config and cost review |
| Channel mismatch | Deploy solves wrong problem | Decide early whether this is agent-runtime-first or messaging-gateway-first |
| Fast Hermes release cadence changes setup | Stale docs or broken commands | Pin tested version and record release notes/date during implementation |

## Open Questions

- What target environment should be used first: local WSL2, Linux server, macOS, or container/VPS?
- Which provider/model stack should be primary and fallback: OpenRouter, Anthropic, OpenAI, Bedrock, LM Studio/local, or other?
- Which first inbound webhook use case matters most: GitHub PR review, Stripe/Sentry alert, newsletter/subscriber event, or custom app event?
- Which notification/output channel should receive webhook results?
- Should Kanban be local-only for experiments or remotely accessible for team use?
- What budget ceiling should guide auxiliary model routing?

## Source Video Notes

- `R3YOGfTBcQg`: intro/install/setup, WSL2 note, provider/API key setup, config files, `hermes doctor`.
- `WNYe5mD4fY8`: webhook receiver/sender workflows, `WEBHOOK_ENABLE`, port/secret, ngrok/local tunneling, real-world event examples.
- `R_aLVXYzDac`: Kanban dashboard/task-board workflow with named agents and hands-on coordination.
- `8beheGoYTHM`: v0.11/v0.12 direction: interface, providers/transports, plugins, dashboards, background workers, Kanban; dashboard exposure concern.
- `NoF-YajElIM`: auxiliary model classes and cost optimization.
- `lBOGkDrKi1E`: release roadmap/features from v0.9-v0.12, gateway/provider expansion, health checks.
- `zwqhemjHq3E`: Hermes vs OpenClaw positioning; Hermes is agent-runtime-first, OpenClaw is gateway/channel-first.

## Plan Handoff

- Recommended next command:
  ```bash
  /plan-it .specs/hermes-deploy/PRD.md
  ```
- Review command:
  ```bash
  /review-it .specs/hermes-deploy/PRD.md
  ```
- Notes for planner:
  - Start by selecting target host, provider stack, first webhook use case, and dashboard exposure model.
  - Treat video-derived details as implementation hints to verify against current Hermes docs/releases before execution.
