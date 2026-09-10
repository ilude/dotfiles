---
status: research-note
source:
  - https://arxiv.org/html/2602.11988v2
  - https://developers.openai.com/codex/subagents.md
  - https://www.anthropic.com/engineering/multi-agent-research-system
  - https://arxiv.org/html/2601.13295v1
  - https://arxiv.org/html/2603.02176v1
  - https://arxiv.org/html/2605.05007v1
  - https://arxiv.org/html/2605.25233v1
  - https://arxiv.org/html/2606.22902v2
  - ../../../../../pi/profiles/default/skills/agent-process/references/instruction-feedback.md
  - ../../../../../pi/profiles/default/skills/agent-process/references/failure-log.md
---

# Agent scope and stopping

## Why this matters

Coding agents can expand requirements, overengineer solutions, and keep generating tests after useful verification is complete. The opposite failure, stopping before the requested work is finished, also matters. The goal is completion with less operator supervision, not simply fewer tool calls.

This captures research gathered for a September 2026 cutoff. Live vendor documentation is not a dated snapshot. These findings are not approved instructions, an implementation plan, or proof that a particular remedy will work in Pi.

## Useful signals

### Local agent-process evidence connects churn with delegation shape

The default profile's [instruction feedback](../../../../../pi/profiles/default/skills/agent-process/references/instruction-feedback.md) and [failure log](../../../../../pi/profiles/default/skills/agent-process/references/failure-log.md) provide the local evidence that gives this external research practical context:

- AIF-003 and APR-002 record open-ended verification and edge-case expansion after broad checks had passed.
- AIF-013 and APR-005 distinguish successful bounded plans from gateway churn involving new surfaces, stale state, and agent-invented obligations.
- APR-006 records a worker taking several plan areas as one cross-cutting prototype, then stopping with required paths unfinished.
- AIF-017 and APR-008 record unnecessary headless overrides and weak delegation visibility.
- AIF-027 and APR-020 record the Herdr audit being assigned as one oversized, unjustifiably Sol-high review instead of smaller proportionate seams.

Together, these incidents support a common hypothesis: stable completion boundaries, small independently verifiable assignments, explicit dependency order, and proportionate model choice may reduce both premature stopping and scope expansion. They do not prove a dedicated scoper will solve those failures. Any change should be evaluated against later operator corrections and completed work rather than tool-call or subagent counts.

### Repository instructions can increase activity without improving completion

