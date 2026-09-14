---
status: research-note
surveyed: 2026-09-13
source:
  - https://code.claude.com/docs/en/memory
  - https://cursor.com/docs/rules
  - https://developers.openai.com/codex/customization/memories
  - https://docs.letta.com/concepts/memfs
  - https://github.com/langchain-ai/langmem
  - https://github.com/gepa-ai/gepa
  - https://github.com/ace-agent/ace
---

# Agent improvement: commercial and open-source implementations

## Why this matters

These seven systems implement parts of selective context, feedback retention, or evaluated prompt evolution. They are not equivalent solutions, and storing a lesson does not establish its truth. This is the implementation companion to the [September 2026 survey](../patterns/agent-improvement-survey-2026-09.md).

Primary documentation, repository files, and release metadata were inspected on **September 13, 2026**. Nothing was installed or run. Live documentation and default-branch source are mutable; versions below identify inspected release/package evidence, not proof that every live-doc feature belongs to that release. No independent effectiveness evaluation was found in the inspected product documentation.

## Useful signals

### Comparison at a glance

| System | Concrete mechanism | What it evaluates | Who controls adoption? |
| --- | --- | --- | --- |
| Claude Code | Global/scoped guidance, progressive skills, automatic topic memory | Explicit verification workflow; memory itself is not fact-verified | User can edit/delete/toggle memory; per-entry approval not documented |
| Cursor | Scoped rules and product-specific memory | No general fact verification established by rules/memory docs | Project background-memory approval documented; Automation memory has separate controls |
| Codex | Hierarchical `AGENTS.md`, progressive skills, optional background memories | Memories are not a verifier | Memories off by default; generation/use controls; checked-in instructions remain separate |
| Letta Code | Git-backed memory files, always-loaded versus on-demand paths, optional background consolidation | Memory audit/review, not general truth evaluation | Agent updates and user edits; second-agent review is not user approval |
| LangMem | Developer-integrated memory profiles/collections and prompt optimization | Caller-supplied feedback | Caller decides integration and activation of returned prompt |
| GEPA / DSPy GEPA | Trace-informed prompt mutation and evaluated candidate selection | User-defined metric and feedback | Explicit optimization; caller chooses final adoption |
| ACE | Structured playbook updated from trajectories and feedback | Benchmark/evaluator outcomes | Research runner updates artifacts; no operator-approval workflow established |

### Claude Code

