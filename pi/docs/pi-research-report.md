# Pi research report

This report integrates the bounded research record for the current Pi runtime. It is a retrospective observational report, not a model evaluation, prevalence study, or policy change. The owning runtime overview is [Pi Agent Setup](../README.md). Current repository-source claims use baseline commit `31ad63e3dfa4d45eb15ae9c8a15d8b62d28ac3da`; installed-package claims use `@earendil-works/pi-coding-agent@0.84.1`. [SRC-001; SRC-005]

## Executive summary

The preserved quantitative snapshot reports that, after the first observed GPT-5.6 selection at `2026-07-09T23:17:59.552Z`, complete sessions containing only GPT-5.6-family assistant messages had higher marginal medians for tool-call blocks, edits or writes, error-marked tool results, output tokens, and elapsed duration than complete non-GPT-5.6 sessions in the preceding equal-duration window. Median user turns were lower, and median delegation calls and compactions remained zero. These are unadjusted metadata proxies, not semantic measures of over-engineering, churn, quality, or value. The boundary has a primary canonical record, but the aggregate values are artifact-reported snapshot results and cannot be reproduced exactly without the missing frozen corpus provenance. [SES-005; TMP-001; TMP-008]

Four selected sessions provide report-grade observations: a persistent identical-edit failure loop; two reviews of the same security surface followed by direct user criticism of the sequence; a change to another client-owned file during Pi-scoped work followed by correction and verified reversion; and mandatory plan-lint ceremony that was executed and then rejected. These observations establish that the events occurred in selected sessions. They do not supply a denominator, establish objective necessity from criticism alone, or identify a model effect. [SES-001; SES-002; SES-003; SES-004; TMP-007]

Within the supplied primary records, Git history, and artifact snapshot, the study does not identify a positive GPT-5.6 causal effect. Model family changed with calendar time alongside recoverable process-policy changes, while the snapshot reports uncontrolled task and role selection, effort, instructions, active tools, workflow entrypoints, repository, session duration, and model switching. It also reports only two atypically short post-period non-GPT-5.6 sessions and same-family, mixed-model, poorly matched, contaminated, or non-independent reviewed controls. [SES-001; SES-002; SES-003; SES-004; SES-005; GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006; TMP-001; TMP-006; TMP-008]

Two sessions retrospectively assessed as clean same-family controls show that churn and over-engineering were not inevitable under the observed GPT-5.6 use. Their primary records cover low and medium activity, not a clean high-activity comparison, and they do not estimate average risk or a non-GPT-5.6 counterfactual. Cleanliness is a retrospective artifact judgment, not a property encoded by the primary records. [SES-006; SES-007; TMP-006; TMP-008]

The current source contains both expansion paths and restraints. Conditional instruction delivery, tool activation, workflow bodies, task or subagent entrypoints, validation repair, and compaction can add process steps when their predicates hold. Governing policy, deferred tools, explicit entrypoints, bounded repair, deduplication, and stopping guards constrain those paths. The observed sessions lack the resolved prompt, extension order, settings snapshot, and event timeline needed to attribute any selected event to one mechanism. [SRC-005; SRC-008; SRC-009; SRC-010; SRC-012; SRC-015; SRC-018; SRC-019; TMP-008]

The disposable design snapshots recommend a set of reversible, preregistered experiments after a strict readiness gate, consistent with current governing restraints. This is rerun guidance rather than frozen protocol authority. No experiment has run, and nothing in this report authorizes a permanent policy change, removal of safety controls, or cumulative rollout. [SRC-005; TMP-010; TMP-011]

## Scope and research questions

The report asks five bounded questions:

1. What metadata differences does the preserved snapshot report before and after the first observed GPT-5.6 selection under one fixed cohort definition? [SES-005; TMP-001]
2. Which selected session events survive the final citation and methodology adjudication? [SES-001; SES-002; SES-003; SES-004; TMP-007]
3. Which current prompt, instruction, tool, workflow, and context mechanisms could add or restrain process steps when activated? [SRC-001; SRC-002; SRC-003; SRC-004; SRC-005]
4. Which model-policy and runtime changes occurred concurrently and therefore confound historical attribution? [GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006; GIT-007; GIT-008; GIT-009; GIT-010; GIT-011; GIT-012; GIT-013; GIT-014; GIT-015; GIT-016]
5. Which isolated experiments do the design snapshots prescribe to distinguish the proposed mechanisms while preserving safety, ownership, mandatory validation, and completion guardrails? [SRC-005; TMP-010; TMP-011]

The report does not estimate GPT-5.6 prevalence, a percentage increase in semantic churn, statistical significance, an adjusted model effect, a natural experiment, or complete unbiased corpus coverage. It does not generalize to Luna, all providers, all roles, all repositories, or all task classes. [TMP-007; TMP-008]

## Definitions

| Term | Operational definition in this report | Boundary |
| --- | --- | --- |
| Session | One canonical session filename whose first and last parseable timestamps fall inside the applicable quantitative window. [TMP-001] | Shards used inconsistent header-ID, filename-fallback, exclusion, and sole-session-entry rules. [TMP-002; TMP-007] |
| GPT-5.6-family exposure | Assistant messages contain Sol or Terra GPT-5.6 family models and no other assistant model family. [TMP-001] | Family-pure does not mean one exact tier or one effort level; Sol and Terra switching is allowed. Luna was after the cutoff. [TMP-001; TMP-008] |
| Complete session | The session starts and ends inside its window. [TMP-001] | Boundary-crossing and cutoff-crossing sessions are excluded. [TMP-001] |
| Tool calls | Assistant tool-call blocks in the quantitative artifact. [TMP-001] | Other artifacts may count tool results or deduplicated calls, so their totals are not interchangeable. [TMP-006; TMP-007] |
| Edits or writes | Calls named `write`, `edit`, `text_edit`, or `structured_edit`. [TMP-001] | A call count does not measure changed lines, semantic size, correctness, or necessity. [TMP-007] |
| Failed tool result | A tool-result entry with `isError=true`. [TMP-001] | It is an error proxy, not automatically a retry, failed task attempt, or unnecessary action. [TMP-007; TMP-008] |
| Equivalent retry | Repetition with materially equivalent arguments, target, relevant state, and result. [TMP-007] | Error totals alone do not establish equivalence. [TMP-007] |
| Duration | Last parseable timestamp minus first parseable timestamp. [TMP-001] | It includes idle time, background activity, and resumed-session gaps. [TMP-007] |
| Direct feedback | A nonempty `directUserFeedback` array in control reviews. [TMP-006] | It includes requests, approvals, clarifications, success statements, and criticism; it is not a criticism rate. [TMP-006; TMP-007] |
| Clean control | Both over-engineering and churn were retrospectively assessed as absent. [SES-006; SES-007; TMP-006] | Cleanliness is an artifact judgment; it is a counterexample, not proof of task comparability or a non-GPT-5.6 counterfactual. [TMP-008] |
| Over-engineering | A retrospective case judgment that implementation or ceremony exceeded or contradicted evidenced scope or the owning workflow. [TMP-007] | No stable, blinded, prespecified rubric separated optional advice, prudent safeguards, workflow requirements, and unnecessary implementation. [TMP-007] |
| Churn | A retrospective case judgment based on supported equivalent retries, repeated review or validation, redesign, scope shifts, polling, or interruption. [TMP-007] | No common threshold, equivalence rule, or severity anchor was prespecified. [TMP-007] |
| Observation | A bounded fact supported by current source, an immutable Git object, a sanitized canonical session locator, or a clearly labeled artifact-reported snapshot calculation. | Raw session records establish recorded events, not external system truth, semantic necessity, or causation; snapshot calculations carry their stated provenance limits. [TMP-007] |
| Hypothesis | A proposed mechanism consistent with some observations and paired with counterevidence and a falsifier. | A hypothesis is not a finding that the mechanism activated in an observed session. [TMP-008] |
| Unknown | A quantity, activation state, identity, or causal relation not established by the supplied evidence. | Unavailable values are not treated as zero. [TMP-007] |

## Method and evidence boundaries

### Study design

The study is a retrospective observational analysis of one local Pi session corpus. It combines a metadata-only pre/post comparison, eight sharded screening artifacts, a candidate manifest and 19 candidate deep reviews, metadata-selected controls and 12 control reviews, source and Git-history audits, and final methodology and causality adjudications. The design supports bounded descriptions of supplied artifacts and selected events, not prevalence, rates, adjusted effects, or model causation. [TMP-002; TMP-003; TMP-004; TMP-005; TMP-006; TMP-007; TMP-008]

The quantitative analysis used the canonical `session_entries` view over `~/.pi/agent/sessions/**/*.jsonl*`. It did not union overlapping archived history. It selected no raw prompt, response, thinking, tool argument, or tool output content. All reported timestamps are UTC. [SRC-037; TMP-001]

### Time boundary and cohorts

The boundary is the first observed Sol model-selection event, not a verified release, deployment, setting change, or exogenous intervention. The canonical Sol record is at physical line 400, entry `423843eb`, timestamp `2026-07-09T23:17:59.552Z`; the quantitative snapshot reports that this is the corpus-wide minimum. It reports Terra at `2026-07-10T03:37:09.834Z` and Luna at `2026-08-12T00:39:15.704Z`. Luna is outside the complete-data cutoff of `2026-08-12T00:00:00Z`. [SES-005; TMP-001; TMP-008]

The pre and post windows each span 33 days, 42 minutes, and 0.448 seconds. Equal duration does not establish balance on tasks, repositories, roles, effort, tools, workflow, or user intent. [TMP-001; TMP-008]

| Cohort | Inclusive start | Exclusive end | Sessions | Inclusion rule |
| --- | --- | --- | ---: | --- |
| Pre non-GPT-5.6 | `2026-06-06T22:35:59.104Z` | `2026-07-09T23:17:59.552Z` | 188 | Complete in-window session, no Sol or Terra assistant messages, and at least one other modeled assistant message. [TMP-001] |
| Post GPT-5.6 family | `2026-07-09T23:17:59.552Z` | `2026-08-12T00:00:00Z` | 163 | Complete in-window session, Sol or Terra assistant messages, and no other-model assistant messages. [TMP-001] |
| Post non-GPT-5.6 | `2026-07-09T23:17:59.552Z` | `2026-08-12T00:00:00Z` | 2 | Complete in-window session, no Sol or Terra assistant messages, and at least one other modeled assistant message. [TMP-001] |

Three pre-window mixed or boundary-crossing sessions, three post-window GPT-5.6 sessions crossing the cutoff, and four post-window mixed sessions were excluded. The two contemporaneous non-GPT-5.6 sessions were too few and atypically short for adjustment, and their identities were not supplied for semantic review. [TMP-001; TMP-006; TMP-008]

### Source quality and missing data

