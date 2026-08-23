# Menos knowledge compiler research

Status: Decision document
Research date: 2026-08-23
Scope: Pi-first knowledge compilation for separated work, workflow, hobby, and shared memory

## 1. Decision summary

Menos should be a provenance-first compiler, not a transcript archive and not a single mutable summary.

The durable model is:

1. Immutable, bounded source observations.
2. Scoped claims extracted from those observations.
3. Versioned syntheses derived from claims and prior syntheses.
4. Explicit corrections, contradictions, and supersession links.
5. Disposable retrieval indexes rebuilt from durable records.

The first release should be a manually invoked, reusable batch pipeline. It should preview proposed changes before committing them. Retrieval should begin as explicit search. Shadow previews may follow, but automatic prompt injection is deferred until retrieval, privacy, provenance, and failure tests pass.

The persona scopes are `work`, `workflow`, `hobby`, and `shared`; personal memory is the umbrella for non-work scopes, not a fifth persona. Persona routing uses explicit selection, then a repository registry, repository marker, path rule, repository remote and metadata, and finally model suggestion with user confirmation when confidence is not high. Machine identity is provenance, not persona evidence. Work-memory model calls use an OpenAI allowlist and a dedicated approved model after its exact identifier and retention policy are confirmed.

The primary local gap is not another vector index. Pi has useful repo-aware feature memory and bounded session-export contracts, but it lacks an end-to-end session capture path, persona policy, claim-level conflict handling, provider policy, review workflow, and validated retrieval surface for Menos.

## 2. Evidence status

This document uses three statuses:

- Verified: stated by the current official/public source or observed in checked-in local artifacts.
- Unresolved: not established by the sources available here; no design dependency should rely on it.
- Recommendation: a Menos design decision derived from the evidence and settled user decisions.

The following current official sources are treated as verified for the capabilities listed below. These are not claims that every implementation detail or hosted-service policy has been verified.

### Verified official product sources

- OpenClaw official memory documentation describes Markdown source files, daily logs, `MEMORY.md`, SQLite hybrid search, memory flush, and optional LanceDB, wiki, and dreaming features. Source: https://docs.openclaw.ai/concepts/memory
- Hermes official memory documentation describes bounded `MEMORY.md` and `USER.md`, frozen session-start injection, automatic writes with optional write approval, SQLite FTS5 session search, and external providers. Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/
- OpenBrain official repository describes Supabase/Postgres with pgvector, MCP cross-client access, Slack capture, auto-capture, provenance chains, wiki compilation and synthesis, imports, and recipes. Source: https://github.com/NateBJones-Projects/OB1
- Letta official documentation distinguishes in-context memory blocks from searchable archival memory. Source: https://docs.letta.com/
- Mem0 official documentation describes semantic, BM25, and entity signals and warns against storing secrets or PII. Source: https://docs.mem0.ai/

### Unresolved product sources

Hindsight and Zep remain unresolved. Their current storage, temporal semantics, provenance, correction behavior, privacy policy, provider boundary, retrieval behavior, and benchmarks require direct verification. Do not use descriptions of those systems as established facts.

- Hindsight: https://github.com/vectorize-io/hindsight
- Zep: https://github.com/getzep/zep and https://help.getzep.com/

Other official repository or service details not listed as verified above should be checked before becoming PRD facts.

## 3. Settled product decisions

These decisions were made in the 2026-08-23 user discussion that requested this research. They supersede conflicting assumptions in the older `.specs/menos-knowledge-compiler/plan.md`, including Claude-first capture, its Python/SurrealDB architecture, destructive-looking compression assumptions, fixed automatic scheduling, and fixed retention defaults. The old plan remains historical input until it is replaced after the PRD.

### Scope and ownership

- Support `work`, `workflow`, `hobby`, and `shared` personas, with personal memory as the umbrella for non-work scopes.
- Keep persona scopes separated by default; `shared` always requires explicit user confirmation.
- Build for Pi first.
- Reference existing machine-aware Pi session logs rather than inventing a second transcript source.
- Capture only bounded, redacted excerpts from session logs.
- Include explicit truncation and source metadata.

