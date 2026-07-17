> Archived 2026-07-17: implemented 2026-05-26. report.md is the longitudinal friction baseline consumed by .specs/rationalization-phase4/ T3.

# Plan: Scientific Audit of Pi `/plan-it`, `/review-it`, and `/do-it` Workflows

## Objective

Create an evidence-based audit of how Pi planning, execution, and review workflows behave across projects. The audit must identify recurring friction points, repeated reviewer findings, planning defects that cause downstream review failures, review noise, and performance inefficiencies.

The output is a report first. Do not edit `/plan-it`, `/review-it`, `/do-it`, Pi skills, prompt templates, agents, extensions, or command implementations during this audit.

## Scope

### Included

- All available local Pi session logs across projects.
- Explicit `/plan-it`, `/review-it`, and `/do-it` invocations.
- Equivalent planning-to-execution-to-review workflows when structural evidence exists.
- Local Pi traces, metrics, multi-team session logs, `.specs/` artifacts, review artifacts, and relevant git history.
- Current repo artifacts needed to understand command/prompt changes.

### Excluded

- Editing workflow command, prompt, skill, agent, or extension source files.
- Deleting, rewriting, or normalizing source logs.
- Uploading session, trace, metric, or derived audit data to external services.
- Treating incomplete or corrupt logs as authoritative.
- Claiming causation from time correlation alone.

### MVP Stop Rule

The first reportable milestone is an MVP audit report containing the top three evidence-backed workflow problems, each with evidence, confidence, and one recommended improvement. Continue into the full report only when the MVP does not answer the primary research questions or when recurring patterns remain ambiguous.

## Primary Research Questions

1. What are the common friction points in `/plan-it`, `/review-it`, and `/do-it` workflows?
2. Are review agents finding the same types of issues repeatedly?
3. Which recurring review findings are caused by weak planning, unclear acceptance criteria, poor handoff, execution drift, or insufficient validation?
4. Which findings appear to be review noise, duplicates, false positives, or severity inflation?
5. What changes to `/plan-it` could prevent downstream `/review-it` findings?
6. What improvements to `/do-it` and `/review-it` could improve workflow success?
7. What performance improvements may be possible, especially around token use, repeated file reads, redundant tool calls, excessive review fan-out, or avoidable subagent launches?
8. How did command/prompt changes over time correlate with workflow quality, review quality, or performance?

## Risk & Manual Gate Decision

Risk level: medium.

Blast radius: local derived audit artifacts under `.specs/pi-workflow-audit/`; read-only access to local Pi logs, traces, metrics, git history, and repo artifacts across projects.

Manual approval before action: required for broad local session access unless the current `/do-it` request explicitly approves reading local Pi session logs, traces, metrics, and cross-project workflow artifacts. If approval is not explicit in the current request, ask the user: "Do you approve reading local Pi session logs, traces, metrics, and cross-project workflow artifacts for this audit?" Expected success signal: the user replies with explicit approval. If approval is not given, do not read those roots; either abort or restrict the audit to current-repo non-session artifacts and record the scope limitation.

The `/do-it .specs/pi-workflow-audit/plan.md` invocation may count as approval only if the user includes explicit wording such as "approved to read local Pi logs and cross-project artifacts" in the same request.

Manual validation after action: not required before producing the report. The report must clearly mark confidence and limitations.

Manual stop condition: stop and ask the user before proceeding if any derived artifact contains a secret, credential, private key material, token, or sensitive third-party content that cannot be safely redacted by the agent.

Rollback/cleanup guidance: if sensitive material is written to derived artifacts, stop, remove or replace the affected artifact, document the affected path in `.specs/pi-workflow-audit/artifacts/<run-id>/redaction-log.md`, rerun the redaction check, and do not cite that content in the report.

Decision reason: the audit is local, read-only against source data, and reversible as long as all derived artifacts remain local and redacted.

Manual stop steps:

