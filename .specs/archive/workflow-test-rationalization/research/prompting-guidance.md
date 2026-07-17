# Prompting Guidance for Frontier LLMs - Distilled for the `pi` Harness Rework

Research date: 2026-07-16. Primary sources are OpenAI's GPT-5 / 5.1 / 5.2 Cookbook prompting guides and Codex prompting guide, plus Anthropic's Claude prompt-engineering best practices, context-engineering guidance, and Agent Skills guidance, plus the AGENTS.md spec and OpenAI's Codex AGENTS.md docs. Community/third-party sources are flagged inline and used only to corroborate.

A note on model versions: OpenAI's official Cookbook publishes guides through GPT-5.2, and the guides explicitly say each version's guidance "largely carries over" to the next. The user runs GPT-5.6 variants (luna/terra/sol); specific 5.5/5.6 version numbers, dates, and effort-level names ("xhigh", "none") appear in third-party blogs and are only partially corroborated by primary sources (GPT-5.1 confirms `none`; GPT-5.2 confirms `none|minimal|low|medium|high|xhigh`). Treat the *principles* below as stable across the GPT-5.x family; treat exact parameter enums as version-dependent and verify against the live API.

---

## What changed between old-model and modern-model prompting

The single biggest shift: **modern models follow instructions literally and reason over your whole prompt, so the compensations written for weaker models now actively hurt.** Weaker models under-followed instructions, so authors compensated with repetition, ALL-CAPS emphasis, rigid step recipes, exhaustive edge-case enumeration, and defensive over-specification. Frontier models read all of that as binding signal.

Concrete reversals, each cited:

- **Repetition and ALL-CAPS emphasis -> dial back.** Anthropic states directly: models "are also more responsive to the system prompt than previous models. If your prompts were designed to reduce undertriggering on tools or skills, these models may now overtrigger. The fix is to dial back any aggressive language. Where you might have said 'CRITICAL: You MUST use this tool when...', you can use more normal prompting like 'Use this tool when...'." ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

- **Contradictions are now expensive, not merely ignored.** GPT-5 "follows prompt instructions with surgical precision," and "poorly-constructed prompts containing contradictory or vague instructions can be more damaging to GPT-5 than to other models, as it expends reasoning tokens searching for a way to reconcile the contradictions rather than picking one instruction at random." Multiple early adopters found that removing contradictions "drastically streamlined and improved their GPT-5 performance." ([GPT-5 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide))

- **Rigid step-by-step recipes -> prefer goals + heuristics.** Anthropic: "Prefer general instructions over prescriptive steps. A prompt like 'think thoroughly' often produces better reasoning than a hand-written step-by-step plan. Claude's reasoning frequently exceeds what a human would prescribe." ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)) Anthropic's context-engineering guidance frames the goal as the "right altitude": avoid "hardcoding complex, brittle logic in their prompts to elicit exact agentic behavior... this approach creates fragility and increases maintenance complexity," while also avoiding vague hand-waving. ([Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

- **Anti-laziness / thoroughness prompting -> remove it; it now over-triggers.** Anthropic migration guidance: "If your prompts previously encouraged the model to be more thorough or use tools more aggressively, dial back that guidance. Claude 4.6 models are more proactive and may overtrigger on instructions that were needed for previous models." Specifically: "Remove over-prompting. Tools that undertriggered in previous models are likely to trigger appropriately now. Instructions like 'If in doubt, use [tool]' will cause overtriggering." Replace "Default to using [tool]" with "Use [tool] when it would enhance your understanding of the problem." ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

- **Exhaustive edge-case enumeration and defensive coding instructions -> trim.** Anthropic's anti-overengineering snippet explicitly tells the model *not* to "add error handling, fallbacks, or validation for scenarios that can't happen" and to keep "the minimum needed for the current task." The corollary for prompt authors: don't pre-enumerate every branch; state the boundary and trust the model. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