| Measure | Reported value | Interpretation |
| --- | ---: | --- |
| Canonical source files | 2,118 | File-level inventory count. [TMP-001] |
| Validated rows | 277,416 | Reported validator count. [TMP-001] |
| Loaded entries | 277,535 | Reported query count; its difference from validated rows is unresolved. [TMP-001; TMP-007] |
| Malformed rows | 0 | No malformed-row opt-in was used; this says nothing about citation metadata. [TMP-001; TMP-007] |
| Entries missing timestamps | 2,052 | They could not supply a parseable session start or end. [TMP-001] |
| Non-null but unparsable timestamps | 0 | None reported. [TMP-001] |
| Assistant messages missing model metadata | 0 | None reported. [TMP-001] |
| Tool results missing `isError` | 0 | None reported. [TMP-001] |
| Files missing inventory ID or start | 1,184 | Legacy timing gaps prevent complete temporal inventory coverage. [TMP-001; TMP-007] |

File-level and row-level measures are distinct denominators. Zero malformed JSONL rows does not imply complete timing, complete corpus coverage, or valid citation coordinates. [TMP-001; TMP-007]

### Sharding, selection, and citation audit

Screening used eight declared partitions with `MOD(HASH(session_key), 8) = partition`, but `session_key` and membership rules differed across artifacts. The eight labels 0 through 7 occurred once each; declared coverage totaled 193 while manifests contained 191 unique IDs, with one-row deficits in partitions 3 and 6. Declared end times exceeded manifest maxima in partitions 0, 1, and 7, and two shard model declarations omitted Luna. The cause of these differences is unknown. [TMP-002; TMP-007]

| Partition | Declared coverage | Manifest rows | Difference |
| ---: | ---: | ---: | ---: |
| 0 | 15 | 15 | 0 |
| 1 | 20 | 20 | 0 |
| 2 | 27 | 27 | 0 |
| 3 | 25 | 24 | -1 |
| 4 | 18 | 18 | 0 |
| 5 | 34 | 34 | 0 |
| 6 | 27 | 26 | -1 |
| 7 | 27 | 27 | 0 |
| Total | 193 | 191 | -2 |

Candidate selection favored high-volume, error-heavy, and user-corrected sessions. It produced 19 candidates and 27 declared counterexamples, but it was designed to find examples rather than estimate a representative distribution. Low-volume expansion, quiet failure, and justified high-volume work could be missed. [TMP-002; TMP-003; TMP-007]

The 19 candidate IDs each mapped to one deep-review artifact across five heterogeneous schemas. Of 57 sampled candidate citation objects and 58 raw coordinates, 47 asserted line, entry-ID, and timestamp tuples passed, seven failed, and three lacked tuple metadata. Four findings survived as report-grade, 12 require qualification, and three were excluded. These are adjudication dispositions, not rates. [TMP-005; TMP-007]

Metadata matching used post-boundary timing, GPT-5.6-family status, user turns, and reported tool-call scale. Its low, medium, and high bands were 42 or fewer, 43 through 279, and 280 or more reported calls. Duration, task identity, task difficulty, repository or topic, and independence were unavailable, and reported call values were not normalized across shards. [TMP-004; TMP-006]

Only 12 controls received dedicated reviews: six same-family counterexamples, five nominally matched same-family controls, and one mixed pre-boundary control. No contemporaneous pure non-GPT-5.6 control was reviewed. The extended control audit found 112 passing raw tuples, 16 identity or timestamp mismatches, and two out-of-bounds lines among 130 assertions; another citation used a non-raw artifact. [TMP-006; TMP-007]

Ten of 12 controls had at least one mixed or present assessment, all five nominally matched controls were non-clean, and no clean high-activity control remained. Two controls shared 311 raw entry IDs, equal to 99.7 percent of the smaller source, and another control shared ancestry with a candidate. Independent-control counts and pairwise effect estimates are therefore invalid. [TMP-006; TMP-007]

### Evidence hierarchy and privacy boundary

Current behavior claims rely on tracked source at the recorded baseline or the versioned installed package. Historical change claims rely on full Git object IDs, dates, paths, and diff hunks. Selected session events, the first-selection boundary, and the two control records rely on sanitized canonical-session paths, 1-based lines, entry IDs, and timestamps. Disposable artifacts document snapshot calculations and adjudications but do not replace raw or source citations when those exist. [SRC-005; SES-001; SES-002; SES-003; SES-004; SES-005; SES-006; SES-007; TMP-009]

The raw boundary was limited to coordinates cited by candidate or control artifacts plus the minimized first-selection locator. The report does not claim a complete transcript audit or reproduce raw content. [SES-005; TMP-007]

## Evidence and results

### Marginal metadata results

The values in this section are historical snapshot results reported by `TMP-001`. They are not exactly reproducible from preserved provenance because the contemporaneous corpus inventory, complete query hashes, generated UTC, validator scripts, and per-artifact row counts were not frozen.

| Metadata proxy | Pre non-GPT-5.6, n = 188 | Post GPT-5.6 family, n = 163 | Post non-GPT-5.6, n = 2 |
| --- | ---: | ---: | ---: |
| User turns | 7 | 5 | 2.5 |
| Tool-call blocks | 66.5 | 100 | 0.5 |
| Edits or writes | 4 | 10 | 0 |
| Error-marked tool results | 5 | 7 | 0 |
| Delegation calls | 0 | 0 | 0 |
| Task calls | 0 | 0 | 0 |
| Schedule calls | 0 | 0 | 0 |
| Compactions | 0 | 0 | 0 |
| Output tokens | 21,364 | 27,460 | 7,528 |
| Duration in seconds | 9,089.886 | 10,035.169 | 356.341 |

The table contains separate marginal medians. Dividing them does not estimate a typical per-turn rate. No uncertainty interval, task adjustment, or hypothesis test was supplied. [TMP-001; TMP-008]

The pattern was not uniform. Median user turns fell from 7 to 5, delegation and compaction medians stayed zero, and the duration 90th percentile was lower post-boundary at 89,343.828 seconds versus 141,780.516 seconds before the boundary. The distributions were strongly right-skewed. [TMP-001; TMP-008]

One artifact text claimed 13 sessions had at least six upper-fence flags, while its listed rows show 12 with at least six and one with five. The report therefore omits an exact upper-fence session count. It also does not describe compactions as having a higher median because both medians are zero. [TMP-001; TMP-008]

Metadata can establish recorded selection times, cohort counts under explicit rules, marginal distributions, right-skew, and candidates for bounded semantic review. It cannot establish whether an action was necessary, whether an error was an equivalent retry, whether work was correct or useful, semantic prevalence, a false-positive rate, an adjusted effect, or a causal effect. [TMP-001; TMP-007; TMP-008]

### Report-grade selected events

| Case | Sanitized observation | Interpretation boundary |
| --- | --- | --- |
| RG-1 | Identical edit requests and matching errors recur near the beginning, midpoint, and end of a long sequence; the final identical request is recorded as aborted. [SES-001; TMP-007] | The persistent loop is report-grade. A separate deep review counted 1,211 calls, but the bounded final audit did not independently re-enumerate that total, so it is not reported as a verified count. [TMP-007] |
| RG-2 | Two security-review results revisit the same scoped surface, followed by direct user criticism identifying the sequence as churn. [SES-002; TMP-007] | The sequence is observed; the evidence does not prove that every finding in either review was unnecessary. [TMP-007] |
| RG-3 | A file owned by another client was changed during Pi-scoped work, followed by user correction, a direction to revert, and successful revert verification. [SES-003; TMP-007] | A later Pi-native implementation was separately authorized and is not counted as unauthorized churn. [TMP-007] |
| RG-4 | Injected workflow text made plan lint mandatory, the lint was executed successfully, and the user then rejected that ceremony. [SES-004; TMP-007] | A separate claimed five-result warning was not independently reconstructed and is excluded. [TMP-007] |

User criticism establishes stated preference and perceived scope mismatch. It does not by itself prove objective technical unnecessaryness. Raw records establish the recorded sequence, not external system truth or model causation. [TMP-007]

### Qualified findings, controls, and exclusions

The normalized candidate synthesis contains eight confirmed, ten partially confirmed, and one false-positive overall labels, but those totals use inconsistent normalization rules and are bookkeeping only. High activity, error counts, review counts, and user-correction tags cannot be converted into prevalence or rates. [TMP-005; TMP-007]

Twelve candidate findings remain usable only with case-specific qualifications such as later authorization, distinct review risk boundaries, changing pipeline stages, unsupported backup semantics, mixed timing, duplicated ancestry, or errors distributed across user-directed phases. This report does not promote those qualified findings into additional report-grade cases. [TMP-007]

Three candidates are excluded from substantive case evidence: one workflow expressly authorized the disputed process, one had both semantic categories adjudicated as false-positive, and one had all three causally important sampled tuples fail. Their session identifiers and disputed narratives are intentionally omitted. [TMP-007]

Primary records for controls c01 and c02 support the event sequences used in the control review; the disposable synthesis retrospectively judges both clean. That bounded judgment establishes same-family heterogeneity and rejects inevitability. Their low and medium activity do not supply a clean high-activity comparison, estimate average risk, or identify what would have happened under another model. [SES-006; SES-007; TMP-006; TMP-008]

## Current prompt and tool map

### Prompt assembly and activation boundaries

The installed Pi 0.84.1 artifact has default and custom system-prompt branches. In the default branch, fixed harness text, documentation guidance, concise-response guidance, clear-path guidance, and the working directory are included; active tools may add descriptions and guidance. A custom prompt replaces the fixed harness and default tool-guidance block, while append-system text, discovered context, eligible skill metadata, and the working directory may still be appended. [SRC-001; SRC-004]

Instruction discovery is conditional. Pi can discover a global file and ancestor-to-working-directory files, preferring `AGENTS.override.md` over `AGENTS.md` and `CLAUDE.md`; discovery can be disabled, and project system files require trust. Eligible skill names, descriptions, and locations are exposed when `read` is active, while skill bodies require an on-demand read or explicit invocation. Skills that disable model invocation are omitted from visible metadata. [SRC-002; SRC-003]

Loaded extensions can replace one turn's system prompt through `before_agent_start`, after which later turns use the rebuilt base unless another override occurs. Source presence alone does not establish that an extension loaded or its predicate activated in an observed session, and the research did not preserve a resolved extension manifest or hook order for those sessions. [SRC-004; TMP-008]

### Surface map