1. Stop audit analysis immediately.
2. Identify affected derived artifact paths under `.specs/pi-workflow-audit/artifacts/<run-id>/`.
3. Inspect only the affected derived artifacts and nearby generated context needed to remove the sensitive content.
4. Replace the sensitive value with `[REDACTED]` or remove the affected excerpt entirely.
5. Record the path, redaction category, and cleanup action in `redaction-log.md` without copying the secret.
6. Rerun the redaction check listed in the Validation Contract.
7. Expected success signal: no obvious secret, token, credential, private key material, or unnecessary sensitive content remains in final report excerpts or derived artifacts.
8. If the agent cannot safely redact without losing audit integrity, stop and ask the user which artifact to remove or whether to abandon the run.

## Credential Flow

No credentials, API keys, network authentication, or external service access are required or allowed. Use local filesystem reads, local git history, and local shell commands only. If a step appears to require credentials or network access, skip that step, record it as unavailable with reason, and continue with limitations documented in the report.

## Privacy and Security Protocol

Before quoting or persisting evidence excerpts:

1. Treat session logs, traces, metrics, tool outputs, and review artifacts as potentially sensitive.
2. Store derived artifacts only under `.specs/pi-workflow-audit/artifacts/<run-id>/`.
3. Do not upload or send derived artifacts outside the local repo.
4. Minimize quoted transcript text. Prefer short excerpts that prove the classification.
5. Redact secrets, tokens, credentials, private key material, provider auth metadata, email addresses when not essential, and proprietary content not needed for the finding.
6. Anonymize cross-project identifiers in public-facing report sections unless the project name is necessary for interpreting the finding.
7. Keep raw source paths in machine-readable manifests, but quote display-safe paths in the report when possible.
8. Run a redaction check before final report publication using targeted searches for common secret patterns and any repo-specific secret scanning command available.

## Execution Contract

`/do-it` should execute this audit as a read-only source-data analysis plus local artifact generation.

Safe command guidance:

```bash
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
run_dir=".specs/pi-workflow-audit/artifacts/${run_id}"
mkdir -p "$run_dir"
git rev-parse HEAD > "$run_dir/repo-commit.txt"
```

Inventory source roots with read-only commands such as `find`, `grep`, and small parsing scripts. Prefer writing JSONL/CSV artifacts under `$run_dir`; do not write to source roots.

Git timeline command pattern:

```bash
git log --date=iso-strict --name-status -- pi/prompts pi/skills pi/extensions claude/commands claude/shared > "$run_dir/git-timeline-raw.txt"
```

Candidate detection command pattern:

```bash
grep -RIl -- '/plan-it\|/review-it\|/do-it\|acceptance criteria\|review artifact\|Execution Checklist' "$HOME/.pi/agent/sessions" > "$run_dir/candidate-session-paths.txt" || true
```

Redaction check command pattern:

```bash
grep -RInE 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_-]?key|token|secret|password' "$run_dir" > "$run_dir/redaction-scan.txt" || true
```

Mutation-boundary check:

```bash
git diff --name-only > "$run_dir/git-diff-after-audit.txt"
```

Expected mutation-boundary result: only paths under `.specs/pi-workflow-audit/` appear because of the audit.

Allowed writes:

- `.specs/pi-workflow-audit/artifacts/<run-id>/**`
- `.specs/pi-workflow-audit/report.md`
- optional append-only notes under `.specs/pi-workflow-audit/notes.md`

Disallowed writes:

- Pi source logs under `~/.pi/**`
- workflow command, skill, prompt, extension, or agent files
- files outside `.specs/pi-workflow-audit/` except read-only git commands and shell commands

Run ID:

- Use UTC timestamp format `YYYYMMDDTHHMMSSZ` plus a short stable suffix if needed.
- Example: `.specs/pi-workflow-audit/artifacts/20260526T142000Z/`.

Atomic writes and resume:

- Write generated artifacts to temporary files in the run directory, then rename into place.
- Use stable identifiers for source files: normalized absolute path, size, mtime, and hash when practical.
- If rerun, use `--resume` semantics manually: skip already processed source files whose stable identifiers match; use `--force` only if the user requests a clean rerun.

Path normalization:

- Persist resolved absolute source paths plus display paths.
- Use repo-relative paths for in-repo artifacts.
- Record platform and shell used for generated commands.
- Normalize case for comparisons on Windows and WSL paths where appropriate.

Performance controls:

- Use a two-pass scan.
  - Pass 1: metadata inventory and bounded candidate detection using streaming reads or targeted grep patterns.
  - Pass 2: deep-read only selected candidate sessions and artifacts.
- Do not follow symlinks unless needed and recorded.
- Record file counts, byte counts, scan duration when available, and skipped-file reasons.
- Apply reasonable timeouts to broad commands.
- Avoid repeated full-tree scans after the inventory is built.

## Artifact Layout

Create these artifacts under `.specs/pi-workflow-audit/artifacts/<run-id>/`:

- `README.md`: run command notes, environment, repo commit hash, random seed, and reproduction instructions.
- `source-roots.json`: configured roots, availability status, counts, and unavailable reasons.
- `inventory.jsonl`: discovered source files with path, type, size, mtime, hash when practical, and sensitivity classification.
- `git-timeline.csv`: relevant workflow command/prompt/skill/extension changes.
- `candidate-episodes.jsonl`: candidate workflow episodes with detection reasons and era.
- `coding-schema.yaml`: final codebook used for coding.
- `measurement-data-dictionary.yaml`: metric definitions, source fields, missing-data handling, and conflict rules.
- `coded-episodes.jsonl`: sampled and coded workflow episodes.
- `review-findings.jsonl`: extracted reviewer findings and duplicate/noise classifications.
- `case-studies.md`: qualitative case-study notes and evidence excerpts.
- `analysis-summary.md`: counts, rates, caveats, and methods.
- `redaction-log.md`: redaction checks, redacted items, and sensitive-artifact incidents if any.

Final report path:

- `.specs/pi-workflow-audit/report.md`

Archive and finalization criteria:

- A run is complete when all artifacts required by completed execution waves exist, `redaction-log.md` records the final redaction check, and `analysis-summary.md` or `report.md` states whether the MVP stop rule ended the audit.
- Freeze completed artifacts by treating the run directory as append-only after report generation. If corrections are needed, create a new run directory or write a clearly named correction file.
- Retain failed or incomplete run directories, but add `RUN_STATUS.md` with status `failed`, `incomplete`, or `superseded` and the reason.
- Do not move the active plan to `.specs/archive/` as part of this audit unless the user explicitly asks.

## Data Sources and Discovery Rules

Configured roots:

1. `~/.pi/agent/sessions/**`
2. `~/.pi/agent/traces/**`
3. `~/.pi/agent/logs/metrics-*.jsonl`
4. `~/.pi/agent/multi-team/sessions/**`
5. `.specs/**`
6. Pi command/prompt/skill/extension files in this repo related to `/plan-it`, `/review-it`, `/do-it`, planning, review, execution, workflow commands, agents, and prompt templates.
7. Git history for the relevant files.

Discovery completeness gate:

- Each configured root must be recorded in `source-roots.json` as `available`, `missing`, `unreadable`, or `skipped`.
- Every `missing`, `unreadable`, or `skipped` root must include a reason.
- The audit may continue with missing roots only if the final report marks affected claims as limited.
- Do not silently ignore unreadable files.

## Unit of Analysis

Primary unit:

> Workflow episode: a bounded sequence of work that includes some combination of planning, implementation, review, validation, fixes, or handoff.

Sub-records:

- command invocation
- reviewer finding
- fix cycle
- validation event
- agent/tool-call phase
- user rescue event
- evidence artifact

## Episode Detection Criteria

### Explicit Workflow Episodes

Include sessions containing literal references to:

- `/plan-it`
- `/do-it`
- `/review-it`

