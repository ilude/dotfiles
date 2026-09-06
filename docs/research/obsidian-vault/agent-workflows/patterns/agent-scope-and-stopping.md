---
status: research-note
source: https://arxiv.org/html/2602.11988v2
---

# Agent scope and stopping

## Why this matters

Coding agents can expand requirements, overengineer solutions, and keep generating tests after useful verification is complete. The opposite failure, stopping before the requested work is finished, also matters. The goal is completion with less operator supervision, not simply fewer tool calls.

This captures research gathered for a September 2026 cutoff. Live vendor documentation is not a dated snapshot. These findings are not approved instructions, an implementation plan, or proof that a particular remedy will work in Pi.

## Useful signals

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

## Possible Pi fit

These are candidates for discussion, not approved changes:

- Keep original requirements and completion criteria distinct from agent proposals across plans and compaction. Necessary implementation choices are not new requirements.
- Remove redundant demands for exhaustive exploration or repeated review before adding more prohibitions. Do not remove required checks merely to reduce activity.
- Ground new tests in required behavior, demonstrated defects, or credible risks in the changed path. An imaginable case alone is not sufficient justification.
- Use narrow factual controls where worthwhile: associate check results with relevant source/configuration state, bound automatic review iterations, or apply an execution budget. Detecting stale evidence reliably still requires knowing which inputs matter.
- Scope reviews to unmet requirements and concrete regressions rather than an open-ended search for improvements. Reviewer suggestions must not silently become mandatory work.

A budget limit means work stopped, not that it completed. Passing tests likewise cannot close unmet integration or operator-acceptance requirements.

## Risks / reasons not to build yet

- No source reviewed establishes a universal fix for this combination of drift, overengineering, and excessive verification.
- Reminders still rely on model judgment. Mechanical limits bound activity but cannot determine whether a semantic edge case deserves implementation.
- More supervisors, logs, approval gates, or task artifacts can recreate the supervision burden the operator wants to avoid.
- A smaller diff or shorter run is not a success if required work is left unfinished. Evaluate unnecessary edits, repeated checks, operator interruptions, and incomplete handoffs together.
- Local incidents establish that failures occurred, not their cause. They do not prove that the current instructions caused the behavior or that a proposed change prevents recurrence.

## KISS recommendation

Keep the research here and link it from the on-demand `agent-process` skill. Preserve local feedback and approved decisions in that skill's logs. Do not add a permanent reviewer loop, new policy, or a general supervisory system from this note alone. Any later change should address a demonstrated failure with the smallest useful intervention and evidence of reduced supervision without more incomplete handoffs.

## Related notes

- [Deterministic agent rules and guardrails](deterministic-agent-rules-and-guardrails.md)
- [Evidence-based code review](evidence-based-code-review.md)
- [Agent workflow benchmark loops](../workflow-ideas/agent-workflow-benchmark-loops.md)
- [Agent process skill](../../../../../pi/profiles/default/skills/agent-process/SKILL.md)
