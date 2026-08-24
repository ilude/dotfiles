---
status: research-note
source: https://blog.modelcontextprotocol.io/posts/2026-07-28
---

# MCP 2026 stateless protocol

## Why this matters

The MCP `2026-07-28` specification replaces the required handshake and hidden
protocol session with self-describing requests. It also adds request-visible
method identity, stateless multi-round interactions, cache hints, stricter OAuth
requirements, extension negotiation, and a formal deprecation lifecycle. These
changes make remote MCP easier to operate with ordinary HTTP infrastructure,
but they do not make MCP necessary when a small CLI or direct API is sufficient.

## Sources

- [Official MCP 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28)
- [Cloudflare MCP v2 overview](https://blog.cloudflare.com/mcp-v2/)
- [MCP transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [MCP versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [Multi Round-Trip Requests](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)
- [MCP caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

## Useful signals

### Request-scoped protocol state

Modern MCP removes the required `initialize` / `initialized` exchange,
`Mcp-Session-Id`, and protocol sessions. Each request declares its protocol
version, client identity, and capabilities. Optional `server/discover` lets a
client inspect supported versions and capabilities before another request.

Application state is still allowed, but it should use an explicit handle that a
client passes back rather than transport state hidden behind a connection. A
server can support modern and legacy clients concurrently while migrations run.

### Multi-round interaction without an open stream

Multi Round-Trip Requests let a server return `input_required`, describe the
input it needs, and optionally include opaque `requestState`. The client gathers
input and retries the original operation as a new request. No server instance or
load balancer needs to retain a protocol session between calls.

Returned `requestState` is attacker-controlled. If it affects authorization,
resource access, or business behavior, the server must protect its integrity and
should bind it to the principal, original method and parameters, and a short
expiry. A client must echo it unchanged and must not interpret it.

This pattern fits explicit operator decisions better than an unsolicited message
or a stream kept open only to await approval:

```text
request -> input required -> operator decision -> explicit retry -> completion
```

### Deterministic gateway identity

Streamable HTTP requests carry `MCP-Protocol-Version`, `Mcp-Method`, and
`Mcp-Name`. Gateways can route, meter, rate-limit, and make first-stage policy
decisions from stable headers without parsing arbitrary JSON. Header admission
does not replace argument-level authorization, content inspection, or tool-side
safety checks.

### Cacheable catalogs and resources

Complete results from discovery, list, and resource-read operations carry
`ttlMs` and `cacheScope`. Deterministic ordering can reduce catalog churn and
help clients preserve stable upstream prompt prefixes.

Important limits from the caching specification:

- cache keys include the method and relevant parameters;
- `input_required` results and MRTR retries are not cacheable;
- TTL is a freshness hint, not a polling schedule;
- `private` results remain caller-specific;
- `public` results may be reused across authorization contexts;
- cache scope does not replace primitive-level access control.

### Current authorization baseline

For protected HTTP servers, the current specification prefers pre-registered
clients or Client ID Metadata Documents. Dynamic Client Registration is
retained for compatibility but deprecated. Implementations must use protected
resource metadata and authorization-server discovery, send the canonical MCP
server URI as the RFC 8707 `resource`, validate token audience, and validate RFC
9207 issuer identity before redeeming authorization codes. Bearer tokens must
not appear in query strings.

### Core and extensions have separate lifecycles

Tasks, Apps, and Enterprise-Managed Authorization live in the extensions
framework rather than the protocol core. Roots, Sampling, Logging, Dynamic
Client Registration, and legacy HTTP+SSE are deprecated with a minimum
12-month removal window. New integrations should not adopt deprecated features,
and compatibility behavior should be explicit rather than inferred.

## Possible Pi fit

- Keep Pi-native tools and direct application APIs when no cross-client MCP
  interoperability requirement exists.
- If a remote MCP adapter becomes necessary, target `2026-07-28` or later and
  keep domain state in the owning service.
- Model operator approval as an explicit input-required response and retry, not
  as implicit authorization from an inbound notification.
- Expose method and tool identity to deterministic policy, metrics, and rate
  limits while retaining argument-level checks.
- Measure whether catalog ordering and caching actually reduce context or
  latency in the selected client before claiming a prompt-cache benefit.
- Keep durable tasks and goals in their owning Pi domain unless the MCP Tasks
  extension solves a demonstrated interoperability problem.

Current Pi and Onclave integration uses Pi-native tools and direct application
contracts rather than an MCP client/server boundary. There is no migration to
perform from this source alone.

## Research questions

1. At what number of clients does MCP provide enough interoperability benefit to
   replace direct CLI or HTTP adapters?
2. Which policy decisions can safely use `Mcp-Method` and `Mcp-Name`, and which
   require argument, identity, or resource inspection?
3. How should permissions react when a cached tool catalog changes?
4. Does deterministic catalog rendering improve provider prompt-cache reuse in
   a real client?
5. Which user decisions fit MRTR, and which need a durable task or external
   workflow instead?
6. How should a dual-era server bound the legacy compatibility window?

## Risks / reasons not to build yet

- MCP adds SDK, protocol-version, authorization, and compatibility maintenance.
- Stateless transport does not make stateful application operations idempotent
  or safe to retry.
- Header-visible tool identity can create false confidence if arguments and
  caller-specific authorization are not checked.
- Incorrect public cache scope can expose user-specific catalogs or resources.
- Opaque request state can become an authorization or replay vulnerability.
- Adopting optional extensions can recreate the complexity removed from core.

## KISS recommendation

Preserve the current protocol contract as research. Use direct tools and APIs
until a repeated cross-client integration need appears. If MCP is selected,
start with one stateless, read-only tool, current authorization requirements,
header-level telemetry, argument-level policy, and no deprecated features.

## Related notes

- [Agent-friendly platforms](../patterns/agent-friendly-platforms.md)
- [Pi damage-control gap analysis](pi-damage-control-gap-analysis.md)
- [X research pipeline](../workflow-ideas/x-research-pipeline.md)
- [Pipelines and policies](../workflow-ideas/pipelines-and-policies.md)
- [Cloudflare and Astro issue triage](cloudflare-astro-issue-triage.md)