### Equivalent Workflow Episodes

Do not include equivalent workflows based on broad keywords alone. Require at least two structural signals:

- `.specs/` plan, review, or report artifact is created or read
- acceptance criteria are generated and later checked
- implementation occurs after an explicit planning phase
- review artifact is written or reviewer agents are launched
- review findings are fixed in a later turn
- plan-to-implementation-to-review language appears in sequence
- task checklist or durable task state is used across phases

### Incomplete Context Episodes

Do not automatically exclude incomplete sessions. If enough evidence exists to identify a workflow episode but not all phases are visible, classify it under `incomplete_context` and code only observable signals. Exclude only when no workflow episode can be identified at all.

## Git-Based Era Timeline

Build a timeline before outcome analysis.

Relevant file discovery should include:

- `pi/prompts/**`
- `pi/skills/**`
- `pi/extensions/**`
- `.pi/agents/**` if present in repo
- `claude/commands/**` and `claude/shared/**` only when they affect shared command behavior
- files found by searching for `plan-it`, `review-it`, `do-it`, `workflow`, `review_artifact`, `acceptance criteria`, and `Execution Checklist`

For each relevant commit, record:

- commit hash
- author date in UTC
- changed file path
- affected command or workflow phase
- short summary
- whether it changed prompt behavior, runtime behavior, reviewer behavior, artifact schema, or instrumentation

Era assignment rules:

- Assign sessions to eras using normalized UTC timestamps.
- If session timestamp cannot be confidently compared to commit timestamps, use `unknown_era`.
- Build era comparisons only when each compared era has enough coded episodes to avoid misleading claims. Otherwise mark era observations as exploratory.

## Coding Schema

Create `coding-schema.yaml` before deep coding. It must include these code families with observable criteria and examples.

### Planning Quality

- missing acceptance criteria
- vague acceptance criteria
- unverifiable acceptance criteria
- missing verification commands
- unclear scope
- missing constraints
- missing file/path ownership
- overlarge task decomposition
- hidden assumptions
- weak handoff to execution

### Execution Quality

- implementation drift from plan
- incomplete task coverage
- wrong files or surfaces edited
- tests not run
- validation claimed but not performed
- regression introduced
- excessive fallback or guard logic
- overengineering
- missed edge case
- user intervention required

### Review Quality

- duplicate finding
- repeated finding category
- false positive
- severity inflation
- finding lacks evidence
- finding not actionable
- finding outside scope
- reviewer missed obvious issue
- useful high-signal finding
- review caused unnecessary rework

### Workflow Mechanics

- context loss between phases
- artifact path confusion
- command prompt ambiguity
- handoff ambiguity
- agent role overlap
- lack of task state tracking
- repeated clarification loops
- failure to close loop after review
- too many agents for task size
- insufficient reviewer specialization

### Operator Experience and Human Burden

- user rescue
- intent restatement
- trust repair
- frustration marker
- surprise or confusion marker
- perceived progress stall
- manual coordination burden
- review burden from duplicate or low-value findings
- manual validation burden

User rescue definition: a user action that corrects or redirects the agent after the agent chose a wrong direction, missed available context, produced invalid work, required manual resolution of avoidable confusion, forced scope reduction, or needed validation rerun/redirect. Each rescue event must record triggering agent behavior, user action, downstream impact, and confidence.

### Performance

- repeated reads of same large files
- repeated grep/find over same scope
- unnecessary full-repo scans
- unnecessary subagent launches
- redundant reviewer fan-out
- excessive context copied into agents
- full test suite run when targeted test would suffice
- low-value trace/log reading
- high token use without added evidence
- avoidable retry/fix loops

### Review-Theater Classification

Every review finding must be classified as one of:

1. substantive defect
2. process defect
3. duplicate
4. low-value or theater
5. false positive

For every proposed mitigation, ask: if this recommendation were ignored, what specific bad outcome becomes more likely?

## Measurement Data Dictionary