| Surface class | Current source behavior |
| --- | --- |
| Default-branch prompt | Fixed harness, documentation guidance, concise-response guidance, clear-path guidance, and cwd are assembled in the default branch; active tools may contribute prompt metadata. [SRC-001] |
| Conditional prompt or context | Discovered instructions, append-system text, skills metadata, path-scoped instruction payloads, active-goal reminders, and per-turn extension overrides require their loading and activation predicates. [SRC-002; SRC-003; SRC-004; SRC-008; SRC-024] |
| Explicit entrypoints | Workflow bodies, prompt templates, durable task creation, subagent execution, goals, and review-artifact writing require a command, tool call, restored explicit state, or review-intent activation. [SRC-015; SRC-016; SRC-017; SRC-018; SRC-024; SRC-034; SRC-035] |
| Deterministic enforcement | Path-scoped delivery can defer one unseen mutation; tool visibility starts selected stateful tools inactive; linked delegation validates task state and workspace; quality gates collect eligible edits; budget rules can steer or block repeated activity; reduction and compaction apply thresholds and guards; model visibility filters catalogs. [SRC-008; SRC-010; SRC-012; SRC-013; SRC-018; SRC-019; SRC-022; SRC-023; SRC-026] |
| Automatic advisory or analytical | Friction metadata collection and selected detached review run after their predicates. [SRC-020; SRC-021] |
| UI or operator only | Context reports are filtered from later model context; permission commands do not replay denied actions; orchestration statistics render without starting an agent turn; model-list notifications are UI-only even though filtering is deterministic. [SRC-014; SRC-025; SRC-026; SRC-028] |
| Provider-request shaping | Direct personality preserves an existing eligible verbosity value or sets `text.verbosity` to `low` for eligible GPT-5 requests; it does not append system text. [SRC-011] |

### Expansion paths and restraints

The strongest conditional expansion paths are path-scoped instruction delivery, activating tool search, explicit workflow bodies, active goals, subagent results, quality repair, and compaction continuation. `agents-context` can deliver a hidden bounded instruction payload and defer one unseen mutation. `tool_search` can activate matching inactive tools by default for a nonempty query and optionally return schemas. A background subagent later returns a bounded completion result. Active-turn compaction can replace eligible history with a handoff and issue one continuation. [SRC-008; SRC-009; SRC-012; SRC-018; SRC-019; SRC-024]

Countervailing restraints are material:

- Governing policy requires the smallest coherent change, proportional planning, focused validation, selective delegation, and stopping after the requested outcome is verified. [SRC-005]
- Context discovery can be disabled, project system files are trust-gated, skill bodies are on demand, and a custom prompt bypasses the default harness and tool-guidance block. [SRC-001; SRC-002; SRC-003]
- Path-scoped context is deduplicated and bounded, and only one fingerprinted unseen mutation is deferred. [SRC-008]
- Twelve advanced or stateful tools start deferred; list mode and `activate:false` do not activate them. [SRC-009; SRC-010]
- Ordinary short work may remain prose, task records do not execute work, and transient delegation may remain task-free. Linked delegation requires an already-running task. [SRC-015; SRC-018]
- Review behavior is route-sensitive: the parent workflow may repair supported artifact defects, while the reviewer child reports implementation findings rather than editing implementation. [SRC-030; SRC-033]
- Automatic quality validation skips configured explicit-only, project-scoped, and long-running validators; repair stops at its attempt limit or an unchanged failure signature. [SRC-019]
- Friction review is conditional and detached from the settled interaction. [SRC-020; SRC-021]
- Compaction requires threshold, tool-result, compactability, pending-message, attempt, and failure-circuit predicates; reduction has off, size, reclaim, recency, and spacing controls. [SRC-012; SRC-013]
- Session-budget findings steer or request an operator decision, and a stop decision blocks later tools in the current epoch. [SRC-022; SRC-023]

Current routing is not one uniform treatment. The tracked interactive default is `openai-codex/gpt-5.6-sol` at high effort; routing uses different tiers by work size, and role files assign Sol or Terra with different efforts to orchestration, building, validation, review, and isolated skill review. [SRC-006; SRC-007; SRC-029; SRC-031; SRC-032; SRC-033; SRC-036]

## Historical evolution and confounders

The earliest recoverable model-specific local-main record in the history audit is dated 2026-07-10 and changes the agent routing ladder to GPT-5.6 tiers. A nearby commit changes the interactive defaults, routing is centralized on 2026-07-16, and tracked default effort changes from medium to high on 2026-07-24. These are recoverable Git events, not an exogenous deployment timeline. [GIT-001; GIT-002; GIT-008; GIT-012; TMP-013]

| Period | Observed Git changes | Causal boundary |
| --- | --- | --- |
| 2026-07-09 to 2026-07-10 | Interactive and role defaults moved to the GPT-5.6 ladder; bounded quality-gate repair, durable subagent-task execution, unified task tooling, and friction measurement were added. [GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006] | Model policy and process machinery changed together. |
| 2026-07-11 | Workflow prompt bodies were compressed into state-machine-style documents. [GIT-007] | The concurrent direction was mixed rather than uniformly expansive. |
| 2026-07-16 | Model routing policy was centralized. [GIT-008] | Role and task routing remained a treatment-composition confounder. |
| 2026-07-20 to 2026-07-23 | Universal workflow mandates were reduced, experiment tracking required explicit intent, delegation guidance was simplified, and path-scoped context was deduplicated and byte-capped. [GIT-009; GIT-010; GIT-011; GIT-013] | Explicit anti-overengineering changes occurred inside the post window. |
| 2026-07-24 to 2026-07-27 | Default effort was raised; active-turn compaction was added, guarded against repeated failed attempts, and later given a configurable soft limit and compactability checks. [GIT-012; GIT-014; GIT-015; GIT-016] | Compaction can add continuation but is also a context restraint with repeated-work guards. |

This Git chronology is concurrent history, not causal ordering. It does not show that GPT-5.6 caused task machinery, validation, review, instruction handling, compaction, or later restraint. [GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006; GIT-007; GIT-008; GIT-009; GIT-010; GIT-011; GIT-012; GIT-013; GIT-014; GIT-015; GIT-016; TMP-008]

## Bounded hypotheses

Each row is a hypothesis, not an observed causal finding. Confidence refers to causal contribution in the studied sessions unless stated otherwise. [TMP-008]

| ID | Mechanism consistent with evidence | Counterevidence and unknown | Confidence and falsifier |
| --- | --- | --- | --- |
| H1 | Sol at high effort may execute more of an already available process surface, while response verbosity is shaped separately. [SRC-006; SRC-007; SRC-011] | Routing pools tiers and efforts by role; shifts were not uniform; clean same-family controls exist; task, context, tools, and workflow were uncontrolled. [SRC-029; SRC-031; SRC-032; SRC-033; TMP-008] | Low. Hold task, role, provider, effort, context, instructions, tools, and entrypoints constant; no reproducible increase in trajectory depth under Sol high falsifies amplification. |
| H2 | Conditional instruction loading and one-time unseen-scope deferral may add reconciliation work. [SRC-002; SRC-008] | Instructions largely converge on restraint, content is bounded and deduplicated, and no instruction-identity timeline connects the mechanism to a selected event. [SRC-005; SRC-008; TMP-008] | Medium for the conditional mechanism, low for observed contribution. A matched unseen-scope comparison with no delivery effect beyond the documented deferral falsifies added reconciliation. |
| H3 | Activating tool search may enlarge the active decision surface. [SRC-009; SRC-010] | No search means no expansion; nonactivating paths exist; activation does not compel use; observed sessions lack toolset fingerprints. [SRC-009; TMP-008] | Low. Matched searches that change schemas without changing later exploration or tool use falsify the behavioral mechanism. |
| H4 | Task and delegation ceremony is primarily an explicit-entrypoint effect. [SRC-015; SRC-016; SRC-018; SRC-024] | Median task and delegation calls were zero; records do not execute work; transient delegation can remain task-free; complex tasks may justify entrypoints. [SRC-015; SRC-018; TMP-001] | Medium for the entrypoint boundary, low as an explanation of the association. A task, child run, workflow body, or goal reminder appearing without invocation or restored state falsifies the boundary. |
| H5 | Eligible edit validation and bounded repair may add post-edit activity. [SRC-019] | Validators can be skipped by policy, repair is bounded, detached friction review does not create visible active-turn churn, and repeated checks may be mandatory or respond to changed failures. [SRC-019; SRC-020; SRC-021] | Low. Missing validation after an eligible edit, or repair past an unchanged signature or configured maximum, falsifies the stated mechanism. |
| H6 | Reduction and active-turn compaction may convert already-long work into visible handoff and continuation. [SRC-012; SRC-013] | Median compactions were zero; compaction is likely a consequence or mediator of long work; threshold and failure guards constrain it. [SRC-012; TMP-001] | Medium as a concurrent context mechanism, low as a churn cause. Compaction below threshold, without tool results, or with repeated completion continuations falsifies the mechanism. |
| H7 | Task mix and role selection confound model-specific behavior. [SRC-007; SRC-029; SRC-031; SRC-032; SRC-033; SRC-036] | The persisted interactive default is Sol high, and no task labels quantify how much role or task mix explains. [SRC-006; TMP-008] | High as an identification threat, low as a proven complete explanation. Stable differences within every matched task, role, effort, instruction, tool, and workflow stratum falsify task mix as sufficient. |
| H8 | Several bounded mechanisms may compose into a multi-stage churn cascade. [SRC-008; SRC-009; SRC-012; SRC-018; SRC-019] | No timeline shows the required predicates and order in one session; explicit entrypoints, caps, deduplication, and failure guards constrain cascade length. [TMP-008] | Low. Repeated churn without the required activation predicates falsifies the proposed cascade. |

The causal-adjudication snapshot permits at most the wording that the supplied evidence is compatible with model or effort amplifying process depth, but is equally compatible with task mix, role selection, concurrent workflow changes, session composition, and outcome-dependent selection. Within the supplied primary records, Git history, and artifact snapshot, no positive model-specific causal claim is supported. [SES-001; SES-002; SES-003; SES-004; SES-005; GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006; TMP-008]

## Reversible preregistered experiment program

This program is an integration synthesis, not a completed experiment or frozen runner-ready protocol. It combines current governing restraints and delegation policy from `SRC-005`, original metrics and minimum-effect thresholds from `TMP-010`, and adjudicated revisions from `TMP-011`. The disposable artifacts are design inputs rather than independent authority for current behavior. [SRC-005; TMP-010; TMP-011]

### Readiness gate

No treatment may enroll until all readiness conditions pass. [SRC-005; TMP-010; TMP-011]

