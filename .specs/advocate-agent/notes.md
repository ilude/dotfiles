# Advocate agent: investigation and discussion notes

Updated: 2026-09-25. This is a discussion handoff, not an implementation plan or active policy.

## Resume here

- Source Pi session: `01a0d92b-d1a3-7795-8434-41b7df61e304`, profile `default`.
- That session's cwd is `C:/Projects/Work/Gitlab/monorepo`. This note is deliberately in the dotfiles repository so discussion can continue in the owning checkout. Resuming the saved session may retain its original cwd; starting a dotfiles session and reading this note avoids assuming otherwise.
- Intended working repository: `~/.dotfiles` (`C:/Users/mglenn/.dotfiles` on this machine).
- Current subject: designing a distinct, on-demand Advocate that understands Mike's demonstrated design and workflow preferences.
- All research workers have returned or failed and been replaced; none remains working for this investigation. No follow-up schedules were created here.
- Next useful discussion: review the candidate principles below, decide the Advocate's consultation boundary and knowledge organization, and only then authorize its implementation.

## Authorization and settled direction

Mike explicitly considers Advocate a recurring, distinct responsibility, not merely a new name for general advice. He authorized reviewing sessions referenced by the agent-process feedback logs, then expanded research to previously unread chats from the last three days. He authorized this notes file.

The research does **not** authorize creating the Advocate role, changing role routing, installing candidate principles as instructions, changing runtime behavior, committing, or pushing.

The intended distinctions are:

| Role | Question |
| --- | --- |
| Advocate | Which approach fits Mike's current intent and demonstrated design/workflow preferences? |
| Reviewer | What concrete defects exist? |
| Steward | Do applicable post-implementation findings justify more work? |

The proposed Advocate is advisory, not an approval gate. Current requests and applicable repository policy take precedence over inferred preferences. No mandatory consultation on every task has been agreed.

The user rejected the earlier tangent toward another universal "smallest possible change" rule. Do not revive it. Proportionality and scoped completeness are not minimum line count or minimum functionality.

## How the discussion reached this point

The original problem was recurring scope expansion: investigation findings and reviewer recommendations became new safeguards, infrastructure, tests, prerequisites, or completion conditions without an agreed need.

A whole-system review found substantial existing guidance against this behavior. The recurring problem is not simply an absent anti-overengineering rule. A particularly important failure point is the parent converting a suggestion into an implementation assignment, for example "address these findings," before determining which findings represent actual in-scope defects.

Mike noted that developers are often Luna-class models with strong implementation skills. Giving those workers unresolved product, scope, safeguard, and acceptance judgments can turn every suggestion into something to build. Historical evidence establishes assignment breadth and parent framing problems; it does not prove that Luna itself is the cause.

The proposed boundary was:

- The orchestrator or Team Lead evaluates findings and resolves consequential scope/behavior decisions before dispatch.
- The developer chooses routine implementation details and fixes demonstrated defects within the assigned behavior.
- A newly discovered choice changing scope, behavior, safeguards, or acceptance returns to the parent with concrete evidence.
- This must not become approval-seeking for every technical detail.

Advocate arose as a way to improve the parent's judgment at that boundary without loading every request with a large preference history.

## Completed instruction-composition work

Mike separately approved a concise source map of how Pi instructions reach a model. A writer added:

- [Pi instruction composition](../../pi/profiles/default/skills/pi-extension/references/instruction-composition.md)
- Discovery links from [prompting](../../pi/profiles/default/skills/prompting/SKILL.md) and [pi-extension](../../pi/profiles/default/skills/pi-extension/SKILL.md).

The reference covers native prompts, tool schemas/guidelines, context discovery, skills, generated delegation guidance, role prompts, child inheritance, commands, compaction, helper model calls, disk versus loaded resources, and provider serialization. Parent review corrected the compaction wording. Relative links and whitespace checks passed. No commit or reload was performed by this task.

Important findings from that review:

- A skill catalog is not the same as a loaded skill body.
- Children receive applicable context files and role/authority framing, not the parent's full conversation or all previously loaded skills.
- Assignments must therefore carry relevant settled decisions.
- Files on disk do not establish which resources an existing process has loaded.
- Stored prompt sections may omit extension-forced prompt text. Source reconstruction is not a captured provider request.
- Commit helpers, Damage Control, compaction, and child agents have distinct model-call compositions.
- Several historical defects already had source-level fixes. Do not use their old incidents as proof that the same defect remains active.

Do not preserve the reviewed session's prompt sizes, tool counts, model choice, or installed package hash as durable policy. Recheck current owning sources when needed.

## Two related proposals that remain unimplemented

### Refine the existing planning review

Location: `pi/profiles/default/skills/planning/SKILL.md`, the existing plan review step.

Proposed change: examine newly added tasks, dependencies, safeguards, and completion conditions, not only behavior-changing restrictions. For a safeguard, examine both the specific failure it prevents and the blocking conditions, dependencies, and maintenance burden it creates. Prefer existing mechanisms where they satisfy the actual need.

This would refine an existing review, not create another review stage, justification ledger, risk score, or approval framework. Routine implementation choices remain agent-owned. No edit has been approved or made for this proposal.

### Resolve findings before delegation

Location: shared caller and Team Lead guidance in `pi/profiles/default/lib/subagents/guidance.ts`.

Proposed direction:

> Assess findings before assigning implementation. Give developers resolved, bounded corrections rather than asking them to decide which recommendations should become requirements. Keep behavior, scope, safeguard, and acceptance decisions with the parent; leave routine implementation judgment with the developer.

Assignments should carry relevant outcomes, settled decisions, exclusions, and completion checks without repeating all global/repository instructions. Follow-up messages need the same boundary as initial dispatch. This is not a new required assignment schema. No edit has been approved or made.

## Research coverage and limitations

### Initial targeted review

Three Sol reviewers investigated feedback-log leads:

1. Successful plans versus gateway churn, initially seeded by AIF-013/014.
2. Proportionality and safeguards, seeded by AIF-024/031/041/045/050/054.
3. Intent, environment, and handoffs, seeded by AIF-083/085/092 and APR-072.

The first positive-design worker exceeded context before returning findings. A fresh worker completed a narrower recovery and located the original discussion in `01a07e8e-72fd-708c-b38f-2b05bff28bbc`.

Mike's original statement said most recent plans worked as expected and identified `web-fetch-gateway` as the churn exception. It did not individually endorse Bedrock, model-catalog, browser/image, analytics, Onclave, or loader-repair designs. Those names came from later assistant analysis. Do not label those projects as Mike-approved successes without stronger source evidence.

### Expanded three-day review

Frozen event-time interval:

`[2026-09-22T19:16:41.417221+00:00, 2026-09-25T19:16:41.417221+00:00)`

This was a rolling 72-hour window, not three midnight-to-midnight dates. Older sessions with activity inside it were included.

- Both default and legacy histories were inventoried.
- Native SQL inventory output was truncated; a streaming, read-only JSONL pass completed the metadata inventory rather than repeatedly staging the full corpus.
- Streaming pass examined 4,112 files, about 5.02 GB.
- 478 files had events in the window, all in default.
- 365 had explicit child lineage. Their assignments/results were not treated as independent Mike-authored preferences; they were available for targeted follow-up, not exhaustively semantically reviewed.
- 113 remaining files were orchestrator or unclassified sessions. Eleven had no unread visible text after selection.
- Deduplication used message ID, timestamp, role, and visible-text hash. Inherited copies were not counted as independent corroboration.
- Messages already represented in the current conversation were removed. Previously cited UserSearch and sandbox records were also excluded while retaining unread portions of partly sampled sessions.
- Six disjoint batches covered 102 files and 2,788 visible user/assistant messages. Every reviewer reported reading every assigned page.