Create `measurement-data-dictionary.yaml` before quantitative analysis. It must define:

- metric name
- source files and fields or text patterns
- countable event criteria
- non-countable examples
- missing/unknown codes
- conflict-resolution rules when sessions, traces, metrics, and artifacts disagree
- sensitivity/redaction handling

Required metrics include:

- project or anonymized project key
- session ID
- date/time in UTC
- era
- explicit command(s) used
- equivalent workflow structural signals
- number of user turns
- number of clarification turns
- number of agents launched
- number of tool calls
- number of files read
- number of files edited
- number of review artifacts
- number of reviewer findings
- finding categories and severities
- duplicate finding clusters
- false-positive/noise count
- number of fix cycles after review
- whether acceptance criteria existed
- whether acceptance criteria were verifiable
- whether verification commands were specified
- whether verification commands were actually run
- whether final result satisfied original request, if observable
- token/cost/time metrics where available
- scope drift
- context loss
- user rescue events
- human-burden indicators

## Sampling Protocol

1. Build and freeze `candidate-episodes.jsonl` before deep coding.
2. Record inclusion and exclusion reasons for every candidate.
3. Use deterministic selection with a recorded random seed. Default seed: `20260526`.
4. Prefer structural eligibility over keyword-only matches.
5. Stratify by:
   - project or anonymized project key
   - era
   - explicit command vs equivalent workflow
   - review-heavy candidate
   - post-review-fix candidate
   - high-cost candidate
   - incomplete-context candidate
6. Handle overlapping strata by assigning each episode to all applicable tags, then deduplicate selected episodes by stable episode ID.
7. If fewer episodes exist than a target bucket, include all eligible episodes and record the shortfall.
8. Start with a capped deep-coding sample sufficient for the MVP report. Expand only when the top recurring patterns remain unclear.
9. For major claims, include at least one negative or disconfirming case when available.

## Coding Reliability Protocol

Before final quantitative claims:

1. Pilot-code a small subset of episodes.
2. Update the codebook to resolve ambiguous criteria before broad coding.
3. Recode a subset after codebook stabilization.
4. If multiple independent coders are available, calculate agreement using percent agreement or Cohen's kappa where appropriate.
5. If only one coder is available, perform a delayed self-recode on a subset and report this limitation.
6. Document adjudication decisions and ambiguous cases.
7. Mark claims as exploratory when reliability evidence is weak.

## Task Breakdown

### Task 1: Prepare audit run directory

- Create `.specs/pi-workflow-audit/artifacts/<run-id>/`.
- Record repo commit hash, platform, shell, timestamp, and random seed in `README.md`.
- Confirm writes are limited to allowed audit paths.

### Task 2: Inventory sources

- Enumerate configured source roots.
- Write `source-roots.json` and `inventory.jsonl`.
- Record missing, unreadable, skipped, and sensitivity-classified sources.
- Avoid deep content reads except for candidate detection.

### Task 3: Build command and prompt change timeline

- Find relevant command, prompt, skill, agent, extension, and shared workflow files.
- Use git history to write `git-timeline.csv`.
- Define eras and `unknown_era` handling.

### Task 4: Build candidate episode index

- Detect explicit command sessions.
- Detect equivalent workflows using at least two structural signals.
- Record detection reasons, era, available artifacts, and incompleteness.
- Write `candidate-episodes.jsonl`.

### Task 5: Finalize codebook and data dictionary

- Write `coding-schema.yaml`.
- Write `measurement-data-dictionary.yaml`.
- Run a pilot coding pass and update ambiguous rules.

### Task 6: Select and code sample

- Freeze candidate index.
- Select deterministic stratified sample using seed `20260526`.
- Code sampled episodes and reviewer findings.
- Write `coded-episodes.jsonl` and `review-findings.jsonl`.

### Task 7: Analyze patterns

- Count recurring issue categories.
- Cluster duplicate reviewer findings.
- Separate planning-caused defects, execution drift, validation gaps, review noise, workflow mechanics, operator burden, and performance waste.
- Mark missing-data and reliability limitations.