1. Reconcile and freeze the hypothesis, quantitative, case, control, audit, experiment, prompt, and runtime artifacts. Correct stale statements about missing control synthesis and quantitative evidence, exclude the effectively duplicated c12 control from independent counts, and record the absence of a clean high-activity control. Any post-freeze change invalidates enrollment. [TMP-011]
2. Run every task instance in a fresh Pi process, isolated runtime-state root, and clean repository copy at the same pinned revision. Do not carry durable tasks, goals, tool state, extension queues, compaction state, child runs, behavior-affecting caches, or worktree state across instances. [TMP-011]
3. Exclude live stateful work, production targets, secrets, destructive operations, and safety-critical tasks from the initial program. Preserve all damage-control, ownership, mandatory validation, and user-decision controls. [TMP-011]
4. Freeze eligibility, task strata, acceptance criteria, required-tool maps, task graphs, capability boundaries, write sets, target paths, and validation surfaces before assignment. Hide evaluator-only structures unless they are ordinary task requirements. [TMP-011]
5. Use blocked randomization within task template, repository, and time block, with arms interleaved to limit drift. Analyze every assigned instance by intention to treat, including noncompletion, nonexposure, and fidelity failure. [TMP-011]
6. Complete blinded A/A and control-only calibration for assignment recovery, semantic-review agreement, derived-metric false positives, control event rates, count dispersion, template clustering, and exposure eligibility. Semantic reviewers must be blind to arm, prompt variant, model, and treatment-specific telemetry; use a frozen codebook and a third reviewer for disagreements. Block enrollment until assignment recovery, every primary metric, and every guardrail have been validated end to end as observable. [TMP-011]
7. Generate acceptance results, state hashes, failure signatures, scope classifications, and outcome manifests through the runner or an independent evaluator, never the tested agent. Freeze provider, resolved model, effort, context limit, prompt and instruction hashes and order, extension membership and order, settings, initial toolset fingerprint, repository revision, and tool contract. Drift is a fidelity failure. [TMP-011]
8. Choose the smallest fixed preregistered sample that gives 90 percent power for the stated minimum important effect after calibrated rates, dispersion, clustering, and multiplicity. If infeasible, keep the experiment blocked. Use one final efficacy analysis with no early stopping for benefit or null. [TMP-011]
9. Consider reversible adoption only when the confidence bound meets the primary minimum effect, the one-sided `acceptedCompletion` bound excludes a decline greater than 5 percentage points, mandatory checks remain intact, and no treatment-attributable critical defect occurs. A preregistered safety, ownership, live-state, data-loss, or mandatory-gate violation pauses and rejects the arm. [TMP-010; TMP-011]

### Ranked experiments

| Rank | Experiment | Isolated factor | Primary outcome and minimum effect | Critical guardrail |
| ---: | --- | --- | --- | --- |
| 1 | E3 evidence-gated verification stopping | Model-initiated duplicate checks only; automatic hooks and mandatory, user-requested, safety, and held-out checks remain fixed. [TMP-010; TMP-011] | `avoidableVerificationCalls`; 25 percent relative reduction. [TMP-010; TMP-011] | No skipped required gate, critical-defect increase, completion decline over 5 points, or independently detected defect increase over 2 points. [TMP-010; TMP-011] |
| 2 | E2b delegation activation only | Delegation guidance only; durable-task guidance stays canonical. [SRC-005; TMP-010; TMP-011] | `ineligibleSubagentLaunch`; 50 percent relative reduction. [TMP-010; TMP-011] | Preserve explicit and capability-required delegation; no ownership conflict or confidence-compatible 20 percent total-work increase. [TMP-010; TMP-011] |
| 3 | E4 nonactivating optional-tool search | Omitted `activate` lists matches without activation; explicit true and false behavior remains. [TMP-010; TMP-011] | `irrelevantPostSearchToolUse`; 20 percent relative reduction. [TMP-010; TMP-011] | No required-tool failure, unsafe shell substitution, permission violation, critical defect, or confidence-compatible 20 percent total-call increase. [TMP-010; TMP-011] |
| 4 | E1 model by instruction-density factorial | Sol versus Terra crossed with exact current instructions versus deletion-only compression. [TMP-010; TMP-011] | `semanticIncident`; hierarchical prompt, interaction, then model tests; 10-point absolute minimum effect. [TMP-010; TMP-011] | Safety, ownership, live-state, and user-decision clauses remain byte-identical; no policy decline, critical defect, or completion decline over 5 points. [TMP-010; TMP-011] |
| Conditional | E2a durable task records only | Task-record activation guidance only; delegation remains canonical. [SRC-005; TMP-010; TMP-011] | `ineligibleTaskCreation`; 50 percent relative reduction. [TMP-010; TMP-011] | No lost requested tracking, dependency or handoff state, terminal-state integrity, critical defect, or completion decline over 5 points. [TMP-010; TMP-011] |
| Conditional final | E6 soft-limit compaction holdout | Disable only soft-limit active-turn compaction before the hard safety boundary; reduction is off in both arms. [TMP-010; TMP-011] | `postThresholdSemanticIncident`; 10-point absolute minimum effect. [TMP-010; TMP-011] | No context failure, decision or dependency loss, critical defect, completion decline over 5 points, or output-token increase over 15 percent. [TMP-010; TMP-011] |

Appendix D presents the integrated treatment clauses, telemetry, predictions, and stopping rules as synthesis for a future frozen protocol. No lower step count, lower tool volume, or mechanically eliminated protocol event counts as success without the semantic primary and intact guardrails. [SRC-005; TMP-010; TMP-011]

### Rejected designs and carryover

The combined E2 design is rejected because changing durable-task creation and delegation together prevents mechanism attribution. E5 eager instruction delivery is rejected because its proposed primary improves mechanically under treatment; a future redesign would need a control-counterfactual fixture, a downstream semantic primary, trajectory accounting that subtracts mandatory deferral and reissue, prompt-byte and irrelevant-instruction costs, preserved dynamic path gating, and a powered semantic effect. [TMP-010; TMP-011]

Another historical pre/post model comparison is rejected because model, calendar time, task mix, routing, instructions, extensions, policy, and workflow changed together. Disabling all extensions or tools, removing instruction or safety controls, universally banning tasks or delegation, fixing reviewer or validation counts, using general-session compaction assignments, or treating elapsed duration or raw tool volume as the primary outcome is also rejected. Re-reviewing raw sessions solely to enlarge the selected case set is outside the evidence boundary. [TMP-010; TMP-011]

The integration synthesis prescribes the same version-pinned canonical baseline for every experiment. A successful treatment is not carried into another experiment's baseline. Combining successful treatments requires a separate preregistered reversible interaction and cumulative-safety study. No individual result by itself supports a permanent policy change. [SRC-005; TMP-010; TMP-011]

## Synthesis and bounded next steps

| Status | Synthesis |
| --- | --- |
| Snapshot result | The disposable quantitative snapshot reports several higher marginal metadata proxies in the post-boundary GPT-5.6-family cohort, while user turns fell and delegation and compaction medians stayed zero. [TMP-001] |
| Observation | Four selected event sequences survive bounded raw-coordinate adjudication. [SES-001; SES-002; SES-003; SES-004; TMP-007] |
| Observation | Current source provides conditional expansion mechanisms and explicit restraints. [SRC-005; SRC-008; SRC-009; SRC-012; SRC-015; SRC-018; SRC-019] |
| Artifact hypothesis | The causal adjudication snapshot proposes that model and effort, instruction delivery, tool activation, explicit task or delegation entrypoints, validation, compaction, task mix, or their composition may affect process depth. [TMP-008] |
| Artifact-limited unknown | The observed sessions and artifact snapshot do not establish which mechanisms activated, their ordering, or their incremental contribution. [TMP-008] |
| Artifact-limited unknown | The supplied primary records and artifact snapshot do not determine whether GPT-5.6 changed average semantic risk after confounding is controlled. [SES-001; SES-002; SES-003; SES-004; SES-005; TMP-008] |
| Rerun guidance | Freeze inputs and calibration, then run the ranked isolated experiments only if their readiness and safety gates pass. [SRC-005; TMP-010; TMP-011] |

No current mechanism should be removed or permanently tightened from this report alone. Current policy and the disposable design synthesis both require safety guardrails, ownership boundaries, mandatory checks, and explicit user decisions to remain fixed in every eligible experiment. [SRC-005; TMP-010; TMP-011]

## Limitations and unknowns

1. Declared shard coverage is 193 while manifests contain 191 rows, and changing session-key definitions prevent a complete, disjoint corpus proof. [TMP-002; TMP-007]
2. No immutable corpus inventory tied to per-file sizes, timestamps, and hashes froze the historical aggregate run. Canonical sessions can be appended or resumed, so live reruns may drift. [TMP-007]
3. Candidate selection was outcome-dependent and favored high volume, errors, and user correction; selected cases cannot estimate prevalence. [TMP-003; TMP-007]
4. No reviewed contemporaneous pure non-GPT-5.6 control exists; reviewed controls are poorly matched, mostly non-clean, and partly non-independent. [TMP-004; TMP-006; TMP-007]
5. Task mix, repository, role, effort, provider behavior, model tier, model switching, instructions, tools, workflow, session duration, and operator behavior were uncontrolled. [TMP-008]
6. Session identity, exposure, tool-call counts, semantic labels, overall verdict rules, severity, and citation forms differ across artifacts. [TMP-007]
7. Candidate and control citation audits found identity, timestamp, fallback, and bounds failures. The final raw audit was bounded rather than exhaustive. [TMP-005; TMP-006; TMP-007]
8. Control duration, task identity, difficulty, repository or topic match, and independence metadata were unavailable. [TMP-004; TMP-006]
9. The corpus contained 2,052 entries without timestamps and 1,184 source files without inventory ID or start time. These unavailable values were excluded rather than treated as zero. [TMP-001]
10. Generation timestamps, a common corpus hash, query hashes, and exact candidate and control validator scripts were not preserved consistently. Current artifact hashes support local integrity checks, not immutable historical reproduction. [TMP-005; TMP-006; TMP-007]
11. The corpus represents one local operator and workflow environment. Generalization to another user, provider, repository, role, Pi version, or task class is unknown. [TMP-008]
12. The source map describes current implementation at one baseline and an installed package version. It does not reconstruct the effective prompt, extension order, settings, provider payload, or toolset for any selected historical session. [SRC-004; TMP-008]

## Privacy and sanitization

The report contains only metadata, aggregate counts, bounded paraphrases, source code locators, Git objects, and minimized session coordinates. It does not include raw prompts, responses, thinking, review narrative, tool arguments, tool output, terminal output, credentials, tokens, cookies, authorization headers, private keys, `.env` values, remote URLs, or private operational details. [TMP-009]

Absolute home paths are represented with `~`. Workspace path segments and session keys are stable report aliases. Exact alias crosswalks, canonical JSONL, logs, copied records, databases, exports, and all `.tmp` artifacts remain local and untracked. Entry IDs and timestamps are included only where required to validate the first-selection boundary, the two retrospective control assessments, and the four minimized report-grade event sequences. [SES-001; SES-002; SES-003; SES-004; SES-005; SES-006; SES-007; TMP-009]

Unavailable, malformed, excluded, and redacted values are stated rather than converted into zero. There is no raw-transcript appendix. [TMP-007; TMP-009]

## Validation record

This section is rerun guidance, not a historical command log. For each revision, reopen every cited source coordinate, resolve each Git object and hunk, parse each cited session physical line while emitting only minimized metadata, and recompute artifact hashes that are still locally available. Treat any unavailable historical provenance field as missing rather than inferred. [TMP-009]

Focused report checks should inspect the complete file, confirm one H1 and sentence-case headings, enforce ASCII-only content, resolve citation tokens, scan for unresolved drafting markers, inspect sanitized paths and Git status scope, run `git diff --check`, and run the repository secret-review path. Runtime JSONL and `.tmp` artifacts must remain untracked. [SRC-005; TMP-009]

For a prose-only revision that does not modify an executable or parsed documentation contract, focused documentation checks are the prescribed gate; TypeScript, Vitest, and broad repository gates are required only when the changed contract gives them relevant coverage. [SRC-005; TMP-009]

## Appendix A: source table

### A.1 Current source and installed artifact