### Knowledge lifecycle

- Preserve immutable provenance chains.
- Treat syntheses as versioned, non-destructive derived artifacts.
- Capture broadly, with repository, path, category, and session opt-outs.
- Start with a manual batch operation implemented as a reusable pipeline.
- Never overwrite raw observations when producing a summary, correction, or generalization.

### Persona routing

Use this order:

1. Explicit session persona.
2. Repository registry.
3. Repository marker.
4. Repository or filesystem path rule.
5. Repository remote and metadata.
6. Model classification followed by user confirmation when confidence is not high.

Machine identity is recorded for provenance but does not classify persona.

A direct user claim may be treated as confirmed only when the user made it directly and its persona and scope are explicit. Confirmation never removes the original source or timestamp.

### Trust and generalization

- Permit bounded automatic trust only for explicitly defined low-risk cases.
- Use deterministic policy plus model-assisted proposals for cross-project generalization.
- Keep repository-specific observations scoped unless a separate broader artifact is approved.
- Never let a generalized artifact overwrite or obscure scoped sources.

### Retrieval and feedback

- Begin with explicit search.
- Add shadow previews before automatic injection.
- Treat swearing and "WTF" as friction signals, not corrections or truth evidence.
- Use deterministic detection and policy gates, model-assisted proposals, and user review for consequential or ambiguous cases.

### Staleness and providers

- Detect stale knowledge using repository, session, and age signals.
- Permit an optional external retrieval shadow experiment.
- Do not make an external provider authoritative or part of the initial availability path.
- Apply deterministic redaction first.
- Apply model-assisted redaction only after deterministic processing and under active provider policy.
- Work-memory model calls use an OpenAI allowlist.
- Use a dedicated work-memory model, likely a Luna-class model, after the exact identifier and retention policy are confirmed.
- Deny sensitive categories by default.
- Provide an explicit review command and optional notification when reviewable changes are ready.

## 4. Comparison of memory systems

`V` means verified capability in the evidence above or local artifacts. `U` means unresolved. `P` means supported by research literature, not necessarily current product behavior.

| System | Capture and identity | Source and provenance | Compression/versioning | Trust and conflicts | Retrieval/privacy | Failure and evaluation |
| --- | --- | --- | --- | --- | --- | --- |
| Pi feature memory | V: repo-aware JSONL records, agent and source locations | V: source metadata; no append-only chain | V: disposable versioned index | Supersession exists; full conflict model U | V: bounded local retrieval; explicit user surface U | Focused tests V; Menos workflow U |
| Pi sessions | V: machine-aware session source and bounded export contract | Bounded source references V; automatic Menos capture U | U | U | Export excludes hidden reasoning and images; redaction pipeline U | Export is explicit; retrieval U |
| Onclave | V: session-derived agent and machine identity | V: message, trace, audit, and protocol metadata | Protocol versioning V; knowledge synthesis U | Untrusted framing and transition checks V | Audit secret-field rejection V; memory policy U | Messaging tests/patterns V; durable memory U |
| OpenBrain / OB1 | V: Slack capture, imports, auto-capture, and cross-client MCP access | V: provenance chains | V: wiki compilation and synthesis | Detailed policy remains to be tested | Supabase/Postgres/pgvector and MCP V; complete privacy policy U | Recipes provide workflows; independent Menos evaluation U |
| OpenClaw | V: Markdown files, daily logs, and `MEMORY.md` | File sources V; complete claim chain U | SQLite hybrid search V; optional LanceDB/wiki/dreaming V | Trust and correction semantics U | Search capability V; provider and isolation details U | Memory flush is V; failure behavior and benchmark U |
| Hermes | V: bounded files, automatic writes, optional approval, session search | Source chain and machine policy U | Frozen session-start injection V; versioning U | Trust and contradiction handling U | SQLite FTS5 and external providers V; provider policy details U | Write approval is V; failure/evaluation U |
| Letta | V: in-context blocks and searchable archival memory are distinct | Current source-chain behavior U | Context/archive separation V; versioning U | U | Archival search distinction V; current privacy U | Product evaluation U |
| Mem0 | V: semantic, BM25, and entity signals; secret/PII warning | Complete source provenance U | Merge/update/version behavior U | Contradiction behavior U | Hybrid signals V; privacy warning V | Current benchmark interpretation U |
| Hindsight | U | U | U | U | U | U |
| Zep | U | U | U | U | U | U |
| Generative Agents | P: event memory and reflections | P: observations and derived reflections | P: periodic reflection | Relevance, recency, importance; correction U | Research architecture | Simulation evaluation, not Menos production evidence |
| W3C PROV | Not a capture system | V: derivation and attribution vocabulary | V: derivation representation | Does not define truth | Does not define provider policy | Not a retrieval system |

