# Repository state: workflow and test rationalization

## Scope and method

This is a read-only inventory of the requested surfaces as they existed on 2026-07-16. Line references are workspace line numbers. "Consumed" means TypeScript/Python runtime code parses or branches on the value, not merely that a Markdown prompt is loaded into a model context.

The worktree was already dirty before this investigation, including the Pi workflow files and `pi/tests/workflow-prompts.test.ts`. This report does not attribute those changes.

## Hardcoded runtime inventories

### Direct runtime model and tier policy

| Inventory | Locations | Runtime consumer | Classification |
| --- | --- | --- | --- |
| Fable model `amazon-bedrock/us.anthropic.claude-fable-5`, effort `high` | `pi/extensions/fable.ts:6-7` | Yes. `/fable` locates this exact registry model, selects it, sets the effort, and special-cases its Bedrock payload at `:118-140`, `:307-334`. | Durable compatibility policy while this provider integration exists; exact ID is operationally brittle. Runtime discovery can replace availability selection, but the payload workaround still needs an identified target. |
| Foreman model `openai-codex/gpt-5.6-sol`, effort `xhigh` | `pi/extensions/fable.ts:8-9` | Yes. `/foreman` directly selects it at `:268-304`. | Model-weakness compensation: fixed "strong foreman" identity and xhigh role. |
| Fable subagent ladder: Luna / Terra / Sol | `pi/extensions/fable.ts:13-18`, `:190-193`; allowed pinned-ID regexp `:49-54` | Yes. `subagentModelFor()` maps `small` and `large`; the tool-call hook overwrites unsupported explicit models at `:247-258`. | Model-weakness compensation. This duplicates the dynamic resolver used by `pi/extensions/subagent/index.ts:1149-1165`. |
| Interactive-parent allowlist: Sol, Fable, Opus | `pi/extensions/fable.ts:159-174`, `:203-215` | Yes. It changes injected delegation instructions based on exact provider/model identifiers and effort. | Model-weakness compensation. The durable part is conditional delegation only when independent work exists. |
| Premium Codex set `gpt-5.5`, `gpt-5.6-sol`; high-confidence floor `0.8`; effort order and schema map | `pi/extensions/prompt-router.ts:360-383`, `:415-443` | Yes. This biases thinking effort and startup defaults. | Uncertain: the provider-specific payload behavior is operational policy, while the exact named-model preference is likely temporary compensation. |
| Runtime route vocabulary `nano`, `mini`, `core`, `large`, `max` and mapping to `small`, `medium`, `large` | `pi/extensions/prompt-router.ts:336-357`; `pi/extensions/subagent/index.ts:1065-1097` | Yes. Router and subagent schemas validate/resolve these values. | Durable runtime interface, provided names remain documented as implementation vocabulary rather than capability claims. |
| Subagent concurrency `8`, collapsed UI item count `10` | `pi/extensions/subagent/index.ts:159-160` | Yes; `MAX_CONCURRENCY` bounds parallel execution. `COLLAPSED_ITEM_COUNT` is a presentation limit. | Durable resource/UI boundary, not a trust compensation. |

### Parsed agent configuration versus prose-only metadata

`pi/extensions/subagent/agents.ts:117-161` parses `name`, `description`, `tools`, `model`, `isolation`, `memory`, `effort`, `skills`, and `roleType`. `pi/extensions/subagent/index.ts:699-707` passes parsed `model`, `effort`, `tools`, and `skills` to the child process. It does **not** consume `routingUse`; outside the parser, `roleType` has no runtime policy consumer (search result: only `agents.ts`, `pi/README.md`, and `agent-role-semantics.test.ts`). Therefore names and models are launch inputs; the team hierarchy is prompt/test convention rather than enforced routing.