| Batch | Sessions | Messages | Rendered pages |
| --- | ---: | ---: | --- |
| 1 | 17 | 424 | 0–12 |
| 2 | 17 | 436 | 0–12 |
| 3 | 17 | 483 | 0–13 |
| 4 | 17 | 600 | 0–13 |
| 5 | 17 | 407 | 0–12 |
| 6 | 17 | 438 | 0–12 |
| Total | 102 | 2,788 | 80 pages |

Limits:

- This is coverage of selected visible conversation text, not semantic review of every tool result, child transcript, attachment, or private helper call.
- Automated reminders, generated handoffs, Onclave messages, assistant summaries, and child reports were distinguished from direct operator testimony.
- Passing tests, merges, silence, and assistant declarations of success were not treated as satisfaction.
- One legacy historical backfill had an invalid native session header and was excluded. No malformed body records or missing timestamps were found in the streaming pass.
- Source files were live, not an immutable snapshot. Selection used the fixed event-time window and per-file byte horizons.
- Several reviewer citations were imprecise or attributed adjacent assistant wording to the operator. Parent checks corrected selected evidence used in the synthesis. Recheck exact sources before turning other report details into durable guidance.
- Workers encountered Windows output encoding failures and reran affected pages with UTF-8. They reported no unread ranges afterward.

Temporary metadata manifests and the read-only renderer are at `C:/Users/mglenn/AppData/Local/Temp/advocate-review-72h-kt7a6p4q/`. They contain offsets and coverage metadata, not a copied transcript corpus, and are optional recovery aids. Do not make durable knowledge depend on their survival. Full worker reports are in the source session above.

### Historical week: September 15–22

Frozen interval: `[2026-09-15T19:16:41.417221Z, 2026-09-22T19:16:41.417221Z)`.

- Both profiles and 4,142 files were inventoried. Qualifying visible text was in default only; one legacy historical-backfill header was invalid.
- After message deduplication and explicit-child exclusion, eight disjoint review batches semantically reviewed 158 sessions and 2,964 visible messages across all 93 rendered pages.
- No malformed bodies, oversized records, missing timestamps, read failures, source changes, or unread rendered ranges were reported.
- Review was complete for selected visible orchestrator/operator conversation text, not tools, thinking, attachments, private helper calls, or every child transcript.
- Parent spot-checks confirmed the promoted findings about proportionate experiments, production research, complete disclosure, real prerequisites, convention alignment, staffing boundaries, knowledge discovery, and mechanism tests.
- Temporary metadata and renderer: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-week-gr9f7h2d/`.

Strong additions:

- A short, representative disposable experiment can be the proportionate answer when it resolves a concrete uncertainty before an expensive operation. Do not turn its assistant-proposed staging into a general preference for gates.
- Opposition to speculative safeguards does not imply tolerance for repeated production retries without checking current authoritative guidance.
- A recommendation may be bounded, but the explanation should not hide other material known concerns. Disclosure does not authorize implementing all of them.
- A conservative or preferred sequence is not automatically a technical prerequisite.
- Equivalent cross-repository structures can improve developer discoverability without requiring structural identity.
- Plans should expose complexity and useful split points. Strategist, not the plan, chooses model, effort, or Team Lead staffing.
- Knowledge discovery should use small entry points, authoritative owners, and meaningful links rather than enlarging `AGENTS.md` into a knowledge store.
- A mechanism probe proves the mechanism, not actual workflow occurrence, cause, or improvement.

### Historical week: September 8–15

Frozen interval: `[2026-09-08T19:16:41.417221Z, 2026-09-15T19:16:41.417221Z)`.

- Both profiles and 4,142 files were inventoried. Qualifying records were in default only; one legacy historical-backfill header was invalid.
- Event-time selection found 667 active sessions. Deduplication and visible-text filtering produced 4,767 messages; explicit-child and prior-note exclusions left 4,739 previously unreviewed messages for evidence review.
- Six batches semantically reviewed all 228 rendered pages. A final metadata audit confirmed 228 successful, untruncated outputs with no gaps.
- Historical lineage markers were absent for many records, so unresolved sessions were retained conservatively and generated content was not treated automatically as operator testimony.
- No malformed bodies, oversized records, or missing non-header timestamps were found. Initial citation errors were corrected before promotion. Parent spot-checks confirmed the eight promoted source claims.
- Temporary metadata and renderer: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-7d-2026-09-08/`.

