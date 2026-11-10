---
status: research-note
source: https://x.com/theo/status/2110269416315429179
updated: 2026-11-10
---

# ClickHouse for centralized Pi session analytics

## Why this matters

Pi already saves native session JSONL locally and archives it through Onclave.
What is missing is centralized structured search and analytics across archived
sessions and machines. ClickHouse could supply that query layer without replacing
native persistence or the lossless archive.

This note preserves research from November 9 and subsequent coordination and user
decisions through November 10, 2026. It is not an implementation plan, deployment
authorization, or evidence that ClickHouse is installed. No performance, sizing,
cost, or complete historical-backfill result was established in this research.

## Useful signals

### Theo's public discussion

Theo (t3.gg) has discussed this specific use case:

- **October 14, 2026:** [Claude and Codex requests in ClickHouse][theo-requests].
  “I collected all of my requests to Claude and Codex and put them in a clickhouse
  db. The data is so fun to play with.”
- **October 14:** [tool-choice analysis][theo-tools]. His follow-up describes
  models increasingly executing Python rather than Bash or other tools.
- **October 25:** [private analytics projects][theo-projects]. He describes
  **Slophouse** as his personal analytics pipeline/platform for T3 Code usage and
  **Fleethouse** as an internal ClickHouse receiving data from his CLI proxy.
  These are distinct projects; the post does not establish that their schemas
  or implementations are identical.
- **November 7:** [agent-assisted investigation][theo-investigation]. He asks an
  agent to investigate changes using his CLI-proxy logs in ClickHouse.

Public search found these posts; their text was retrieved through FxTwitter's
public JSON mirror because direct X extraction was login-limited. These are
extracted post-text observations, not rendered screenshots or a review of their
attached charts. No detailed public schema, ingestion implementation, or
architecture walkthrough was found in the bounded research. Theo explicitly
calls the projects private. His setup is evidence of use, not a design we can
claim to have reproduced.

**Request logs and session logs differ.** A proxy can observe actual requests,
routing, retries, and wire timings that session history may not contain. Native
Pi sessions record conversation and tool history. Our proposed first scope uses
existing files; introducing a model proxy is not required or approved.

### ClickHouse capabilities and constraints

- [JSON columns][ch-json] support dynamic fields and path-level queries. Use typed
  columns for frequently queried fields and JSON selectively for variable custom
  entries. JSON storage is not byte-preserving: the documentation discusses
  null/absence equivalence and path representation. Preserve original bytes in
  the archive rather than reconstructing evidence from analytical JSON.
- [Text indexes][ch-text] are generally available in **26.2 and newer**. They make
  centralized text search plausible, but tokenization and substring behavior
  matter for code, paths, and error messages. Do not silently equate token search
  with the current exact-literal search contract.
- [Insert guidance][ch-inserts] recommends batching rather than one INSERT per
  event. Acknowledged asynchronous inserts can batch server-side; with
  `async_insert=1, wait_for_async_insert=1`, acknowledgment follows successful
  flush. Retry deduplication depends on the selected engine, configuration,
  version, and deduplication window. It is not a substitute for event identity.
- [ReplacingMergeTree][ch-replacing] deduplicates by its sorting key during
  background merges, which do not guarantee immediate duplicate-free reads.
  Correct results may require `FINAL` or another explicit query-time model.
  Simply choosing this engine does not solve repeated snapshots or copied history.
- [OpenTelemetry collection][ch-otel] supports structured JSON file logs and
  batched export. A generic collector does not automatically understand Pi entry
  trees, archive revisions, or fork semantics. OTel may help future live
  instrumentation but is not required for archive indexing.
- [ClickStack][ch-clickstack] adds HyperDX search/dashboards and an OTel-oriented
  stack; its self-hosted deployment also uses MongoDB for application state.
  A dashboard is independent of the remote query API, not a first-slice requirement.
- [Self-hosting guidance][ch-sizing] documents tuning for small-memory systems.
  ClickHouse is another operated service, not a cost-free index. Its broad sizing
  recommendations are not a measurement or resource assignment for our corpus.

## Possible Pi fit

### Existing baseline inspected during research

The [Pi archive documentation][local-archive] describes these eligible inputs:

- Active default-profile `sessions/**/*.jsonl`, including saved subagent sessions,
  tool messages, custom entries, branching and compaction.
- Bedrock usage, Codex cache observations, Onclave audit, and Herdr naming logs.

The shared adapter has one elected uploader per machine/canonical profile, with
standby sessions able to take over. Background scans run while an orchestrator
is running, with about a minute between completed periodic scans. This is not a
standalone upload daemon. Local originals remain the working files and durable
pending-upload input.

Raw immutable snapshots use fixed 1 MiB content-addressed chunks, except the final
chunk, in object storage. PostgreSQL stores manifests and metadata. The research
observed a running uploader and successfully listed remote session manifests.
That establishes working access and some stored data, not complete backfill or
continuous coverage across all machines. Rotation before observation can still
lose diagnostics. Legacy, credentials, browser data, caches and coordination
files are excluded from archive inputs. Native session content itself is not
redacted and can contain private prompts, tool output and embedded images.