| Hardcoded value | Locations | Consumed? | Classification |
| --- | --- | --- | --- |
| Agent names and models: `backend-dev`, `builder`, `data-engineer`, `devops-pro`, `eval-engineer`, `frontend-dev`, `model-engineer`, `planner`, `product-manager`, `python-pro`, `qa-engineer`, `rust-pro`, `terraform-pro`, `typescript-pro`, `ux-researcher` -> Terra | their respective `pi/agents/*.md:2-4` | Names/models: yes, parsed and launched. `routingUse`: no. | Names can be durable capability labels; their fixed Terra binding is model-weakness compensation. |
| `code-reviewer`, `coding-heavy`, `engineering-lead`, `ml-research-lead`, `orchestrator`, `planning-lead`, `reviewer`, `security-reviewer`, `validation-lead`, `validator-heavy` -> Sol | respective `pi/agents/*.md:2-4` | Same as above. | Fixed heavy-model allocation is compensation; narrow capability boundaries such as read-only review are durable. |
| `coding-light`, `utility-mini`, `validator` -> Luna; `coding-medium` -> Terra | `pi/agents/{coding-light,utility-mini,validator,coding-medium}.md:2-4` | Same as above. | Fixed ladder is compensation; lightweight/direct-task intent is judgment guidance. |
| `skill-review-gpt` -> Sol xhigh; `skill-review-fable-medium` / `skill-review-fable-high` -> Fable medium/high | `pi/agents/skill-review-*.md:2-4` | Yes for launch. Additionally `pi/lib/skill-review.ts:602,628-641` dispatches these three exact names. | Model-weakness compensation and a brittle executable coupling. Retain only if the deterministic review-packet protocol is retained. |
| `roleType` values `orchestrator`, `lead`, `worker`, `specialist`, `tier` | all active agent frontmatter at `pi/agents/*.md:5`; accepted list `pi/extensions/subagent/agents.ts:29-35` | Parsed, but not used to authorize routing or tools. Tests assert the intended semantics at `pi/tests/agent-role-semantics.test.ts:28-78`. | Model-weakness compensation as an unenforced organization chart. Tool allowlists are the durable enforcement mechanism. |
| `routingUse` strings | most active agent files at `:6-7` | No parser or runtime consumer found. | Prose-only compensation. Delete or replace with runtime-discovered capability descriptions if agent files remain. |

OpenCode also has exact model-bound agents: `bigpickle`, `gpt-codex`, `gpt-mini`, `gpt`, `kimi`, `minimax`, `opus`, `skills-engineer`, and `sonnet` at `opencode/agents/*.md:2-4`. Their runtime consumer was not traced in this pass; in the examined repository they are configuration, not Pi subagent inputs. They should be inventoried separately before deleting because they may be consumed by OpenCode.

### Prompt-only ladders, panels, and counts

None of the following values is parsed by Pi workflow runtime. `workflow-commands` reads skill Markdown and puts it into a model prompt; it does not parse its tables, thresholds, names, or headings. The current Pi review skill explicitly says to discover capabilities and avoid fixed names/models at `pi/skills/workflow/review-it.md:43-47`.

| Value | Locations | Classification |
| --- | --- | --- |
| File-count ladder: 1-2 simple, 3-5 medium, 6+ complex; tiers small/medium/large; mandatory Model and Agent columns | `pi/skills/workflow/plan-it.md:43-52`; duplicated in `pi/skills/workflow/do-it.md:23-26`; template `pi/skills/workflow/templates/plan-template.md:116-171` | Model-weakness compensation. File count is a poor proxy for risk or capability. Keep acceptance criteria and dependency/validation guidance, remove forced agent/model assignment and numeric routing. |
| Hidden panel `evidence-auditor`, `workflow-friction-analyst`, optionally `regression-test-hunter` | `pi/skills/workflow/do-it.md:124-127` | Prose-only compensation. No corresponding `pi/agents/*.md` exists. |
| Adaptive reviewer result fields including expected reviewer count and personas | `pi/skills/workflow/plan-it.md:59` | Prose-only. The artifacts can retain evidence/readiness fields; reviewer-count metadata is compensation. |
| Review finding limits: at most five and under 120 words | `pi/skills/workflow/templates/review-it-reviewer-prompts.md:32,48` | Prose-only. | Uncertain: output bounding protects context and cost, but five findings is arbitrary. Replace with a runtime token/byte budget if needed. |
| One panel and one apply pass; retry a failed reviewer once | `pi/skills/workflow/review-it.md:13,95,148` | Prose-only. | Durable resource/safety principle in intent; the fixed counts are compensation. |
| Legacy fixed review panel: three mandatory personas, 4-6 normally, up to 8, coordinator `max_turns: 25`, reviewers 5/8 turns, rebuttal at 8 high/critical findings, top 8 findings, 15,000-character reviewer cap, 3,000-character synthesis cap, 500/800-line thresholds, two launch batches | `claude/shared/review-it-instructions.md:3,93,98,120,146,155,213,269,284,327,373,466,469-470` | Prose-only. | Model-weakness compensation. It conflicts with Pi's capability-neutral review instructions. |
| Legacy model selection: Sonnet/Opus/Haiku and GPT/GPT-Codex/GPT-Mini | `claude/shared/review-it-instructions.md:110-113` | Prose-only. | Model-weakness compensation. |
| Legacy team hierarchy: named planning/engineering/validation/ML leads and workers | `claude/shared/review-it-instructions.md:5,398-403`; `pi/agents/{engineering-lead,planning-lead,validation-lead,ml-research-lead,orchestrator}.md:2-6` | Pi role type is parsed but does not enforce this hierarchy. | The non-delegating tool restrictions are durable. The fixed organization chart is compensation. |
| Legacy plan ladders use Haiku/Sonnet/Opus and builder-light/builder/builder-heavy | `claude/shared/plan-it-instructions.md:61-63`; `claude/shared/plan-with-team-instructions.md:201-203`; `claude/shared/do-it-instructions.md:67-79,87-92` | Prose-only. | Model-weakness compensation; some referenced Pi agent names do not exist. |
| Review scratchpad threshold `>5 issues` | `claude/shared/review-instructions.md:62` | Prose-only. | Compensation. |

