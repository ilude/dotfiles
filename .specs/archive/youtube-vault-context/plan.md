---
created: 2026-09-21
status: in progress
completed: null
---

# Whole-video understanding without sponsor text in model context

## Goal and scope

Improve Onclave's YouTube ingestion and Pi `/yt` retrieval so the model receives useful, compact, whole-video information instead of duplicated metadata, opening-only summaries, and known sponsorship text.

### User requirements and settled decisions

1. Include the title when available in terminal job callbacks, avoiding a content lookup merely to name the video.
2. Make single-content tool reads compact by default, with optional field selection and explicit full-record retrieval. Do not introduce a GraphQL server.
3. Generate a whole-video summary and ordered outline from the complete retained transcript. Use one model call when the complete input fits the configured input budget; otherwise analyze ordered chunks and synthesize their results. Do not silently discard everything after the first 10,000 characters.
4. Generate one canonical structured summary. Derive the legacy scalar summary from it rather than requesting two independently authored summaries.
5. Use SponsorBlock's `sponsor`/`skip` intervals to keep known sponsor text out of summarization, intermediate analysis, embeddings, new search snippets, and default whole-transcript retrieval. Preserve the original transcript and original video timestamps. Retain ambiguous caption boundaries rather than invent word timing.
6. Report filtering and coverage honestly. No matches, unavailable service, incompatible timing, and absent timing are not proof that a video contains no advertisements. SponsorBlock lookup is best effort, not a prerequisite for ingestion.
7. Preserve `/yt-local`, the already-implemented `/yt` tool activation, asynchronous one-way callbacks, explicit Onclave failures, and the prohibition on local fetcher fallback. A URL ingestion does not implicitly request repository research or changes.
8. **Latest operator clarification:** do not fetch SponsorBlock information for all old videos. Consult it only when an operation needs the whole video transcript and the matching stored information is absent. Summary, outline, metadata, list, and search-snippet reads must not trigger that lookup. A stored successful empty result counts as information already present until its on-access retry eligibility expires.
9. **Approved negative-cache policy:** determine video age at lookup time. For videos younger than 7 days, or with unknown publication date, a successful no-match result becomes eligible for another lookup after 24 hours. For videos at least 7 days old, eligibility is after 30 days. Recheck only on a later whole-transcript access, never from a timer or lightweight lookup. If matches appear, update the filtered transcript view but do not automatically regenerate summaries or embeddings.
10. No automatic LLM reprocessing or embedding reindexing of existing content. A permitted whole-transcript read may lazily acquire and store SponsorBlock information and a filtered transcript view; that is not permission to regenerate summaries or replace old search chunks.

### Non-goals

- Removing playback ads, downloading/editing video or audio, adding yt-dlp as a runtime dependency, or using an LLM to detect unlabelled ads.
- Removing self-promotion, intros, outros, interaction reminders, tangents, or other SponsorBlock categories.
- Bulk backfill, periodic SponsorBlock refresh, scheduled reprocessing, automatic model upgrades, a new model catalog service, or broad changes to non-YouTube processing.
- Graph traversal/query language, field projection for every list/search operation, or replacing the underlying content API with GraphQL.
- Unrelated host/infrastructure changes, secret rotation, stateful replacement, router/firewall changes, and commercial SponsorBlock licensing arrangements. The managed deployment and configuration/pin updates needed for this change are authorized below.

### Authorization

The current action remains plan authoring, not immediate implementation. **On 2026-09-21 the operator explicitly authorized full deployment on merge.** A later execution of this plan includes dedicated task worktrees, implementation, local commits, merge into the recorded targets, required publication, and the complete managed deployment and verification of these changes after merge. Do not ask again for the same publication/deployment permission.

**Decision A1 resolved:** publish the completed Onclave changes to `origin/feature/v2-broker-core` before committing the parent gitlink, then merge/publish the task's dotfiles changes to `main`. Full deployment includes the immutable core image, changed application/env contracts, necessary managed runtime configuration/pins, and validation of the updated Pi integration. Use the existing homelab-infra deployment owner; do not treat GitHub image publication alone as deployment.

This authorization survives later execution commands unless the operator narrows it. It does not authorize unrelated infrastructure changes, data destruction, bulk SponsorBlock lookup, automatic regeneration of historical summaries/indexes, or commercial SponsorBlock usage. An explicit no-merge instruction defers deployment because the authorized trigger has not occurred.

## Fresh-context handoff

Paths in dotfiles sections are relative to the dotfiles root. **Onclave** sections use paths relative to `modules/onclave/` or its corresponding task worktree. **Homelab-infra** sections and T13 use paths relative to `modules/homelab-infra/` or its corresponding task worktree.

### Ownership and required reading

- Dotfiles owns the canonical coordinating spec, default Pi prompt/skill/docs, loader integration, root changelog, and module gitlink.
- Onclave owns the API/client, transcript artifacts, SponsorBlock integration, pipeline, search inputs, notification payload, and Pi vault tool implementation. Do not copy these implementations into dotfiles.
- `modules/homelab-infra/` owns the managed host deployment, BWS runtime configuration and pins, and deployment validation. Use its existing Ansible/BWS/service-state workflow; no infrastructure source changes are assumed. If a necessary deployment-consumer source change is established, keep it in its own task worktree and follow that repository's commit/push-before-parent-pin rules.
- Read the applicable `AGENTS.md` files in both repositories. Do not inspect or edit `pi/profiles/legacy/`.
- Dotfiles: `pi/README.md`, `pi/profiles/default/docs/{commands,onclave}.md`, `pi/profiles/default/prompts/yt.md`, `pi/profiles/default/skills/youtube/SKILL.md`, and `pi/profiles/default/extensions/onclave-pi.ts`.
- Onclave: `services/core/src/vault/{routes,jobs,pipeline,models,vault-service,youtube-transcript,embedding-reindex,config,llm-providers,llm-metering}.ts`; `extensions/onclave-pi/src/lib/{vault-tools,presentation}.ts`; `packages/client/src/index.ts`.
- Onclave: `docs/menos/parity-contract.md` for the raw-download compatibility contract; `docs/extensions/onclave-pi/PRD.md` for one-way notifications; `deploy/app/onclave/env-contract.md` for any added service configuration. Historical Menos Python/SurrealDB designs are not the current implementation.
- Homelab-infra: its `AGENTS.md`, `docs/{onclave-core-rollout,onramp-host-runbook,onramp-app-platform-contract}.md`, `scripts/run-infra.sh`, and `infra/ansible/playbooks/onclave-onramp.yml`. Resolve live configuration from its authorized BWS sources, never from public tracked files or chat. Onclave's `.github/workflows/ci.yml` builds/publishes the immutable core image; the host rollout is a separate managed operation.
- Follow installed Pi docs and the default profile's relevant extension, TypeScript, testing, and prompting guidance when editing those surfaces. This plan does not require loading the planning skill during execution.