### Comparison conclusions

1. File-based systems make source review and portability practical, but need an explicit provenance and version model.
2. SQL and vector systems improve search, but an index must remain a projection rather than the source of truth.
3. In-context memory and archival memory should be separate, as Letta documents and as the Menos scope requires.
4. Automatic writes and frozen injection, as described by Hermes, are useful comparison points but should not set Menos defaults.
5. OpenBrain's provenance and cross-client design is relevant to reusable architecture, but Menos still needs local policy, bounded capture, and independent evaluation.
6. OpenClaw's optional compilation features are evidence that search, wiki, and dreaming are separate layers, not reasons to make synthesis destructive.
7. Mem0's retrieval signals are candidates for ranking experiments, not a trust model.
8. Hindsight and Zep cannot support design conclusions until directly verified.

## 5. Current local capability and gap

### Pi feature memory: available

Checked-in local artifacts include:

- `pi/extensions/feature-memory.ts`
- `pi/lib/feature-memory-store.ts`
- `pi/lib/memory-index.ts`
- `pi/lib/memory-retrieve.ts`
- `pi/lib/memory-promote.ts`
- `pi/lib/memory-snapshot-archive.ts`
- `pi/docs/expertise-layering.md`
- `pi/skills/pi-extension/references/contracts/feature-memory.md`
- `pi/skills/pi-extension/references/contracts/session-export.md`

The local implementation provides JSONL source records with source locations, timestamps, agent identity, repository identity, and stable identifiers. Index metadata includes schema, embedding model, model hash, dimensions, dtype, chunker, and embedder versions. Index rebuild from JSONL is possible. Retrieval combines local hashed-vector similarity with lexical overlap, is repository-scoped by default, and filters superseded records. Focused retrieval, privacy, promotion, and archive tests exist.

### Pi feature memory: missing for Menos

- JSONL is mutable local storage, not a cryptographically append-only record.
- There is no complete claim-level contradiction state.
- `superseded_by` is not an unresolved conflict model.
- No verified session-to-Menos capture path exists.
- Persona, provider, consent, and retention metadata are incomplete.
- Automatic trust and cross-project generalization are not the requested policy.
- Retrieval is not yet a complete explicit search, preview, or injection workflow.
- Skipped malformed rows and rebuilt indexes need operator-visible reporting.

### Pi session evidence

The session-export contract permits bounded summaries and excludes hidden reasoning, images, and prior recap payloads. Lifecycle surfaces include session start, agent end, and shutdown. This is a suitable source boundary, but it does not prove automatic vault capture.

A Menos source reference should include machine identity, Pi client and version, session identifier, repository and revision, event range, provider and model identifiers, capture and observation timestamps, bounded redacted excerpt, truncation and redaction metadata, and a content hash.

### Onclave patterns

Onclave supplies useful patterns for identity, audit redaction, untrusted framing, message IDs, trace metadata, deduplication, restart-safe delivery, and terminal-state validation. It does not provide the Menos knowledge compiler or a unified chain from session excerpt through correction and retrieval.

Relevant local paths include `modules/onclave/extensions/onclave-pi/src/` and its audit, framing, policy, and implementation-plan files. RFC 9421 is relevant to message signatures: https://datatracker.ietf.org/doc/rfc9421/

### Gap statement

The current local system can store and retrieve some repo-scoped feature records. It cannot yet reliably answer: what was observed, by which machine and persona, under which provider policy, what was derived from it, whether it is current or contradicted, what may be shared across projects, and why a result was shown. That is the Menos boundary.