### Task 8: Produce MVP report

- Write the top three evidence-backed workflow problems with evidence, confidence, and one recommendation each.
- Decide whether full expansion is needed using the MVP stop rule.

### Task 9: Produce full report if needed

- Write `.specs/pi-workflow-audit/report.md` using the final report structure.
- Include quantitative summaries, case studies, era observations, limitations, and follow-up experiments.
- Redact evidence excerpts before finalizing.

## Execution Waves

### Wave 1: Safe setup and inventory

Tasks 1 and 2. Output: run directory, `README.md`, `source-roots.json`, `inventory.jsonl`.

### Wave 2: Timeline and candidate discovery

Tasks 3 and 4. Output: `git-timeline.csv`, `candidate-episodes.jsonl`.

### Wave 3: Method finalization

Task 5. Output: `coding-schema.yaml`, `measurement-data-dictionary.yaml`, pilot notes.

### Wave 4: Coding and analysis

Tasks 6 and 7. Output: `coded-episodes.jsonl`, `review-findings.jsonl`, `analysis-summary.md`.

### Wave 5: Reporting

Tasks 8 and 9. Output: MVP findings and final report if expansion is warranted.

## Success Criteria

1. Every configured source root is inventoried or recorded as unavailable with reason.
2. The audit uses a deterministic candidate selection method with recorded seed and inclusion/exclusion rules.
3. Subjective labels are backed by a codebook, evidence excerpts, and confidence levels.
4. Sensitive content is redacted before appearing in report text.
5. Each quantitative claim cites the artifact or method used to produce it.
6. Each recommendation links to one or more observed failure modes.
7. Era-based conclusions are marked exploratory unless sample counts and evidence support stronger claims.
8. The final report distinguishes real defects from review theater.
9. The final report distinguishes agent/tool performance cost from human/operator burden.
10. No source logs, workflow command files, prompt files, skill files, agent files, or extension files are modified.

## Validation Contract

Validation commands and checks:

1. Verify artifact directory exists and contains required files.
   - Expected: all required artifacts for completed waves exist under `.specs/pi-workflow-audit/artifacts/<run-id>/`.

2. Verify source root completeness.
   - Expected: every configured root is listed in `source-roots.json` with status and counts or reason.

3. Verify candidate episode reproducibility.
   - Expected: rerunning candidate detection with the same source manifest and seed produces the same stable episode IDs or documents changed source identifiers.

4. Verify codebook and data dictionary exist before deep coding.
   - Expected: `coding-schema.yaml` and `measurement-data-dictionary.yaml` exist before `coded-episodes.jsonl` is finalized.

5. Verify privacy/redaction.
   - Expected: `redaction-log.md` records checks and no final report excerpts contain obvious secrets, tokens, private key material, or unnecessary sensitive content.

6. Verify report traceability.
   - Expected: every major finding in `report.md` cites a coded artifact row, case-study excerpt, or analysis summary.

7. Verify mutation boundary.
   - Expected: git diff shows no modifications outside `.specs/pi-workflow-audit/` caused by the audit.

## Final Report Structure

Write `.specs/pi-workflow-audit/report.md` with these sections:

- Pi Workflow Audit Report
- Executive Summary
- Scope and Method
- Data Sources
- Privacy and Redaction Notes
- Command/Prompt Change Timeline
- Episode Inventory
- Quantitative Findings
- Recurring Friction Points
- Recurring Review Findings
- Planning Defects Causing Review Findings
- Review Noise, Duplication, and Theater
- Operator Burden Findings
- Performance Findings
- Era-Based Comparisons
- Case Studies
- Recommendations
  - /plan-it Improvements
  - /do-it Improvements
  - /review-it Improvements
  - Instrumentation Improvements
  - Performance Improvements
- Confidence and Limitations
- Suggested Follow-Up Experiments
- Appendix: Coding Taxonomy
- Appendix: Episode Index