## Duplicated rules across instruction layers

| Rule | Occurrences | Plausible owner | Assessment |
| --- | --- | --- | --- |
| Pi TypeScript uses pnpm; do not use npm/Bun for Pi; use the stated typecheck/test commands | `AGENTS.md:53-56`; `CLAUDE.md:32`; `pi/README.md:88-107` | `AGENTS.md` for operative repository rule; `pi/README.md` for rationale and Pi installation detail | Durable environment fact, but `CLAUDE.md` is redundant and risks command drift. |
| Repository validation command index | `AGENTS.md:38-48`; `CLAUDE.md:13,116` | `AGENTS.md` | Durable. `CLAUDE.md` correctly points back, so this is a reference rather than harmful duplicate. |
| WSL link mirroring and shell invariants | `AGENTS.md:68-71`; the old instruction text embedded in untracked `pi/inspect/snapshots/*.json` also repeats it | `AGENTS.md` | Durable repository facts. The snapshots are stale local artifacts, not tracked source (`git ls-files pi/inspect/**` returned none). |
| Idempotent scripts and LF endings | `AGENTS.md:92`; `pi/AGENTS.md:83` says setups must be rerunnable | `AGENTS.md` | Durable. Pi global instructions should refer to the repo rule, not paraphrase it. |
| Ask only for unresolved material choices, then use one-at-a-time 1-3-1 | `pi/AGENTS.md:9,24-25`; `claude/CLAUDE.md:9,24-25`; legacy command bodies at `claude/shared/review-instructions.md:39-40,141-143`, `plan-it-instructions.md:43`, `plan-with-team-instructions.md:59,96`, `do-it-instructions.md:163` | `pi/AGENTS.md` for Pi; `claude/CLAUDE.md` only if it is intentionally the shared global linked file | Durable interaction value, but procedural copies convert it into fixed recipes. `claude/CLAUDE.md` and `pi/AGENTS.md` are byte-for-byte-style duplicate global rules rather than separate ownership layers. |
| Default direct work; delegate only when independent work benefits | `pi/AGENTS.md:43`; `pi/extensions/fable.ts:20-31`; `pi/README.md:623-626`; leader prompts at `pi/agents/{engineering-lead,orchestrator,planning-lead,validation-lead}.md:31-42` | `pi/AGENTS.md` for policy and `fable.ts` only for executable injection | Durable judgment guidance. Per-lead model-size recipes duplicate and over-specify it. |
| Full repository validation is required before archive/completion | `copilot/prompts/do-it.prompt.md:10`; `claude/shared/do-it-instructions.md:106-111`; Pi rules in `AGENTS.md:57-61` instead prescribe a focused validation ladder | One repository-level policy in `AGENTS.md`, then client-specific entrypoint references | Contradiction: old Claude/Copilot bodies demand broad-suite completion even for unrelated failures, while `AGENTS.md` says to escalate broad validation only under defined conditions and report unrelated findings as backlog. |