Local `log_analytics` remains a local-file search/DuckDB facility. The existing
remote archive tool provides manifest listing, paged bytes, and bounded search
within one snapshot, not remote SQL or exhaustive global search.

### Proposed application shape

```text
Pi native JSONL and existing logs
  -> existing Onclave archive uploader
  -> raw object-store chunks + PostgreSQL manifests
  -> new server-side parser/indexer
  -> ClickHouse
  -> authenticated Onclave query API/tool
```

Keep ClickHouse a rebuildable analytical projection. Index committed manifests
rather than adding a second workstation upload path or putting database requests
on Pi's turn loop. The archive chunks are arbitrary byte slices, not independent
JSONL documents; reconstruct the manifest stream and preserve record boundaries,
including incomplete final lines, before indexing.

Candidate logical datasets, not an approved schema:

- **Sessions:** project, profile, native session identity and observed lineage.
- **Entries:** event time, role/type, model/provider, extracted searchable text,
  native entry/parent IDs, custom data, and precise archive occurrence references.
- **Tool and usage facts:** correlated calls/results, recorded error flags,
  tokens/cache usage, and estimates or timings only where recorded evidence exists.

Keep binary/image payloads in the archive rather than the text index. Preserve
unknown or missing values; uploading must not invent origin machines, timestamps,
or session IDs for historical records that do not contain them.

An explicitly remote, bounded read-only tool should report typed structured
results plus plain readable content, selected scope, indexing freshness, coverage,
and exact manifest/byte references. It should work through the same Onclave Pi
adapter in standalone Pi, Herdr and T3 without T3 source changes. DuckDB SQL is
not automatically portable to ClickHouse; keep backend selection explicit.

### Counting and correlation are the central design problem

Each growing-file snapshot repeats earlier entries. Inserting every snapshot's
lines as new activity would inflate counts. A design must distinguish new appends,
unchanged entries, rewrites/truncations, and history copied into forks or branches.

An archive **occurrence** can be identified by manifest and entry coordinates.
A logical **activity** requires separately established identity across revisions
and copies. Native entry IDs are useful evidence but cannot be assumed present
or globally unique. Text hashes must not merge unrelated repeated activity.
Retain source/tree provenance and make the counting convention explicit.

The Pi/T3 session's advisory identified existing custom entries:
`t3-role-snapshot`, `t3-role-receipt`, `t3-role-outcome`, and `t3-role-question`.
These offer partial thread/launch/task/run joins. A retained T3 thread can have
multiple runs and native Pi sessions. Goal-run IDs are a separate namespace;
T3 execution status is distinct from a substantive role outcome. Composed calls
linked by `tool-invocation-provenance` are not automatically separate delegations.

General root-session T3 mapping, an explicit environment/server namespace, and
comprehensive per-run Pi mapping are missing. Complete joins would require
separately approved correlation events or supported enrichment. Do not infer
absent values or ingest private `.t3-roles` coordination files or endpoint tokens.
Basic native-session analytics does not depend on filling these gaps.

## User decisions and ownership

These decisions supersede earlier deployment alternatives discussed in the chat:

1. **Hatchery owns the first ClickHouse deployment.** Do not deploy through the
   old tooling first and migrate later. Live deployment waits for the needed
   Hatchery service capabilities. This does not select ClickHouse as the existing
   transition's pilot or authorize deployment.
2. **The Pi/T3 improvement session owns the logging/analytics application work.**
   That includes necessary implementation in the owning Onclave repository;
   it does not move Onclave application logic into dotfiles or T3.
3. **The Hatchery session owns deployment coordination and the destination service.**
   Keep generic capabilities in Hatchery and private topology, bindings and secrets
   in the site layer. The private site-composition repository remains undecided.
4. **Local operation must survive remote outages.** Native sessions keep saving,
   local analytics remains usable, and existing local pending-upload input is
   retained. Server indexing should catch up from retained archives. Remote
   queries must report unavailability instead of silently returning local-only
   results for a cross-machine scope.
5. **Pi uses the authenticated Onclave API, not a newly exposed database endpoint.**
   Preserve one default profile and standalone/Herdr behavior; no T3 patches,
   new proxy, OTel stack, dashboard, or change to local analytics is implied.

Repository responsibilities remain: Onclave owns analytical semantics,
parser/indexer, schema/migrations, API/client and adapter; dotfiles owns Pi runtime
integration with a thin Onclave loader; Hatchery owns deployment capabilities.
Homelab-infra is the current deployment/site owner during transition, not an
approved fallback deployment path for this service.

The handoff messages were delivered. Implementation, readiness and deployment
completion were not established by those messages. Coordinate shared deployment
roles/docs rather than allowing concurrent ownership of the same files.

## Risks / reasons not to build yet

- Correct snapshot/fork counting, replay/checkpoint behavior and analytical
  coverage must be settled before claiming accurate cross-session activity totals.
