---
created: 2026-03-30
review: 1
status: complete
reviewers: 7 (Completeness, Red Team, Outside-the-Box, Agent Design, Memory Systems, Pi SDK, Security)
---

# Review Synthesis — Pi Agent Setup Plan

## Review Panel

| # | Reviewer | Focus | Verified Issues | Dismissed |
|---|----------|-------|-----------------|-----------|
| 1 | Completeness & Explicitness | Missing context, ambiguous steps | 4 | 1 |
| 2 | Adversarial / Red Team | Failure modes, cascading failures | 4 | 0 |
| 3 | Outside-the-Box / Simplicity | Proportionality, over-engineering | 3 | 2 |
| 4 | Agent Design & Orchestration | Delegation, domain constraints | 3 | 1 |
| 5 | Knowledge Compounding & Memory | Expertise file system integrity | 3 | 1 |
| 6 | Pi Extension & SDK Integration | Extension API correctness | 5 | 0 |
| 7 | Security & Domain Constraints | Access control, path escapes | 4 | 1 |

---

## Outside-the-Box Assessment

The plan has sound architectural instincts (dotfiles integration, expertise compounding) but suffers from three overlapping problems: (1) it mixes a "local install MVP" with a "production agent platform" in a single execution wave set, creating disproportionate scope; (2) it treats Tier 3 (ML classifier) as in-scope despite no dependency on it for validating the agent platform; and (3) the most critical technical claims (delegate() tool name, -e flag behavior, agent YAML schema, pi-skills install method) were never verified against Pi's actual API and are materially wrong.

**Recommendation**: Execute Tiers 1-2 first, validate the platform works, then treat Tier 3 as a separate plan after hands-on experience with Pi's actual API.

---

## Bugs — Confirmed Issues That Will Cause Failure

### BUG-1 [CRITICAL] — delegate() tool does not exist; real tool is dispatch_agent

**Reviewer**: Pi SDK, Agent Design
**Verified**: Yes — confirmed via IndyDevDan's actual agent-team.ts extension code

The plan consistently references the orchestrator using a `delegate()` tool (Context & Motivation, T6 agent persona YAML, T7 acceptance criteria). Pi's actual extension API registers a tool named `dispatch_agent` via `pi.registerTool({ name: "dispatch_agent", ... })`. There is no built-in `delegate()` tool in Pi's core four tools (`read`, `write`, `edit`, `bash`). An orchestrator persona instructed to use `delegate` will hallucinate or fail silently.

**Affected phases**: T2, T6, T7, V2, V3, Success Criteria
**Fix**: Replace all references to `delegate` tool with `dispatch_agent`. The T7 extension must register it via `pi.registerTool({ name: "dispatch_agent", ... })`. The orchestrator persona tools list should be `[read, grep, find, ls, dispatch_agent]`.

---

### BUG-2 [CRITICAL] — Agent YAML frontmatter schema does not match Pi's actual format

**Reviewer**: Pi SDK, Agent Design, Completeness
**Verified**: Yes — confirmed via actual planner.md from pi-vs-claude-code repo

The plan shows a complex YAML frontmatter with `expertise:`, `skills:`, `domain:`, and `tools:` as array blocks. Pi's actual agent files use a minimal schema: `name`, `description`, `tools` (comma-separated string, not array). Fields like `expertise:` with sub-keys `path`, `use-when`, `updatable`, `max-lines` and `skills:` with path/use-when objects are not part of Pi's native format — they are conventions IndyDevDan added on top via extension code that reads and injects them. If T2 creates agent files with the complex schema expecting Pi to natively parse expertise/skills/domain keys, Pi will ignore them silently — no error, no enforcement.

**Affected phases**: T2, T5, T6, T7, V1, V2
**Fix**: Clarify which fields Pi reads natively vs. which require the agent-chain/damage-control extension to parse. The extension code in T5 and T6 must explicitly read and process `expertise:` and `domain:` sections from the agent .md files. Add a note: "Pi parses only name/description/tools natively; expertise/skills/domain require custom extension parsing."

---

### BUG-3 [CRITICAL] — -e flag for loading extensions not confirmed as supported by Pi CLI