## Prose/wording tests

The groups below are tests that read tracked prompts/source and assert literals or source shape without executing the behavior that the prompt text describes. They are separated from ordinary unit tests that assert observable runtime output from a constructed fixture.

| Test file and count | Nominal protection | Runtime consumer | Recommendation |
| --- | --- | --- | --- |
| `pi/tests/workflow-prompts.test.ts:16-202` - 10 cases | Prompt headings, exact sentences, example paths, banned legacy tokens, agent/panel vocabulary, and command prose across `pi/prompts/` and `pi/skills/workflow/`. | Markdown is loaded as prompt context, but no consumer parses these strings into workflow behavior. | **Delete** literal wording assertions. Keep a small behavioral dispatch test for command registration, argument substitution, and safe command execution. Keep only structural frontmatter checks if Pi requires them. |
| `pi/tests/agent-role-semantics.test.ts:10-81` - 5 cases | Active agent directory, frontmatter fields, absence of old fields, role/tool topology, named tier agents. | The parser consumes model/tools/effort/skills. It parses role type but does not enforce the hierarchy. | **Replace with behavior.** Keep tests that spawn/construct a child invocation and verify tool/model/skill flags; remove named hierarchy and `maxTurns` source-shape prohibitions unless those become runtime schema constraints. |
| `pi/tests/runtime-smoke.test.ts:27-93` - 6 cases | Extension helper placement and default export source shape. | Pi auto-discovery is the real concern, but this does not start discovery. | **Replace with behavior.** Run isolated Pi discovery against a fixture and assert helpers do not load. The existence and regex checks are brittle proxies. |
| `pi/tests/tool-reduction.test.ts:203-220` - 3 source assertions | Absence of `uv run`, presence of `windowsHide`, and process-tree cleanup spelling. | No parser consumes these exact strings. | **Replace with behavior.** The file already has process timeout and failure-mode tests at `:134-198`; extend those to assert Windows invocation options and cleanup through mocked spawn, then delete source greps. |
| `test/test_config_patterns.py` - 65 test functions, including 150 parametrized pattern cases | Exact shell/config strings, module names, comments, ordering, installers, and link configuration. Its own header states this intentionally tests implementation details at `:11-15`. | Shells and installers consume the files, but not the asserted prose/shape. A subset is structural configuration parsing, not prompt wording. | **Split.** Keep/replace load-bearing parsed-config checks (YAML link parity at `:841-868`, executable files, perhaps ordering) with execution tests. Delete cosmetic grep assertions and replace shell behavior with isolated zsh/bash execution. |
| `test/test_agent_browser_brave.py:8-39` - 3 cases | Wrapper safety defaults, warning wording, absence of broad browser-kill strings, README mention. | The wrapper behavior is executable; README is not parsed. | **Replace.** Exercise wrapper argument construction with a fake browser/process; keep a documentation reference check only if the wrapper is a supported public interface. |
| `test/test_ci_contract.py:66-96` - 4 static-contract cases within 8 total | Git executable modes, required workflow paths, directly executed scripts, absence of root `package-lock.json`. | GitHub Actions YAML is parsed by GitHub; local test parses only `run` strings. | **Keep, narrowed.** These are deployment/CI contracts, not model compensation. Replace regex extraction of shell commands with an explicit CI manifest or a CI dry-run if practical. Keep the package-lock guard as durable package policy. |
| `pi/tests/workflow-commands-pure.test.ts:310-318` - one prompt-wording case | Exact untracked-file classifier instructions including an 85% confidence gate. | The generated prompt is sent to a model; no code parses its wording. | **Delete or replace.** Test deterministic fallback and validation of returned decisions, not the wording/confidence sentence. |
| `pi/tests/skill-review.test.ts:123-125` and `pi/scripts/skill-review-run-models:32,41` | Exact model-packet labels and Fable/GPT review routing. | The skill-review library dispatches named agents at `pi/lib/skill-review.ts:602,628-641`. | **Replace with behavior** if this feature remains: test packet schema and dispatch through a configurable capability registry. Otherwise delete with the hardcoded reviewer mechanism. |