### Verified starting behavior, 2026-09-21

- Dotfiles `main`: `f07728c9c5295f572a47bec0bd6fe4ee52c6ad78`; Onclave `feature/v2-broker-core`: `6b2724cd1ca607f3c39f992f0e8340b9bcf936b4`, tracking `origin/feature/v2-broker-core`. Both working trees were clean at planning inspection. Recheck before editing.
- `/yt` already activates the four vault tools before submitting its prompt, retaining them after settlement until session start/reload. Do not reimplement or undo this.
- Onclave `pipeline.ts:481-501` builds analysis input from only the first 10,000 characters. It asks for independent scalar and structured summaries. `StructuredSummary` v1 has `overview` and `key_points`, but no outline or coverage.
- Pipeline persistence embeds the full `request.contentText`, not the truncated model input. Fixing only the prompt would leave sponsor text in embeddings/search.
- `youtube-transcript.ts` preserves `{text,start,duration}` during fetch. `routes.ts:529-559` submits plain full text but stores timestamped text, losing exact segment durations outside the fetch result.
- Existing-content ingest, explicit reprocess, and embedding reindex each read the original stored object. They are additional input paths that must share the new transcript-selection logic.
- `contentDownload` returns the original stored object. The Pi tool can bypass that HTTP route using a direct S3 object download; both paths need explicit transcript-variant selection.
- `contentDetail` exposes top-level summary fields and the full `metadata.unified_result`. The Pi tool serializes nearly the whole record, duplicating summaries in model context. Compact TUI rendering does not reduce that model-visible JSON.
- `jobs.ts:321-367` emits terminal IDs/status/timing/summary but no title. Notifications are one-way untrusted reference data; do not add replies or change channel protocol semantics.
- Providers expose output-token limits and usage, but no input-budget/context-window metadata. Existing embedding chunking uses 400-code-point chunks and is not an analysis-budget planner.
- Existing processing version fields do not initiate a migration sweep. Ordinary repeated URL ingestion already creates/subscribes to processing jobs; preserve that explicit-request behavior rather than adding background reprocessing.

### Source evidence for SponsorBlock

Inspected during this planning conversation:

- Project: <https://github.com/ajayyy/SponsorBlock>
- Working integration: <https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/postprocessor/sponsorblock.py>
- API/license: <https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License>

The yt-dlp integration uses `/api/skipSegments/{sha256(videoId).slice(0,4)}`, matches the exact `videoID` in the bucket, requests categories/action types, and checks video-duration compatibility. Use the HTTP contract as a reference, not a reason to add Python or copy yt-dlp's broader video-editing workflow. The API wiki returned a bot challenge during inspection; this is not a live API compatibility test.

SponsorBlock publishes API/database data under CC BY-NC-SA 4.0 unless separately permitted. Retain attribution/provenance and document this constraint. The operator has authorized deployment for this workflow; this is not a claim of commercial usage permission. Commercial licensing remains outside the selected scope.

### Worktrees, targets, and profiles

- Verified planning profile: `default`, `C:/Users/mglenn/.dotfiles/pi/profiles/default`; session `01a0c4f8-639b-77d0-9c14-f8b7866ca0f5`.
- Intended execution profile: default. Do not treat that intention as an actual run.
- Dotfiles target: `C:/Users/mglenn/.dotfiles`, branch `main`.
- Onclave target: `C:/Users/mglenn/.dotfiles/modules/onclave`, branch `feature/v2-broker-core`. Keep this canonical checkout attached to that branch and tracking its existing remote.
- Proposed dotfiles task worktree/branch: `.worktrees/youtube-vault-context`, `task/youtube-vault-context`.
- Proposed Onclave task worktree: the task dotfiles checkout's `modules/onclave/`, on its own `task/youtube-vault-context` branch in the module repository. Do not switch the canonical module checkout. Record actual paths/branches before edits.
- During authorized execution, pull the canonical module before starting its task branch and before updating the parent pin as repository instructions require. Preserve unrelated changes and integrate remote changes normally; never force-push or rewrite published module history.
- Use dependencies belonging to these worktrees. The default loader resolves the nearest owning `modules/onclave` from its real source path; do not accidentally validate a canonical adapter while claiming to test the task adapter.
- Carry this task-owned uncommitted spec into the task checkout without deleting its originating copy. Reconcile/remove only the identical task-owned active copy during successful archival/integration.
- Homelab-infra was inspected at `6cebeac3af7c322cd38063960b1b35b5da7a7ac7` in a clean detached checkout. Preserve that checkout state for deployment work; do not switch it to a guessed branch. Record the execution-time deployment tooling revision and resolved target privately. If source edits are necessary, establish their integration target before editing rather than treating the detached checkout as a publishable branch.

## Decisions and implementation contract

### A. Model-context boundary and lazy acquisition

Introduce one reusable whole-transcript preparation path in Onclave. The path produces an analysis transcript and filtering metadata without putting original text in downstream model requests.

