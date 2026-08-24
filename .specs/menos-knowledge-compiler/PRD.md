# PRD: Menos evolutionary memory

**Status:** Draft product contract
**Source of truth:** `research.md` and the settled decisions recorded there
**Scope:** Pi-first knowledge compilation for separated work, workflow, hobby, and shared memory

## Problem

Pi has machine-aware session sources and repo-scoped feature memory, but no end-to-end way to turn bounded session evidence into reviewable, provenance-linked knowledge. A mutable summary or one shared index would lose corrections, blur project boundaries, expose sensitive work data, and make stale or inferred claims appear authoritative.

Menos must compile useful memory without replacing source evidence. It must preserve what was observed, what was derived, why it is in scope, whether it is trusted or current, and how a user can correct or delete it.

`plan.md` is historical input, not authority. This PRD explicitly supersedes its Claude-first capture, Python/SurrealDB/menos implementation ownership, automatic APScheduler scheduling, 365-day automatic session retention, fixed retention defaults, automatic SessionStart injection, and destructive-looking summary/compression assumptions. The first product is Pi-first, manually invoked, preview-first, non-destructive, and reusable by later triggers.

## Goals

- Provide a Pi-first manual batch pipeline that can later be invoked by session-end or periodic triggers without changing record semantics.
- Capture all eligible sessions by default while supporting repository, path, category, session, and explicit content opt-outs.
- Preserve bounded, redacted, source-linked observations and immutable provenance.
- Derive scoped claims and versioned non-destructive syntheses, corrections, contradictions, and generalizations.
- Keep persona, trust, lifecycle/conflict, freshness, and scope independent.
- Make explicit search and shadow previews safe and explainable before any injection is considered.
- Keep normal Pi operation available when Menos, retrieval, or an approved model is unavailable.
- Establish measurable release gates from baselines and experiments rather than inventing unsupported quality thresholds.

## Non-Goals

- No automatic prompt injection in the first release.
- No transcript archive or second transcript authority; existing Pi session references remain authoritative.
- No automatic scheduling, session-end registration, or external retrieval authority in the first release.
- No automatic retention or deletion policy initially; retention and deletion are manual.
- No silent provider fallback, unapproved model use, or sensitive-category exception.
- No claim that inferred intent is confirmed truth.
- No destructive compression, summary replacement, last-write-wins correction, or index-as-source-of-truth design.
- No implementation choice for storage, schema serialization, command syntax, or deployment beyond the product contracts below.

## Defined terms and domain model

### Personas and scope

The only personas are `work`, `workflow`, `hobby`, and `shared`. Personal memory is the umbrella for non-work personas, not a fifth persona. Persona scope and knowledge scope are separate. Every durable record has persona, project/repository applicability, subject, conditions, and time range. Repository-specific evidence remains scoped unless a separate broader artifact is approved. `shared` always requires explicit confirmation.

### Durable record types

- **Source observation:** An immutable, bounded representation of an eligible session excerpt or existing feature record, with source locator and hash.
- **Deletion tombstone:** A non-content, auditable record containing only the record ID, deletion time, deletion category/reason, and affected record IDs. Manual deletion erases source content, excerpts, derived content that cannot stand without it, and index entries; indexes are rebuilt. Deleted text, hashes, and locators are unrecoverable. Manual retention supports listing, review, and deletion only; there is no automatic expiry.
- **Claim:** A scoped proposition derived from one or more observations, never a replacement for them.
- **Synthesis:** A versioned explanation, compression, or approved generalization derived from claims and earlier syntheses. A new version supersedes a prior version without overwriting it.
- **Correction:** A new event that points to affected records and explains the correction.
- **Conflict:** An explicit unresolved or resolved incompatibility between records.
- **Batch report:** The auditable result of selection, policy decisions, denials, failures, pending work, and commits.
- **Index manifest:** Metadata for a disposable retrieval projection; an index is never durable source truth.

### Identity and provenance