All tracked-source entries are current as of commit `31ad63e3dfa4d45eb15ae9c8a15d8b62d28ac3da`. Installed-artifact entries are current for package version 0.84.1.

| Evidence ID | Class and status | Locator | As-of | Evidence role | Privacy treatment | Limitation |
| --- | --- | --- | --- | --- | --- | --- |
| SRC-001 | Installed artifact, current | `@earendil-works/pi-coding-agent@0.84.1/dist/core/system-prompt.js:7-103` | Package 0.84.1 | System-prompt branches and tool guidance | Public package source | Not a historical session payload |
| SRC-002 | Installed artifact, current | `@earendil-works/pi-coding-agent@0.84.1/dist/core/resource-loader.js:31-103,366-397,808-828` | Package 0.84.1 | Instruction discovery and trust | Public package source | Activation can be disabled |
| SRC-003 | Installed artifact, current | `@earendil-works/pi-coding-agent@0.84.1/dist/core/skills.js:250-281` | Package 0.84.1 | Skill progressive disclosure | Public package source | Does not prove a skill was read |
| SRC-004 | Installed artifact, current | `@earendil-works/pi-coding-agent@0.84.1/dist/core/agent-session.js:710-739,884-916,1970-1988` | Package 0.84.1 | Per-turn prompt override and assembly | Public package source | Resolved hook order was not captured |
| SRC-005 | Tracked source, current | `pi/AGENTS.md:8-34` | Baseline commit | Minimal scope, validation, stopping, delegation | No sensitive content | Policy does not prove historical compliance |
| SRC-006 | Tracked source, current | `pi/settings.json:2-8,20-32,41-44` | Baseline commit | Interactive model, effort, and enabled model policy | No credentials in tracked settings | Per-user overrides may differ |
| SRC-007 | Tracked source, current | `pi/lib/model-routing.ts:121-144,402-420` | Baseline commit | Work-size routing | No sensitive content | Historical sessions may use older routing |
| SRC-008 | Tracked source, current | `pi/extensions/agents-context.ts:231-283,480-593` | Baseline commit | Path-scoped delivery, bounds, dedupe, and deferral | No runtime payloads | Activation timeline unavailable |
| SRC-009 | Tracked source, current | `pi/extensions/tool-search.ts:65-247` | Baseline commit | Search, activation defaults, list mode, and schemas | No search queries reproduced | Exposure does not prove later use |
| SRC-010 | Tracked source, current | `pi/extensions/tool-visibility.ts:8-79` | Baseline commit | Deferred stateful tools | No sensitive content | Initial registry may vary by runtime |
| SRC-011 | Tracked source, current | `pi/extensions/direct-personality.ts:10-58` | Baseline commit | Provider-request verbosity shaping | No payloads reproduced | Applies only to eligible requests |
| SRC-012 | Tracked source, current | `pi/extensions/active-turn-compaction.ts:11-149,169-303` | Baseline commit | Trigger, handoff, continuation, and guards | No session content | Historical settings unknown |
| SRC-013 | Tracked source, current | `pi/extensions/tool-reduction.ts:55-63,354-477` | Baseline commit | Reduction thresholds and restraints | No tool output | Historical activation unknown |
| SRC-014 | Tracked source, current | `pi/extensions/context.ts:659-698` | Baseline commit | Context report filtering | No report content | UI behavior only |
| SRC-015 | Tracked source, current | `pi/extensions/tasks.ts:581-592,846-993` | Baseline commit | Task entrypoints and lifecycle | No task records | Records do not execute work |
| SRC-016 | Tracked source, current | `pi/extensions/workflow-commands.ts:2430-2516` | Baseline commit | Explicit workflow dispatch | No workflow payloads | Invocation is required |
| SRC-017 | Tracked source, current | `pi/extensions/review-artifact.ts:83-210` | Baseline commit | Review-artifact activation | No artifact content | Source does not prove invocation |
| SRC-018 | Tracked source, current | `pi/extensions/subagent/index.ts:1236-1248,1547-1648,2012-2087,2465-2488` | Baseline commit | Delegation entrypoint, task checks, result delivery | No child output | Child activation unknown historically |
| SRC-019 | Tracked source, current | `pi/extensions/quality-gates.ts:434-479,1025-1164` | Baseline commit | Edit collection, validator skips, bounded repair | No validator output | Runtime config was not captured |
| SRC-020 | Tracked source, current | `pi/extensions/workflow-friction-review.ts:1549-1717` | Baseline commit | Interaction selection and detached review | No review narrative | Selection is conditional |
| SRC-021 | Tracked source, current | `pi/lib/workflow-friction.ts:7-10,540-572` | Baseline commit | Queue and metadata behavior | No session content | Does not show historical activation |
| SRC-022 | Tracked source, current | `pi/extensions/session-budget.ts:300-382,386-505` | Baseline commit | Budget steering and stop handling | No runtime events | Historical settings unknown |
| SRC-023 | Tracked source, current | `pi/lib/session-budget.ts:1-5,174-234` | Baseline commit | Pure budget decisions | No runtime content | Input state controls outcomes |
| SRC-024 | Tracked source, current | `pi/extensions/goal.ts:327-417` | Baseline commit | Explicit goals and reminders | No goal text | Restored state may activate reminders |
| SRC-025 | Tracked source, current | `pi/extensions/permissions.ts:99-229` | Baseline commit | Operator permission commands | No decision payload | Commands do not reissue tools |
| SRC-026 | Tracked source, current | `pi/extensions/model-visibility.ts:282-313,355-425` | Baseline commit | Deterministic filtering and UI notice | No credentials | Catalog depends on provider conditions |
| SRC-028 | Tracked source, current | `pi/extensions/orchestration-stats.ts:313-328` | Baseline commit | Read-only report dispatch | No metrics content | UI report does not start a turn |
| SRC-029 | Tracked source, current | `pi/agents/orchestrator.md:1-21` | Baseline commit | Orchestrator model and effort | No task content | Role-specific only |
| SRC-030 | Tracked source, current | `pi/skills/workflow/review-it.md:1-57` | Baseline commit | Parent review and repair semantics | No reviewed artifact | Explicit review-only remains non-mutating |
| SRC-031 | Tracked source, current | `pi/agents/builder.md:1-26` | Baseline commit | Builder model, effort, and bounded behavior | No task content | Role-specific only |
| SRC-032 | Tracked source, current | `pi/agents/validator.md:1-20` | Baseline commit | Validator model and effort | No task content | Role-specific only |
| SRC-033 | Tracked source, current | `pi/agents/reviewer.md:1-31` | Baseline commit | Reviewer model, effort, and no implementation repair | No review content | Route-sensitive behavior |
| SRC-034 | Installed documentation, current | `@earendil-works/pi-coding-agent@0.84.1/docs/prompt-templates.md:5-53` | Package 0.84.1 | Native prompt-template invocation | Public package docs | Documentation, not session evidence |
| SRC-035 | Tracked source, current | `pi/prompts/gitlab-ticket.md:1-139` | Baseline commit | Repository prompt template | No generated ticket | Explicit invocation required |
| SRC-036 | Tracked source, current | `pi/agents/skill-review.md:1-17` | Baseline commit | Isolated review model and effort | No packet content | Role-specific only |
| SRC-037 | Tracked source, current | `pi/skills/pi-log-analytics/reference.md:3-126,243-249` | Baseline commit | Canonical corpus, overlap, malformed-row, and scratch rules | No runtime rows | Live corpus can change |

### A.2 Git history

| Evidence ID | Class and status | Commit, date, subject | Path and exact hunk | Evidence role | Privacy treatment | Limitation |
| --- | --- | --- | --- | --- | --- | --- |
| GIT-001 | Immutable history | `cac78b4ed24a8be8ed2b5ca81a20f4a9c8f7c1c4`, 2026-07-10, `feat(pi): route agents through the GPT-5.6 Codex ladder` | `pi/lib/model-routing.ts`, `@@ -22,13 +22,13 @@`; `pi/agents/orchestrator.md`, `@@ -1,7 +1,7 @@` | GPT-5.6 role ladder | No private data | Recoverable Git event, not deployment time |
| GIT-002 | Immutable history | `f82d36ca33a7a3434a0d9a016160473fb982d77b`, 2026-07-09, `fix(pi): align extension defaults with GPT-5.6` | `pi/extensions/persistent-defaults.ts`, `@@ -13,9 +13,9 @@`; `pi/settings.json`, `@@ -1,7 +1,7 @@` | Interactive defaults | No private data | Commit time is not first use |
| GIT-003 | Immutable history | `bb7c7a4933969a2696142473990ef2c2cc382a27`, 2026-07-10, `feat(pi): add bounded auto-repair to quality gates` | `pi/extensions/quality-gates.ts`, `@@ -78,6 +78,7 @@`, `@@ -136,6 +137,16 @@`, `@@ -170,12 +181,33 @@` | Quality repair | No validator output | Later implementation evolved |
| GIT-004 | Immutable history | `e3a8be71ffd30cb51fd52f9e6e84836aa7c4979f`, 2026-07-10, `feat(pi): execute durable subagent tasks` | `pi/extensions/tasks/execution.ts`, `@@ -0,0 +1,385 @@`; `pi/extensions/tasks.ts`, `@@ -304,18 +377,86 @@` | Durable execution | No task content | Historical surrounding source may differ |
| GIT-005 | Immutable history | `ec5a7bfd8ab94e91707a4eff1f249a57f1842d5d`, 2026-07-10, `feat(tasks): unify durable planning and execution tools` | `pi/extensions/tasks.ts`, `@@ -250,204 +385,136 @@` | Task unification | No task content | Does not show session use |
| GIT-006 | Immutable history | `037bbfac0211c89bceb0a0a374853719af991ad4`, 2026-07-10, `feat(workflow): add friction measurement and review pipeline` | `pi/extensions/workflow-friction.ts`, `@@ -0,0 +1,876 @@`; `pi/lib/workflow-friction.ts`, `@@ -0,0 +1,464 @@` | Friction pipeline | No review records | Activation and later behavior changed |
| GIT-007 | Immutable history | `3bacb977ee6aa4facafb6a628ba430c210f8641d`, 2026-07-11, `refactor(workflow): compress prompts into state machines` | `pi/skills/workflow/do-it.md`, `@@ -1,341 +1,144 @@`; `pi/skills/workflow/plan-it.md`, `@@ -1,271 +1,101 @@`; `pi/skills/workflow/review-it.md`, `@@ -1,436 +1,207 @@` | Prompt compression | No workflow payload | Diff size does not measure semantic effect |
| GIT-008 | Immutable history | `48eb3c5887e1900b1b62d79f05496d39a1c54dc8`, 2026-07-16, `refactor(pi): centralize model routing policy` | `pi/lib/model-routing.ts`, `@@ -4,6 +4,16 @@`, `@@ -201,13 +253,64 @@` | Routing centralization | No private data | Not an isolated model change |
| GIT-009 | Immutable history | `4a6e335793754585001710e1caa9de3318922c72`, 2026-07-20, `docs: reduce universal Pi workflow mandates` | `AGENTS.md`, `@@ -54,10 +54,9 @@`; `pi/AGENTS.md`, `@@ -9,7 +9,7 @@`, `@@ -19,11 +19,11 @@`; `pi/skills/orchestration/SKILL.md`, `@@ -14,28 +14,18 @@` | Proportional policy | No private data | Policy text does not prove compliance |
| GIT-010 | Immutable history | `0f315d91cab38441563d274e433986fa8de82de0`, 2026-07-20, `fix(pi): require explicit tracking intent` | `pi/extensions/workflow-friction-review.ts`, `@@ -1901,11 +1901,11 @@` | Explicit tracking boundary | No runtime records | One mechanism only |
| GIT-011 | Immutable history | `55cf8541bd7dbf7cafa761b6d99207b3971c1d85`, 2026-07-21, `fix(pi): simplify delegation instructions` | `pi/extensions/fable.ts`, `@@ -13,17 +13,8 @@`, `@@ -172,21 +163,6 @@`, `@@ -216,9 +192,7 @@` | Delegation restraint | No child output | Historical extension later evolved |
| GIT-012 | Immutable history | `73a5721b0e41d7a6b447b59909a9415cf3dd4790`, 2026-07-24, `feat(prompt-router): raise default thinking effort to high` | `pi/extensions/persistent-defaults.ts`, `@@ -17,7 +17,7 @@`; `pi/settings.json`, `@@ -1,14 +1,14 @@` | Effort change | No payloads | Per-role and per-user overrides remain possible |
| GIT-013 | Immutable history | `da43c95d9dbafb007a489cf2ec8e31961b881c65`, 2026-07-23, `fix(pi): reduce default context overhead` | `pi/extensions/agents-context.ts`, `@@ -188,21 +224,35 @@` | Dedupe and byte caps | No instruction content | Does not quantify session effect |
| GIT-014 | Immutable history | `06819c979d330e5a4e03357fb8242ac929b78126`, 2026-07-24, `feat(pi): compact context during active turns` | `pi/extensions/active-turn-compaction.ts`, `@@ -0,0 +1,148 @@` | Initial compaction | No handoff content | Later guards changed behavior |
| GIT-015 | Immutable history | `39ae972fdddb2d15f718cdb2941b4ca43422d1b5`, 2026-07-24, `fix(compaction): prevent repeated failed threshold compaction` | `pi/extensions/active-turn-compaction.ts`, `@@ -71,12 +71,14 @@`, `@@ -84,6 +86,17 @@`, `@@ -93,7 +106,8 @@` | Attempt and failure guards | No session content | One historical revision |
| GIT-016 | Immutable history | `d4f778abe1d2b9fc4562c63f57ebbc7e932ce291`, 2026-07-27, `feat(pi): add soft-limit active turn compaction` | `pi/extensions/active-turn-compaction.ts`, `@@ -34,7 +41,12 @@`, `@@ -43,20 +55,84 @@`, `@@ -111,6 +189,13 @@`; `pi/settings.json`, `@@ -41,5 +41,8 @@` | Soft limit and compactability | No session content | Provider hard limits are separate |

