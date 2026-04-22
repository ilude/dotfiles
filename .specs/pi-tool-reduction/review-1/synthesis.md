---
date: 2026-04-22
status: synthesis-complete
---
# Plan Review Synthesis: pi tool-output reduction

## Coordinator note

The coordinator instructions called for launching six reviewer subagents in parallel via a `Task` subagent tool with `subagent_type: general-purpose`. That tool is not available in the current environment -- the only "Task*" tools exposed are the task-list management tools (`TaskCreate` / `TaskUpdate` / `TaskGet`), not a subagent launcher, and `ToolSearch` surfaced no general-purpose agent-spawn tool. The review was therefore executed in-context, playing each reviewer role in turn, with repo-level verification via `Read` / `Grep` / `Glob` / `Bash`. Every CRITICAL / HIGH finding below is backed by a direct citation into the repo.

## Review Panel

| Reviewer | Role | Findings | Verified Issues |
|----------|------|---------:|----------------:|
| R1 | Completeness & explicitness | 4 | 3 |
| R2 | Adversarial / red team | 4 | 3 |
| R3 | Outside-the-box / simplicity | 3 | 2 |
| R4 | ML / data science | 4 | 4 |
| R5 | Security & privacy | 3 | 3 |
| R6 | Cross-platform & hot-path perf | 5 | 5 |

Total unique verified findings after dedupe: 13 bugs + 9 hardening items.

## Outside-the-Box Assessment

Phase 1 is worth shipping. Phase 2 is over-scoped relative to what Phase 1 will prove. Two specific simplifications are strongly recommended:

1. **Drop the classifier from Phase 1.** The classifier's label is `rule_id`, produced by the same deterministic argv matcher the classifier is supposedly helping. This is label leakage by construction: the classifier can only learn what the matcher already computed, so in Phase 1 its predictions are either redundant (argv matched) or trained on `__passthrough__` (argv did not match), which teaches nothing useful about routing. The plan's own T8 acceptance `test_argv_match_takes_priority` cements this: argv match always wins, classifier never overrides. Replace T8 in Phase 1 with a thin "novelty queue" (record misses to the corpus, nothing more). Re-introduce a classifier only after the Phase 2 codegen has produced a second rule set whose boundaries the argv matcher cannot disambiguate -- that is the first moment the classifier has a non-trivial label to learn.

2. **Reconsider "port applyRule to Python" vs "call tokenjuice once per N bash commands".** The plan rejected "fork tokenjuice as a subprocess" citing Node runtime + console flashing, but the same spawn cost applies to the chosen Python approach (100-400ms Windows cold start per Bash tool -- see R6). A long-lived Python daemon (a single `python -m pi.tool_reduction.serve` stdio server, which pi already does for prompt-routing-adjacent flows) eliminates both the cold-start hit and the port-22-rules-to-Python translation risk. Fold this into T6 or accept the cold-start budget explicitly.

Otherwise the two-phase split (deterministic hot path, offline LLM-driven codegen with schema-gated outputs) is a good shape. Classifier-as-router-only and JSON-schema-only codegen are correctly constrained.

## Bugs (must fix before executing)

### B1. `pi/tool-reduction/` is not importable as `pi.tool_reduction` [CRITICAL]
Flagged by: R1, R6.
Verified: `ls C:/Users/mglenn/.dotfiles/pi/prompt-routing/__init__.py` -> not found; `pi/` contains no `__init__.py`. The plan repeatedly invokes `python -m pi.tool_reduction.reduce` (T6, T9, T12, Success Criteria) and `from pi.tool_reduction.pipeline import ...` (T2 acceptance). Two independent problems:
  a. The directory name uses a hyphen (`tool-reduction`), which is not a valid Python module identifier -- `pi.tool_reduction` cannot resolve to `pi/tool-reduction/`.
  b. Even if renamed to `pi/tool_reduction/`, there is no `pi/__init__.py` -- existing code (`pi/prompt-routing/train.py:42`) works around this by doing `sys.path.insert(0, str(ARTIFACT_DIR))` and importing siblings flatly.