Each generated machine has a stable machine ID and a human-readable label. Machine identity is provenance only and never persona evidence. Existing session identifiers and references are retained. A source reference includes machine ID and label, Pi client/version, session ID, originating session provider and exact model when applicable, repository and revision when applicable, event range, capture and observation times, bounded excerpt, truncation and redaction metadata, and a canonical content hash. Extractor provider and exact model are recorded separately from originating session provider/model. Provenance follows OpenBrain-style source and derivation chains and may use W3C PROV vocabulary.

### Independent dimensions

- **`confirmation_state`:** `unconfirmed` or `confirmed`. A direct user claim with a clearly resolved persona and bounded scope transitions to `confirmed` when it does not conflict with existing evidence; the user does not have to state the routing metadata aloud. Inferred or model-produced content remains `unconfirmed` until later direct evidence or user confirmation.
- **`trust_state`:** `unrated` or `trusted_low_risk`. Only an explicitly documented low-risk rule can transition `unrated` to `trusted_low_risk`; confirmation does not imply trust.
- **Lifecycle/conflict:** `active`, `unresolved`, `contradicted`, `superseded`, or `refuted`. Corrections, contradiction decisions, and new synthesis versions create explicit transitions and linked records; they do not silently rewrite prior state.
- **Freshness:** `current`, `possibly_stale`, or `stale`.
- **Scope:** persona, repository/project, subject, conditions, time range, and local versus cross-project applicability.

Scope is established by policy and explicit approval, not ranking. Similarity, recency, or model confidence cannot silently change another dimension.

## Users and jobs

- **Operator:** runs a batch, reviews a preview, commits approved changes, searches, corrects claims, and deletes content.
- **Work user:** needs work knowledge isolated from hobby and unrelated personal content, with provider policy enforced.
- **Workflow user:** needs reusable process and tooling lessons across repositories without leaking employer/client detail.
- **Hobby user:** needs personal exploration isolated by default.

Their jobs are to recover source-backed decisions, answer an explicitly scoped query, identify stale or contradicted knowledge, approve safe generalization, and recover the full history behind any compressed or synthesized result.

## Functional requirements