### A.3 Sanitized session evidence

Workspace names and session keys below are stable aliases. Each locator uses a sanitized home-relative canonical path, 1-based physical line, exact entry ID, and exact timestamp. The aliases resolve locally to the actual canonical source paths, but the private crosswalk remains untracked. The report does not contain raw record text or tool payloads.

| Evidence ID | Class and status | Sanitized path and session key | Evidence role | Privacy treatment | Limitation |
| --- | --- | --- | --- | --- | --- |
| SES-001 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-dotfiles/2026-07-11T04-06-59-993Z_RG-1.jsonl`; session key `RG-1` | Identical-edit sequence | Workspace and canonical session ID aliased | Mutable source; semantic equality also uses bounded adjudication |
| SES-002 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-dotfiles/2026-07-20T18-41-09-496Z_RG-2.jsonl`; session key `RG-2` | Repeated-review sequence and criticism | Workspace and canonical session ID aliased | Criticism does not prove every review unnecessary |
| SES-003 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-dotfiles/2026-07-20T20-28-07-991Z_RG-3.jsonl`; session key `RG-3` | Cross-client change, correction, and reversion | Workspace and canonical session ID aliased | Later authorized work is excluded |
| SES-004 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-private-infra/2026-07-21T21-50-58-983Z_RG-4.jsonl`; session key `RG-4` | Mandatory lint, execution, and rejection | Private workspace and canonical session ID aliased | Separate warning count is excluded |
| SES-005 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-dotfiles/2026-07-09T16-58-05-509Z_boundary-sol.jsonl`; session key `boundary-sol` | First observed Sol model-selection record | Workspace and canonical session ID aliased | Establishes one current canonical record; corpus-wide minimum remains snapshot-derived |
| SES-006 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-dotfiles/2026-07-25T00-41-05-040Z_control-c01.jsonl`; session key `c01` | Low-activity control sequence | Workspace and canonical session ID aliased | Cleanliness is a retrospective judgment |
| SES-007 | Canonical local runtime, mutable | `~/.pi/agent/sessions/workspace-dotfiles/2026-07-11T04-11-59-417Z_control-c02.jsonl`; session key `c02` | Medium-activity user-directed work and validation sequence | Workspace and canonical session ID aliased | Cleanliness is a retrospective judgment; one published review tuple was corrected |

| Evidence ID | 1-based line | Entry ID | Timestamp | Minimized record role |
| --- | ---: | --- | --- | --- |
| SES-001 | 137 | `3c81cb0a` | `2026-07-11T12:07:30.721Z` | Assistant edit call |
| SES-001 | 138 | `ef23d683` | `2026-07-11T12:07:30.726Z` | Error-marked tool result |
| SES-001 | 139 | `73f3cfea` | `2026-07-11T12:07:35.219Z` | Assistant edit call |
| SES-001 | 140 | `e0fe3853` | `2026-07-11T12:07:35.223Z` | Error-marked tool result |
| SES-001 | 1369 | `5a995e7b` | `2026-07-11T13:40:06.934Z` | Assistant edit call |
| SES-001 | 1370 | `e6ff50e7` | `2026-07-11T13:40:06.940Z` | Error-marked tool result |
| SES-001 | 2577 | `31ce3ed9` | `2026-07-11T16:14:39.513Z` | Assistant edit call |
| SES-001 | 2578 | `b0a02c41` | `2026-07-11T16:14:39.529Z` | Error-marked tool result |
| SES-001 | 2579 | `4484ea82` | `2026-07-11T16:14:54.270Z` | Aborted assistant edit call |
| SES-002 | 324 | `dbfe9907` | `2026-07-21T00:23:20.695Z` | First review result |
| SES-002 | 330 | `ad4e7520` | `2026-07-21T00:41:59.166Z` | Second review result |
| SES-002 | 334 | `206d2bf2` | `2026-07-21T00:45:26.514Z` | User criticism |
| SES-003 | 82 | `a44b3f17` | `2026-07-20T20:53:54.643Z` | Cross-client write result |
| SES-003 | 92 | `afca6bc6` | `2026-07-20T20:54:59.786Z` | User correction |
| SES-003 | 108 | `5efd3a4e` | `2026-07-20T21:05:18.092Z` | Revert direction |
| SES-003 | 124 | `be29db02` | `2026-07-20T21:06:58.297Z` | Revert verification result |
| SES-004 | 4 | `6bfd3d48` | `2026-07-21T21:51:05.398Z` | Workflow instruction record |
| SES-004 | 11 | `768b430c` | `2026-07-21T21:51:24.525Z` | Assistant validation calls |
| SES-004 | 12 | `f6e68614` | `2026-07-21T21:51:35.522Z` | Successful lint result |
| SES-004 | 26 | `23930c9d` | `2026-07-21T21:53:21.548Z` | User rejection |
| SES-005 | 400 | `423843eb` | `2026-07-09T23:17:59.552Z` | Sol model-selection boundary |
| SES-006 | 4 | `0ae4f7c0` | `2026-07-25T00:43:03.283Z` | Initial user request |
| SES-006 | 5 | `88dfdc1b` | `2026-07-25T00:43:09.143Z` | Bounded assistant response |
| SES-006 | 6 | `a737e70f` | `2026-07-25T00:46:22.182Z` | User-quit session close |
| SES-007 | 4 | `fe44b870` | `2026-07-11T04:13:00.460Z` | Initial authorized scope |
| SES-007 | 19 | `3bb91f6c` | `2026-07-11T04:13:52.546Z` | Initial implementation result |
| SES-007 | 31 | `de2e1e49` | `2026-07-11T04:15:23.874Z` | Focused test failed from wrong directory |
| SES-007 | 34 | `89382111` | `2026-07-11T04:15:43.557Z` | Corrected-directory focused test result |
| SES-007 | 49 | `3a25ea27` | `2026-07-11T04:18:47.859Z` | User correction and revised authorization |
| SES-007 | 53 | `86e7a25a` | `2026-07-11T04:19:08.054Z` | Correction-driven implementation result |
| SES-007 | 66 | `6f230ce9` | `2026-07-11T04:21:33.415Z` | Later feature authorization |
| SES-007 | 72 | `eaaeda22` | `2026-07-11T04:22:32.559Z` | Later feature implementation result |
| SES-007 | 81 | `a9f1ea3f` | `2026-07-11T04:23:21.284Z` | Final policy-scope authorization |
| SES-007 | 93 | `813d0dcd` | `2026-07-11T04:24:19.089Z` | Final formatter result |
| SES-007 | 94 | `453f5212` | `2026-07-11T04:24:19.089Z` | Final focused test result |

### A.4 Disposable research artifacts

Every `TMP` source is disposable and untracked. This is a locator inventory, not a reproducibility matrix. `Generated UTC` was not embedded in the artifacts; the table records filesystem modification time only as local metadata. The recorded SHA-256 values identify the current local copies, but complete source inventories, generation commands or query hashes, validator scripts, and per-artifact row counts were not consistently preserved.