- No real-corpus ClickHouse benchmark, cost estimate, disk layout or resource
  envelope was produced. Query speed is a hypothesis, not a demonstrated fix for
  a local performance problem. Central access is the established missing feature.
- Retention, rebuildability, persistence and any necessary backups must follow
  the retained raw-data coverage. Archive data, ClickHouse data and Hatchery
  orchestration state are different domains. Reusing SeaweedFS for orchestration
  state does not decide ClickHouse storage.
- A stable service contract is needed: pinned artifacts, indexer lifetime, ports,
  logical config/secrets, schema lifecycle, readiness, outage behavior, persistent
  paths and UID/GID needs. Placement and BWS bindings are site decisions.
- Hatchery's durable deployment command/state/service workflow was reported as
  not yet implemented in the advisory. Application design can proceed independently,
  but production deployment is intentionally dependent on Hatchery readiness.
- Indexed content can expose private task material. Keep authentication and
  access scope aligned with the existing private archive; this note supplies no
  live endpoints, private inventory, or secrets.
- Recorded `isError` values are observations, not proof of product defects.
  Unknown timestamps/origin and incomplete T3 correlation must remain visible.

## KISS recommendation

Keep the raw archive and local analytics intact. Let the Pi/T3 session develop
one bounded Onclave-backed analytical projection and explicit remote interface,
while the Hatchery session supplies the destination through its service workflow.
Resolve counting semantics and the consumed service contract before live use.
Do not add a proxy, dashboard, collector stack, new correlation telemetry or old-
tooling fallback merely because ClickHouse supports them. This note preserves
research and user decisions, not permission to begin implementation or deploy.

## Sources and related notes

### External sources read

- [Theo: requests in ClickHouse][theo-requests], October 14, 2026.
- [Theo: Python versus Bash/tool usage][theo-tools], October 14, 2026.
- [Theo: Slophouse and Fleethouse][theo-projects], October 25, 2026.
- [Theo: investigation using ClickHouse logs][theo-investigation], November 7, 2026.
- [FxTwitter extraction example](https://api.fxtwitter.com/theo/status/2110269416315429179).
  Other posts used the same `/theo/status/<id>` API pattern. Third-party extraction
  of primary-source posts; no independent verification of Theo's internal system.
- [ClickHouse JSON type][ch-json].
- [ClickHouse full-text indexes][ch-text].
- [ClickHouse insert strategies][ch-inserts].
- [ReplacingMergeTree semantics][ch-replacing].
- [OpenTelemetry collection and integration][ch-otel].
- [ClickStack components and deployment][ch-clickstack].
- [Self-hosting resource recommendations][ch-sizing].
- [Official JavaScript client](https://clickhouse.com/docs/integrations/language-clients/js/index).
  Typed Node client is available; no dependency was installed for this research.

### Local evidence and related notes

- [Pi archive sources and behavior][local-archive].
- [Pi runtime documentation](../../../../../pi/README.md).
- [Archive uploader implementation](../../../../../modules/onclave/extensions/onclave-pi/src/lib/archive-uploader.ts).
- [Local analytics skill](../../../../../pi/profiles/default/skills/pi-log-analytics/SKILL.md).
- [Dated Onclave deployment ownership](onclave-deployment-ownership.md).
- [CLIProxyAPI account-hub research](cliproxyapi-account-hub.md).
- [Pi observability and timing](../patterns/pi-observability-timing.md).
- [Earlier DuckDB analytics idea](../workflow-ideas/duckdb-for-pi-usage-analytics.md).
- [Agent workflow research index](../index.md).

### Coordination provenance

- Research and user decisions:
  <t3-thread://v2/e50f5b6b-573d-4347-9769-334d19452b01/cdc244e8-2740-4ca2-98f6-adb7c3b61c10>
- Logging/application owner:
  <t3-thread://v2/e50f5b6b-573d-4347-9769-334d19452b01/49b654e1-5a02-423c-8546-0318e5e05da1>
- Hatchery/deployment owner:
  <t3-thread://v2/e50f5b6b-573d-4347-9769-334d19452b01/1cc3b634-797b-43bc-8cf4-ec0be01e252e>

[theo-requests]: https://x.com/theo/status/2110269416315429179
[theo-tools]: https://x.com/theo/status/2110269617365262649
[theo-projects]: https://x.com/theo/status/2114194770209947674
[theo-investigation]: https://x.com/theo/status/2119193502852755520
[ch-json]: https://clickhouse.com/docs/reference/data-types/newjson
[ch-text]: https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/textindexes
[ch-inserts]: https://clickhouse.com/docs/concepts/best-practices/selecting-an-insert-strategy
[ch-replacing]: https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/replacingmergetree
[ch-otel]: https://clickhouse.com/docs/guides/use-cases/observability/build-your-own/integrating-opentelemetry
[ch-clickstack]: https://clickhouse.com/docs/clickstack/overview
[ch-sizing]: https://clickhouse.com/docs/guides/oss/best-practices/tips
[local-archive]: ../../../../../modules/onclave/docs/pi-archive.md