| ID | Requirement | Direct verification |
| --- | --- | --- |
| FR-001 | Provide a trigger-neutral reusable batch pipeline with stable selection, policy, redaction, derivation, preview, commit, report, and index stages. Release one invokes it manually; session-end and periodic trigger invocation belongs only to future Stage 3. | Run two equivalent manual batches and compare stage records; verify the reusable contract has no trigger-specific data model or semantics. |
| FR-002 | Select all eligible sessions by default, using existing Pi session references, while honoring repository, path, category, session, and explicit opt-outs. | Run fixtures with no opt-out and each opt-out; verify only explicitly excluded inputs are absent and each exclusion is reported. |
| FR-003 | Assign a stable generated machine ID and label and preserve both on every applicable source reference and derived artifact. | Process the same machine twice and verify the ID is stable; change only the label and verify provenance retains the ID and new label history. |
| FR-004 | Store bounded excerpts, explicit truncation state, source metadata, existing session references, and canonical hashes. Hidden reasoning, images, and prior recap payloads are excluded. | Process an over-limit fixture; verify bounded output, truncation metadata, session reference, and reproducible hash; scan output for excluded content. |
| FR-005 | Make source observations immutable. Corrections, conflicts, and supersession create linked records rather than rewriting observations. | Attempt correction and rerun; verify original content/hash/timestamps remain and new relations are recoverable. |
| FR-006 | Extract claims with explicit persona, project, subject, time, provenance, confirmation state, trust state, lifecycle/conflict, freshness, scope, and derivation state. Confirmation and trust are independent and have explicit transitions. | Inspect a claim fixture and verify every dimension is independently queryable and source-linked; test direct confirmation, low-risk trust, and state-preserving correction transitions. |
| FR-007 | Produce versioned, non-destructive syntheses, including bounded active compression, while permitting complete recovery of all source and prior versions. | Create successive synthesis versions and a bounded compression; verify the active result is bounded and the complete version/source chain can be reconstructed. |
| FR-008 | Route personas in this exact precedence: explicit session persona; repository registry; repository marker; repository/path rule; repository remote and metadata; model suggestion. Model suggestions require user confirmation when confidence is not high. Machine identity is not a routing signal. | Conflicting fixtures must resolve to the first applicable deterministic signal; ambiguous model output remains pending until confirmation. |
| FR-009 | Confirm a direct user claim when its persona and bounded scope are clearly resolved and it does not conflict with existing evidence. The user need not state routing metadata aloud. Inferred intent remains unconfirmed. Confirmation never removes source or timestamp. | Compare direct, scoped, conflicting, ambiguous, and inferred fixtures; verify only a direct claim with resolved bounded scope and no conflict becomes confirmed and all originals remain. |
| FR-010 | Permit automatic trust only for explicitly defined low-risk cases; consequential, ambiguous, sensitive, persona-changing, and broad-generalization cases require review. | Run low-risk and consequential fixtures; verify only the documented low-risk case receives `trusted_low_risk`. |
| FR-011 | Keep repository observations local by default. Use deterministic policy plus model-assisted proposals for cross-project generalization and preserve all local sources. Recurring friction and workflow patterns may become confirmed cross-project artifacts after strong independent evidence under an approved low-risk rule. Goals, preferences, intent, ideas, architectural choices, and all promotion to `shared` require explicit approval before their scope broadens. | Test both classes: verify an approved low-risk recurring workflow or friction rule can confirm only after independent multi-repository evidence, while goals, preferences, intent, ideas, architecture, and `shared` promotion remain pending approval; rejection leaves local knowledge unchanged. |
| FR-012 | Begin with explicit scoped search accepting query, persona, repository, optional time boundary, result type, and bounded result count. Enforce persona and repository scope by partitioning or equivalent pre-query policy before candidate retrieval or ranking; absent or ambiguous scope defaults to deny. By default, retrieve only active, in-scope, non-deleted records; include confirmed direct claims and `trusted_low_risk` records, while unconfirmed observations require an explicit request. Exclude unconfirmed syntheses, contradicted, refuted, superseded, stale, and deleted records unless an explicit diagnostic/admin override is supplied. Results expose source preview, provenance, trust, freshness, contradiction, confirmation, and observation/synthesis type as untrusted context. | Search fixtures across personas and dates, including adversarial cross-persona and cross-repository candidates; verify pre-query isolation, default eligibility, explicit unconfirmed/diagnostic overrides, labels, source explanation, bounded count, and untrusted framing. |
| FR-013 | Support non-injecting shadow previews after explicit search. Do not automatically inject retrieved knowledge into model context in release one. | Run a shadow preview and inspect a session; verify a preview artifact exists and model context is unchanged. |
| FR-014 | Treat swearing and `WTF` as deterministic friction signals. They may create review candidates but are neither correction evidence nor truth evidence. Use a hybrid deterministic detector, policy gate, model-assisted proposal, and user review for consequential or ambiguous cases. | Feed profanity/frustration, factual correction, and unrelated failure fixtures; verify signals do not mutate claims and review classification is required where ambiguous. |
| FR-015 | Detect staleness from repository state, session state, and age. Permit an optional external retrieval shadow that is non-authoritative and not on the availability path. | Change repository revision, session context, and age fixtures; verify freshness state changes; disable external shadow and verify local operation remains unchanged. |
| FR-016 | Apply deterministic redaction before any model redaction. At minimum deny credentials, tokens, keys and authentication material; `.env` values, private keys and certificates; regulated personal information; health, financial, legal and employment-sensitive material; restricted customer or employer data; hidden reasoning; and explicitly private or opted-out content. Secrets are always denied. Denials and notifications must not reproduce denied values. Only taxonomy extensions and matching rules remain open. | Run secret and minimum sensitive-category corpus plus benign lookalikes; verify deterministic denial/redaction precedes provider calls and denied values are absent from records, logs, and notifications. |
| FR-017 | Send work data only to an exact allowlist of OpenAI models, using the exact dedicated approved work-memory model. Personal-memory provider policy remains an open decision. Never silently fall back. | Configure an unapproved model/provider and an unavailable approved model; verify policy violations are denied, provider outage leaves model-dependent stages pending, and no fallback call occurs. |
| FR-018 | Fail open for normal Pi operation when capture, parsing, retrieval, indexing, or an external shadow fails, while making failures visible. Provider outages mark model stages `pending`, never `denied`; `denied` is reserved for policy violations. Fail closed for privacy, persona, redaction, consent, and provider-policy checks. | Inject each failure; verify Pi remains usable for fail-open cases, reports the failure, marks outage-dependent stages pending, and excludes unsafe/policy-uncertain content for fail-closed cases. |
| FR-019 | Provide explicit review for pending conflicts, syntheses, stale items, denied categories, generalizations, and shadow previews. Notifications are disabled by default; when authorized, they use only an authorized destination and generic lock-screen-safe text, with no persona, repository, category, session, or other metadata. | Verify review lists pending items; confirm no notification occurs by default and enabled notifications use only the authorized destination and generic text without metadata. |
| FR-020 | Provide manual retention only: list, review, and delete, with no automatic expiry. Manual deletion erases source content, excerpts, derived content that cannot stand without it, and index entries; rebuild indexes. Preserve only a non-content tombstone containing record ID, deletion time, category/reason, and affected IDs. Deletion is auditable, but deleted text, hashes, and locators are unrecoverable. | Delete a source and derived result; verify dependent content and index entries are erased, indexes rebuild, only the specified tombstone remains, active search excludes it, and reports do not reproduce deleted content. |
| FR-021 | Rebuild disposable lexical/vector/entity/graph indexes from durable records and report malformed, skipped, denied, failed, pending, and committed items. | Corrupt an index, delete records, and add malformed input; rebuild and verify durable records and deletion semantics remain intact and the batch report distinguishes every outcome. |
| FR-022 | Record compiler, policy, provider, model, prompt, redaction, and index versions for derived artifacts and batch reports. | Change a policy or model version and verify new derived artifacts carry new versions while prior artifacts remain recoverable. |