[Evaluating AGENTS.md, June 23, 2026 revision](https://arxiv.org/html/2602.11988v2) evaluated four agent/model combinations on SWE-bench Lite and CTXbench repository tasks. Context files did not significantly improve overall task success, while increasing exploration, testing, and cost. The abstract reports inference cost increasing by over 20% on average. Human-written files outperformed generated ones, but not significantly the no-context baseline.

Instructions were generally followed. Repository overviews were unhelpful in the evaluated settings; nonstandard conventions remained a useful purpose for context files. This supports keeping instructions selective, not concluding that all `AGENTS.md` files are harmful. Use this revision rather than the earlier, stronger negative framing.

### Verification guidance can reinforce excessive checking

Anthropic's live [prompting guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) recognizes unnecessary abstractions, extra files, speculative flexibility, excessive exploration, and subagent overuse. It recommends dialing back aggressive instructions carried over from earlier models.

Its live [Opus 5 guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#task-scope-and-over-verification) specifically says redundant verification instructions and scaffolding can add cost without improving quality. This is model-specific vendor guidance, not controlled evidence that removing verification improves every model.

### Harness changes matter, but must target the actual failure

[LangChain's harness experiment](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering) reports Terminal Bench 2.0 performance improving from 52.8% to 66.5% while keeping GPT-5.2-Codex fixed. Changes bundled context delivery, verification guidance, time-budget signals, reasoning allocation, and loop detection. The report does not isolate the benefit of every component.

Their loop detector injects a reminder after repeated edits; it does not enforce a stop. Much of the experiment addressed insufficient verification, so copying its verification loop could worsen excessive testing. Maximum reasoning throughout also performed worse than high reasoning because of timeouts in that benchmark.

### Test volume is not evidence of test value

[Are Coding Agents Generating Over-Mocked Tests?](https://arxiv.org/abs/2602.00409), submitted January 30, 2026, examined more than 1.2 million commits across 2,168 JavaScript, TypeScript, and Python repositories. Agents modified tests and added mocks more frequently than non-agents.

This observational result does not establish that those tests were unnecessary or that mocks are inherently wrong. Passing self-authored tests and test counts alone do not establish fidelity to requirements or real integration behavior.

### Keep the harness proportional

[Stop Overengineering Your Agent Harness](https://www.oreilly.com/radar/stop-overengineering-your-agent-harness/), July 22, 2026, argues for job-specific harnesses and adding infrastructure only for demonstrated needs. This is engineering advice, not a controlled evaluation of scope-drift prevention. It distinguishes complex coding and research agents from simpler workflows; it does not argue that all agents need minimal context management.

### Delegation quality depends on task boundaries and dependencies

OpenAI's live [Codex subagent guidance](https://developers.openai.com/codex/subagents.md) recommends bounded pieces, narrow custom agents, separate review concerns, and parallelism primarily for independent read-heavy work. It warns that parallel write-heavy work adds conflicts and coordination overhead. Anthropic's [multi-agent research report](https://www.anthropic.com/engineering/multi-agent-research-system) similarly requires each worker to have an objective, output format, tool/source guidance, and clear boundaries, while warning that dense dependencies and shared context make multi-agent execution a poor fit.

[CooperBench](https://arxiv.org/html/2601.13295v1), covering 652 collaborative coding tasks, reports substantially worse results from two-agent cooperation than from a solo baseline. Its observed failures include vague or late communication, duplicated work, false expectations, broken commitments, and incompatible overlapping changes. This supports explicit ownership and orchestrator-controlled sequencing rather than assuming more simultaneous agents improve coding work.

[AgentSkillOS](https://arxiv.org/html/2603.02176v1) reports that DAG-based skill composition outperformed flat invocation with the same skill set. [Meta-Agent](https://arxiv.org/html/2605.25233v1) likewise constructs a small DAG with explicit input/output contracts, dependencies, and verification criteria before execution. These systems are more elaborate than Pi needs, but they support dependency-aware decomposition over unordered task lists.

### Task sizing and model routing are one decision

[Uno-Orchestra](https://arxiv.org/html/2605.05007v1) jointly decides whether to delegate, decomposition depth, and the model/primitive assigned to each subtask under a cost budget. Its selective-delegation result supports keeping simple work local and paying orchestration cost only for genuinely compositional tasks.

[Agent-as-a-Router](https://arxiv.org/html/2606.22902v2) found that execution-grounded model performance information improved a capable router by 15.3 percent relative to its zero-shot baseline. The authors attribute much of the routing gap to information deficit rather than insufficient router reasoning. This cautions against using a stronger routing model by default; verified local outcomes and task characteristics may matter more.

Community Codex definitions such as [agent-organizer](https://github.com/VoltAgent/awesome-codex-subagents/blob/main/categories/09-meta-orchestration/agent-organizer.toml), [task-distributor](https://github.com/VoltAgent/awesome-codex-subagents/blob/main/categories/09-meta-orchestration/task-distributor.toml), and [multi-agent-coordinator](https://github.com/VoltAgent/awesome-codex-subagents/blob/main/categories/09-meta-orchestration/multi-agent-coordinator.toml) provide direct examples of read-only agents that map critical paths, write ownership, dependencies, worker fit, and output contracts. Their Sol-high defaults are community choices, not evidence that this effort level is necessary.

## Possible Pi fit

These are candidates for discussion, not approved changes:

- Keep original requirements and completion criteria distinct from agent proposals across plans and compaction. Necessary implementation choices are not new requirements.
- Remove redundant demands for exhaustive exploration or repeated review before adding more prohibitions. Do not remove required checks merely to reduce activity.
- Ground new tests in required behavior, demonstrated defects, or credible risks in the changed path. An imaginable case alone is not sufficient justification.
- Use narrow factual controls where worthwhile: associate check results with relevant source/configuration state, bound automatic review iterations, or apply an execution budget. Detecting stale evidence reliably still requires knowing which inputs matter.
- Scope reviews to unmet requirements and concrete regressions rather than an open-ended search for improvements. Reviewer suggestions must not silently become mandatory work.
- Treat one independently verifiable responsibility, such as one plan section, review concern, or tightly coupled implementation seam, as the default delegation unit. Do not split mechanically by file.
- Run independent read scopes in parallel, but sequence dependent work and overlapping writes. Integrate prerequisite results before assigning their consumers.
- A small read-only scoping advisor could propose task boundaries, dependencies, worker fit, and output contracts without receiving execution or delegation authority. It should be optional rather than a gate.
- Start routing with the least capable model and effort supported by task clarity, coupling, and verification. Ask questions when complexity comes from unclear intent; do not spend a stronger model on guessing requirements.

A budget limit means work stopped, not that it completed. Passing tests likewise cannot close unmet integration or operator-acceptance requirements.

## Risks / reasons not to build yet

- No source reviewed establishes a universal fix for this combination of drift, overengineering, and excessive verification.
- Reminders still rely on model judgment. Mechanical limits bound activity but cannot determine whether a semantic edge case deserves implementation.
- More supervisors, logs, approval gates, or task artifacts can recreate the supervision burden the operator wants to avoid.
- A dedicated scoping agent adds cost and latency when the next bounded task is already obvious. Mandatory invocation, complexity scoring, automatic escalation, and persistent routing infrastructure would turn advice into ceremony.
- Public routing results do not validate local Luna, Sol, or Astra thresholds. Local model/effort policy should begin with operator experience and change only from verified outcomes.
- A smaller diff or shorter run is not a success if required work is left unfinished. Evaluate unnecessary edits, repeated checks, operator interruptions, and incomplete handoffs together.
- Local incidents establish that failures occurred, not their cause. They do not prove that the current instructions caused the behavior or that a proposed change prevents recurrence.

## KISS recommendation

Keep the research here and link it from the on-demand `agent-process` skill. Preserve local feedback and approved decisions in that skill's logs. If delegation sizing is promoted, try one optional read-only scoper definition plus a short orchestrator rule before any router, task database, scoring model, approval gate, or automatic escalation system. Do not add a permanent reviewer loop, new policy, or a general supervisory system from this note alone. Any later change should address a demonstrated failure with the smallest useful intervention and evidence of reduced supervision without more incomplete handoffs.

## Related notes

- [Deterministic agent rules and guardrails](deterministic-agent-rules-and-guardrails.md)
- [Evidence-based code review](evidence-based-code-review.md)
- [Agent workflow benchmark loops](../workflow-ideas/agent-workflow-benchmark-loops.md)
- [Durable task and dependency systems](../workflow-ideas/durable-task-dependency-systems.md)
- [Historical agent routing research](../projects/agent-routing-research.md)
- [Agent process skill](../../../../../pi/profiles/default/skills/agent-process/SKILL.md)