## 6. Recommended architecture

### Durable layers

1. Source observations: bounded excerpts and source locators, immutable after commit.
2. Claims: scoped statements extracted from observations, each linked to one or more sources.
3. Syntheses: versioned summaries or generalized concepts linked to source claims.
4. Relations: correction, contradiction, supersession, derivation, confirmation, and scope links.
5. Batch reports: input, output, skipped, denied, failed, and policy decisions.
6. Indexes: disposable lexical, vector, entity, or graph projections.

No summary or index replaces the source layer.

### Processing stages

1. Select eligible sessions or feature records.
2. Enforce repository, session, path, category, and explicit opt-outs.
3. Resolve persona using the settled precedence order.
4. Create bounded source references.
5. Run deterministic redaction and sensitive-category denial.
6. Apply allowlisted model redaction only when policy permits.
7. Extract candidate observations and claims.
8. Detect duplicates, corrections, conflicts, stale records, and generalization candidates.
9. Render a review preview.
10. Commit approved immutable records and versioned syntheses.
11. Rebuild or update disposable indexes.
12. Run evaluation and write a batch report.

The same record semantics should support future event-driven capture without making event-driven capture part of the first release.

### Retrieval boundary

The first interface should accept query text, persona, repository, optional time boundary, result type, and bounded result count. Each result should expose source preview, trust, staleness, contradiction, confirmation, and whether it is an observation or synthesis.

Retrieved text must be framed as untrusted context. No automatic injection is allowed in the initial path. Shadow previews may record candidate injections without changing model context.

### Availability boundary

Normal Pi operation should continue if Menos retrieval is unavailable. This is fail-open for assistance, not silent failure:

- Capture, parse, and retrieval failures are visible.
- Reports distinguish skipped, denied, failed, and committed items.
- Records are not marked committed before durable validation.
- Privacy, persona, provider, and redaction checks fail closed.
- Unsafe or unresolved content is excluded from injection.
- Index failure cannot corrupt durable records.

## 7. Versioned provenance model

### Record types

- `source_observation`: immutable bounded source representation.
- `claim`: scoped proposition derived from observations.
- `synthesis`: versioned derived explanation or generalization.
- `correction`: event linking new evidence to affected records.
- `conflict`: explicit unresolved or resolved incompatibility.
- `batch_report`: processing and policy audit artifact.
- `index_manifest`: disposable projection metadata.

### Required fields

Every durable record should have:

- Stable record ID and record type.
- Persona and scope.
- `observed_at` and `captured_at`.
- `valid_from`, `valid_to`, and `last_confirmed_at` when applicable.
- Source locator and canonical source hash.
- Machine, client, session, repository, and revision identity where applicable.
- Parent and source record IDs.
- Derivation, correction, contradiction, and supersession relations.
- Compiler, policy, provider, model, and prompt versions for derived records.
- Redaction and truncation status.
- Confirmation and trust state.

Use W3C PROV as vocabulary for entities, activities, agents, derivation, and attribution: https://www.w3.org/TR/prov-o/ and https://www.w3.org/TR/prov-dm/

### Immutability and deletion

A correction creates a new event and points to the affected record. It does not rewrite the observation. A synthesis is superseded by a new synthesis. Indexes can be rebuilt from the durable records.

The PRD must decide whether cryptographic chaining is required initially and how deletion requests coexist with provenance. At minimum, deletion must remove content from active retrieval and reports must avoid reproducing denied values.

## 8. Trust, scope, and contradiction rules

Relevance, trust, freshness, and scope are separate dimensions. A high similarity score cannot make a record trusted.

### Scope rules

- Explicit persona beats inferred persona.
- Repository registry, markers, paths, remotes, and metadata beat model classification; machine identity is provenance only.
- Repository observations stay repository-scoped by default.
- Shared or global artifacts require a separate derivation.
- Time-specific disagreement is not automatically a contradiction.
- Unconfirmed syntheses are labeled and may be excluded from default retrieval.

### Independent state dimensions