- New URL ingestion, explicitly requested processing/reindexing, and default whole-transcript retrieval are eligible consumers.
- For eligible consumers, first inspect compatible stored SponsorBlock information. A missing usable result or an expired successful no-match result triggers one lookup. Reuse positive matches without adding a refresh policy in this scope. A failed request is not a negative match; a later eligible access may retry it, without timers or a retry loop in the access itself.
- For successful no-match results, persist publication date when known, lookup time, result state, and retry-eligible time. If the video was younger than 7 days at that lookup, set eligibility to lookup time plus 24 hours; if at least 7 days old, use 30 days. Unknown publication date uses 24 hours. Base expiry on the age at the recorded lookup, so a video aging past day 7 does not extend an already assigned expiry. A later successful no-match lookup computes a new interval using the then-current video age.
- Check negative-cache freshness even when an analysis transcript artifact already exists. Before expiry, reuse it without HTTP requests. On a later eligible whole-transcript access at/after expiry, query once and refresh the filtered view if segments have appeared. Keep original content and historical summary/index artifacts unchanged. No background refresh, summary-triggered refresh, or automatic positive-result refresh is introduced.
- Old summary/outline/metadata/list/snippet reads neither load the whole transcript to do this work nor contact SponsorBlock.
- Preserve originals. Store exact timed segments for new fetches, the lookup snapshot, the filtering decision, and a derived analysis representation using existing object storage plus content metadata. Keep `content.file_path` as the original object for compatibility.
- Old timestamped text can be used conservatively when segment boundaries are available. Plain user-supplied transcripts remain accepted. If reliable timing is unavailable, retain the text with an explicit unavailable/not-applicable filtering reason; do not pretend text can be aligned exactly to video time.
- Only intervals categorized `sponsor` with action `skip` are candidates. Match the exact video, validate finite ordered intervals, coalesce overlaps, and reject duration-incompatible intervals using the referenced duration logic where duration is known. Missing duration is reported as an evidence limit rather than a new ingest gate.
- Remove captions wholly within applicable sponsor intervals. Preserve partial-overlap or uncertain captions and record that boundary handling is conservative. Do not renumber time or fabricate word timestamps.
- Record lookup state separately from whether text was actually removed. Distinguish matches, empty result, lookup unavailable, incompatible intervals, and unavailable transcript timing. Retain IDs/categories/intervals and source attribution without embedding removed text in diagnostics.
- All model calls, including intermediate map/reduction and repair calls, must use retained content only. Embeddings/new chunk snippets use the same retained source. A test with unique sponsor sentinel text must catch raw-source bypasses.
- If everything is excluded, keep the original, return an empty retained transcript with filtering metadata, and do not restore sponsor text to satisfy chunking. Produce a deterministic no-retained-content result without model/embedding calls, and remove stale chunks during an explicitly requested processing/reindex operation.
- Lazy transcript preparation alone does not regenerate summaries or reindex old chunks. Old summary/index artifacts may still contain sponsor material until explicitly regenerated; do not label them as filtered merely because a SponsorBlock snapshot now exists. Expose unknown/legacy provenance where needed rather than claiming retroactive cleanup.

Exact artifact filenames, internal type names, and metadata nesting are implementation details. Define them once in T1 and reuse them; do not add a parallel database, cache daemon, or periodic refresh system.

### B. Whole-video summary and outline

- Keep the configured provider/model. Add an explicit service input-budget setting with a documented conservative estimator, not a model-discovery subsystem. Account for the complete prompt and reserve output capacity; an input budget is not a claim that providers expose their true context limits. Choose and document the numeric default and estimator against supported provider behavior while implementing T5. Do not switch models or add a paid service to solve this.
- For YouTube, short retained transcripts take a single analysis call. Longer inputs take ordered timestamp-aware chunks; each retained segment must enter analysis. Do not reuse tiny embedding chunks as the map-call unit.
- Intermediate notes carry source segment/range references, mechanisms, demonstrations, results, limitations, and relevant entities. They remain ordered. If all notes do not fit the final synthesis input, reduce adjacent groups recursively without silently clipping the tail. Detect non-progress rather than looping indefinitely.
- Keep existing provider retries, metering, job identity, and stage reporting. Meter every additional map/reduction/synthesis/repair call. A failed required chunk fails analysis through the existing job failure path; do not mark partial work as a complete whole-video summary.
- Canonical summary remains compatible with `structured_summary: {version:1,overview,key_points}`. New successful YouTube analyses require valid canonical structured output. Readers still accept old scalar-only records. Derive scalar `summary` deterministically from overview/key points; do not copy an independently supplied model scalar over it.
- Add a separate versioned `outline` with ordered sections: a heading, concise description, and source time/range when available. Numeric times are seconds in the original video. Source segment IDs should ground model-generated times; missing timing is omitted, not invented. An outline is substantive navigation, not a sponsor-removal log.
- Add `summary_coverage` distinguishing full retained-source coverage from legacy/unknown or partial historical coverage, along with generation method and source range/chunk counts needed to explain it. “Full” means all retained material entered analysis, not that a summary reproduces every fact.
- Ask for concrete mechanisms, what was actually demonstrated, reported results, and important limitations when present. Distinguish a speaker's claims from evidence shown. Do not force unsupported findings to fill a template.
- Preserve unrelated tagging/entity behavior and non-YouTube processing. Changes to shared readers/serialization may be additive; SponsorBlock and the new whole-video analysis path are YouTube-specific.

### C. Content retrieval contracts

For `onclave_vault_content` single-item `get`:

- Default compact output: identity/title/type/status; one summary representation; concise coverage/filtering state; useful source/channel/date/duration metadata; existing tags/topics/entities and relevant resource links when present. Omit duplicate `metadata.unified_result`, diagnostic explanations, storage URLs, and the outline unless requested.
- `fields: [...]` selects documented top-level fields and selected dotted metadata paths from the same logical content record. Include examples for title-only, summary-plus-outline, and filtering provenance. Use explicit supported paths with deterministic output and clear unknown-field errors; do not introduce arbitrary expressions or require schema discovery for routine calls.
- `view: "full"` exposes the existing detailed record, including additive new fields. Reject ambiguous combination with `fields`; it does not implicitly download the transcript. Full means the existing tool-visible record, not newly exposing hidden storage credentials/keys.
- Preserve `id` and existing field names, including separation of user tags and pipeline tags. Use `structured_summary` when present, otherwise legacy `summary`, without returning both by default.
- Full/field-selected reads are projection, not permission for SponsorBlock requests or full-transcript work.
- Do this projection in the Pi adapter; keep the underlying content-detail API compatible. List/channel/search/annotation output projection is outside this scope.