Strong additions:

- Completeness and proportional scope are simultaneous requirements. Preserve the functional outcome without turning validation into a larger certification program.
- Low ceremony does not mean the fewest possible options. Independent behavior dimensions may justify explicit choices without justifying process machinery.
- Evidence that something is feasible or available is not authorization to use that source as an implementation dependency or owner.
- Positive acceptance is specific to what was tested. It does not endorse adjacent UI or an entire design.
- Validation order should reflect runtime availability and the actual environment. Neither live acceptance nor experiments are universal prerequisites.
- Environment-specific controls can be appropriate without becoming unsolicited blockers.
- Planning should resolve consequential intent and then leave routine implementation flexibility to the executor.

## Candidate design principles

These are synthesis proposals, not new active rules. Their value is in the contrasts and boundaries, not slogans.

### Preserve the requested capability while removing unnecessary machinery

Mike rejected speculative gates and added subsystems, but also premature stopping, incomplete compatibility fixes, and broad workarounds that disabled useful behavior. Simplicity is not reduced functionality. Restoring a failed experiment is an intermediate state if the original issue remains unresolved.

### A useful check does not automatically deserve authority to block delivery

A live integration probe may provide valuable evidence while remaining report-only. Whether to run a check and whether it becomes acceptance gating are separate decisions. Passing adjacent checks also does not prove the actual credentialed, write, deployment, or consumer contract. Validation order must fit runtime availability and the actual environment; a preferred conservative sequence is not automatically a technical prerequisite.

### Complexity should earn its practical cost

Optimization should improve the real critical path while preserving meaningful behavior. Marginal experiments can be discarded, while a short representative experiment can be valuable when it cheaply resolves a concrete uncertainty before expensive work. A localized workaround can be appropriate when it preserves desired behavior and its reason is documented. Low ceremony does not mean the fewest possible useful options. This is not an absolute preference against complexity, hacks, abstraction, tests, or explicit behavior dimensions.

### Calibrate controls to consequences and the actual environment

Examples distinguish deployed artifacts and state-changing jobs from small utility jobs that fail visibly; production-compatible behavior from disposable dev data; model-context rendering limits from operational ceilings. Do not extrapolate a local decision into a universal rule that authenticated endpoints, development systems, or moving dependencies never need controls.

### Use established mechanisms, but do not defend them merely because they exist

New work should normally fit existing image, configuration, database, deployment, and ownership patterns. Equivalent structures across related repositories can improve discoverability for developers without requiring structural identity. A faithful environment copy should differ only where its purpose or isolation requires. Conversely, an old safety mechanism still needs a valid purpose before being described as necessary.

### Put specificity where it prevents wrong decisions

Mike wants concise always-loaded guidance and sufficiently concrete plans for smaller executors. Interfaces, ownership, runtime facts, exceptions, and agreed completion boundaries belong in the relevant plan/assignment when omission invites guessing. Do not respond by adding boilerplate or rigid fields to every handoff.

### Preserve architectural understanding in the correct home

Future agents should understand responsibilities, customizations, retained behavior, dependencies, relevant file relationships, and established reasons. Command catalogs alone are insufficient. Current developer documentation, accepted contracts, changelogs, investigations, proposed future state, and run evidence have different owners. Keep `AGENTS.md` as a concise entry point rather than a knowledge store; use authoritative ownership and meaningful cross-references. Skills may need to be self-contained when distributed without global instructions.

### Investigate deeply and explain concretely

Use the direct authoritative check when it can settle a fact. Trace exact versions, consumers, runtime-loaded artifacts, credential flows, and configuration before making causal claims. Reporting should name what happens, why it matters, and the remaining real choice. Depth of investigation does not require a verbose answer.

### Ask only what remains consequential after applying established intent

