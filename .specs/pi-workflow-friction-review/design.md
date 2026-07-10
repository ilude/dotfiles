# Pi workflow friction review design

## Status

Design decisions captured from the July 10, 2026 workflow interview. This is a reference design, not an implementation plan.

The thin slice was implemented on July 10, 2026 in:

- `pi/extensions/workflow-friction.ts`;
- `pi/lib/workflow-friction.ts`;
- `pi/tests/workflow-friction.test.ts`.

`pi/extensions/goal.ts` and `pi/extensions/workflow-commands.ts` mark Explore and Engineer command submissions so timing begins at command invocation rather than hidden prompt dispatch.

## Objective

Add a low-friction feedback loop that helps identify when Pi work is productive, when it churns, and which workflow or instruction changes may improve future work.

The system must:

- keep simple requests fast and focused;
- scale when repository evidence or risk justifies it;
- measure behavior before changing it;
- keep background review out of the user's active workflow;
- produce concise, evidence-linked improvement suggestions;
- require agreement before changing instructions, skills, prompts, hooks, or code.

## Design principles

### Prefer the smallest useful solution

Prefer the smallest interface and implementation that satisfies the observed need. Do not add modes, options, configuration, abstraction, or automation without a current requirement or measured recurring friction. Start with one obvious path and extend it only when evidence justifies the added complexity.

Use the 80/20 rule, YAGNI, and KISS as design constraints. Ease of use and ease of reasoning are part of correctness.

### Separate observation from change

Background review records evidence. It does not modify source files, instructions, skills, prompts, settings, or model routing.

`/workflow-review` turns evidence into a discussion. The user decides whether a proposed change should be applied.

### Prefer deterministic selection

Code determines which interactions are selected for review. Model judgment evaluates the selected interaction but does not decide whether its own review should run.

### Treat model review as evidence, not truth

A reviewer may misclassify productive debugging as churn or miss a real problem. Store its confidence and evidence references. Use recurring patterns, random controls, source inspection, and user corrections to assess reviewer quality.

## Operating modes

Pi begins with an explicit mode determined by the command surface.

### Explore mode

Surfaces:

- regular chat;
- `/goal`.

Purpose:

- answer a question;
- diagnose a problem;
- test whether an idea works;
- build a temporary spike;
- solve a one-time problem;
- refine a working idea only after it proves useful.

Planning is normally internal. Validation should prove or disprove the current hypothesis or verify the exact requested outcome. It should not automatically expand into full repository assurance.

### Engineer mode

Surfaces:

- `/plan-it`;
- `/review-it`;
- `/do-it`.

Purpose:

- design before implementation;
- examine architecture and maintenance consequences;
- coordinate independent work;
- execute explicit acceptance and validation contracts;
- preserve durable implementation and review evidence.

The workflow may be more structured, but structure must still earn its cost.

### Prompt-router boundary

The prompt router continues to select model tier and reasoning effort. Its cost and quality value on real work remain unproven.

Do not use prompt-router output to mandate planning, delegation, background review, or workflow escalation. Evaluate router-on and router-off behavior separately when enough outcome data exists.

## Interaction boundary and timing

An interaction begins when the user submits input and ends when Pi reaches `agent_settled`.

Start capture:

- use the Pi `input` event for regular prompts and prompt-template or skill expansion paths;
- instrument extension command handlers directly because extension commands bypass `input`;
- assign a stable interaction ID and retain the Pi session ID.

End capture:

- use `agent_settled`, not `agent_end`;
- `agent_settled` includes automatic retries, compaction retries, and queued follow-up work;
- treat it as the supported proxy for control returning to the user;
- record elapsed wall-clock time and monotonic duration.

The first implementation does not need a separate TUI-editor-ready event unless observed timing proves `agent_settled` materially inaccurate.

## Review selection

### Duration rules

| Interaction duration | Review behavior |
| --- | --- |
| Less than 2 minutes | No automatic review. `/capture` may select it manually. |
| 2 through 10 minutes | Review when a trigger fires, or when selected by the 15 percent control sample. |
| More than 10 minutes | Always review. |

The 10-minute rule applies to both Explore and Engineer modes.

### Initial high-confidence triggers

Select a 2-to-10-minute interaction when one or more of these occur:

- explicit profanity or clear frustration wording;
- the same failed command is repeated without a relevant intervening change;
- the same validation command is repeated without relevant intervening edits;
- multiple subagent launches fail;
- the same tool fails repeatedly;
- repeated attempts are needed to build a working helper script.