Trust, lifecycle or conflict, freshness, and scope are stored separately.

Trust uses at least:

- `unconfirmed`
- `confirmed`
- `trusted_low_risk`

Lifecycle and conflict use at least:

- `active`
- `unresolved`
- `contradicted`
- `superseded`
- `refuted`

Freshness uses at least:

- `current`
- `possibly_stale`
- `stale`

Scope records persona, repository or project, subject, applicable conditions, time range, and project-specific or cross-project applicability. Ranking may use these fields but never erases source history. Age may lower ranking or trigger review; it must not silently delete an observation.

### Contradiction handling

Detect incompatible values, time overlap, scope mismatch, explicit correction language, and insufficient evidence deterministically where possible. Use a model to propose explanations, not to silently resolve consequential conflicts.

Automatic resolution is limited to bounded low-risk rules. User review is required for persona changes, sensitive data, broad generalization, ambiguous conflicts, and corrections that alter durable policy.

Swearing and "WTF" create review candidates and a friction score. They are not factual evidence.

## 9. Privacy and provider policy

Deterministic secret filtering precedes any model call. Sensitive categories are denied by default:

- Credentials, tokens, keys, and authentication material.
- `.env` values, private keys, and certificates.
- Regulated personal information.
- Health, financial, legal, or employment-sensitive material.
- Restricted customer or employer data.
- Hidden reasoning.
- Explicitly private or opted-out content.

Review commands and notifications may identify a denied category but must not reproduce its value.

For work memory, only allowlisted OpenAI models may receive content. Record exact provider and model identifiers on derived artifacts. Confirm retention, training, region, logging, and maximum-content policies before activation. Do not silently fall back to an unapproved provider. If the approved provider is unavailable, keep deterministic stages and mark model-dependent stages pending.

Mem0's official warning against secrets and PII reinforces this boundary: https://docs.mem0.ai/

## 10. Manual-first reusable pipeline

### Input

Accept selected Pi sessions or feature-memory records, with persona, repository, time, path, category, and opt-out filters. Use existing session references rather than creating a second transcript authority.

### Preview

The preview must show proposed records, source references, persona, scope, redaction status, derivation type, conflicts, generalization requests, and provider use. It must show why an item was denied without exposing denied content.

### Commit

Commit only approved records after validation. Idempotency keys must prevent duplicate source observations on rerun. Partial batches must report each item as committed, skipped, denied, failed, or pending.

### Index

Build lexical and vector indexes from durable records. Store schema, embedding model, model hash, dimensions, chunker, and embedder versions in the manifest. Rebuild rather than mutating source records when an index is missing or incompatible.

### Review

Provide an explicit review command for pending conflicts, proposed syntheses, stale items, denied categories, and shadow previews. Notifications are optional and must be safe for the machine and persona context.

## 11. Evaluation plan

Retrieval repair remains a prerequisite. The existing baseline reports blank titles, irrelevant results, weak score discrimination, and approximately 22-second search latency in `.specs/menos-knowledge-compiler/eval-baseline-pre.md`.

Evaluate independently:

- Retrieval relevance and source recall.
- Source and citation accuracy.
- Persona and repository isolation.
- Temporal "as of" correctness.
- Contradiction and correction accuracy.
- Multi-hop composition.
- Stale-result rate.
- Unsupported-synthesis rate.
- Redaction precision and leakage.
- Mutation and idempotency correctness.
- Preview usefulness and review burden.
- Injection safety.
- Failure visibility.
- Latency and index rebuild behavior.

Use `.specs/menos-knowledge-compiler/eval-queries.yaml` as the starting query set. Retain Jaccard@5, Jaccard@10, top-1 score delta, and Kendall tau where applicable, then add source accuracy, contradiction-state accuracy, stale-result rate, and latency.

A correct answer does not prove that the durable mutation was correct. These are separate release gates.

## 12. Testable hypotheses