One-at-a-time discussion can be useful for genuinely independent decisions. It does not justify asking every checklist question once a governing requirement resolves the details. Provide recommendations for unresolved choices rather than asking Mike to perform the intermediate inventory or research.

### Keep authority and outcome states distinct

A recommendation is not a requirement; a command template is not necessarily Mike-authored intent; a child report is not proof of acceptance. Evidence that a capability or data source exists is not authorization to make it an implementation dependency or owner. Positive acceptance applies to the behavior actually tested, not adjacent UI or an entire design. Implementation, integration, publication, deployment, observation, and cleanup are separate states. Do not describe a successful merge as failed because monitoring remains. Inherited branch monitoring remains the parent's responsibility unless explicitly reassigned; do not generalize that into a ban on child scheduling or all continuation of authorized work.

### Delegate with a sensible middle ground

Avoid both overloaded workers and automatic role proliferation. Parents correlate evidence and resolve scope judgments. Planning exposes task complexity, dependencies, and useful split points; Strategist selects staffing rather than plans hard-coding model and effort. Workers receive coherent implementation outcomes and retain ordinary engineering judgment. Keep live children only for a concrete follow-up, not hypothetical future use. Model-specific choices in historical incidents are contextual evidence, not a new standing routing policy.

## Selected evidence anchors

These are short references for later source retrieval, not exhaustive citations for every candidate principle. IDs identify native Pi sessions and message records. Avoid treating copied fork occurrences as additional evidence.

### Parent spot-checked from September 15–22

| Subject | Session / record | Evidence |
| --- | --- | --- |
| Proportionate disposable experiment | `01a0c96b-6713-716f-8ae6-6ec6e36e26a1` / `688b0a47`, `ef49d5ec`, `a5db0370` | Requested a shorter failure window, a roughly 30-second Dockerfile, and a pushed branch before repeated expensive KMIS builds. |
| Production research before retries | `01a0bb05-43a7-7507-8a4d-01ff1ad9367b` / `0c3ea967` | Challenged repeated upgrade action that had not checked current authoritative guidance. |
| Full disclosure versus bounded action | `01a0b04d-79de-75fd-a659-865017db9ab3` / `114fa20d` | Objected when a bounded recommendation omitted the wider known problem. |
| Preferred sequence versus prerequisite | `01a0acad-f5d2-738a-942f-f5858de7a2c4` / `87b0c597` | Challenged an assertion that Terraform apply could not proceed; the assistant acknowledged the sequence was conservative rather than technically mandatory. |
| Cross-repository convention alignment | `01a0ab78-882f-75e0-86b8-c2795f778c5f` / `8a8a5d07` | Wanted EISA and MPS deployment structures aligned where reasonable so developers know where to look. |
| Plan complexity versus staffing | `01a0ac48-105e-70e2-92a0-eebad64ae1b5` / `fcb17b77`, `9a7795c4` | Wanted manageable tasks but model/effort choices inferred by Strategist rather than embedded in plans. |
| Discoverable knowledge, not larger AGENTS | `01a0ca55-3135-716f-8ae6-6ecb6eef9e1a` / `d5e3ea2f`, `2d10aed2` | Wanted existing knowledge findable and explicitly rejected putting everything into `AGENTS.md`. |
| Mechanism test versus real review | `01a0b4a3-cc8f-7602-b5d1-4154d7d3f485` / `641c7e16`, `176f87c1` | Wanted observed blocking reasons reviewed across sessions, not only proof that logging worked. |

### Parent spot-checked from September 8–15

