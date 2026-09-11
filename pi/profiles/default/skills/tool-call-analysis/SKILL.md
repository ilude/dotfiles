---
name: tool-call-analysis
description: Classify and analyze tool-call and subagent failures without confusing legitimate command, test, HTTP, or application outcomes with failures of the tool mechanism. Use for session reviews, failure counts, recurring-error analysis, and diagnosis of tool or subagent reliability.
---

# Tool-call analysis

This skill owns a durable history of tool-call reviews and operator corrections. It is on demand, not automatic monitoring.

## Persistent workflow

1. Before every tool-call or subagent-failure review, read [the analysis log](references/analysis-log.md) and [the classification feedback log](references/classification-feedback.md) completely.
2. Define the profiles and exact `[since, until)` interval before retrieval. Review every selected session when exhaustive coverage is requested.
3. Classify observed events using this skill and all non-superseded operator feedback. Separate verified facts from suspected causes.
4. Append an analysis-log entry after each review. Record:
   - review ID and date;
   - profiles and exact interval;
   - selected sessions and records or bytes when known;
   - retrieval methods, completion state, exclusions, malformed input, and other coverage limits;
   - normalized findings with occurrence and distinct-session counts;
   - isolated incidents kept out of recurring findings;
   - report or artifact paths;
   - remediation and unresolved status.
5. Append operator corrections about definitions, counting, presentation, or scope to the classification feedback log. Link the review or incident that prompted them and mark superseded interpretations explicitly.
6. When operator feedback changes this executable taxonomy or workflow, update `SKILL.md` only when the operator directs or approves the change. Keep detailed history in the logs rather than expanding the executable instructions with examples already covered by a rule.
7. Do not create telemetry, background indexing, approval gates, operational limits, or automatic reviews. Existing session records remain authoritative.

Classify the observed event before counting or diagnosing it. A red result, nonzero exit code, HTTP error status, failed test, or unsuccessful requested operation is not by itself a tool-call failure.

## Categories

### Tool mechanism failure

The tool failed to carry out its own contract. Examples:

- the tool crashed, hung, or returned an internal exception;
- a valid call was rejected because of a tool adapter, renderer, transport, or lifecycle defect;
- the call has no corresponding result because recording or cancellation reconciliation failed;
- the tool reports success despite not performing the represented operation;
- malformed tool output prevents the caller from determining what happened.

### Tool-use failure

The tool operated correctly, but the caller misunderstood its interface or the invoked program. Examples:

- invalid or missing tool arguments;
- wrong CLI flags, shell syntax, quoting, working directory, or executable;
- treating several paths as one path;
- using a regex where a literal was intended;
- choosing a tool that cannot perform the requested operation.

This is a real workflow failure and may be diagnosable, but it is not a defect in the tool implementation.

### Command or application outcome

The tool correctly executed the request and faithfully returned the result. Examples:

- Bash returns the program's actual nonzero exit code;
- a test runner reports failing tests;
- `grep` finds no match when that is a meaningful result;
- an HTTP client returns the server's actual 4xx or 5xx response;
- Git rejects a conflicting operation;
- a deliberately written probe uses a nonzero exit code to signal an observed condition.

Do not count this as a tool-call failure. Diagnose the command, test, service, repository, or application instead. A status such as HTTP 500 can prove that the target system failed while simultaneously proving that the HTTP tool worked correctly.

### Interpretation failure

The tool returned accurate evidence, but the agent described it incorrectly. Examples:

- calling a 500 response a successful service check;
- claiming tests passed after a nonzero test result;
- treating an intentionally expected nonzero probe as an execution failure;
- treating a successful transport check as successful deployment.

This is an agent reasoning or reporting failure, not a tool-call failure.

## Subagents

Apply the same separation:

- A subagent mechanism failure is a dispatch, model-resolution, transport, lifecycle, result-delivery, or settlement defect.
- A subagent-use failure is a bad assignment, unsupported role/model selection, missing required authority, or unsuitable working directory chosen by the caller.
- A child finding broken code, failing tests, or an external blocker is not a subagent failure.
- A weak or incorrect child answer is an output-quality failure unless transport or lifecycle corrupted or lost the answer.
- A child waiting for its parent, handing off a result, or reporting blocked work is not a failure when that matches the protocol.

## Analysis procedure

1. Recover the call, its arguments, the corresponding result, surrounding intent, and any later retry or interpretation.
2. State separately:
   - whether the tool mechanism honored its contract;
   - whether the caller used the tool or invoked program correctly;
   - what the command or target system reported;
   - whether the agent interpreted that evidence correctly.
3. Count only like categories together. Do not aggregate every `isError`, nonzero exit, failed test, HTTP error, denial, cancellation, and application failure as "tool failures."
4. Normalize by demonstrated mechanism, not superficial wording. Two nonzero exits from unrelated programs are not one recurring issue.
5. Call an issue recurring only when the same mechanism or caller misunderstanding appears in at least two independent sessions. Repetition within one session may establish a loop or high-impact incident, but not cross-session recurrence.
6. Report recovered failures separately. Recovery does not erase an observed tool-use or mechanism failure, but it does establish eventual task outcome.
7. Treat isolated events as isolated. Do not propose system-wide workflow or runtime controls from one occurrence unless its impact alone justifies the change and that reasoning is explicit.

## Reporting

For each claimed recurring issue, provide:

- category;
- normalized failure mechanism;
- number of occurrences and distinct sessions;
- representative session coordinates;
- observed facts;
- suspected cause, clearly labeled;
- whether it recovered;
- current remediation status.

If reliable counts or cross-session recurrence were not established, say so and do not promote the event as a recurring issue.