For whole-transcript retrieval:

- Preserve the tool's extension-owned private-file result (`local_path`, `content_id`, `bytes`) and add the selected variant plus concise filtering state when needed to avoid misrepresentation.
- Default tool variant is `analysis`; `original` is explicit. Original means unmodified stored source, not a prompt to contact SponsorBlock or generate model output.
- Add an explicit analysis variant to the service/client download path while preserving the raw default of the existing HTTP `/content/{id}/download` contract. The Pi tool must select analysis explicitly; both service and direct-S3 execution must select the same artifact, never silently use the original S3 key for an analysis request.
- Resolving a missing analysis view on an eligible old whole-transcript access may obtain SponsorBlock information and persist derived artifacts, without LLM calls or index replacement. Best-effort unavailable cases retain text with accurate status.
- Outline and summary retrieval never fetch a transcript merely because the stored outline or summary is missing. Return absence/legacy state; regeneration remains explicit.

### D. Terminal callbacks and Pi workflow

- Extend `onclave.job.terminal.v1` additively with optional `title`; preserve IDs/status/timing/trust and existing protocol version. Include concise coverage/filtering state when available so reporting it does not require a full content read. Do not put the complete outline, transcript, or duplicate structured summary into a routine callback.
- Resolve titles for completed, failed, and cancelled paths when available, including subscribers attached to existing jobs. Missing metadata must not suppress an otherwise valid callback. Preserve exactly the existing publication and idempotency behavior.
- Pi reports directly to the operator. A callback with enough information is the completed result, not a reason for an automatic `get` call. Older callbacks without titles remain accepted; fetch stored content only when the requested report needs it.
- Keep tool activation additive/session-lived. Do not change Onclave messaging permissions, add polling, or add local YouTube fetching to `/yt`.

## Execution guidance

Planning is not implementation permission. On later execution, create/resume the recorded dedicated worktrees and record actual revisions/paths. Consult `strategist` before delegating plan execution unless the operator explicitly requests a single-agent handoff. A Team Lead follows its own Strategist-first workflow. Use only active-catalog roles, assign at most one named task per subagent, and split a task further when its independently provable outcomes would exceed one ordinary context.

Do not add a mandatory reviewer chain. If review agents are used, follow the active profile's Steward guidance for their findings. Continue independent work around blockers. Adapt mechanisms within the fixed contracts, but ask before changing scope, defaults with consequential behavior differences, acceptance, model/provider selection, or publication permission.

Keep task checkboxes, evidence, actual runs, and blockers accurate. Do not mark integration/cleanup done based only on passing tests. Run finite agreed checks and stop once task-related defects are resolved. New files named below are **proposed**; equivalent focused modules are allowed. When tasks share a file, integrate the named prerequisite before assigning the consumer; do not give concurrent writers ownership of the same file.

## Tasks

- [x] **T1: Establish shared transcript-analysis contracts**
  - Depends on: none.
  - Owns: Onclave `services/core/src/vault/models.ts`; proposed `services/core/src/vault/transcript-analysis.ts` contract/types; focused contract tests; proposed `docs/guides/youtube-context.md` contract section.
  - Define original/timed/analysis representations, sponsor lookup/filter state, negative-cache publication/lookup/retry-eligibility timestamps, stored provenance, canonical summary, versioned outline, and summary coverage. Define a reusable whole-transcript resolver interface and single-source serialization rules consumed below. Separate current transcript provenance from provenance of historical summaries/indexes.
  - Keep old content/scalar summaries readable; use optional additive stored fields rather than a forced migration. Define exact artifact metadata and download variant response contract before dependent implementations.
  - Verify: focused type/normalization tests for old records, new records, missing timing, empty lookup, and all-excluded input; Onclave typecheck.
  - Done when: downstream workers can implement against written typed contracts without deciding product behavior.
  - Evidence: Typed transcript, provenance, artifact, summary, outline, coverage, and resolver contracts implemented with compatibility tests.

- [x] **T2: Acquire and apply SponsorBlock intervals without an LLM**
  - Depends on: T1's filter/provenance contract.
  - Parallel with: T5 and T7, with disjoint new helper/test files.
  - Owns: proposed Onclave `services/core/src/vault/sponsorblock.ts` and `services/core/tests/vault-sponsorblock.test.ts`. Keep configuration/wiring changes for T3.
  - Implement the hash-prefix API request and exact-video selection, sponsor/skip selection, duration compatibility, normalized intervals, and conservative caption filtering. Reuse stored positive results and unexpired no-match results. Implement the approved 7-day publication-age threshold and 24-hour/30-day negative-cache intervals, with unknown publication date using 24 hours. Failed lookup permits best-effort use of retained original text with status, not an automatic retry loop.
  - Use normal bounded service HTTP behavior and cancellation; do not add a service-wide readiness gate, third-party SDK, video download, or category expansion.
  - Verify: fixture HTTP responses for exact matching, unrelated bucket entries, no match/404, failure, wrong duration, invalid/overlapping intervals, caption-boundary overlap, and zero retained content. Assert excluded text is absent from returned analysis text and raw segments are unchanged. With a controlled clock, test young/older/unknown publication ages, the exact expiry boundary, a video aging past day 7 after lookup, and positive-result reuse without periodic refresh.
  - Done when: interval acquisition/filtering is deterministic under recorded API fixtures and cannot mutate the original.
  - Evidence: SponsorBlock lookup, interval validation/filtering, and age-aware negative caching implemented with fixture tests.