- **Bloated instruction files measurably hurt.** Two studies found LLM-generated context files *reduced* task success (an ETH Zurich study reported ~3% lower success, >20% higher inference cost, 2-4 extra reasoning steps; a second found ~2% lower success and 23% higher cost) "primarily because they duplicated content already available in the repository." ([AGENTS.md research-backed guide, ASDLC.io](https://asdlc.io/practices/agents-md-spec/) - secondary source summarizing primary studies; corroborates Anthropic's "smallest set of high-signal tokens" principle below.)

- **Overall trend, stated by Anthropic:** "smarter models require less prescriptive engineering, allowing agents to operate with more autonomy," while "treating context as a precious, finite resource remains central." ([Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

---

## GPT-5.x specific guidance

**Literal instruction following is the defining trait - and the main risk.** GPT-5 "follows prompt instructions with surgical precision" and is "extraordinarily receptive to prompt instructions surrounding verbosity, tone, and tool calling behavior." GPT-5.2 is described as "prompt-sensitive": "small changes to prompt structure, verbosity constraints, and reasoning settings often translate into large gains in correctness." The flip side is that contradictions cost real reasoning tokens (see above). ([GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide), [GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide))

**Reasoning effort is the primary control dial, and it interacts with prompt verbosity.** `reasoning_effort` "controls how hard the model thinks and how willingly it calls tools." Lowering it "reduces exploration depth but improves efficiency and latency"; "many workflows can be accomplished with consistent results at medium or even low reasoning_effort." GPT-5.2's enum is `none|minimal|low|medium|high|xhigh`. The consistent recommendation is **restraint: confirm medium (the default) isn't already sufficient before reaching for high/xhigh.** A separate `verbosity` parameter controls "the length of the model's final answer, as opposed to the length of its thinking." ([GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide), [GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide))

**Agentic eagerness is bidirectional and prompt-steerable.** To *reduce* eagerness: lower `reasoning_effort`, give clear exploration/stop criteria, and set explicit tool-call budgets. To *increase* it: raise effort and add a persistence prompt - GPT-5.1's canonical form is "you are an agent - please keep going until the user's query is completely resolved, before ending your turn," and "Be extremely biased for action... assume you should go ahead and make the change." ([GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide), [GPT-5.1](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide))

**Scope discipline must be stated explicitly.** GPT-5.2 guidance: "Make scope discipline explicit (don't expand problem surface area)" and, verbatim, "Implement EXACTLY and ONLY what the user requests. No extra features, no added components, no UX embellishments." ([GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide))

**Tool-calling.** "Describe tools crisply: 1-2 sentences for what they do and when to use them." Make tool names semantically precise (`semantic_search` over `search`). Encourage parallelism for independent reads to cut latency. In non-reasoning (`none`) mode, prior GPT-4.1 practice applies (few-shot examples and high-quality tool descriptions become more valuable). ([GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide), [Codex guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide), [GPT-5.1](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide))

**Preambles fix the "frozen app" UX and shape planning.** Because reasoning models may run for a while before emitting visible text, prompt a short visible update before tool calls. GPT-5.1: post 1-2 sentence updates every few tool calls and "always state at least one concrete outcome since the prior update (e.g., 'found X', 'confirmed Y')." **Caveat for coding agents:** the Codex guide warns that over-instructing status updates can cause *premature stopping* - keep preambles to "1 sentence acknowledgement, 1-2 sentence plan," updates every 1-3 steps, and (on Codex models) use the `phase` parameter to mark output `commentary` vs `final_answer` so long tasks don't halt early. ([GPT-5.1](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide), [Codex guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide))

**Lightweight planning, not batch bookkeeping.** GPT-5.1 planning-tool discipline: 2-5 milestone items, "exactly one item in_progress at a time," and never batch-complete items after the fact. ([GPT-5.1](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide))

**Self-reflection / rubrics raise quality without few-shot bloat.** Ask the model to build an internal 5-7 category excellence rubric and iterate against it internally, rather than supplying many worked examples. ([GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide))

**Migration doctrine: change one variable at a time.** GPT-5.2's stated order is "Switch models, don't change prompts yet," pin `reasoning_effort` explicitly, run evals for a baseline, then make incremental tweaks and re-measure. OpenAI also ships a **Prompt Optimizer** whose entire job is removing "contradictions in instructions, missing or unclear format specifications, and inconsistencies between the prompt and few-shot examples." Note the tension with GPT-5.5 third-party guidance that recommends "starting from scratch" - the reconciled reading is: re-audit rather than trust old prompts, but validate changes with evals rather than rewriting blind. ([GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide), [Prompt optimization cookbook](https://developers.openai.com/cookbook/examples/gpt-5/prompt-optimization-cookbook), [GPT-5.5 guide via Simon Willison](https://simonwillison.net/2026/apr/25/gpt-5-5-prompting-guide/))

**Recommended prompt structure (GPT-5.x).** Crisp role, then explicit scope/constraints, then tool guidance (1-2 sentences each), then output-shape constraints (concrete length caps like "3-6 sentences or <=5 bullets"), then eagerness/persistence calibration matched to the reasoning-effort setting. For long context (>~10k tokens), have the model outline relevant sections and re-state the user's constraints before answering. ([GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide))

---

## Claude-specific guidance

**Be explicit and request "above and beyond" behavior directly.** "If you want 'above and beyond' behavior, explicitly request it rather than relying on the model to infer this from vague prompts." Golden rule: "Show your prompt to a colleague with minimal context... If they'd be confused, Claude will be too." ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Give the *why*; Claude generalizes from motivation.** The canonical example: instead of "NEVER use ellipses," write "Your response will be read aloud by a text-to-speech engine, so never use ellipses..." - "Claude is smart enough to generalize from the explanation." This is a meaningful divergence from GPT-5.x's terser, constraint-list style. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Tell Claude what to do, not what not to do.** Instead of "Do not use markdown," write "Your response should be composed of smoothly flowing prose paragraphs." ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Structure with XML tags and clear sections.** Claude parses `<instructions>`, `<context>`, `<example>` tags well; both Anthropic and the context-engineering post recommend organizing prompts into distinct sections via XML or Markdown headers. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices), [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

**Examples are high-value but must be curated.** Claude "pays close attention to details and examples"; use 3-5 relevant, diverse, structured examples and ensure they model *only* the behavior you want (bad examples get imitated). Contrast with GPT-5.x, where rubric-driven self-reflection is often preferred over many examples. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Action vs. hesitation is a single steerable knob.** By default Claude may only *suggest* when you say "can you suggest changes." Anthropic supplies a `<default_to_action>` snippet to make it proactive and a `<do_not_act_before_instructions>` snippet to make it conservative - pick one per surface. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Overeagerness / overengineering needs a dedicated guardrail.** Anthropic notes Opus 4.5/4.6 "tend to overengineer by creating extra files, adding unnecessary abstractions, or building in flexibility that wasn't requested," and supplies an anti-overengineering snippet (scope, docs, defensive coding, abstractions all held to "the minimum needed for the current task"). Subagents can also be *overused*; give explicit "when to delegate vs. work directly" guidance. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Thinking/effort replaces manual budgets.** Current Claude models use adaptive thinking controlled by an `effort` parameter, not `budget_tokens` (which now 400s on Fable 5 / Mythos 5 and Opus 4.7+). If prompts push thoroughness, tune it down; higher effort already drives more upfront exploration. Note the quirk: when thinking is off, some Claude models are "particularly sensitive to the word 'think'" - use "consider/evaluate/reason through" instead. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Long-horizon / multi-window agentic work.** Claude tracks a "token budget" and may wrap up early near context limits unless told the harness compacts/persists - tell it so. Use structured state files (JSON for test status, freeform `progress.txt`, git for checkpoints), and give a distinct first-window prompt (scaffold) vs. later-window prompts (iterate on a todo list). Parallel tool calls are default behavior and steerable to ~100%. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

**Prefill is gone (Claude 4.6+ / Fable 5 / Mythos 5).** Migrate format-forcing to structured outputs or tool/enum fields; migrate "no preamble" to a direct instruction. Relevant if any harness code prefilled assistant turns. ([Anthropic prompt best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))

---

## The happy medium: model-agnostic harness prompt principles

Where the two vendors agree, treat it as bedrock. Where they diverge, the user prefers the GPT-5.x-leaning choice; I flag those explicitly.

**Shared bedrock (both vendors):**
1. One instruction, stated once, at the right altitude - goals and boundaries over step recipes. (Anthropic "right altitude"; GPT-5 "surgical precision" + contradiction cost.)
2. No contradictions. Audit for conflicting rules across layered files; a conflict is a bug, not a nuance.
3. Minimal high-signal tokens; delete anything the model can infer from code, tools, or manifests.
4. Explicit scope discipline ("implement exactly what's asked; no unrequested features/abstractions").
5. Crisp tool descriptions (1-2 sentences: what + when), semantically precise names, parallelize independent reads.
6. State one behavior per knob (proactive vs. conservative; more vs. less exploration) rather than piling on emphasis.

### (a) Workflow skills - goals, boundaries, evidence; not recipes

- Write the **objective and the definition of done**, not an ordered N-step procedure. "Prefer general instructions over prescriptive steps" (Anthropic); rubric/self-reflection beats scripted steps (GPT-5).
- State **hard boundaries as boundaries** ("never edit tests," "don't expand scope," "ask before destructive/irreversible actions") - these are the high-value lines. Anthropic's reversibility snippet and GPT-5.2's "EXACTLY and ONLY" are the models.
- Specify **evidence/verification requirements** rather than the mechanics of producing them: "verify against [criteria] before finishing," "ground answers in files you actually opened." (Anthropic `<investigate_before_answering>`; self-check guidance.)
- **Don't hardcode panel sizes / iteration counts.** A fixed "spawn exactly 5 reviewers" is brittle hardcoded logic - the anti-pattern context-engineering warns against. Express it as intent ("use enough reviewers to cover the distinct risk areas; typically a few") and let effort/model scale it.
- **Lean on progressive disclosure** (Agent Skills): keep the SKILL.md short; move rarely-needed detail into referenced files loaded on demand. "When the SKILL.md file becomes unwieldy, split its content into separate files and reference them." The `name`/`description` are the highest-leverage tokens - they gate activation. ([Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills))
- **GPT-5.x-leaning divergence on examples:** Anthropic loves 3-5 curated examples; GPT-5 prefers internal rubrics and warns few-shot bloat can conflict with instructions. *Recommendation:* keep at most one or two canonical examples where format is genuinely non-obvious; prefer a described rubric over an example gallery.

### (b) Agent definitions - role intent, tools, capabilities; not model IDs

- Define **role and decision boundaries** (what this agent owns, when it should act vs. hand back), the **tools it needs and why**, and its **stop condition**. That's what steers behavior on both vendors.
- **Do not hardcode model ladders inside prompts.** Model selection is a config/routing concern; embedding "use opus for X, haiku for Y" in prompt text is exactly the brittle logic that ages badly as the model lineup changes. Express capability needs ("this agent needs strong multi-file reasoning" / "this is a mechanical, low-ambiguity task") and let the harness map capability->model. This also matches AGENTS.md guidance to not duplicate what the toolchain owns.
- **Calibrate eagerness per agent explicitly**, using one direction: builder-type agents get persistence/bias-to-action; review/advisory agents get "research and recommend, don't act." Both vendors ship snippets for each pole.
- **Tune eagerness to effort, not to caps.** Prefer lowering reasoning effort or narrowing scope over hardcoded tool-call budgets, except where a hard ceiling is genuinely required.

### (c) Layered instruction files (AGENTS.md / CLAUDE.md) - one owner per rule

- **One rule, one home.** The closest file to the edited code wins; put shared rules at the root and only *overrides* in nested files. Don't restate a root rule in a child file. ([AGENTS.md spec](https://agents.md/), [Codex AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md))
- **Write only the non-obvious.** "Keep each section to information the agent cannot infer from your code or package manifests"; the highest signal-to-noise section is non-obvious patterns. Prioritize copy-pasteable commands and real code over prose. ([AGENTS.md research guide](https://asdlc.io/practices/agents-md-spec/))
- **Don't duplicate what the toolchain enforces.** "If a rule overlaps with something your toolchain or harness enforces (e.g., linting rules, type errors), remove it - the tool is the enforcement mechanism, not the agent."
- **Respect the size budget.** Codex truncates at `project_doc_max_bytes` (32 KiB default) and skips empty files; long files silently drop content. Split by directory rather than growing one file. ([Codex AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md))
- **Keep judgment/safety/facts minimal and authoritative.** Safety rules (reversibility, destructive-op confirmation) belong once, at the top layer, stated plainly - not repeated with escalating caps in every file.
- Note the load mechanics differ: Codex injects each AGENTS.md as a separate user message root-to-leaf; Claude Code reads CLAUDE.md (which can `@AGENTS.md`-import a shared file). Content is ~90% identical across tools, so maintain one source and import.

**Where GPT-5.x and Claude genuinely conflict, and the recommended call:**
- *Motivation/verbosity:* Claude benefits from explanatory "why" prose; GPT-5.x rewards terse, concrete constraints and can be derailed by narrative. **Recommendation (GPT-5.x-leaning):** write terse, concrete rules; attach a brief "why" only where it changes behavior, kept to one clause. This keeps token cost down and satisfies Claude adequately.
- *Examples:* Claude wants a few curated examples; GPT-5 prefers rubrics and warns about few-shot/instruction inconsistency. **Recommendation (GPT-5.x-leaning):** minimize examples; use a described rubric or output-shape spec. Add an example only where format is otherwise ambiguous.
- *Emphasis:* both say dial back caps, so no conflict - delete ALL-CAPS/"CRITICAL" universally.

---

## Anti-patterns checklist (delete on sight when auditing old harness prompts)

- [ ] **ALL-CAPS / "CRITICAL" / "You MUST" emphasis.** Causes over-triggering on current models; replace with plain "Use X when...". ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))
- [ ] **Contradictory or overlapping instructions across layers.** Burns reasoning tokens on GPT-5.x; run a dedicated contradiction pass. ([GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide), [Prompt optimizer](https://developers.openai.com/cookbook/examples/gpt-5/prompt-optimization-cookbook))
- [ ] **Rigid N-step recipes for tasks the model can reason through.** Replace with goal + boundary + done-criteria. ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))
- [ ] **Anti-laziness / "be thorough" / "if in doubt, use [tool]" / "default to [tool]".** Now causes over-exploration and tool over-triggering. ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))
- [ ] **Hardcoded model ladders in prompt text** (use opus/haiku by name). Move to routing config; express capability need instead. ([Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- [ ] **Fixed panel sizes / iteration counts / tool-call budgets baked into prompts.** Brittle hardcoded logic; express as scalable intent or control via effort. ([Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
- [ ] **Exhaustive edge-case enumeration and mandated defensive coding.** State the boundary; don't pre-list every branch. ([Anthropic anti-overengineering snippet](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))
- [ ] **Repeated restatement of the same rule across files.** One rule, one owner (closest-file-wins). ([AGENTS.md spec](https://agents.md/))
- [ ] **Rules duplicating what code/manifests/linters already say.** Measurably lowers success and raises cost; delete. ([AGENTS.md research guide](https://asdlc.io/practices/agents-md-spec/))
- [ ] **"What not to do" phrasing where a positive instruction works.** Convert to "do this instead." ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))
- [ ] **Few-shot example galleries.** Trim to <=1-2 where format is genuinely non-obvious; prefer rubric/output-spec. ([GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide))
- [ ] **`budget_tokens` / manual thinking budgets and prefilled assistant turns.** Removed on current Claude models; migrate to effort + structured outputs. ([Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices))
- [ ] **Missing scope-discipline line where scope creep is a risk.** Add an explicit "exactly and only what's asked" boundary. ([GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide))
- [ ] **Over-instructed status updates in coding agents.** Can cause premature stopping; keep preambles minimal. ([Codex guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide))
- [ ] **Bloated instruction/AGENTS.md files over ~32 KiB.** Silent truncation; split by directory. ([Codex AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md))

---

## Sources

Primary (vendor):
- [GPT-5 prompting guide - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide)
- [GPT-5.1 prompting guide - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide)
- [GPT-5.2 prompting guide - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide)
- [Codex prompting guide - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)
- [GPT-5 Prompt Optimizer - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/gpt-5/prompt-optimization-cookbook)
- [Custom instructions with AGENTS.md - OpenAI/Codex docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Prompting best practices (Claude 4/5) - Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Effective context engineering for AI agents - Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Equipping agents for the real world with Agent Skills - Anthropic](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [AGENTS.md - the open spec](https://agents.md/)

Secondary (corroborating / community, flagged in text):
- [AGENTS.md research-backed guide - ASDLC.io](https://asdlc.io/practices/agents-md-spec/) (summarizes ETH Zurich and related studies on bloated context files)
- [GPT-5.5 prompting guide notes - Simon Willison](https://simonwillison.net/2026/apr/25/gpt-5-5-prompting-guide/) (5.5-era reasoning levels, preamble pattern, "start fresh" caution)