Commercial coding runtime with public docs and release artifacts. Sources: [memory](https://code.claude.com/docs/en/memory), [skills](https://code.claude.com/docs/en/skills), [v2.1.270 release](https://github.com/anthropics/claude-code/releases/tag/v2.1.270), published September 12, 2026.

- `CLAUDE.md` supplies persistent guidance; `.claude/rules/` supports path scope; skills progressively expose workflow instructions. The memory documentation recommends concise guidance rather than treating a large file as reliably enforced configuration.
- Auto-memory is documented as enabled by default. Its startup index is bounded to the first 200 lines/25 KB of `MEMORY.md`; additional topic files load on demand. These are vendor implementation choices, not recommended limits for Pi.
- `/memory` permits inspection, editing, deletion, and toggling. Individual automatic writes do not have a documented user-approval requirement.
- The skills documentation describes explicit `/verify` invocation and reusable verification recipes. This is not a guarantee that ordinary claims or memories are checked automatically.

**Evidence boundary:** documentation establishes context and control mechanisms, not a controlled improvement from automatic memory or a guarantee of instruction adherence.

### Cursor

Commercial proprietary runtime. Sources: [rules](https://cursor.com/docs/rules), [Automation memories](https://cursor.com/docs/cloud-agent/automations#memories), [1.0 changelog](https://cursor.com/changelog/1-0), [1.2 changelog](https://cursor.com/changelog/1-2). Historical changelogs place project-memory beta in June 2025 and GA/background-memory approvals in July 2025; no latest September 2026 binary version is asserted.

- `.cursor/rules/*.mdc` can always apply, match file globs, be selected for relevance, or be manually invoked. Nested `AGENTS.md` provides simpler scoped instructions. Docs favor focused rules and canonical-file references over copied facts.
- Project memories and Automation memories are different surfaces. The 1.2 changelog documents user approvals for background-generated project memories. That does not establish approval for every memory mechanism.
- Automation memories are enabled by default and stored outside the working filesystem, with UI controls to disable, view, edit, and delete them. Agents can also remove obsolete entries. The docs warn that untrusted input can influence future runs through memory.

**Evidence boundary:** rules and memories do not constitute a general verifier. Changelog claims of better memory generation are not controlled outcome evidence.

### Codex

Commercial service with an Apache-2.0 open-source CLI. Sources: [AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md), [skills](https://developers.openai.com/codex/build-skills), [memories](https://developers.openai.com/codex/customization/memories), [CLI 0.154.0](https://github.com/openai/codex/releases/tag/rust-v0.154.0), published September 9, 2026.

- Global, repository, and nested instructions are discovered hierarchically; more specific guidance takes precedence. Skills expose metadata before full instructions. This separates persistent policy from selected workflow context.
- Combined AGENTS guidance has a documented default 32 KiB cap. The inspected skills documentation also budgets metadata separately. These limits describe Codex, not evidence of optimal context budgets.
- Local memories are **off by default**. When enabled, idle background processing extracts summaries, durable entries, and supporting evidence under `~/.codex/memories/`.
- `/memories` and settings control generation and use. Docs treat memory files as generated state rather than the primary hand-edited policy surface. Required team rules belong in checked-in instructions. Detailed deletion semantics were not established by the inspected pages.

**Evidence boundary:** generated evidence references do not themselves verify a lesson. No empirical comparison of memory-enabled versus disabled development outcomes was inspected.

### Letta Code

Runnable open-source coding client with an optional hosted service. Sources: [MemFS](https://docs.letta.com/concepts/memfs), [memory and dreaming](https://docs.letta.com/letta-code/memory), [skills](https://docs.letta.com/configuration/skills), [Letta Code v0.32.6](https://github.com/letta-ai/letta-code/releases/tag/v0.32.6), published September 13, 2026. This entry concerns Letta Code, not all behavior of the separate Letta server.

- MemFS is a Git-backed memory repository. `system/` files remain in context; other files are read on demand, with the directory tree providing navigation. Search is file-based by default rather than an inherent vector-index requirement.
- Agents can update memory; `/remember` explicitly requests it. Optional background “dreaming” configured through `/sleeptime` consolidates lessons.
- `/doctor` audits placement and token use. A second agent may review updates, but this is not operator approval or factual verification. Git history supports inspection and reversal.

**Evidence boundary:** persistence, selective loading, and history are concrete capabilities. Their availability does not show that the agent chooses correct or generalizable lessons.

### LangMem

MIT open-source library, not a turnkey agent. Sources: [repository](https://github.com/langchain-ai/langmem), [conceptual guide](https://github.com/langchain-ai/langmem/blob/main/docs/docs/concepts/conceptual_guide.md), [prompt optimizer API](https://langchain-ai.github.io/langmem/reference/prompt_optimization/), [February 2025 launch](https://www.langchain.com/blog/langmem-sdk-launch). Inspected package version: `0.0.30`; no GitHub Releases were present in the inspection, so the package declaration is not treated as a release date.

- Supports semantic, episodic, and procedural memory. Collections can insert/consolidate/delete; profiles represent current state in one document rather than retaining every event.
- Prompt optimization accepts trajectories and feedback such as scores, comments, or revisions, and returns a new prompt. Returning that string does not deploy it.
- Retrieval, storage, namespaces, background processing, and prompt activation are integration choices. Storage can use the application's LangGraph store; the library does not require one universal memory deployment.
- Inspected source defaults optimization to `gradient`; docs disagree about reflection-step defaults. Check the installed version if considering adoption.

**Evidence boundary:** examples show transformations, not general causal improvement. Correct feedback and a useful evaluation remain caller responsibilities; no built-in user-approval boundary was established.

### GEPA and DSPy GEPA

Runnable open-source optimizer. Sources: [GEPA repository](https://github.com/gepa-ai/gepa), [v0.1.4 release](https://github.com/gepa-ai/gepa/releases/tag/v0.1.4), published July 15, 2026, and [DSPy GEPA API](https://dspy.ai/api/optimizers/GEPA/overview/). See [academic evidence](../patterns/agent-improvement-academic-evidence.md) for paper-version distinctions.

- Explicit `compile`/`optimize` calls evaluate candidates, collect execution traces, ask a reflection model for mutations, and select promising prompts/components.
- Caller-defined metrics are required; textual feedback can explain failures. Separate validation and Pareto candidate selection do not eliminate metric overfit.
- Optional logging/checkpoints preserve artifacts. Rollout budgets, minibatches, and stop controls bound optimization work; full traces used for optimization are not automatically permanent agent memory.
- Final prompt adoption is a caller decision, not automatic production activation.

**Evidence boundary:** runnable evaluation is stronger evidence of a mechanism than a memory-feature description, but repository examples and paper benchmarks remain project/author-reported. No evidence establishes that GEPA's objectives capture this operator's development philosophy. Pareto here is candidate nondominance, not the 80/20 rule.

### ACE

Apache-2.0 runnable research implementation. Sources: [repository](https://github.com/ace-agent/ace), [package metadata](https://raw.githubusercontent.com/ace-agent/ace/main/pyproject.toml), [curator](https://raw.githubusercontent.com/ace-agent/ace/main/ace/core/curator.py), [playbook operations](https://raw.githubusercontent.com/ace-agent/ace/main/playbook_utils.py). Inspected package version `0.1.0`; no GitHub Releases were found. Default-branch source was inspected, not pinned to a release.

- Generator, Reflector, and Curator roles turn trajectories into structured playbook entries with helpful/harmful counters. Offline examples distinguish train/validation/test; online examples update periodically. Evaluator quality and optional absence of ground truth change what feedback means.
- Runs persist playbooks, diffs, usage, and model logs. The inspected configuration uses an 80,000-token playbook budget: not a small standing-instruction approach and not a proposed local budget.
- **Important implementation gap:** `apply_curator_operations` in inspected `playbook_utils.py` implements `ADD`; `UPDATE`, `MERGE`, `CREATE_META`, and `DELETE` are explicitly TODOs. Non-ADD operation types have no implementation there. An optional bullet analyzer can deduplicate/merge, but it is not enabled by default. Do not describe the standard curator path as automatic comprehensive pruning.
- Helpful/harmful counts are feedback tags, not independent causal estimates of an instruction's contribution.

**Evidence boundary:** research scripts and saved artifacts make evaluation possible; they were not run here. Paper-level “grow and refine” descriptions must not be substituted for the actual implementation path. No proposal is made to repair or adopt ACE.

## Possible Pi fit

Progressive disclosure and scoped files are already compatible with the repository's Markdown-first direction. Git-backed changes and explicit adoption are simpler starting points than autonomous prompt mutation. GEPA illustrates evaluated variation; LangMem illustrates returning a candidate without activating it. Neither requires importing its complete stack to use the underlying idea.

## Risks / reasons not to build yet

- Durable memory can turn one incorrect explanation into repeated future context.
- Model-selected relevance and automatic consolidation can omit exceptions or reinforce mistaken intent.
- Documentation dates and source versions are not independent evaluation results.
- A memory or optimizer subsystem adds storage, retrieval, evaluation, and maintenance costs absent from a small instruction edit.
- None of the surveyed defaults should silently replace the local user-approval boundary or justify new token/resource gates.

## KISS recommendation

Borrow scoped loading, editable evidence, and explicit adoption as patterns. Do not install a memory service or optimizer until an existing repeated failure cannot be addressed by a small change to the current skill and feedback records. Any comparison should include completed work and operator burden, not only prompt size or benchmark score.

## Related notes

- [Survey synthesis](../patterns/agent-improvement-survey-2026-09.md)
- [Academic evidence](../patterns/agent-improvement-academic-evidence.md)
- [Instruction evolution and reasoning budgets](../patterns/instruction-evolution-and-reasoning-budgets.md)
- [Markdown skills and memory](../patterns/markdown-skills-memory.md)