- [x] **T3: Store transcript provenance and prepare whole-transcript inputs lazily**
  - Depends on: T1 contracts, T2 filtering, and T7's completed `jobs.ts` changes before editing that shared file.
  - Owns: proposed transcript artifact/resolver helper; Onclave `routes.ts`, `jobs.ts` request plumbing, `vault-service.ts` SponsorBlock/resolver wiring, and corresponding route/artifact tests. T5 owns shared budget configuration and deployment-contract files; SponsorBlock uses its documented service endpoint and injectable fetcher without requiring another configuration surface.
  - New ingestion stores original timed data plus filtering snapshot and derived analysis artifact. Existing full-transcript operations use the resolver: cached matches and unexpired empty results avoid lookup; missing information or expired no-match results trigger one best-effort lookup only during whole-transcript work, even when an analysis artifact already exists. Plain supplied transcripts remain accepted and accurately labelled.
  - Prepare filtered input before job model processing; retain segment references for outlines. Do not place raw source text into job/model diagnostics. Metadata/summary/outline/snippet access stays lookup-free.
  - Include new artifacts in the existing explicit content-deletion path, which currently deletes only `content.file_path`; delete only objects owned by that content. Preserve original objects during ordinary filtering/reprocessing.
  - Verify: `pnpm test services/core/tests/vault-routes.test.ts services/core/tests/vault-ingest-clients.test.ts` plus the proposed resolver tests. Assert first eligible old access fetches once, later access and unexpired no-match fetch zero times, and an expired no-match result is checked only on a subsequent whole-transcript access. A no-match-to-matches transition updates the filtered view without LLM calls/index replacement. Lightweight reads fetch zero times even after expiry.
  - Done when: new and old whole-transcript consumers have one reusable prepared input with persisted provenance and unchanged original content.
  - Complexity: storage identity, source timing, and lazy acquisition interact. Split artifact persistence from route integration if necessary, retaining the same contract.
  - Evidence: Original/timed/analysis artifacts and lazy resolver integrated; route/resolver tests and full suite passed.

- [x] **T4: Route processing and indexing through retained content**
  - Depends on: T3's whole-transcript resolver.
  - Owns: Onclave `routes.ts` repeated-ingest/reprocess paths, `embedding-reindex.ts`, relevant `vault-service.ts` wiring, `pipeline.ts` persistence input plumbing, and focused pipeline/reindex/search tests.
  - Apply the same prepared source to explicit repeated ingest, explicit reprocess, normal embedding creation, and explicit embedding reindex. Preserve existing active-job subscription and force/already-completed semantics.
  - Newly persisted chunks and returned snippets must contain no wholly excluded sponsor text. Handle all-excluded source without embedding original text and without retaining old chunks after an explicit regeneration.
  - Do not contact SponsorBlock during ordinary search or automatically reindex historical chunks. Keep provenance sufficient to avoid labelling old search/summary artifacts filtered after a metadata-only lazy preparation.
  - Verify: `pnpm test services/core/tests/vault-pipeline.test.ts services/core/tests/embedding-reindex.test.ts services/core/tests/vault-search.test.ts services/core/tests/vault-routes.test.ts`. Capture inputs at embedding/provider boundaries with a unique sponsor sentinel; test new, explicit reprocess, explicit reindex, and all-excluded paths.
  - Done when: no raw-source bypass remains in the agreed regeneration paths; old data is unchanged absent an explicit regeneration request.
  - Evidence: Processing, reprocessing, embeddings, and reindex now use retained content; sentinel and all-excluded paths tested.

- [x] **T5: Plan bounded, complete analysis inputs**
  - Depends on: T1's timed retained-source contract.
  - Parallel with: T2 and T7. Do not edit shared `vault-service.ts` wiring concurrently with T3; include that small integration in T6.
  - Owns: proposed Onclave `services/core/src/vault/analysis-budget.ts`, its tests, analysis-budget configuration, and matching `deploy/app/onclave/{compose.yaml,.env.example,env-contract.md}` entries.
  - Implement explicit input-budget configuration and documented conservative sizing of complete prompts, including instructions/context and output reservation. Preserve provider/model selection; no model catalog service or speculative capacity claims.
  - Implement ordered segment-aware source chunk planning, splitting an oversized individual caption without dropping text and retaining its source reference. A short complete input stays one unit. Plan adjacent-note reduction when synthesis would exceed budget, with an observable progress condition.
  - Configuration additions here are provider-neutral Onclave contracts; T13 applies necessary runtime settings through homelab-infra/BWS after merge. Do not put site inventory/secrets into tracked source. Document the chosen numeric default and estimator and how operators can tune them. Invalid or insufficient budgets must report their actual configuration problem, not silently truncate.
  - Verify: proposed budget tests with tiny fixture budgets, non-ASCII input, long captions, prompt overhead, one-call threshold, complete segment coverage, and multi-level ordered reduction planning; `pnpm test services/core/tests/config.test.ts services/core/tests/vault-llm.test.ts` if affected.
  - Done when: every retained source unit has a planned analysis path and no generated request is knowingly larger than the configured estimate budget.
  - Evidence: 12,000-token conservative budget planner, 3,000-token output reserve, chunking/reduction planning, configuration, and docs implemented.

- [x] **T6: Produce canonical whole-video summaries and grounded outlines**
  - Depends on: T4's filtered processing input and T5's call planner.
  - Owns: Onclave `pipeline.ts`, proposed focused analysis prompt/parser helpers, `llm-metering.ts` only if required, final service wiring, and `vault-structured-summary.test.ts`/analysis pipeline tests.
  - Replace YouTube's first-10,000-character path with single-call or ordered map/reduce/synthesis execution. Preserve classification/entity output and existing non-YouTube behavior. Do not restore excluded source during schema repair.
  - Generate concrete canonical structured summaries, source-grounded outline sections, and complete retained-source coverage metadata. Derive scalar summaries in code. Persist new fields in the existing result transaction with model/version provenance; old readers/records stay compatible.
  - Meter every model call through the existing contextual provider. A failed required analysis unit fails the job rather than publishing a falsely complete result. Keep existing retry/stage semantics; do not create a second job orchestration system.
  - Verify: `pnpm test services/core/tests/vault-pipeline.test.ts services/core/tests/vault-structured-summary.test.ts services/core/tests/vault-llm.test.ts`. Tests capture every prompt, prove late-video content reaches analysis, preserve outline order/original times, exclude sponsor sentinel text even in repair prompts, test multi-level synthesis, canonical-to-scalar rendering, all-excluded source, and mid-analysis failure/metering.
  - Done when: the whole retained video contributes to a compatible canonical result and coverage is supported by actual processed source ranges.
  - Complexity: multi-call lifecycle and parser compatibility are separate proof obligations. A worker may split prompt/parser implementation from orchestrated integration rather than owning both plus all regressions in one context.
  - Evidence: Complete single-call or ordered map/reduce/synthesis analysis, canonical summary, grounded outline, coverage, and metering implemented.