**Reviewer**: Pi SDK, Completeness
**Verified**: Partial — Pi README documents extension directories (~/.pi/agent/extensions/, .pi/extensions/) but does NOT document a -e CLI flag. IndyDevDan's repo uses `pi -e extensions/foo.ts` syntax, but Pi's own README says extensions are "discovered automatically from standard directories."

The plan uses `pi -e pi/extensions/damage-control.ts` syntax in every acceptance criterion (T5, T6, T7, V2, V3, Success Criteria). If Pi discovers extensions from directories rather than a -e flag, every acceptance check command will behave differently than expected (either the flag is ignored, errors out, or extensions load from directories automatically regardless of -e).

**Affected phases**: T5, T6, T7, V2, V3, all Success Criteria
**Fix**: Before writing acceptance criteria, verify: `pi --help | grep -e` to confirm flag exists. If extensions load via directory placement only, update all acceptance checks accordingly: place extensions in `.pi/extensions/` and remove -e flags. Add this as a T1 verification step.

---

### BUG-4 [CRITICAL] — pi-skills install command is wrong

**Reviewer**: Pi SDK, Completeness
**Verified**: Yes — confirmed via pi-skills GitHub repo

T9 instructs `pi install git:github.com/badlogic/pi-skills` and verifies with `pi list 2>&1 | grep -i skill`. The actual pi-skills repo documents installation via git clone: `git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills`. There is no `pi install git:` protocol documented. The `pi list` command shows packages (npm/git), not skill directories. The verification command will also fail.

**Affected phases**: T9, V3
**Fix**: Replace T9 install step with: `git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills`. Replace verify command with: `ls ~/.pi/agent/skills/pi-skills/`.

---

### BUG-5 [HIGH] — Config path inconsistency: two different team config files referenced

**Reviewer**: Completeness, Agent Design
**Verified**: Yes — grep confirmed

T2 creates `pi/multi-team/multi-team-config.yaml` and its V1 acceptance check reads from `pi/multi-team/multi-team-config.yaml`. T7 creates `pi/agents/teams.yaml` and its acceptance check reads from `pi/agents/teams.yaml`. These are two different files serving overlapping purposes (team hierarchy), with no reconciliation. The damage-control extension (T5) and agent-team extension (T7) will need to agree on which file to load, but the plan doesn't establish this.

**Affected phases**: T2, T7, V1, V2
**Fix**: Choose one canonical config location. Given T7 is the dispatcher extension, use `pi/agents/teams.yaml` as the single source of truth. Remove `multi-team-config.yaml` or clarify it serves a different purpose.

---

### BUG-6 [HIGH] — apps/frontend and apps/backend domain paths don't exist in this repo

**Reviewer**: Completeness, Security, Red Team
**Verified**: Yes — dotfiles repo has no apps/ directory

The domain constraint examples throughout T5, T6, T7 (and the domain YAML blocks in agent personas) reference `apps/backend/` and `apps/frontend/` as locked paths. This dotfiles repo has no `apps/` directory. On first run, the damage-control extension will either enforce constraints against non-existent paths (no-op) or, worse, if the constraint logic defaults to "block everything not in domain," agents will be unable to operate on any actual project files.

**Affected phases**: T5, T6, T7, V2
**Fix**: Either (a) document that domain paths are project-specific and the damage-control extension must accept a project-level config override, or (b) provide a default permissive config with placeholder paths that an executor replaces per project. Add to T5: "Default domain is project-relative; executor must update paths for their project structure."

---

### BUG-7 [HIGH] — T10 Tier 3 acceptance criteria assume scikit-learn and a pre-built evaluate.py

**Reviewer**: Completeness, Red Team
**Verified**: Yes — plan shows `python prompt-routing/evaluate.py --holdout` as a verify step but T10 only lists agent .md files and `prompt-routing/` as output directory

T10's acceptance criterion #3 verifies with `python prompt-routing/evaluate.py --holdout` but this file is an output of T10's execution (agents build it), not a pre-existing harness. If agents don't produce exactly this file with exactly this interface, the verification fails. Scikit-learn is also not listed as a prerequisite.