Keep trigger rules narrow and explainable. A normal first failure, one validation rerun after a relevant edit, or one successful delegation is not friction by itself.

### Random control sample

Review 15 percent of otherwise non-triggered interactions in the 2-to-10-minute window.

Selection must be deterministic for a given interaction, for example by hashing the interaction ID into a stable bucket. Do not use model judgment or process-global random state.

The control sample serves two purposes:

- discover friction not covered by existing triggers;
- estimate how often trigger-selected interactions differ from ordinary interactions.

### Selection deduplication

An interaction receives at most one background review. If duration, triggers, random sampling, and `/capture` select the same interaction, merge the selection reasons into one queue record.

## `/capture`

Command:

```text
/capture [optional note]
```

Behavior:

- select the latest completed interaction;
- attach the optional note as reviewer context;
- enqueue the same background review used by automatic selection;
- preserve the source session ID;
- do not add labels, categories, sentiment syntax, selection UI, or a separate proposal path;
- do not notify the user when review finishes.

`/capture` is a manual selection trigger and nothing more.

## Background review

### Execution

- Start review only after the original interaction reaches `agent_settled`.
- Never delay control returning to the user.
- Use a persistent queue that survives Pi shutdown and resumes in a later session.
- Process one review at a time.
- Run one bounded attempt per review.
- Record failure metadata and continue silently when review fails.
- Do not retry automatically.
- Do not expose background reviews through `/tasks`, the task status bar, or normal chat notifications.

### Reviewer

Initial fixed reviewer:

- model: `openai-codex/gpt-5.6-terra`;
- reasoning effort: low;
- tools: none.

Fixing the reviewer configuration makes early results comparable and avoids coupling this experiment to the prompt router.

### Review input

Provide the bounded interaction only:

- session ID and interaction ID;
- operating mode;
- start, end, and duration;
- selection reasons;
- the user request;
- assistant turns within the interaction;
- tool calls and bounded results;
- the final assistant response;
- deterministic counts and failure signals;
- optional `/capture` note.

Do not provide the complete session by default. The session ID allows later source inspection during interactive aggregation.

### Review questions

The reviewer determines whether the interaction was:

- `productive`;
- `mixed`;
- `churn`;
- `uncertain`.

It should examine:

- whether tool activity produced new evidence or repeated prior work;
- time before the first meaningful action;
- repeated commands without relevant state changes;
- validation performed before a coherent implementation existed;
- whether the earliest failure was isolated before an expensive retry;
- delegation overhead and failed launches;
- scope drift into secondary or unrelated work;
- whether the exact requested outcome was reached;
- whether complexity added to the solution was required;
- whether a simpler interface or implementation would have satisfied the request.

For repeated tool or helper-script failures, answer one focused question:

> Would clearer reusable instructions probably have prevented these failures?

If yes, identify the relevant existing skill or a specific skill gap. If no, identify the concrete tool or runtime problem. Do not force every repeated failure into a skill recommendation.

Keep reviewer output structured and brief. Suggestions are optional and should appear only when supported by evidence.

## Runtime storage

Use one local runtime store outside tracked repository source. Keep append-only JSONL streams for interaction metadata, review results, and experiment markers.

Requirements:

- record metadata for every interaction so reviewed findings have a denominator;
- never include prompt or response content in interaction metadata records;
- retain records indefinitely;
- keep source session IDs;
- avoid copying full interaction content into the durable review result;
- store enough metadata to aggregate results and locate the source interaction;
- preserve failed review attempts;
- version the record schema;
- keep runtime evidence uncommitted.

The implementation may choose the smallest schema and safe local path that satisfy these requirements.

## `/workflow-review`

Purpose: aggregate recent background findings and begin an interactive improvement discussion.

Default behavior:

- inspect review records from the previous 15 days;
- use session IDs to gather source context only when summarized evidence is insufficient;
- show up to three concise finding headlines;
- show only one when only one meaningful issue exists;
- recommend one issue to address first;
- include evidence counts, representative source references, likely impact, and confidence;
- distinguish observed facts from reviewer interpretation;
- brainstorm possible instruction, skill, prompt, hook, tooling, or code changes;
- do not apply changes automatically.

The discussion should follow the preferred interview pattern:

1. State the problem.
2. State the goal.
3. Present a small numbered set of concrete options.
4. Give one recommendation.
5. Let the user select an option and add context.
6. Lock the decision before continuing.