## Non-functional requirements

| ID | Requirement | Direct verification |
| --- | --- | --- |
| NFR-001 | Privacy checks must be deterministic, deny by default, and auditable; secrets must never pass to a model or appear in output. | Adversarial redaction corpus and provider-call recording show no secret egress. |
| NFR-002 | Provenance must be complete enough to recover source, derivation, attribution, scope, and version history for every result. | Provenance audit finds no orphaned derived record and reconstructs each sampled result. |
| NFR-003 | Rerunning an unchanged batch is idempotent and does not duplicate observations or syntheses. | Run the same batch twice and compare durable record IDs and counts. |
| NFR-004 | Normal Pi assistance remains available during fail-open Menos failures; unsafe output is never presented as safe during fail-closed failures. | Fault-injection test verifies both paths and visible reporting. |
| NFR-005 | Retrieval and mutation quality are separate release gates. Evaluation covers relevance, source/citation accuracy, isolation, temporal correctness, contradiction/correction accuracy, stale rate, unsupported synthesis, redaction leakage, mutation correctness, preview burden, injection safety, failure visibility, latency, and rebuild behavior. | Run the maintained query set and experiment suite; publish both retrieval and mutation gate results. |
| NFR-006 | Quality gates use measured baselines. No fixed numeric threshold is asserted before baseline capture and review. Promotion requires an approved threshold record specifying metric, corpus, sampling, confidence/variance method where applicable, and regression rule. | Capture baseline, document threshold decision, then run repeatable gate; reject promotion when the threshold record is absent. |
| NFR-007 | Active compression is bounded in size and context exposure, and full source/version recovery remains available. | Compression fixture verifies size bound and complete recovery. |
| NFR-008 | Work provider use records exact model/provider identifiers and policy version, with no silent fallback. | Audit derived records and provider call logs under unavailable/unapproved configurations. |