1. Immutable observations plus syntheses reduce correction errors versus summary-only memory.
2. Source, scope, and derivation labels reduce acceptance of mis-scoped results.
3. Explicit, registry, and path routing reduces personal/work leakage versus model-only classification.
4. Explicit search plus shadow previews exposes privacy and retrieval defects before injection.
5. Separate observation, capture, and valid times reduce stale answers.
6. Preserved unresolved conflicts reduce false corrections versus last-write-wins.
7. Separate relevance and trust reduce retrieval of weak but highly similar syntheses.
8. Hybrid generalization improves recall without unrestricted global leakage.
9. Deterministic then allowlisted model redaction reduces leakage versus model-only redaction.
10. Friction signals find review candidates, but treating them as correction evidence creates false positives.
11. Manual reusable batches expose policy defects with less recovery risk than automatic capture.
12. External retrieval shadows can expose ranking gaps without creating authority or availability dependency.
13. Answer quality and mutation correctness correlate weakly enough to need separate gates.
14. Bounded source-linked excerpts preserve correction context with less exposure than full transcripts.

## 13. Experiments

### 13.1 Capture and provenance fidelity

Run the batch over personal and work sessions containing direct claims, tool results, corrections, and ambiguity. Verify machine, session, repository, excerpt, source hash, persona, and scope. Pass only with no orphaned records or persona leaks.

### 13.2 Persona routing

Compare model-only classification with explicit, registry, path, then model-with-confirmation routing. Measure personal-to-work leakage, work-to-personal leakage, confirmation rate, and unresolved assignments.

### 13.3 Non-destructive correction

Test changed preferences, tool migrations, repository-specific conventions, retractions, and disagreeing sources. Compare last-write-wins with immutable observations and correction relations. Measure temporal accuracy, source recovery, and false global updates.

### 13.4 Retrieval discrimination

Add persona, repository, provenance, temporal, contradiction, multi-hop, and stale-content queries to the existing evaluation set. Measure relevance, source accuracy, conflict-state accuracy, stale rate, and latency.

### 13.5 Explicit search usability

Show source, trust, staleness, and contradiction labels. Measure selected-result rate, source expansion, rejection reasons, reformulations, and incorrect-scope results.

### 13.6 Shadow preview

Run non-injecting previews at selected session boundaries. Record usefulness, redundancy with current context, staleness, scope errors, answer impact, and estimated context cost. Do not enable automatic injection until thresholds are met.

### 13.7 Friction signals

Review candidates after swearing or "WTF". Classify retrieval failure, stale memory, incorrect synthesis, unrelated tool failure, frustration, or ambiguity. Measure precision and review burden.

### 13.8 Redaction

Use synthetic sensitive and benign lookalikes. Compare deterministic-only, model-only, and deterministic-then-allowlisted-model redaction. Measure sensitive recall, false positives, source-link preservation, policy violations, and review burden.

### 13.9 Cross-project generalization

Compare no promotion, deterministic rules, model-only promotion, and hybrid proposal plus confirmation. Measure recall, leakage, unsupported generalization, contradiction rate, and correction effort.

### 13.10 External shadow

Send only approved redacted fixtures to a selected external system. Compare local and external retrieval quality and latency. Keep external results non-authoritative and unable to mutate local memory.

## 14. Anti-patterns

- Replacing observations with summaries.
- Treating reflections as confirmed facts.
- Last-write-wins correction.
- Embeddings without recoverable source records.
- One unscoped index for personal and work data.
- Model classification overriding explicit routing rules.
- Model redaction before deterministic filtering.
- Unapproved provider fallback.
- Relevance score treated as trust.
- Repository behavior promoted globally without a derivation.
- Stale observations deleted instead of ranked lower or superseded.
- Automatic injection before explicit search and shadow evaluation.
- Swearing treated as factual proof.
- Hidden capture, parse, or index failures.
- External service on the initial availability path.
- Answer correctness as the only evaluation metric.
- Easy single-fact benchmarks only.
- Full transcripts when bounded excerpts suffice.
- Denied sensitive values in logs or notifications.
- Generated summaries used as the only durable source.

## 15. PRD decisions still required

### Schema