- [x] **T7: Make terminal callbacks sufficient for routine reports**
  - Depends on: T1's compact provenance shapes.
  - Parallel with: T2 and T5. Complete before T3 edits `jobs.ts`.
  - Owns: Onclave `terminal-notification-contract.ts`, `jobs.ts` terminal payload/title lookup, `extensions/onclave-pi/src/lib/presentation.ts`, notification/presentation tests, and relevant notification contract docs.
  - Add optional title and concise coverage/filtering state where available. Preserve one-way publication, trust framing, schema version compatibility, and deduplication. Do not include full transcripts/outlines or duplicate summary bodies.
  - Cover success/failure/cancellation and existing-job subscribers; missing title/metadata must not suppress terminal delivery. Render an available title compactly without hiding failure status.
  - Verify: notification cases in `services/core/tests/vault-pipeline.test.ts`; adapter presentation/extension tests; old payload fixtures still accepted. Assert the model-visible callback supplies the routine result without requiring a content API call for title.
  - Done when: both old and additive new payloads work and routine completion reporting has title/IDs/status/summary when available.
  - Evidence: Optional callback title and concise provenance added compatibly across terminal paths and presentation.

- [x] **T8: Expose original and analysis transcript variants through service/client**
  - Depends on: T4's integrated resolver/regenerated-source paths and T1's additive result field shapes. Can run alongside T6, which supplies the producer rather than the already-established interface.
  - Owns: Onclave `routes.ts` content-detail/download changes, `packages/client/src/index.ts`, client/route tests, and download contract documentation.
  - Add the explicit analysis download/resolve variant needed by the Pi adapter, including filtering state and selected object identity. Retain the existing raw default HTTP download for compatibility. Resolve old whole-transcript analysis requests lazily using T3; summary/outline/detail reads do not prepare transcripts.
  - Expose canonical summary, outline, coverage, and filtering provenance additively. Missing legacy fields remain absent/unknown rather than fabricated.
  - Verify: `pnpm test services/core/tests/vault-routes.test.ts packages/client/src/index.test.ts`; signed request paths/query selection, raw/analysis contents, cached/uncached legacy full reads, missing objects, and proof that detail/projection reads do not trigger SponsorBlock.
  - Done when: callers can explicitly select either transcript and obtain truthful metadata without breaking existing raw-download consumers.
  - Evidence: Raw-compatible and explicit analysis download variants implemented in service/client with signed route tests.

- [x] **T9: Return compact and field-selected single-content tool results**
  - Depends on: T1's content field contract. Can finish independently of service implementations using fixture records; T11 verifies the integrated producer/consumer contract.
  - Owns: Onclave adapter proposed projection helper, `extensions/onclave-pi/src/lib/vault-tools.ts` get path/schema, and projection/vault-tool tests. Do not assign T10 concurrently on that file.
  - Implement compact default, supported `fields`, and explicit full view exactly as contract C. Avoid duplicate summary representations and raw pipeline blobs in default model content. Keep old scalar-only records useful and do not fetch the transcript to fill missing fields.
  - Keep expansion truthful: TUI expansion shows returned data, not an unrequested full-record network call. Existing transcript/list/channel/annotation behavior remains unchanged in this task.
  - Verify: `pnpm test extensions/onclave-pi/tests/vault-tools.test.ts` plus projection tests for default/selected/full output, invalid combinations/fields, deterministic ordering, legacy fallback, and no extra client calls. Compare model-visible serialized bytes for the same representative fixture, proving duplicate removal rather than claiming measured provider cache gains.
  - Done when: routine lookup needs neither discovery nor a long duplicated record; specific fields and full inspection remain explicit.
  - Evidence: Compact default, selected fields, and explicit full projections implemented without extra retrieval calls.

- [x] **T10: Default the Pi whole-transcript tool to the analysis variant**
  - Depends on: T8's client/download contract and T9's merged `vault-tools.ts` edits.
  - Owns: Onclave adapter `vault-tools.ts` transcript path/schema and `extensions/onclave-pi/tests/vault-tools.test.ts`.
  - Select analysis by default and original only explicitly. Preserve private-file retrieval and add concise variant/filter status to the result. Both direct S3 and HTTP download must use the resolver-selected object, including lazily prepared old content.
  - Preserve existing `download` argument compatibility and cancellation/cleanup behavior. Do not inline whole transcripts into the tool result or add local fetcher fallback.
  - Verify: both transport fixtures with sponsor sentinel text, explicit original access, cached/no-match/unavailable status, legacy lazy preparation, and download failure/cancellation cleanup in `vault-tools.test.ts`.
  - Done when: normal agent whole-transcript retrieval cannot accidentally bypass the selected analysis object via S3, while original access stays available.
  - Evidence: Pi transcript retrieval now defaults to analysis, supports explicit original, and preserves private-file cleanup semantics.

- [x] **T11: Align /yt guidance and run the bounded cross-path checks**
  - Depends on: T6-T10 integrated results and the lazy behavior from T3/T4.
  - Owns: dotfiles `pi/profiles/default/prompts/yt.md`, `skills/youtube/SKILL.md`, relevant default docs/tests, `pi/README.md`, root `CHANGELOG.md`; Onclave guide/contract reconciliation and cross-path fixture tests.
  - Guidance uses callbacks directly when sufficient, compact metadata by default, optional outline/fields on demand, and analysis transcript unless original is requested. Document lazy SponsorBlock eligibility, age-aware expiring empty results, unavailable states, legacy artifacts, and explicit regeneration. Preserve no callback replies, no polling loop, no local fallback, and no automatic repository comparisons for bare ingestion.
  - Update public service env documentation and SponsorBlock attribution/license notes without moving site values into tracked source. T13 owns authorized live configuration updates. Preserve existing deferred-tool activation behavior.
  - Run the final finite suites listed below once on the integrated code. Inspect the assembled `/yt` prompt plus YouTube skill for contradictory old discovery/raw-transcript instructions.
  - Done when: fixtures prove the agreed input boundaries across acquisition, analysis, indexing, retrieval, and callback reporting, and docs describe the actual behavior and limitations.
  - Evidence: Dotfiles guidance/docs and cross-path fixtures updated. Integrated offline checks passed: Onclave 319 passed/1 skipped; default typecheck; 14 focused Pi tests; loader smoke; both diff checks.