Fix: pick one. Either (i) create `pi/__init__.py` + `pi/tool_reduction/__init__.py` and rename the directory to `tool_reduction`; or (ii) follow the existing prompt-routing convention (flat scripts, no package) and change every `python -m pi.tool_reduction.X` to `python pi/tool-reduction/X.py` with the same `sys.path.insert` shim. Option (ii) matches POLA with the existing codebase.

### B2. Hashing vectorizer claim contradicts existing prompt-routing [HIGH]
Flagged by: R4.
Verified: The plan's Handoff Notes say "`pi/prompt-routing/train.py` uses a hashing vectorizer + small classifier; mirror that in T8". `pi/prompt-routing/train.py:52, 65` actually uses `TfidfVectorizer(max_features=7000, ngram_range=(1, 2), sublinear_tf=True)` with a `LinearSVC` classifier -- not a hashing vectorizer. T8's whole "mirror shape of prompt-routing" directive is therefore wrong about what shape to mirror.
Fix: Either adopt the real prompt-routing shape (TF-IDF + LinearSVC + `CalibratedClassifierCV` for probabilities) or justify deviating. Do not cite a non-existent hashing vectorizer in prompt-routing.

### B3. Classifier has a structural label-leakage problem in Phase 1 [HIGH]
Flagged by: R3, R4.
Verified from the plan text (T4 corpus schema, T8 training recipe, T6 orchestration order): labels come from `rule_id`, which is produced by `classify_argv` running first. When argv matches, the classifier trains on a label the argv matcher already gave you. When argv does not match, `rule_id=None` so the only available label is `__passthrough__`. The classifier therefore learns "this is something the argv matcher did not match" -- it cannot route to a rule the argv matcher missed, because there is no training signal for that case.
Fix options: (i) Defer T8 to Phase 2, where generated rules create the first real multi-rule ambiguity. (ii) Redefine the label as "the rule that produced the largest `bytes_saved` on this sample" (eval-derived, not match-derived) so the classifier can cross rules. (iii) Keep T8 but acknowledge in the plan that Phase 1 classifier accuracy is a dry-run gate, not a signal of routing value, and drop the `classifier_confidence >= 0.7` branch from the hot path until Phase 2.