**Affected phases**: T10, V4
**Fix**: Add prerequisites: `pip install scikit-learn` (or uv add). Change acceptance criterion to: "Verify agents produced evaluate.py: `test -f prompt-routing/evaluate.py && python prompt-routing/evaluate.py --holdout`". Acknowledge the verify command is contingent on agent output.

---

### BUG-8 [HIGH] — T3 symlink target inconsistency: pi/settings.json vs ~/.pi/agent/ structure unknown

**Reviewer**: Completeness, Pi SDK
**Verified**: Partial

T3 says pi-link-setup symlinks `~/.pi/agent/` contents from dotfiles `pi/` directory. The verification checks `readlink ~/.pi/agent/settings.json` pointing to `~/.dotfiles/pi/settings.json`. But Pi's config directory is `~/.pi/agent/` — it's unclear whether Pi creates this directory itself on first run, or whether the script must pre-create it. The claude-link-setup pattern creates a junction to `~/.claude` (whole directory), but this plan creates individual symlinks inside `~/.pi/agent/`. If Pi tries to create `~/.pi/agent/` on first install and finds it already exists (as a managed directory), there may be a conflict.

**Affected phases**: T1, T3, V1
**Fix**: Add T1 step: after `pi --help`, run `ls ~/.pi/` to document what Pi creates on first run. Then T3 should handle the case where Pi already created `~/.pi/agent/` before the link-setup runs.

---

## Hardening Suggestions

### H-1 [MEDIUM] — Expertise files have no staleness detection or schema version