`pi/tests/pi-instructions.test.ts`, `pi/tests/skill-prompt.test.ts`, `pi/tests/review-artifact.test.ts`, and the listed runtime tests are not wording tests in the relevant sense: they exercise extension output, template substitution, or artifact validation in memory/temp directories. They should not be removed merely because their expected output contains literals.

## Classification: compensation vs durable

### Model-weakness compensation

- Fixed model-to-role assignments, model-tier ladders based on file counts, and named hierarchy routing in `pi/agents/*.md`, `pi/extensions/fable.ts`, and legacy `claude/shared/*` workflows.
- Fixed reviewer panels, mandatory personas, coordinator layers, turn caps, finding caps, and panel-size thresholds in `claude/shared/review-it-instructions.md`.
- Prompt-shape and wording tests that freeze the older prescriptions, especially `pi/tests/workflow-prompts.test.ts`.
- Unconsumed `routingUse` and parsed-but-unenforced `roleType` taxonomy.
- Per-workflow detailed recipes that duplicate the same direct-work, delegation, and validation principles.

### Durable content

- Safety boundaries: secret protection, destructive-operation controls, explicit failure/reporting, and validation evidence.
- Environment and repository facts: pnpm-only Pi boundary, lockfile policy, `uv` Python tooling, LF endings, idempotent scripts, WSL link mirroring, shell `ZDOTDIR` behavior, submodule safeguards, and platform-specific paths.
- Judgment guidance: work directly by default, delegate only independent work, verify before mutation, distinguish durable constraints from advisory prose, and validate the requested workflow.
- Actual runtime contracts: subagent schema, tool allowlists, model registry resolution, provider payload workarounds, concurrency limit, artifact path traversal protection, and CI executable-mode requirements.

### Uncertain cases

- The prompt router itself is an executable classifier, not merely an old-model prompt recipe. Its provider-specific model preference and effort bias are compensation-like; its current-provider resolution, continuation safety, and cross-provider denial are runtime safety/compatibility behavior.
- Output/finding limits may be valuable context/cost controls, but fixed numeric limits should be measured and enforced by runtime byte/token budgets if retained.
- Persona files can remain useful as concise capability and safety constraints. Their fixed provider/model bindings and organization chart should not be treated as durable facts.

## Surprises and leads

1. **Conflicting review systems.** `pi/skills/workflow/review-it.md:43-65` requires runtime discovery and rejects fixed names/models/coordinators. `claude/shared/review-it-instructions.md:3-470` still mandates a three-person panel, fixed model families, coordinator, counts, turns, and batches. They describe materially different behavior under the same command concept.
2. **Missing referenced agents.** `pi/skills/workflow/do-it.md:125` names `evidence-auditor`, `workflow-friction-analyst`, and `regression-test-hunter`; none exists under `pi/agents/`. Pi plan prose and legacy shared instructions also reference `builder-light` and `builder-heavy`, which likewise do not exist under `pi/agents/`.
3. **Agent metadata is weaker than the documentation claims.** `pi/README.md:636-644` says several frontmatter fields are enforced. Code confirms enforcement for tools/model/effort/skills, but `roleType` is only parsed and `routingUse` is ignored. `pi/tests/agent-role-semantics.test.ts` is currently the only enforcement of the intended role hierarchy.
4. **Stale local snapshots contain retired system instructions.** `pi/inspect/snapshots/` is untracked, but contains old three-tier hierarchy, `maxTurns`, expertise-tool, and path-policy claims that no longer match current Pi code. It should be treated as local diagnostic residue, not a source of truth; do not use it to restore behavior.
5. **Validation policy conflict.** Current `AGENTS.md:57-61` gives a focused-to-broad validation ladder and says unrelated failures are backlog unless they invalidate the outcome. Legacy Claude and Copilot `/do-it` text requires the full repo-wide suite and treats any failure as incomplete (`claude/shared/do-it-instructions.md:106-111`, `copilot/prompts/do-it.prompt.md:10`). Pick one owner and delete the incompatible client copies.
6. **No evidence of a runtime parser for workflow report headings.** The headings and tables protected by `workflow-prompts.test.ts` are neither parsed nor used to drive execution. If the intended contract is an artifact schema, it needs a schema/parser and behavioral test; otherwise the assertions are wording locks.