| Evidence ID | Status and class | Locator | Filesystem mtime UTC | Evidence role | Privacy treatment | Limitation |
| --- | --- | --- | --- | --- | --- | --- |
| TMP-001 | Disposable quantitative artifact | `.tmp/gpt-5.6-research/quantitative.json:27-594`; sha256 `52ed3c7f4fb970f64591945d44e4db005c5b0a4b8aa68e3547209c4c2ffe2f80` | `2026-08-12T21:00:58.234766Z` | Boundary, source quality, cohorts, medians, and SQL | No outlier IDs reproduced | Generation time and query hash absent; live reruns can drift |
| TMP-002 | Disposable reconciliation artifact | `.tmp/gpt-5.6-research/corpus-reconciliation.json:4-1252`; sha256 `242cbf4bba2ecf75c8ea1dcb90bae1243b874df99a5bc40eeebd630fedcb2638` | `2026-08-12T20:49:34.450107Z` | Shard counts, bounds, and declaration differences | Raw identifiers omitted | Does not query underlying sessions directly |
| TMP-003 | Disposable candidate manifest | `.tmp/gpt-5.6-research/candidate-manifest.json:2-411`; sha256 `ee83e7343bc66d3d99f6c231dc7f21627d421a5c07da878006531557922cd82a` | `2026-08-12T21:13:12.831402Z` | Candidate screen and limitations | Candidate IDs omitted | Outcome-dependent selection |
| TMP-004 | Disposable control manifest | `.tmp/gpt-5.6-research/control-manifest.json:11-931`; sha256 `72d5ffe2b6fed6635f4d43ca39c5cdd09df4046acee7bf55bd8c3213bbfdb6c1` | `2026-08-13T05:50:30.087004Z` | Matching rules and activity bands | Assignment IDs omitted | Task and duration matching unavailable |
| TMP-005 | Disposable case synthesis | `.tmp/gpt-5.6-research/case-synthesis-final.json:20-203,932-993`; sha256 `7060f302b42b7e59419833c76b05b0562641b8e265126a930940ea2f2a9f7918` | `2026-08-13T07:12:19.886576Z` | Review normalization and candidate citation audit | Session details minimized | Five schemas and coordinate failures |
| TMP-006 | Disposable control synthesis | `.tmp/gpt-5.6-research/control-synthesis.json:47-222,581-884`; sha256 `184fd225809240b0f256e50d637f042e509c7aa423842159e4a24dead7b2455a` | `2026-08-13T07:37:00.220764Z` | Control review, contamination, and coordinate audit | Private contexts omitted | Poor match and non-independence |
| TMP-007 | Disposable methodology adjudication | `.tmp/gpt-5.6-research/adjudication-methodology.json:16-165,184-645`; sha256 `d16a03a83a41138df9836f2169c2a5649a4da7522556ce6fc5fbb6668c973c58` | `2026-08-13T07:52:31.761359Z` | Definitions, exclusions, valid claims, and privacy | Raw path crosswalk remains untracked | Bounded raw-coordinate audit |
| TMP-008 | Disposable causal adjudication | `.tmp/gpt-5.6-research/adjudication-causality.json:4-781`; sha256 `12618cbb1c5e0509c1ca6661555ed574abe9b38d99f98192536834f5b7c942ea` | `2026-08-13T07:52:04.588315Z` | Attribution boundary, hypotheses, and wording bounds | No transcript content | Establishes snapshot non-identification, not an effect |
| TMP-009 | Disposable report convention | `.tmp/gpt-5.6-research/report-conventions.json:26-138`; sha256 `c7334a56ddecf7ca38c9aad368f370ff1a345b9a49c1e72ed7a8173241bf4247` | `2026-08-13T07:31:34.504402Z` | Citation, privacy, appendix, and validation rules | Defines sanitization | Methodological source only |
| TMP-010 | Disposable experiment proposals | `.tmp/gpt-5.6-research/experiments.json:64-768`; sha256 `8c212a0364f98427f3a6828b5d6d2ec03b99273820bc5d2a44e218a4f555a31f` | `2026-08-13T07:39:18.850314Z` | Initial reversible experiment designs | No session content | No proposal accepted unchanged |
| TMP-011 | Disposable experiment adjudication | `.tmp/gpt-5.6-research/adjudication-experiments.json:4-314`; sha256 `d889d5b57fc263ffda3cb116a97201f2e0d29e241501a2d76f93bc247238d91f` | `2026-08-13T07:49:03.149096Z` | Readiness, redesign, power, guardrails, and rejection | No task payloads | Experiments have not run |
| TMP-012 | Disposable mechanism synthesis | `.tmp/gpt-5.6-research/prompt-hypotheses.json:5-157`; sha256 `9da4a767ad5f78f3de84f01e89f6d04c2a25374bf7fb3cec048a4ae385114dc3` | `2026-08-12T21:15:59.835663Z` | Source mechanism hypotheses | No prompt payloads | Stale source-availability statements superseded |
| TMP-013 | Disposable history audit | `.tmp/gpt-5.6-research/audits/history.json:4-364`; sha256 `7bf0a84b58d1658c157656461e02a534a494905cab6de67b84b897c64fb40876` | `2026-08-12T21:02:03.597537Z` | Commit discovery and confounder framing | No private Git data | Git objects, not this artifact, support history claims |

## Appendix B: claim-to-evidence matrix

| Claim ID | Concise claim | Evidence IDs | Status | Confidence | Caveat |
| --- | --- | --- | --- | --- | --- |
| C-001 | A canonical record selects GPT-5.6 Sol at `2026-07-09T23:17:59.552Z`; the snapshot reports it as the corpus-wide minimum. | SES-005; TMP-001 | Primary observation plus snapshot calculation | High for the record; medium for the historical minimum | Not release or deployment time; live corpus is mutable |
| C-002 | The quantitative snapshot reports 188 pre non-GPT-5.6, 163 post GPT-5.6-family, and 2 post non-GPT-5.6 complete sessions. | TMP-001 | Artifact-reported snapshot calculation | Low to medium | No immutable corpus freeze or exact historical reproduction |
| C-003 | The quantitative snapshot reports several higher post-cohort marginal metadata medians, lower user turns, and unchanged zero medians for delegation and compaction. | TMP-001 | Artifact-reported snapshot calculation | Low to medium | Unadjusted association; exact historical rerun unavailable |
| C-004 | The reconciliation snapshot reports 193 declared shard records and 191 unique manifest IDs. | TMP-002; TMP-007 | Artifact-reported snapshot count | Medium within supplied artifacts | Underlying cohort completeness and exact rerun unproven |
| C-005 | Four selected event sequences are report-grade. | SES-001; SES-002; SES-003; SES-004; TMP-007 | Observed selected cases | High for recorded sequences | No denominator or causation |
| C-006 | Two primary same-family sequences were retrospectively judged clean and therefore reject inevitability. | SES-006; SES-007; TMP-006; TMP-008 | Primary sequences plus artifact judgment | Medium | Cleanliness is retrospective; low and medium activity only |
| C-007 | Within the reviewed-control snapshot, available controls cannot estimate a model counterfactual or independent rate. | SES-006; SES-007; TMP-006; TMP-007; TMP-008 | Artifact-limited methodological inference | Medium | Contamination and poor matching are snapshot-reported |
| C-008 | Current source includes conditional process expansion and bounded restraint. | SRC-005; SRC-008; SRC-009; SRC-012; SRC-015; SRC-018; SRC-019 | Observed source | High | Historical activation unknown |
| C-009 | Model and process-policy changes occurred concurrently. | GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006; GIT-007; GIT-008; GIT-009; GIT-010; GIT-011; GIT-012; GIT-013; GIT-014; GIT-015; GIT-016 | Observed Git history | High | Concurrency is not causal ordering |
| C-010 | The supplied primary records, Git history, and artifact snapshot do not identify a positive GPT-5.6 causal effect. | SES-001; SES-002; SES-003; SES-004; SES-005; GIT-001; GIT-002; GIT-003; GIT-004; GIT-005; GIT-006; TMP-007; TMP-008 | Bounded methodological inference | Medium | Does not prove a null effect or generalize beyond supplied evidence |
| C-011 | The design snapshots prescribe isolated, reversible tests under current governing restraints. | SRC-005; TMP-010; TMP-011 | Artifact design guidance | Medium | Not frozen protocol authority; experiments have not run |
| C-012 | Publication requires minimized session coordinates and untracked raw data. | SRC-037; TMP-009 | Source and privacy rule | High | Exact alias crosswalk remains local |

## Appendix C: rerun guidance and scratch artifacts

### C.1 Rerun boundary

This section prescribes a new live-corpus rerun; it does not reproduce the historical aggregate run. Exact historical reproduction is unavailable because no contemporaneous frozen corpus inventory, complete query hashes, generated UTC, exact validator scripts, or per-artifact row counts were preserved. The values elsewhere in this report are snapshot results, not fully reproducible historical aggregates. Run analytics from the repository root with only `session_entries` enabled so archived history and unrelated sensitive views are unavailable. Routine commands use `--no-sync`; dependency installation is a separate explicit step. [SRC-037; TMP-001; TMP-007; TMP-009]

```bash
uv sync --project pi/analytics --locked

uv run --no-sync --project pi/analytics \
  python pi/analytics/pi_log_query.py \
  --source session_entries validate session_entries --format csv

uv run --no-sync --project pi/analytics \
  python pi/analytics/pi_log_query.py \
  --source session_entries \
  query "SELECT modelId AS model_id, min(timestamp) AS earliest_model_selection, max(timestamp) AS latest_model_selection, count(*) AS model_change_entries, count(DISTINCT filename) AS session_files FROM session_entries WHERE type = 'model_change' AND modelId IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'openai.gpt-5.6-luna') GROUP BY modelId ORDER BY earliest_model_selection" \
  --limit 20 --format csv
```

The preserved source-quality and cohort SQL can be loaded from `TMP-001` and run through the same helper. Such commands query the live mutable corpus and may not reproduce historical counts after appends or resumed sessions. Exact historical reproduction would require the missing contemporaneous source inventory with paths, sizes, modification times, and hashes. [SRC-037; TMP-001; TMP-007]

```bash
SOURCE_QUALITY_SQL="$(uv run --no-sync --project pi/analytics python -c "import json; print(json.load(open('.tmp/gpt-5.6-research/quantitative.json', encoding='utf-8'))['data']['sql']['sourceQuality'])")"
COHORT_SQL="$(uv run --no-sync --project pi/analytics python -c "import json; print(json.load(open('.tmp/gpt-5.6-research/quantitative.json', encoding='utf-8'))['data']['sql']['cohortDefinition'])")"

uv run --no-sync --project pi/analytics \
  python pi/analytics/pi_log_query.py \
  --source session_entries query "$SOURCE_QUALITY_SQL" \
  --limit 10 --format csv

uv run --no-sync --project pi/analytics \
  python pi/analytics/pi_log_query.py \
  --source session_entries query "$COHORT_SQL" \
  --limit 20 --format csv
```

Do not copy output containing raw session IDs, private paths, prompts, arguments, or records into tracked documentation. Candidate and control validator procedures were described but their exact scripts and query hashes were not preserved. [TMP-005; TMP-006; TMP-009]

### C.2 Integration inputs

The drafts below were synthesis inputs, not evidence sources or independent protocol authority. Material behavior claims require current source, Git, or sanitized primary sessions; the experiment program is explicitly labeled integration synthesis of current policy and the two disposable design snapshots. No claim can be validated from a draft alone.