**Reviewer**: Memory Systems, Red Team
The plan documents that expertise files grow over sessions but provides no mechanism to detect stale entries (e.g., agent's mental model refers to files that no longer exist). No schema version field means future evolution of expertise format breaks old files silently.

**Suggestion**: Add a `schema_version: 1` and `last_updated: SESSION_ID` field to each expertise file's required initial structure. Add a note in the mental-model skill: "Flag entries that reference paths you cannot find as stale."

---

### H-2 [MEDIUM] — No write-lock mechanism for concurrent expertise file updates

**Reviewer**: Red Team, Memory Systems, Security
The plan says expertise files are updated "after completing work." If two agents run in parallel (e.g., via sequential dispatch that spawns subprocesses), both may attempt to update the same file simultaneously, causing partial YAML writes and corruption.

**Suggestion**: For MVP, document the sequential-only constraint: "Agents update expertise files sequentially. Never run two agents that share an expertise file in parallel." Add to damage-control rules: expertise/ paths are upsert-allowed, delete-never.

---

### H-3 [MEDIUM] — Conversation log JSONL format undefined; agents must agree on schema

**Reviewer**: Memory Systems, Completeness
The plan shows a single example JSONL line (`{"role":"user","content":"test"}`) but doesn't define what fields are required (role, content, session_id, timestamp, agent_name). When agents write to the shared log, inconsistent schemas will make the active-listener skill unreliable.

**Suggestion**: Define a minimal JSONL schema in the T6 spec: `{"role": "string", "agent": "string|null", "content": "string", "session_id": "string", "timestamp": "ISO8601"}`. Add to T6 acceptance criteria: validate at least one line in conversation.jsonl matches this schema.

---

### H-4 [MEDIUM] — Domain-control extension has no path normalization; symlink/traversal escapes possible

**Reviewer**: Security
Without path canonicalization (resolving symlinks, normalizing `../`), an agent could escape its domain constraint by using paths like `apps/backend/../frontend/secret.ts`. The plan doesn't mention this.

**Suggestion**: Add to T5 spec: "Extension must use `path.resolve(ctx.cwd, toolPath)` to canonicalize all paths before constraint checking. Test with: `../` traversal in a bash tool call to verify blocking."

---

### H-5 [MEDIUM] — ANTHROPIC_API_KEY assumed in environment; no guidance for shell profile setup

**Reviewer**: Completeness
T1 checks `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY pi ...` (inline override), but the real validation (Success Criteria #1) uses `pi --mode print --no-session -p "What is 2+2?"` without setting the key. If the key isn't in the shell profile that Pi inherits, this will fail.

**Suggestion**: Add to T1 prerequisites: "Ensure `ANTHROPIC_API_KEY` is exported in `~/.zshrc` or `~/.bashrc`. Verify: `echo $ANTHROPIC_API_KEY | wc -c` (should be 50+)."

---

### H-6 [LOW] — T10 Tier 3 is proportionally too large relative to Tier 1-2 validation

**Reviewer**: Outside-the-Box
T10 is a 10-file "architecture" task requiring Opus, ML libraries, multi-team coordination, and a real classifier with 85%+ accuracy on a holdout set — all before the agent platform has been proven in any real usage. Tier 3 should be a separate plan after Tier 2 is validated.

**Suggestion**: Mark T10 and V4 as "Phase 2" and note: "Execute only after completing at least one real team task in Tier 2 to validate the agent platform works." This de-risks the plan without removing value.

---

### H-7 [LOW] — Model strings use claude-sonnet-4-6 / claude-opus-4-6 but Pi may use different model IDs

**Reviewer**: Pi SDK, Agent Design
The plan's agent YAML blocks use `anthropic/claude-sonnet-4-6` and `anthropic/claude-opus-4-6`. These version-pinned model IDs may not be valid — Anthropic's API often uses aliases like `claude-sonnet-4-5` or `claude-3-5-sonnet-20241022`. If Pi passes these strings directly to the API, invalid model IDs will cause agent launch failures.

**Suggestion**: Add a T2 acceptance criterion: run `pi` with one agent persona and verify no model-not-found error. Use alias names (e.g., `claude-sonnet-4-5`) if version-pinned IDs fail.

---

### H-8 [LOW] — No guidance on Windows junction vs symlink for ~/.pi/agent/

**Reviewer**: Completeness, Security
The plan says pi-link-setup should create symlinks. The existing claude-link-setup creates Windows junctions (not symlinks) because symlinks require elevated privileges on Windows. The plan doesn't mention junction support for pi-link-setup.

**Suggestion**: Add to T3 spec: "Follow claude-link-setup junction pattern for Windows. Use `cmd //c mklink /J` for junction creation, not `ln -s`."

---

## Dismissed Findings (False Positives)

| Finding | Reason Dismissed |
|---------|-----------------|
| "Pi doesn't support jiti" | Pi's npm package explicitly depends on `@mariozechner/jiti@^2.6.2` — jiti IS used by Pi for TypeScript extension loading. |
| "pi list command doesn't exist" | Pi README confirms `pi list` shows installed packages — command is valid. |
| "10,000-line expertise files are over-engineered" | The plan explicitly calls this a configurable max; the files start empty and grow organically. YAML is appropriate for human-editable mental models. |
| "No Tier 3 alternatives considered" | The plan's Alternatives Considered table is for the install approach, not Tier 3. Tier 3 is scoped as a proof-of-concept, which is explicitly labeled as out-of-scope for production critique. |
| "V1 checks pi/AGENTS.md is non-empty but file may not exist" | T2 explicitly creates pi/AGENTS.md as a deliverable; V1 correctly gates on T2 completion. |

---

## Positive Notes

1. **Acceptance criteria quality** — Nearly every task has runnable verify/pass/fail triples. This is production-grade spec writing and far exceeds typical plan quality.

2. **Dependency graph is correct** — Wave → validation gate → next wave sequencing is sound and prevents building on broken foundations.

3. **Idempotency emphasis** — Multiple tasks explicitly call out re-run safety, matching the dotfiles repo's existing patterns.

4. **npm package name verified** — `@mariozechner/pi-coding-agent` is confirmed correct (v0.64.0, MIT, 240 versions published).

5. **Jiti confirmed** — The npm package depends on `@mariozechner/jiti@^2.6.2`, confirming TypeScript extensions work without a separate compilation step.

6. **pi --mode print, --no-session** — These flags are confirmed in Pi's README documentation.

7. **tool_call event** — `pi.on("tool_call", ...)` is confirmed as the correct event name via IndyDevDan's actual damage-control.ts source.