## Staged product behavior

### Stage 0: Baseline and policy readiness

Capture the current retrieval and mutation baselines using the existing query set. Establish the minimum denied sensitive categories above, any taxonomy extensions and matching rules, persona registry/marker rules, machine identity, provider allowlist, exact dedicated model identifier, retention policy, and threshold-setting procedure. No release promotion occurs without these records.

### Stage 1: Manual capture and review

A user selects a batch. Menos applies opt-outs, persona precedence, bounded references, deterministic redaction, and provider policy, then shows a preview and batch report. Approved observations and claims commit immutably. Search is explicit only.

### Stage 2: Safe synthesis and shadow retrieval

Approved claims can produce versioned scoped syntheses and reviewed hybrid generalization proposals. Explicit search displays provenance and independent state dimensions. Shadow previews measure candidate retrieval without changing model context. Notifications remain disabled unless explicitly enabled.

### Stage 3: Trigger reuse and measured expansion

Session-end and periodic triggers may call the existing manual batch contract. External retrieval may run as an optional non-authoritative shadow. Automatic injection is considered only after retrieval, privacy, provenance, failure, and shadow experiments pass their approved release gates. It is not part of release one.

## Acceptance criteria

1. A manual batch processes all eligible sessions by default, honors every opt-out, is idempotent, and reports committed, skipped, denied, failed, and pending items; no release-one criterion requires trigger invocation.
2. Every sampled observation has stable machine and session provenance, including originating provider/model where applicable, separate extractor provider/model, bounded redacted excerpt, truncation metadata, source metadata, and hash; observations cannot be overwritten.
3. Claims and syntheses preserve source and derivation chains, explicit scope, independent confirmation/trust/lifecycle/freshness dimensions and transitions, corrections, contradictions with time/scope overlap checks, and full version recovery.
4. Persona precedence and pre-query partitioning prevent default hobby/work/workflow leakage, including adversarial candidate isolation; absent or ambiguous scope is denied; shared artifacts require explicit confirmation; inferred intent is unconfirmed; and only approved low-risk recurring friction or workflow evidence may generalize automatically across repositories.
5. Default search eligibility is active, in-scope, non-deleted records, including confirmed direct claims and trusted-low-risk records; unconfirmed observations require explicit request, and excluded states require diagnostic/admin override. Search is explicit, bounded, provenance-labelled, and untrusted; shadow preview does not inject context; notifications are disabled by default and authorized notifications are generic and metadata-free.
6. Swearing/WTF signals create review candidates only, and hybrid resolution does not treat them as factual evidence.
7. Staleness responds to repository, session, and age signals; external retrieval is optional and non-authoritative.
8. Deterministic-first redaction, the minimum denied sensitive categories, always-deny secrets, exact OpenAI allowlist and dedicated approved work model, personal-provider decision status, and no silent fallback are demonstrated with provider-call tests; outage stages are pending, not denied.
9. Manual deletion erases content, dependent derived content, and index entries, leaves only the specified non-content tombstone, rebuilds indexes, and makes deleted text/hashes/locators unrecoverable; manual retention has no automatic expiry.
10. Menos failures do not stop ordinary Pi use, while privacy/provider/policy failures block unsafe processing and remain visible.
11. Release gates are based on recorded baseline evidence and approved threshold records; no invented quality number is accepted as a gate.

### Contradiction handling

Contradiction detection requires both scope overlap and time overlap checks. A time-specific disagreement is not automatically a conflict when the applicable periods do not overlap. Models may propose explanations or candidates, but cannot silently resolve consequential conflicts; consequential, ambiguous, persona-changing, sensitive, and broad-generalization conflicts require review.

## Alternatives considered