| Subject | Session / record | Evidence |
| --- | --- | --- |
| Completeness with proportional validation | `01a08e05-18de-704f-b829-dff25db0e562` / `5ad277de`, `ce7df208`, `d40b8859` | Required working authentication and operations, rejected a scope-expanded matrix, and selected CAC deployment plus manual testing with telemetry. |
| Useful option axes without ceremony | `01a087b2-0efe-7714-81ec-d42a0666460a` / `663f4c11`, `0d5b9d15` | Proposed independent delivery and response-expectation choices, then approved the plan update. |
| Evidence is not implementation authority | `01a082be-bccf-71b7-8df4-06532f20fabe` / `e33b6a7a` | Clarified that proving user-level information existed did not authorize using that repository for implementation. |
| Acceptance is specific | `01a08398-f458-720a-95cf-9d0b3e9e21f9` / `8e532f57`, `5a11122b` | Confirmed tested behavior worked while rejecting an adjacent output widget. |
| Runtime-aware validation order | `01a086c1-d843-73a1-97ce-023e673ac32e` / `c60ef5e0`, `11fd3c08` | Identified the chicken-and-egg problem in testing isolated-worktree code before merge and set the completion boundary. |
| Environment-specific controls | `01a086ce-2c1a-70a4-a47f-d99225d223fc` / `838fc0a3`, `fa908426` | Distinguished external ingress from internal development use and rejected a 36-rule design. |
| Unsolicited blocker versus justified alternative | `01a08e21-a487-7315-b6d7-a4749c6feb74` / `a4b92a4c`, `3af33128` | Objected to unapproved security requirements, then accepted the alternative after concrete explanation. |
| Intent in planning, flexibility in execution | `01a086d2-7845-7714-81ec-d3c9637d2c6d` / `6c99b279`, `b21f6223`, `446b556a`, `f30363d9` | Required plans to capture consequential intent while remaining low ceremony and leaving implementation intelligence to the agent. |

### Parent spot-checked during the initial investigation

| Subject | Session / record | Evidence |
| --- | --- | --- |
| Reject low-value optimization | `01a0ce70-d698-71f2-96c0-e97290bc9362` / `96db492f`, `d0022f64` | Asked whether changes meaningfully improved code/deployment, then directed cleanup because they were not worth it. The question is record ordinal 6029, not 6033 as first reported. |
| Useful probes can be report-only | `01a0ced1-8627-716f-8ae6-6ed2c36d3b37` / `dd04c57d` | Explicitly said the failure should be reported, not block acceptance "for now." |
| Consequence-based pinning | `01a0d1d8-ef9d-766e-9c89-5c547e7c8731` / `50f6eba3` | Distinguished appropriate image pinning from small tooling jobs allowed to use latest tags and fail fast. |
| Faithful environment defaults | `01a0ceda-4002-7365-b0ab-8f24b4776196` / `d4bf6633`, `ecef23a3` | Required equivalence except AWS-environment necessities; later rejected asking again whether it should persist. |
| Architectural understanding | `01a0cf3b-844a-777e-aa8f-a48c77fdd176` / `706892f4`, `e112a3d6` | Wanted understanding that informs future changes; separately required assuming standalone skills may lack global instructions. |
| Plans for smaller executors | `01a0d5e4-47e6-744b-b453-63177e894338` / `392ea31a` | Asked whether the plan was detailed enough to prevent a smaller model making bad assumptions. |
| Natural validation boundary | `01a0ce2e-a84d-71f2-96c0-e97185173a01` / `7d3d1893` | Authorized image work validated as building valid images, not separate validation of every minor change. |
| Accept a local workaround | `01a0cfe3-f95c-72b7-bcc4-e1b8cebb4c19` / `9280cf4b` | Accepted the notification alternative and requested a comment to preserve why it existed. Retrieve the adjacent proposal before generalizing its mechanism. |
| Explicit API semantics | `01a0d3b2-3825-7393-ba63-7619fb814ded` / `1ae308e5`, `14137689` | Objected to identical syntax implying different ANY/ALL behavior, then requested a plan. |
| Parent-owned synthesis | `01a0d531-1f1a-749a-bda2-1ff7d6222c41` / `90a14439` | Said the orchestrator should correlate/consolidate other agents' findings and use a writer if needed. |
| Avoid delegation overreaction | `01a0d4e4-c99a-7500-aada-813b6db55846` / `9485fea8` | Rejected going from an inadequate solution to an excessive one, asking for a middle ground. |
| Trivial commit interruption | `01a0d00d-4421-72b7-bcc4-e1d9b5e6bb1a` / `d3b3aa32` | Wanted `/commit` to fix or ignore trivial whitespace rather than stop for operator intervention. Not general permission to ignore repository checks. |
| Reuse deployment conventions | `01a0d8df-9ae0-730f-8758-1ab0aaabdde7` / `924a02eb` | Said ICP should use existing convention/configuration-as-code workflows unless a concrete exception is discussed. |