| Artifact | Recorded SHA-256 | Filesystem mtime UTC | Bounded result size |
| --- | --- | --- | ---: |
| `.tmp/gpt-5.6-research/drafts/evidence.md` | `a4a50f1a7bbda31eb378ba273e4c81ac9d649f01f9f4f71dd07a4219fcb9c13c` | `2026-08-13T08:18:56.683522Z` | 155 lines |
| `.tmp/gpt-5.6-research/drafts/causes-v2.md` | `ca86f83351d8ca3d8f842451cd44098e0a3cfc5e978d15c097df2eaf903a9e69` | `2026-08-13T08:29:47.122442Z` | 243 lines |
| `.tmp/gpt-5.6-research/drafts/experiments-v2.md` | `1f0e6cfd760e30b7b5af0ca00bd4b7771e90d96273d6f212a6f3df529272ade4` | `2026-08-13T08:26:30.285714Z` | 163 lines |
| `.tmp/gpt-5.6-research/drafts/methods.md` | `2eed951ec0eea77540b189c1935bf87897cbc7df9a6edd2e54d295154331dafd` | `2026-08-13T08:00:49.008423Z` | 387 lines |

Scratch artifacts remain disposable and untracked. Their recorded hashes identify current local copies, and their modification times are not represented as generation times. [TMP-009]

## Appendix D: detailed experiment protocols

Appendix D is integration synthesis for future preregistration, not an experiment result or a frozen adjudicated protocol artifact. It combines current governing restraints and the canonical delegation clause from `SRC-005`, original proposal metrics and thresholds from `TMP-010`, and revisions from `TMP-011`. The drafts in Appendix C are not independent authority. Before enrollment, a runner must freeze the integrated clauses, telemetry schema, assignment, metrics, guardrails, and sample selected under readiness-gate item 8. [SRC-005; TMP-010; TMP-011]

### D.1 E3 evidence-gated verification stopping

A non-effect shadow phase first computes proposed stopping decisions while every check still runs. Treatment enrollment starts only after the independently generated classifier distinguishes useful checks from avoidable duplicates at the calibrated false-positive threshold. Automatic quality hooks, mandatory repository gates, user-requested gates, safety checks, and one held-out independent post-run validation remain identical. [TMP-010; TMP-011]

Control clause:

> After a decisive pass for a criterion and validator, another model-initiated check may run when focused validation would provide useful evidence about that validator, relevant repository state, or criterion. After a failure, the same validator may run again when focused validation would provide useful diagnostic evidence. Mandatory repository, user-requested, safety, and held-out independent checks still run.

Treatment clause:

> After a decisive pass for a criterion and validator, another model-initiated check may run only if that validator's inputs, relevant repository state, or criterion changed. After a failure, the same validator may run again only if its normalized failure signature, relevant state, or diagnostic action changed. Mandatory repository, user-requested, safety, and held-out independent checks still run.

Before enrollment, the runner freezes control and treatment variants at the same prompt position with matched length. The runner determines changed inputs, state, signatures, criteria, and diagnostic actions. Assignment is blocked by template, repository, time, risk, complexity, and read-only versus reversible mutation. Telemetry includes invocation and validator IDs, criterion, reason, result, normalized signature, input and state hashes, diagnostic action, first decisive pass, initiation class, mandatory status, and held-out defects. A skipped mandatory gate or treatment-attributable critical defect rejects the arm immediately; otherwise efficacy is assessed once at the fixed sample selected under readiness-gate item 8. [TMP-010; TMP-011]

A selective reduction supports stopping-guidance ambiguity. Unchanged model behavior with continuing automatic calls implicates hook policy. Increased held-out defects falsify the boundary. Risks include omitted independent validators, model-authored reason gaming, flaky checks, initiation misclassification, and wording novelty. [TMP-010; TMP-011]

### D.2 E2b delegation activation only

Control keeps the current clause:

> Delegate only when independent workstreams materially improve execution, such as parallel work, output-heavy investigation, or a distinct capability boundary. Never delegate serial stages or overlapping writes.

Treatment replaces only that clause:

> Delegate only when explicitly requested, when a required capability is unavailable to the parent, or when at least two ready work items have no dependency and disjoint write sets. Never delegate serial stages or overlapping writes.

The runner freezes length-matched variants, child models, limits, tool contracts, result delivery, and task lifecycle. The evaluator fixes a hidden task graph, dependencies, capability boundaries, and write sets. Assignment is blocked by template, repository, time, risk, complexity, requested delegation, required capability, and independent ready-item count. Telemetry includes graph facts, activation predicates, run IDs, parent and child work, failures, tokens, acceptance, and ownership conflicts. [SRC-005; TMP-010; TMP-011]

Calibration must include ineligible opportunities, eligible independent work, capability boundaries, and explicit delegation requests. Suppressing an explicit request or required capability, or causing an ownership conflict, rejects the arm. Selective reduction supports activation ambiguity; harm to eligible work makes the threshold too strict; no effect suggests task structure or explicit workflows dominate. Risks include gaming write-set overlap, suppressing useful specialization, graph leakage, miscounting completion delivery, and shifting work to the parent. [SRC-005; TMP-010; TMP-011]

### D.3 E4 nonactivating optional-tool search

Both arms receive neutral documentation that `activate:true` activates matches, `activate:false` lists them, omission follows session policy, and the response reports actual activation. Control retains default activation for positive-scoring inactive matches. Treatment makes omitted `activate` exactly equivalent to false. Explicit true or false, ranking, descriptions, schemas, implementations, and the initial deferred set remain unchanged. Required deferred tools must be proven explicitly activatable before enrollment. [TMP-010; TMP-011]

A deterministic wrapper fixes a nonempty search with at least one inactive match before randomization. Assignment is blocked by template, repository, time, initial registry, query breadth, exploratory versus directed work, and required deferred tools. A blinded evaluator freezes requirement and criterion-to-tool maps. Telemetry includes toolset fingerprints around every search and activation, match counts, actual activations, intervening registry changes, later calls, and frozen maps. Any intervening activation by another extension is an intention-to-treat fidelity failure, not a treatment outcome or an exclusion. [TMP-010; TMP-011]

The first treatment-attributable required-tool access or activation failure, unsafe generic substitution, or permission violation rejects the arm. Reduced activation alone is mechanical and not success; only reduced irrelevant downstream use with intact completion and safety supports the mechanism. Risks include inaccessible tools, shell substitution, post hoc relevance changes, cross-extension activation, repeated search, and documentation cueing. [TMP-010; TMP-011]

### D.4 E1 model by instruction-density factorial

E1 is a 2x2 factorial: `openai-codex/gpt-5.6-sol` versus `openai-codex/gpt-5.6-terra`, crossed with the frozen current instruction bytes versus compression-only treatment. Both models must share provider, effort, context window, and tool contract. Compression preserves clause order and every safety, ownership, live-state, repository, and explicit-user-decision clause byte-for-byte. It may delete only preregistered redundant non-safety ranges, with no insertion, substitution, paraphrase, or reordering. Independent non-outcome reviewers must unanimously approve the mapping. [SRC-005; TMP-010; TMP-011]

All cells use identical preloaded scoped instructions, tools, extensions, tasks, criteria, and context policy; tasks stay below reduction and compaction thresholds and initially include only sandboxed read-only or reversible local mutation. Assignment is interleaved within template, repository, and time blocks. Hierarchical testing evaluates prompt main effect, model-by-prompt interaction, then model main effect. Each semantic-incident category -- unrequested scope expansion, unnecessary process artifacts, redundant review or validation, equivalent retry loops, and unjustified task or delegation ceremony -- is preregistered as a required secondary outcome on all assigned tasks. No primary or secondary is conditioned on accepted completion. [TMP-010; TMP-011]

Telemetry freezes assignments, resolved model and provider, effort, context, tool contract, cell, prompt and deletion hashes, clause mapping, instruction order and bytes, extension manifest, toolset fingerprint, policy results, acceptance, and context usage. Any runtime drift fails fidelity. A compression-attributable safety, ownership, live-state, or user-decision violation rejects the prompt arm. The explicit null predicts no prompt main effect, no model main effect, and no interaction after blocking. Within this benchmark, that no-effects result would shift attention toward task mix, workflow activation, tools, or selected upper-tail anomalies; it would not prove that those alternatives caused the historical snapshot. Prompt effect alone supports instruction-density sensitivity; interaction supports model-dependent sensitivity; model effect alone supports only a tier difference. Risks include semantic loss, salience changes, interaction underpower, tokenization differences, provider drift, and category dilution. [TMP-010; TMP-011]

### D.5 E2a durable task records only

E2a runs only if control calibration, with delegation separate and canonical, shows enough ineligible task creation for a powered test. A successful E2b treatment is not part of its baseline. [SRC-005; TMP-010; TMP-011]

Treatment clause:

> Create a durable task record only when explicitly requested or when task state must survive a declared dependency or context handoff.

Before enrollment, the runner freezes a control clause that retains current long-work, dependency, and material-benefit guidance, is length matched to the treatment clause, and occupies the same prompt position. Delegation, lifecycle validation, task tools, criteria, and other prompts remain fixed. The evaluator freezes hidden dependencies and handoff needs. Assignment is blocked by template, repository, time, complexity, explicit tracking, dependency state, and handoff need. Telemetry includes requests, hidden classifications, task lifecycle, terminal states, handoffs, retained state, acceptance, and parent work. [SRC-005; TMP-010; TMP-011]

Loss of required durable state or requested tracking rejects the arm. Selective reduction supports activation ambiguity; state loss makes the threshold too strict; no effect suggests explicit workflows already control creation. Risks include evaluator error, hidden dependencies, displacement into prose, lifecycle defects, and low baseline prevalence. [SRC-005; TMP-010; TMP-011]

### D.6 E6 soft-limit active-turn compaction holdout

E6 runs last and only after neutral calibration finds fixed offline templates that naturally cross the soft threshold, semantic post-threshold incidents remain prevalent, an interaction- and cluster-aware sample is feasible, and every listed compaction field -- including explicit `continuationCount` and `abortReason` values -- passes end-to-end observability validation. E6 remains blocked until that readiness condition passes. [TMP-010; TMP-011]

Control retains soft-limit active-turn compaction. Treatment disables only that soft limit before the hard safety boundary. Tool reduction is off in both arms. Native or hard compaction remains for safety; activation in treatment is a treatment failure and safety event rather than an exclusion. No live, stateful, production, destructive, or safety-critical task is eligible. [TMP-010; TMP-011]

A neutral pilot fixes naturally long templates with safe reserve. Assignment is blocked by template, repository, time, expected output, reserve, and threshold-crossing probability; every assigned run remains in analysis even without crossing. The primary covers repeated work, omitted preregistered facts, lost decisions, unnecessary continuation, and premature completion after the expected threshold region. Telemetry includes context at turn end, soft and hard triggers, generation IDs, explicit `abortReason`, explicit `continuationCount`, continuation triggers, context failures, handoff bytes, native or hard compaction, post-threshold acceptance, and independent fact retention. [TMP-010; TMP-011]

The first treatment-attributable context failure, critical fact loss, safety-state omission, or native or hard compaction caused by holdout rejects the arm. Fewer steps without semantic improvement is not success. Better completion or retention under control supports soft compaction as useful restraint; a semantic reduction with intact guardrails suggests the soft threshold is too aggressive. Risks include context failure, state loss, endogenous hard compaction, premature completion rewarded as brevity, low exposure, provider-specific accounting, and benchmark cost. [TMP-010; TMP-011]