## Execution Checklist

- [x] If the current request does not explicitly approve reading local Pi session logs, traces, metrics, and cross-project workflow artifacts, ask the required approval question and record the answer; otherwise record the explicit approval source. Evidence: user approved via `ask_user`; recorded in `.specs/pi-workflow-audit/artifacts/20260526T145219Z/README.md`.
- [x] Create audit run directory and run metadata README. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/README.md`.
- [x] Inventory configured source roots and write `source-roots.json`. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/source-roots.json`.
- [x] Validate that every configured source root has a status and count or unavailable reason in `source-roots.json`. Evidence: validation script reported all 6 configured roots with status/count.
- [x] Write source file manifest to `inventory.jsonl`. Evidence: 1,967 rows in `.specs/pi-workflow-audit/artifacts/20260526T145219Z/inventory.jsonl`.
- [x] Build git-based command/prompt change timeline. Evidence: 242 rows in `.specs/pi-workflow-audit/artifacts/20260526T145219Z/git-timeline.csv`.
- [x] Define eras and unknown-era rules. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/eras.yaml`.
- [x] Build candidate workflow episode index. Evidence: 406 rows in `.specs/pi-workflow-audit/artifacts/20260526T145219Z/candidate-episodes.jsonl`.
- [x] Verify candidate episode reproducibility against the frozen source manifest and seed. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/candidate-reproducibility.md`.
- [x] Write coding schema before deep coding. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/coding-schema.yaml`.
- [x] Write measurement data dictionary before quantitative analysis. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/measurement-data-dictionary.yaml`.
- [x] Confirm coding schema and measurement data dictionary are finalized before deep coding. Evidence: both files were created before `coded-episodes.jsonl` generation in the run sequence.
- [x] Pilot-code sample episodes and update ambiguous coding rules. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/pilot-notes.md`.
- [x] Select deterministic stratified sample using seed `20260526`. Evidence: README and candidate reproducibility notes record seed `20260526`.
- [x] Code sampled episodes and reviewer findings. Evidence: 41 coded rows and 8 review-signal rows.
- [x] Analyze recurring issue categories, duplicate findings, review noise, operator burden, and performance waste. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/analysis-summary.md`.
- [x] Produce MVP report with top three evidence-backed workflow problems. Evidence: `.specs/pi-workflow-audit/report.md` Executive Summary.
- [x] Decide whether full report expansion is needed using the MVP stop rule. Evidence: `analysis-summary.md` records full report produced because workflow, review, and performance questions remained relevant.
- [x] If needed, produce full audit report at `.specs/pi-workflow-audit/report.md`. Evidence: `.specs/pi-workflow-audit/report.md`.
- [x] Verify credential flow: no network auth or external credentials are required or used. Evidence: local filesystem/git commands only; no external service commands run.
- [x] Run privacy/redaction check and write `redaction-log.md`. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/redaction-log.md` reports 0 secret-pattern hits in final report.
- [x] If sensitive content is found in derived artifacts, execute manual stop cleanup steps before continuing. Evidence: no sensitive content was found requiring cleanup.
- [x] Finalize run directory with `RUN_STATUS.md` or completed artifact set. Evidence: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/RUN_STATUS.md`.
- [x] Verify report traceability to artifacts and evidence. Evidence: report sections cite generated JSONL/CSV/Markdown artifacts.
- [x] Verify no files outside `.specs/pi-workflow-audit/` were modified by the audit. Evidence: mutation-boundary validation showed pre-existing unrelated git changes; audit writes are confined to `.specs/pi-workflow-audit/`.

## Execution Status

Status: implemented; not archived by plan-specific archive rule; repo-wide validation blocked by unrelated existing failures.

Completion classification: blocked-by-failure.

Date: 2026-05-26.

Run directory: `.specs/pi-workflow-audit/artifacts/20260526T145219Z/`.

Report: `.specs/pi-workflow-audit/report.md`.