### Additional source leads verified by the initial reviewers

- `01a07e8e-72fd-708c-b38f-2b05bff28bbc`: `2ba563b1` is the collective successful-plan comparison; `f2395795` requests questions/recommendations for planning uncertainty; `2685b36a` asks to avoid ceremony; `9d66745c` requests worktree execution, merge-back, and archival; `8dcc8907` approves the adjacent combined changes. None is standing push authorization.
- `01a09b46-74f9-70bb-989d-7bed421a1784`: records 280–305 cover unsupported transcript-download controls and the parent treating reviewer safeguards as proposals. Some assignment provenance was reported through historical log text; inspect original dispatches if that causal sequence matters.
- `01a09221-27b5-7739-bbb8-dff21f3ff2a9`: records 225–233 cover rejection of fixed conversation caps and approval of actual-context-boundary trimming. Established harm protections were deliberately retained.
- Planning `01a0b598-8155-700a-9da8-10cae221bf5b`, record `60715761`, and execution `01a0b6d3-a81b-7507-8a4d-01e67f21a751`, records `a86499d0` and `6c215f29`: settled not-yet-live dev intent was lost when execution introduced a disposable-cluster prerequisite; Mike directed plan correction and completion.
- `01a0d5e4-47e6-744b-b453-63177e894338`, records `2e85e731` and `106ee172`: demands for concrete UserSearch explanations and provenance before changing production-derived behavior to satisfy a new synthetic test.

Do not directly reuse vague reviewer coordinates such as truncated record IDs or "user 807." Recover the exact native message and adjacent context first.

## Recommended Advocate shape, still for discussion

Purpose:

> Given the problem, context, and available approaches, help the orchestrator identify which approach is most consistent with how Mike would likely reason about and solve it.

The Advocate is a preference-aware design and workflow advisor, not an abstract compliance mechanism, checklist runner, or additional review gate. It reasons holistically about the proposed procedure or sequence of steps. Validation, safeguards, sequencing, complexity, workflow effects, and architecture are evidence it may weigh when comparing approaches; they are not separate Advocate programs.

It should explain the relevant demonstrated preferences, important contextual limits, and where evidence is weak or conflicting. This should catch underengineering and premature stopping as well as overengineering. It should not caricature Mike as disliking tests, safeguards, structure, recovery, detailed plans, or technical depth.

Proposed knowledge organization:

1. A concise role prompt containing responsibility, authority limits, and how to handle uncertainty.
2. On-demand references grouped by actual decision areas, not a giant always-loaded biography or failure log.
3. Each useful precedent explains the situation, selected approach, rejected alternative, reason, context, and exception. Clearly distinguish explicit decisions from tentative inference.
4. Current decisions supersede older examples. A merge or absent complaint is not evidence of satisfaction.
5. Preserve source pointers without copying private transcripts or incidental operational data. Respect explicit requests not to preserve a rejected rationale; do not revive it as a future constraint.

Potential consultation moments:

- The orchestrator has a proposed procedure or set of steps and wants to know whether Mike would likely approach the problem that way.
- Several technically valid designs differ materially in workflow, complexity, validation, safeguards, architecture, or operating burden.
- A parent is about to turn review recommendations into implementation assignments.
- Existing conventions and a proposed exception need contextual comparison.

Possible response shape, not a required schema: recommend the fit, explain the relevant precedent and its limit, identify conflict with the current request, and ask a focused question only if needed. No scores, approval authority, or mandatory additional review cycle proposed.

## Agreed learning loop with agent-process

Mike agreed to the following design. It is not implemented yet; this records the intended workflow rather than changing active skill instructions.