- **Claude-first hooks and a separate backend:** rejected; Pi is the first client and existing Pi session references are the source boundary.
- **One mutable summary or destructive compression:** rejected; immutable observations and versioned syntheses are required for correction and recovery.
- **One shared corpus/index:** rejected; persona and project isolation is a product invariant.
- **Model-only routing, trust, redaction, or generalization:** rejected; deterministic policy must control safety and scope, with models proposing rather than silently deciding.
- **Automatic capture, scheduling, or injection first:** rejected; manual preview and shadow evaluation reduce recovery and privacy risk.
- **External memory provider as authority:** rejected; external retrieval is an optional shadow only.
- **Last-write-wins conflicts and automatic retention:** rejected; corrections are linked events and retention/deletion are manual initially.

## Risks and mitigations

- **Persona leakage:** strict precedence, default isolation, explicit shared confirmation, and isolation experiments.
- **Sensitive data exposure:** deterministic-first redaction, deny-by-default categories, secrets always denied, exact provider allowlist, and no sensitive notifications.
- **False trust or inferred intent:** separate dimensions, direct-claim confirmation, bounded low-risk trust, and review for consequential cases.
- **Stale or contradictory knowledge:** repository/session/age signals, explicit conflict states, corrections, and time-scoped claims.
- **Summary distortion:** immutable observations, source hashes, versioned syntheses, and full recovery.
- **Provider outage or policy drift:** fail-open Pi behavior, fail-closed provider checks, exact model/version recording, and no fallback.
- **Review overload:** bounded excerpts, friction triage, measurable review burden, and threshold decisions based on observed baselines.
- **Unvalidated quality claims:** independent retrieval/mutation gates and promotion only after threshold establishment.

## Dependencies

- Existing Pi session-export contract and local session sources.
- A stable machine identity source and repository registry/marker configuration.
- The maintained evaluation query set and pre-capture baseline.
- Approved minimum sensitive-category policy, any extensions and matching rules, and deletion authority.
- Exact OpenAI allowlist, dedicated approved model identifier, and confirmed retention, training, logging, region, and content policies before work data is processed.
- A review surface and safe local notification configuration if notifications are enabled.
- Optional external retrieval fixture/service for shadow experiments only.

## Open questions

These are configuration or operational details not settled by `research.md`, not product direction:

1. What exact machine ID generation/storage and human label format will be used?
2. What exact observation, claim, synthesis, correction, conflict, and batch-report fields and canonicalization rules will be selected?
3. Is cryptographic chaining required in release one?
4. What exact registry format, marker names, path-rule precedence, and confidence rule require model confirmation?
5. Which low-risk cases may receive automatic trust, and which conflict patterns may resolve automatically within the stated overlap and review rules?
6. Which sensitive-category extensions and matching rules, beyond the minimum denied set, are approved?
7. What exact manual command, selection syntax, preview/commit boundary, review command, and deletion workflow are preferred?
8. What exact OpenAI allowlist, dedicated model identifier, and provider retention/logging/training/region policy are approved for work memory?
9. What personal-memory provider policy is approved? Until decided, work remains restricted to the exact allowlisted OpenAI dedicated model policy and personal-memory model calls are not authorized by this PRD.
10. Which measured baseline corpus, sampling method, and variance/confidence method will establish each release threshold?
11. What shadow triggers and result limits are appropriate after the manual path is stable?

## Plan handoff

Implementation may proceed only after the open provider, privacy, schema, identity, and threshold configuration decisions are recorded. Any implementation plan must preserve this PRD's record semantics and staged gates; it must not reintroduce the superseded Claude-first, automatic-scheduling, fixed-retention, destructive-compression, or automatic-injection assumptions.

## Sources

- `research.md`
- Existing Pi session-export contract and local expertise sources listed in `research.md`
- Existing evaluation artifacts: `eval-queries.yaml` and `eval-baseline-pre.md`
- OpenBrain/OB1 provenance patterns, Hermes bounded active memory and recovery comparison, OpenClaw memory comparison, Letta context/archive separation, Mem0 privacy warning, and W3C PROV as cited in `research.md`