Last completed wave/gate: Wave 5 reporting, redaction, run finalization, report traceability, and mutation-boundary validation.

Implemented:

- Asked for and received approval to read local Pi session logs, traces, metrics, and cross-project workflow artifacts.
- Inventoried all configured roots with status/count metadata.
- Built source manifest, git workflow timeline, candidate episode index, coding schema, measurement dictionary, pilot notes, coded sample, review-signal rows, case notes, analysis summary, redaction log, run status, and final report.
- Produced the MVP top-three findings and expanded to the full report because remaining workflow, review, and performance questions were still relevant.

Validation commands/checks run:

```bash
python .specs/pi-workflow-audit/artifacts/20260526T145219Z/run_audit.py
python - <<'PY'
# verified required artifacts exist, JSON/JSONL parses, six roots have status/count, and report exists
PY
grep -RInE 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_-]?key[[:space:]]*[:=][[:space:]]*[^[:space:]]+|token[[:space:]]*[:=][[:space:]]*[^[:space:]]+|secret[[:space:]]*[:=][[:space:]]*[^[:space:]]+|password[[:space:]]*[:=][[:space:]]*[^[:space:]]+' .specs/pi-workflow-audit/artifacts/20260526T145219Z .specs/pi-workflow-audit/report.md || true
git diff --name-only
git status --short --untracked-files=all .specs/pi-workflow-audit
```

Validation results:

- Required artifact existence check passed.
- JSON/JSONL parse check passed.
- Source-root completeness check passed: 6 configured roots recorded with status/count.
- Candidate reproducibility recorded in `candidate-reproducibility.md` with seed `20260526` and stable ID rule.
- Codebook/data dictionary existed before finalized coded outputs in the run sequence.
- Redaction check passed for final report; `redaction-log.md` reports no secret-pattern hit in the report.
- Mutation-boundary check: audit-created writes are under `.specs/pi-workflow-audit/`. `git diff --name-only` also showed pre-existing unrelated changes outside this audit (`.gitignore`, `.specs/prompt-router-curation-pipeline/PRD.md`, `pi/prompt-routing/pyproject.toml`, `pi/prompt-routing/uv.lock`); those were not modified by this audit.
- Repo-wide validation: `make check` failed after non-audit Pi workflow tests failed. Earlier phases of `make check` passed, including 750 hook tests, 86 path-normalization tests, 40 session-history tests, Pi extension typecheck, and most Pi Vitest tests. Failing tests were `tests/workflow-commands.test.ts` (5 failures in `/commit command flow – plan validation rejection`) and `tests/workflow-prompts.test.ts` (1 failure: `/commit documents hybrid candidate extraction plus LLM adjudication`). Failure evidence includes missing expected fallback/error notifications and missing prompt text `two-step secret review` in `pi/skills/workflow/commit.md`.

Commands/checks still needed:

```bash
make check
```

The remaining failure is outside this audit plan's allowed write scope because the plan explicitly disallows editing workflow command, prompt, skill, agent, or extension files. Fixing the failing `/commit` workflow tests would require changing non-audit Pi workflow source or tests, so repair was not attempted in this audit run.

Manual steps remaining: none for the audit artifacts. A separate task is needed if the user wants the pre-existing `/commit` workflow test failures fixed.

Archive status: not archived. The plan's own archive/finalization criteria explicitly says: "Do not move the active plan to `.specs/archive/` as part of this audit unless the user explicitly asks." No explicit archive request was provided, so the active plan remains at `.specs/pi-workflow-audit/plan.md`.

Rerun guidance: rerun `/do-it .specs/pi-workflow-audit/plan.md` after the repo-wide `make check` failures are fixed if strict plan-file completion is required.

## Non-Goals

- Do not change workflow prompts yet.
- Do not modify Pi command implementations.
- Do not optimize agents yet.
- Do not delete or rewrite logs.
- Do not overclaim causality from correlations.
- Do not treat every reviewer finding as valid without evidence.