Avoid walls of text and do not pad the response to produce three findings or three options when fewer are meaningful.

### Easy approval path

After presenting a recommended change, the user may respond with a simple instruction such as `apply`.

The active agent then uses normal repository tools and safety rules to make the approved change. No autonomous mutation engine or special apply command is required.

### Experiment markers

When an approved change is intended to improve a measured friction pattern, record a small marker containing:

- change date;
- friction pattern;
- concise treatment description;
- affected instruction, skill, prompt, hook, or code surface.

Nothing runs automatically after a fixed period. Future `/workflow-review` invocations may compare evidence before and after the marker when enough observations exist.

One conceptual change is the default experiment unit, even when it requires coordinated edits across multiple files. A few tightly related changes may be treated as one intervention when review evidence shows especially high value or repeated user aggravation. Report the bundle honestly; do not attribute results to an individual component without evidence.

## Initial measurements

The first version should support these questions:

- How long do interactions take from submission to `agent_settled`?
- How often do interactions cross the 10-minute threshold?
- Which triggers select interactions in the 2-to-10-minute window?
- How often does random sampling find churn that triggers missed?
- How often do reviewers classify selected work as productive, mixed, churn, or uncertain?
- Which repeated tool failures appear preventable through clearer skills?
- How often are validations repeated without relevant edits?
- How often do failed subagent launches contribute to churn?
- Which friction patterns recur within a 15-day review window?
- After an approved change, does the targeted pattern become less frequent or less severe?

Do not collapse these into a single productivity score.

## Scope for the first implementation

Build one thin end-to-end pipeline containing:

- interaction timing;
- deterministic selection;
- persistent silent review queue;
- bounded background review;
- `/capture`;
- local append-only JSONL results;
- `/workflow-review`;
- experiment markers.

Use Pi-native TypeScript extension events and existing subagent/session infrastructure where practical. Keep the background queue separate from user task state.

## Explicit non-goals

The first version does not include:

- automatic instruction, skill, prompt, setting, or code changes;
- dashboards;
- adaptive duration thresholds;
- prompt-router-driven workflow scaling;
- full-session background review;
- multiple concurrent reviewers;
- automatic review retries;
- automatic experiment scheduling;
- automatic promotion or rollback;
- mandatory user ratings;
- `/capture` labels or categories;
- user-facing notifications for individual background reviews;
- a new memory platform;
- autonomous skill creation.

## Acceptance criteria

- Normal prompts and extension commands receive one stable interaction boundary.
- Duration is measured from submission to `agent_settled`.
- The original interaction returns control without waiting for background review.
- Interactions over 10 minutes are selected.
- Triggered interactions from 2 through 10 minutes are selected.
- Exactly 15 percent of deterministic control buckets are eligible among otherwise non-triggered 2-to-10-minute interactions.
- Interactions under 2 minutes are selected only through `/capture`.
- Multiple selection reasons produce one review.
- `/capture` selects the latest completed interaction and accepts an optional note.
- Review jobs run one at a time and pending jobs survive restart.
- Each review makes one bounded Terra low-effort attempt with no tools.
- Failed reviews are recorded and not retried automatically.
- Durable records include source session IDs and remain outside tracked source.
- `/workflow-review` uses a 15-day lookback and presents no more than three meaningful headlines.
- No source change occurs without user agreement.
- Experiment markers support later before-and-after inspection without scheduling automatic work.

## Research influences

Useful patterns came from:

- Claude Code lifecycle hooks and telemetry: <https://code.claude.com/docs/en/hooks-guide> and <https://code.claude.com/docs/en/monitoring-usage>
- Claude Code file-based memory boundaries: <https://code.claude.com/docs/en/memory>
- Hermes Agent bounded memory and staged writes: <https://hermes-agent.nousresearch.com/docs/user-guide/features/memory>
- Hermes Agent procedural skills and approval gates: <https://hermes-agent.nousresearch.com/docs/user-guide/features/skills>
- Hermes Agent's separate evaluation pipeline: <https://github.com/NousResearch/hermes-agent-self-evolution>
- Pi extension lifecycle and session APIs: installed Pi 0.80.6 `docs/extensions.md`, `docs/session-format.md`, and `docs/sdk.md`

The transferable pattern is an auditable loop:

```text
observe -> select -> review -> aggregate -> discuss -> approve -> change -> measure again
```

The background system gathers evidence. The user and active agent decide what to do with it.