- [ ] **T12: Commit, archive, merge, and publish in repository order**
  - Depends on: T11 passing checks. Publication and deployment permission is already recorded above.
  - Owns: task commits, the coordinating spec, gitlink integration, and required module/parent publication.
  - Follow the commit/merge/publication portions of closeout steps 1-5; T13 owns the subsequent deployment. Publish module commits before committing parent gitlinks. Archive the completed implementation spec with deployment/cleanup still unchecked; do not set overall completion before T13/T14.
  - Verify: recorded target merges, published module and parent hashes, archived spec on the target, and exact Onclave commit selected for image publication. Preserve unrelated changes and published history.
  - Done when: the checked implementation is merged/published and the authorized deployment trigger has occurred.
  - Evidence: Not started.

- [ ] **T13: Deploy the merged changes through the managed Onclave workflow**
  - Depends on: T12 merged/published revisions and their successful CI/image build. No further routine deployment approval is required.
  - Owns: homelab-infra-managed Onclave source/image/configuration pin updates, application rollout, and live deployment evidence. Application code stays in Onclave; BWS remains the live configuration/secret authority. Do not print secrets or site inventory.
  - Confirm the exact merged Onclave SHA passes `.github/workflows/ci.yml` and has a published immutable GHCR digest. Monitor CI and rollout waits using `schedule`: list existing jobs first, schedule a reasonable next check, and include exact run/SHA/target context. Do not poll indefinitely, sleep for long periods in shell, or delegate the external wait to a subagent.
  - Deploy the complete changed application contract and core image on the existing managed Onclave host through `scripts/run-infra.sh` and the targeted `infra/ansible/playbooks/onclave-onramp.yml`/`onclave_onramp` role. Apply only necessary source/checksum/image/runtime settings via the existing BWS workflow. Follow the current documented service-state backup/recovery boundary before changing live state. Preserve the existing data volumes, network layout, and other services; a full application deployment is not a global infrastructure apply.
  - `scripts/onclave-core-rollout.sh` is available only when its verified Compose/PostgreSQL-helper compatibility checks permit a core-only rollout. T5 can change Compose/env contracts, so do not bypass that refusal or claim a core-only image replacement deployed missing contract changes. Use the full managed application path when needed. Do not replace digest pins with mutable tags or local production builds.
  - Verify direct `/health` reports the expected source SHA and broker connectivity, `/ready` reports healthy dependencies, and signed vault lookup works. Exercise one disposable/test-tagged ingestion and terminal callback through the freshly loaded adapter to verify the deployed path. Do not reprocess an existing real vault item merely as a smoke test. Confirm original/analysis retrieval and coverage/filter state using the controlled test item; fixture tests remain the proof of precise timing/expiry cases.
  - Validate the merged Pi adapter in a fresh or safely reloaded default-profile session. Do not reload running subagents or unrelated active operator sessions. Existing sessions may need an operator reload; that does not substitute for validating the newly loaded adapter.
  - If deployment fails, follow homelab-infra's failure/recovery rules, preserve healthy services, and report the actual live state. Do not mark the plan complete because commits or images exist. No unrelated recovery/refactoring work is authorized.
  - Run homelab-infra `just validate` exactly once after all implementation and live work for this plan is otherwise finished, as that repository requires. Use only targeted checks during rollout and fixes.
  - Done when: the exact merged application revision is deployed, the affected live workflow passes the bounded checks, and the final homelab validation result is recorded.
  - Evidence: Not started.

- [ ] **T14: Record final completion and remove task-owned worktrees**
  - Depends on: T13 successful deployment and validation, or a later explicit operator change to the completion scope.
  - Owns: final archived-plan metadata/evidence commit and publication, and only task-owned worktree cleanup.
  - Follow closeout steps 6-7. Leave cleanup unchecked until it succeeds; report retained worktrees accurately.
  - Evidence: Not started.

### Useful concurrency

After T1, T2 (SponsorBlock helper), T5 (budget planner/config), T7 (callback payload), and T9 (adapter projection) have disjoint primary write ownership. T3 starts after T2/T7; T4 follows T3; T6 follows T4/T5; T8 follows T4 and can run alongside T6; T10 follows T8/T9. T11 consumes the integrated behavior; T12 merges/publishes, T13 deploys after merge, and T14 records completion/cleanup. This is a dependency map, not a requirement to run four agents. Shared final wiring/tests belong to the named integrating consumer; use smaller assignments when required.

## Actual implementation and publication evidence

- Execution profile: default. Dotfiles task worktree `C:/Users/mglenn/.dotfiles/.worktrees/youtube-vault-context`, branch `task/youtube-vault-context`; Onclave task commit `8349ffc9b09c632d39b5de8c8ce9c9a4c5c800a4`.
- Onclave implementation merged to `feature/v2-broker-core` as `72a666412d2292a4ec105d3b2b5eb6b97150d95b`, then CI exposed a credential-dependent extension test. The task-owned fix passed the full local check and was merged/published as `1d35d2320f154b24b61ad637b565184755b8f635`.
- Offline integrated validation on 2026-09-21: Onclave `pnpm run check` passed (319 passed, 1 skipped), including the CI fix; default profile typecheck passed; selected Pi tests passed (14); task-adapter smoke passed; both repositories passed `git diff --check`.
- Deployment, live verification, final homelab validation, completion metadata, and worktree cleanup remain pending. Next action owner: executor, after parent merge/publication and exact-SHA image availability.

## Agreed validation and current handoff