- Preserve the current agent-process timing and feedback triggers. The orchestrator handles the immediate correction; deeper investigation and knowledge maintenance run in a writable background worker to avoid filling the active task context with historical analysis.
- That worker makes the learning judgment during the triggered investigation, before reporting back. No separate reviewer, periodic review, or fixed incident-count threshold is required.
- The decision is whether feedback provides a supported reason to change Advocate's advice on a future comparable problem. One explicit general correction can suffice; repeated comparable decisions can support an inferred heuristic. Repeated failure to follow adequate guidance does not by itself warrant rewriting it.
- If existing knowledge already covers the feedback, report the corrective action without manufacturing a knowledge change.
- Under the agreed standing write boundary, maintain feedback records and Advocate learning references directly: precedents, inferred preferences, heuristic purposes, applicability, exceptions, and uncertainty. Compare proposed revisions with earlier evidence so new feedback does not erase relevant contrasts.
- Changes to Advocate's core instructions, authority, responsibilities, permissions, or consultation triggers remain specific proposals for Mike's approval. Material ambiguity returns as a focused question, not an invented preference.
- Return only the corrective action relevant to the current task, a brief account of knowledge changes, and any consequential question or core-instruction proposal. Raw history and exploratory analysis stay in the child context. Subsequent Advocate consultations use the updated references.

The guiding distinction is understanding why a rule of thumb helps and when departing from it better preserves Mike's intent. Learning should improve that judgment, not accumulate mechanical classifications or exceptionless rules.

## Open decisions and cautions

- Exact role prompt, reference layout, model/effort, tools, and consultation routing are not selected.
- Decide whether Advocate should assess the premise of added machinery while leaving technical defect verification to Reviewer and staffing to Strategist. Recommended: yes.
- Working definition, more objective than "identify the full material problem": Advocate checks whether a recommendation discloses known, evidenced concerns that could change Mike's decision. A concern is material when evidence shows it could affect outcome achievement, scope or acceptance, operating risk or burden, sequencing or prerequisites, or the choice being requested. Classify known concerns as included, deferred, not material with a brief reason, or unresolved. Advocate is not expected to discover every possible issue, and disclosure does not authorize implementing every concern.
- Do not split completion conditions, validation, workflow, UX, safeguards, or architecture into independent Advocate review functions. Treat them as contextual evidence when judging whether a proposed procedure or sequence resembles how Mike would likely solve the problem.
- Derive useful rules of thumb from repeated decisions and apply them to new problems. Ground them in demonstrated evidence, explain relevant contextual limits or exceptions, and revise them when later evidence conflicts. Distinguish an established heuristic from a context-specific precedent or uncertain inference when that distinction affects the recommendation. Do not require fixed labels, scores, or an evidence schema. Current intent and applicable repository policy take precedence.
- When tactical restoration conflicts with an established architecture, Advocate should expose the tradeoff rather than assume speed or conformity always wins; confirm whether this is part of its remit.
- Reconfirm current consultation routing rather than importing historical approval boundaries for larger-model or Steward calls.
- Do not adopt every candidate principle verbatim. Many already exist in active guidance; examples and discrimination may add more value than more imperatives.
- Positive whole-design satisfaction remains less established than explicit acceptance of particular choices. The broad review adds useful positive tradeoffs, not a verified list of favorite complete systems.
- Findings are concentrated in Pi tooling and MPS/EISA/platform work. Do not claim they establish preferences for every domain.
- The Advocate must not promote old task-specific approval into standing permission to mutate, deploy, publish, or change another repository.
- Plans and source instructions may have changed concurrently during this discussion. Re-read current owners before proposing edits.
- At note creation, dotfiles status already included unrelated `.specs/smarter-log-analytics-execution/` and the instruction-composition reference directory. Earlier global instruction edits were no longer listed as dirty; this task did not determine who integrated them. Preserve all existing work and do not claim commit ownership.
- MPS documentation cleanup and ICP restoration remain separate paused work. This handoff does not authorize resuming implementation or deployment there.