### B4. Secret-scrubber is deferred but the logger ships first [HIGH]
Flagged by: R5.
Verified from plan: T4 writes `stdout_sample` and `stderr_sample` (2 KB head + 2 KB tail of every command) to `~/.cache/pi/tool-reduction/corpus.jsonl` starting in Wave 1. Secret scrubbing is mentioned only in "Handoff Notes" at the bottom as a future concern, listing only `gh_*, sk_*, AKIA*`. Real-world bash output routinely contains: bearer tokens, JWTs, `https://user:pass@host` URLs, AWS session tokens (`ASIA*` + long strings), GCP service-account JSON blocks, SSH private keys pasted in error output, `env` dumps, database URLs with credentials. Once written to the corpus these are persisted on disk, and Phase 2 ships corpus excerpts to Anthropic for rule codegen (T11) -- the data leak becomes outbound.
Fix: Move the scrubber into T4 as a hard prerequisite before the first log line is written. Include a minimum pattern set + tests: generic bearer tokens (`[Bb]earer\s+[A-Za-z0-9._-]+`), JWT (`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), URL-embedded creds, AWS `AKIA` / `ASIA` + secret-length heuristic, private-key headers, and an "env dump" heuristic (`^[A-Z_]+=\S{20,}$`). Add an explicit T11 rule: scrub once on write, then re-scrub immediately before any network send.

### B5. No subprocess-hang timeout on hot path [HIGH]
Flagged by: R2, R6.
Verified from plan T7: "On Python subprocess error: fall through to raw output (never break the agent)." There is no mention of a wall-clock timeout. A hung subprocess (e.g., blocking on a regex with catastrophic backtracking against a user-supplied rule -- see B6) will block the tool-result chain indefinitely, not error. `pi.on("tool_result")` handlers run inline with the agent's turn (see `pi/extensions/quality-gates.ts:99`), so a hang stalls the entire session.
Fix: T7 must spawn with a hard timeout (default 2000 ms is generous for a compaction step); on timeout, kill the child and return raw output. Add a test: spawn a child that sleeps 5s, assert the hook returns raw within 2.5s.

### B6. ReDoS via user/project rule regex [HIGH]
Flagged by: R5.
Verified from plan T5: user and project rule layers load arbitrary JSON from `~/.config/pi/tool-reduction/rules/` and `./.pi/tool-reduction/rules/`. T2 pipeline ports `skip_patterns` / `keep_patterns` straight from tokenjuice. A hostile or naive rule shipped in a cloned repo's `.pi/` directory can contain a regex with catastrophic backtracking (`(a+)+b` patterns) that hangs the reducer on crafted output. Python's `re` has no timeout; `regex` module does via `timeout=`.
Fix: Either (i) migrate pattern engine to the `regex` module with `timeout=0.1` per pattern, or (ii) compile with a length cap on input before matching, or (iii) validate rules at load time against a complexity heuristic. Option (i) is smallest, matches POLA.

### B7. Concurrent corpus append race [HIGH]
Flagged by: R6.
Verified: pi agents can run multiple Bash tools concurrently (the SDK is event-driven; see `pi.on("tool_result", ...)` in `pi/extensions/quality-gates.ts`). Multiple `python -m pi.tool_reduction.reduce` subprocesses racing on `~/.cache/pi/tool-reduction/corpus.jsonl` will interleave partial writes on Windows where POSIX `O_APPEND` semantics are weaker. T4's "valid jsonl" acceptance runs single-threaded and will not catch this.
Fix: Use `portalocker` (cross-platform flock) around the append, or write one jsonl per process and compact/merge in T9/T13, or use a datagram-per-line pattern (open-append-write-close per record is fine if done with `os.open(..., O_APPEND)` atomically; document and test).

### B8. `T1` byte-identical vendoring conflicts with repo rules [HIGH]
Flagged by: R1.
Verified from `~/.claude/CLAUDE.md` + `.dotfiles/CLAUDE.md`: the repo bans em/en-dashes in files, because Windows-1252 roundtrips corrupt them. Tokenjuice's `src/rules/**/*.json` may contain em/en-dashes in example output fixtures or rule descriptions. V1 acceptance #4 runs `grep -rE "[\xe2\x80\x93\xe2\x80\x94]| AI-assisted|Claude|generated by" pi/tool-reduction/ || true` but T1 acceptance #1 demands "byte-identical to upstream" -- these are directly contradictory if upstream uses any dash character.
Fix: Pick one. Either (i) T1 runs a scrubber on import and relaxes "byte-identical" to "semantically equivalent" (document the transform in `UPSTREAM.md`), or (ii) V1 check #4 is relaxed to "no AI mentions" and the dash ban is acknowledged as carve-out for vendored artifacts.

### B9. `rule.schema.json` filename does not exist upstream [HIGH]
Flagged by: R1.
Verified from plan T1: "Copy `tokenjuice-rule.schema.json` to `pi/tool-reduction/rule.schema.json`". This claim is not verified against upstream; a quick survey of the tokenjuice repo should confirm the filename before vendoring. If the actual file is named differently (e.g., `schema/rule.json` or the schema is inline in TypeScript), T1's command "copy X to Y" will fail silently.
Fix: Before executing T1, verify the actual upstream filename via `gh api repos/vincentkoc/tokenjuice/contents/`. Update T1 to reference the real path.

### B10. `windowsHide` is the wrong fix reference [HIGH]
Flagged by: R6.
Verified from `claude/tracking/windows-console-flashing.md`: the documented workaround for Claude Code hook flashing is "use bare `python` instead of `uv run`". The root cause is `uv.exe` being a console-subsystem binary, not a missing spawn flag -- and the tracking doc explicitly notes that `windowsHide: true` is already set on many paths yet does not work. T7 acceptance #3 says "apply `windowsHide` / detached flag per `claude/tracking/windows-console-flashing.md`". That is not what the tracking doc says. The pi extension spawns its own subprocess (not via the Claude Code hook machinery), so the comparison may not even apply -- this is a pi-side Node spawn, and `spawn(..., { windowsHide: true })` in Node does work.
Fix: T7 should specify: Node `spawn("python", [...], { windowsHide: true, stdio: ["pipe","pipe","pipe"] })`, no shell. Drop the reference to the tracking doc (which is about Claude Code's internal hook runner, a different layer), or restate the reference accurately.

### B11. Eval FP-rate metric has no ground-truth source [MEDIUM -> HIGH because it is a Success Criteria gate]
Flagged by: R4.
Verified from plan T9 + Success Criteria #1: the `--max-fp 0.02` gate requires a `lost_signal: bool` column in `corpus-labeled.jsonl`. The plan never specifies who labels `lost_signal` or how. Without a labeling protocol this metric is unmeasurable, which means the Phase 1 exit gate cannot pass.
Fix: Add a task to define the labeling protocol: either (a) a deterministic heuristic ("any line matching `error|fail|traceback|fatal` that appears in raw but not in compact counts as `lost_signal=true`"), (b) manual labeling with a sampled subset + documented rubric, or (c) drop FP-rate from Phase 1 exit and keep bytes-saved only.

### B12. Rule cache directory-write trust surface [MEDIUM]
Flagged by: R5.
Verified from plan T12: cached rules live at `~/.cache/pi/tool-reduction/generated/*.json` and are loaded by `load_rules()` as layer 2 of the overlay. Anything with write access to that directory (malware in userland, a compromised dev container volume mount) can inject arbitrary reducer rules. Since rules contain regex, this combines with B6 into arbitrary-hang or arbitrary-skip.
Fix: At least sign the generated rules with an HMAC keyed on something not in `~/.cache` (e.g., a dotfiles-root secret), verified on load. Or document that `~/.cache/pi/tool-reduction/` is a trust boundary and require `chmod 700` + ownership check on load.

### B13. Plan says "no `ruff` if present; else add ruff" but prompt-routing already has implicit tooling [LOW -> MEDIUM]
Flagged by: R1.
Verified: `C:/Users/mglenn/.dotfiles/pi/prompt-routing/requirements.txt` contains only `scikit-learn==1.8.0` + `numpy>=2.0,<3.0`; no ruff config in that directory. Repo-wide ruff config may exist at `.dotfiles/` root but was not confirmed. The phrasing "ruff check pi/tool-reduction/ ... else add ruff" punts a decision the plan should make.
Fix: Decide now. Either add `pi/tool-reduction/pyproject.toml` with ruff config, or reuse an existing root config, or drop the ruff gate.

## Hardening Suggestions (optional)

Sorted by priority. Each includes a proportionality assessment.

### H1. Replace per-invocation subprocess with a long-lived stdio daemon
Proportional for a PostToolUse hook on every Bash tool call. Windows cold start is 100-400ms, sklearn pickle load is 50-200ms on top, and the agent may issue tens of Bash calls per turn. A daemon pattern (keep-alive Python process, newline-delimited JSON over stdin/stdout) amortizes this to ~1ms per call. Downside: lifecycle management, restart on crash. Worth the complexity only if benchmarks show the naive approach crosses ~200ms median -- measure first, then decide.

### H2. Add an explicit latency budget + benchmark to T6/T7 acceptance
No latency test exists in the plan. Add: median reduction-pipeline time under 100ms on a 4KB input (Linux), 300ms (Windows). Fail the task if exceeded. This pre-empts H1 drift.

### H3. Define feature window for classifier more carefully
"first + last N lines" misses middle-discriminating cases (`pnpm test` vs `pnpm install` both have identical last-line "done"). If the classifier survives B3, add `argv[0..2]` + first 5 lines + last 5 lines + exit_code as features. Proportional given the classifier is already in scope.

### H4. Re-training cadence for drift (Phase 2)
T13 detects rule effectiveness drift but doesn't re-train the classifier on drifted features. Add: any rule re-codegen also invalidates the classifier's `model.pkl` and requeues training. Low cost, prevents stale-model silent failure.

### H5. Rotate corpus via date-based filenames, not size
T4 says "rotates at 100 MB" -- rotation logic is unspecified. Date-stamped files (`corpus-2026-04.jsonl`) are simpler, analyzable without re-merging, and make T13's rolling-window math trivial. KISS over "rotate at size".

### H6. Prompt-caching claim for T11 needs an actual budget
T11 acceptance #3 requires `cache_control` annotations on the static prompt skeleton, citing `skills/claude-api`. Confirm the skill exists (verified: yes, `claude-api` skill is registered) and the prompt is structured so the cacheable prefix is >= 1024 tokens (the Anthropic minimum). Otherwise the annotation is a no-op.

### H7. `select_inline_text` + `tiny_max` default of 100 is borrowed unverified
T3 references `tiny_max=100` but does not cite the tokenjuice value. Confirm upstream. Off-by-one in the tiny threshold silently bypasses compaction on many short-but-reducible outputs (git status with one modified file is ~120 chars).

### H8. WSL vs native Windows corpus segregation
R6 raised: WSL pi and Windows pi both resolve `~/.cache/pi/tool-reduction/` but to different filesystems. Plan should state intent: separate corpora (POLA, matches how pi already treats WSL as a distinct environment) or shared via `/mnt/c`. Document, don't defer.

### H9. Rule-ID conflict detection in the 3-layer overlay
T5 says "merges by `id` (last wins)" with no warning. Add a debug log on conflict so users can tell why a generated rule is shadowed.

## Dismissed Findings

### D1. "Corpus file permissions group/world readable on Linux" (R5 original)
Pathlib-based `open(..., 'a')` + umask set by user login shell (typically 0022) yields 644 on Linux. This is fine for a user-scoped cache; secret scrubbing (B4) is the real control. Downgraded to not-actionable.

### D2. "Python cold start will dominate and must be fixed before T7" (R6 first draft)
Downgraded to hardening (H1/H2). Measure first; the operator will notice if bash output takes visibly longer, and the plan's "fall through to raw on error" gives a degrade path.

### D3. "Eval overfitting on codegen samples" (R4)
The plan's T11 acceptance #1 already requires schema validation of the output, and T11's description says "Test generated rule against the sample corpus (T12) BEFORE caching." This is genuinely a held-in test, which is a known limitation of generator-tester co-training, but V4 check #4 adds a separate "reduces by >= 30% with zero lost error lines" gate on failure samples. Adequate for Phase 2 MVP.

### D4. "Classifier 0.7 threshold is unjustified" (R4)
Given B3 (classifier is structurally redundant in Phase 1), the threshold's exact value is moot -- the branch is never meaningfully exercised. Resolves with B3.

### D5. "Model.pkl load cost is per-invocation" (R6)
Resolves with H1 (daemon eliminates the load path entirely). Not a separate finding.

## Positive Notes

- Correct identification of upstream tokenjuice shape (JSON rules, 3-layer overlay, `selectInlineText` passthrough guard) and the right decision to port semantics rather than fork the TS tool.
- Hot-path determinism constraint is correctly stated and enforced in Success Criteria #3 and #4.
- Codegen output restricted to schema-validated JSON (T11 #1, #2) with no code-execution path -- strong security posture against prompt injection.
- Schema-valid generator with pre-cache validation (T11 -> T12) is a genuinely defensible way to use LLMs for config-like artifacts.
- Cross-platform `pathlib` discipline and explicit cross-platform Success Criteria #6.
- Wave/gate structure with explicit V1-V5 validation gates is appropriately conservative for a hot-path change.
- Alternatives Considered table genuinely engages with the options and the rejections hold up, with the one caveat noted in the Outside-the-Box section (subprocess cold-start was mis-attributed to Node only).
- Handoff Notes call out the corpus-privacy concern even if they defer it; B4 escalates timing but the concern was raised.