Implementation checks are offline and finite; T13 adds the authorized post-merge live deployment checks. Use the owning package's pnpm scripts. Focused tests above should run while changing their behavior; do not rerun unaffected suites after documentation-only edits.

Final integrated checks:

1. Onclave task root: `pnpm run check` (typecheck and configured Vitest suite). New tests use recorded/synthetic HTTP/model fixtures, not live SponsorBlock, paid model calls, or private inventory.
2. Dotfiles task root, `pi/profiles/default/`: `pnpm run typecheck` and `pnpm test onclave-pi.test.ts commands-lifecycle.test.ts prompt-template-commands.test.ts tool-visibility.test.ts` plus any new focused `/yt` guidance test.
3. Default profile: `node scripts/onclave-smoke.mjs` against the task-owned adapter. It is an installed-loader offline check, not a live ingest or broker acceptance test.
4. Both source repositories: `git diff --check`; verify the parent task loader resolves the task module, not an unrelated checkout.
5. After merge/publication: T13's exact-SHA CI/image checks, managed deployment, direct health/readiness/signed-vault checks, disposable ingestion/callback check, and fresh-adapter verification.
6. Homelab-infra: one final `just validate` after all implementation/live work is otherwise finished; not an intermediate per-task gate.

Proof fixtures must include: a short complete video; a long video with substantive conclusions beyond character 10,000; multiple sponsor intervals and conservative boundaries; a successful empty SponsorBlock lookup; a service failure; untimed supplied text; an old timestamped record with missing information; young/older/unknown-date no-match records crossing their retry-eligibility boundaries; an all-excluded video; and existing scalar-only summaries. Reuse these fixtures across relevant tests instead of building a separate evaluation system.

- Status: **ready**. A1 is resolved by explicit full-deployment-on-merge authorization. No runtime implementation or live deployment has begun.
- Completed planning work: current source inspection, read-only explorer findings on providers/chunking, and the requirements/contracts/tasks in this document.
- Actual planning profile: default. No implementation suites, live SponsorBlock requests, model-quality experiments, or deployment were performed for this plan.
- Next action: a plan execution request starts T1 and the recorded worktrees. Execution includes the already-authorized post-merge publication/deployment; do not reopen that permission.
- Open decisions/blockers: none currently. Record actual implementation or deployment blockers if discovered, with owner and next action.
- Verification limits: fixture tests prove request inputs, filtering, ordering, compatibility, and lifecycle, not real-model factual quality or crowdsourced SponsorBlock completeness. T13's live deployment checks are required agent-owned work. Broader old/new quality comparison on operator-selected existing transcripts and operator UX testing remain optional and must not overwrite stored items without explicit reprocessing permission.

## Closeout

On later execution, the publication and full post-merge deployment authorization above is already in force:

1. Finish implementation and finite offline checks. Record actual profile, revisions, checks, and results; leave integration, deployment, and cleanup pending. Continue independent available work around external prerequisites.
2. Commit module implementation in its own task repository. Merge into the canonical Onclave `feature/v2-broker-core` target without disturbing unrelated work. Pull/integrate remote updates normally as repository instructions require. Resolve routine conflicts within settled intent; rerun only checks whose checked content changed.
3. Push the module target to `origin/feature/v2-broker-core` without force and track the exact-SHA CI/image publication. Confirm source publication before committing the parent gitlink. If required homelab-infra source changes were made, commit/merge/publish those in their owning repository before updating its parent pin too. If publication fails, retain worktrees and report the actual integration boundary; do not bypass the module-first rule.
4. In the dotfiles task checkout, update the module pin to the published module commit. Confirm `.specs/archive/youtube-vault-context/` does not already contain another plan, move this entire spec directory there, repair affected links, and commit the dotfiles implementation/gitlink/archived spec on the task branch. Implementation must be finished before archival; leave deployment/cleanup tasks unchecked and overall status unfinished.
5. Unless explicitly disabled, merge the dotfiles task branch into the recorded `main` checkout and push its task changes, without stashing, discarding, or committing unrelated changes. Preserve the initial task-owned plan copy until it can be reconciled safely with the identical archived content. After the required merged revision's CI/image results pass, execute T13's full managed deployment. Routine merge conflicts and authorized deployment steps are agent-owned; ask only about consequential changes or prerequisites outside the recorded authority.
6. Verify the targets contain the intended changes, the parent has the archived spec with no stale active copy, and T13's deployment/validation has succeeded. Set archived `status: completed` and `completed: YYYY-MM-DD`, record actual commits, image digest, deployment and verification evidence without secrets, then commit and push that metadata update on the parent target. Do not mark cleanup finished until it is finished.
7. Remove only task-owned worktrees/branches with no uncommitted or unmerged work, module worktree before its containing parent worktree. Preserve all pre-existing worktrees. Record and publish the final cleanup evidence if it changes the archived spec. If cleanup remains, report it rather than claiming completion.

An explicit `--no-merge` instruction permits retaining committed task worktrees with integration intentionally pending and defers deployment until merge. It does not revoke the recorded publication/deployment authorization unless the operator says so, or bypass the module-before-parent-pin rule. Optional operator UX testing does not block closeout; the explicitly authorized agent-owned deployment and T13 checks do.

### Final execution response

Start with one explicit outcome:

- 🟢 **COMPLETED**: checks passed, module/parent merged and published in order, full managed deployment verified, completion metadata published, task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed but integration/publication blocked.
- 🔴 **NOT COMPLETE: DEPLOYMENT BLOCKED**: merged code exists but required image publication, rollout, live checks, or recovery is unfinished; state the actual deployed revision and next action.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or required permission prevents completion.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed, permitted commits made, and worktrees intentionally retained under no-merge instructions.
- 🟡 **CLEANUP PENDING**: changes and completion metadata integrated but worktree cleanup unfinished.

For blocked/cleanup outcomes, give **Reason** and **Action needed** first, including the actor and exact next action. Then briefly report checks, spec location, actual hashes/branches, module/parent publication, image/deployment state, and retained worktrees. Do not imply automatic resumption, lead a blocked result with passed checks, or call archival alone completion.