- Required IDs and timestamp fields.
- Exact observation, claim, synthesis, correction, and conflict schemas.
- Canonicalization and hashing rules.
- Stable source locators after archive or repository movement.
- Whether cryptographic chaining is first-release scope.
- Semantics of confirmed, trusted, unresolved, stale, contradicted, and superseded.
- Manual retention and deletion controls for the initial release. The older plan's automatic 365-day session-log retention and indefinite concept retention are superseded; automated retention remains deferred until observed volume creates a concrete need.

### Persona and privacy

- Shared-memory review, retrieval, and revocation mechanics within the settled four-persona model.
- Registry format and ownership.
- Overlapping path-rule precedence.
- Classification confidence requiring confirmation.
- Sensitive-category taxonomy.
- Safe notification contents on shared machines.
- Encryption at rest for bounded excerpts.
- Authority to change work-provider policy.

### Trust and conflicts

- Low-risk cases eligible for automatic trust.
- Trust inputs and precedence.
- Whether trust decays with age.
- Automatically resolvable conflict patterns.
- Corrections requiring direct confirmation.
- Ranking of scope-specific and time-specific disagreement.
- Default retrieval eligibility of unconfirmed syntheses.

### Pipeline and retrieval

- Manual command syntax and selection rules.
- Preview and commit boundary.
- Idempotency and rerun behavior.
- Partial-batch and report semantics.
- Index update and rebuild policy.
- Review command and notification workflow.
- Query API, filters, ranking weights, and result limits.
- Source explanation and untrusted-context framing.
- Shadow triggers and automatic-injection thresholds.

### Provider and release gates

- Exact OpenAI allowlist and Luna-class model identifier.
- Retention, logging, training, region, and content limits.
- Behavior when the provider is unavailable.
- Personal-memory provider policy.
- Rebuild or supersession behavior after provider/model changes.
- Thresholds for persona leakage, sensitive leakage, provenance recovery, contradiction and correction accuracy, stale rate, source accuracy, unsupported synthesis, idempotency, failure visibility, latency, preview usefulness, and review burden.

## 16. Sources

### Official product sources

- OpenClaw memory: https://docs.openclaw.ai/concepts/memory
- Hermes memory: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/
- OpenBrain / OB1: https://github.com/NateBJones-Projects/OB1
- Letta documentation: https://docs.letta.com/
- Mem0 documentation: https://docs.mem0.ai/
- Hindsight, unresolved: https://github.com/vectorize-io/hindsight
- Zep, unresolved: https://github.com/getzep/zep and https://help.getzep.com/

### Local evidence

- `pi/extensions/feature-memory.ts`
- `pi/lib/feature-memory-store.ts`
- `pi/lib/memory-index.ts`
- `pi/lib/memory-retrieve.ts`
- `pi/lib/memory-promote.ts`
- `pi/lib/memory-snapshot-archive.ts`
- `pi/skills/pi-extension/references/contracts/feature-memory.md`
- `pi/skills/pi-extension/references/contracts/session-export.md`
- `pi/tests/memory-retrieve.test.ts`
- `pi/tests/memory-promote-scan.test.ts`
- `pi/tests/memory-promote-scan.privacy.test.ts`
- `modules/onclave/extensions/onclave-pi/src/`
- `.specs/menos-knowledge-compiler/eval-queries.yaml`
- `.specs/menos-knowledge-compiler/eval-baseline-pre.md`

### Research and standards

- Generative Agents: https://arxiv.org/abs/2304.03442
- Reflexion: https://arxiv.org/abs/2303.11366
- MemGPT: https://arxiv.org/abs/2310.08560
- W3C PROV-O: https://www.w3.org/TR/prov-o/
- W3C PROV-DM: https://www.w3.org/TR/prov-dm/
- FEVER: https://aclanthology.org/N18-1074/
- BEIR: https://arxiv.org/abs/2104.08663
- Self-RAG: https://arxiv.org/abs/2310.11511
- Corrective RAG: https://arxiv.org/abs/2401.15884
- TimeQA: https://arxiv.org/abs/2106.09168
- CRAG: https://arxiv.org/abs/2406.04744
- RAGBench: https://arxiv.org/abs/2407.11005
- RFC 9421: https://datatracker.ietf.org/doc/rfc9421/
