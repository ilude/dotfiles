# Requirements Language

Use this reference for normative requirements and acceptance criteria. Keep narrative context natural.

## Build One Verifiable Obligation

A requirement should contain one independently verifiable obligation. Include these elements when they affect meaning:

- Identifier: a stable label used by later plans, tests, and decisions.
- Responsible entity: the system, component, operator, or other actor that must produce the result.
- Condition: the event, state, option, or failure condition under which the obligation applies.
- Outcome: externally observable behavior or a defined state change.
- Measure: a quantity, threshold, tolerance, duration, capacity, or other bound.
- Verification: the inspection, test, demonstration, or analysis and its pass condition.

Split requirements joined by multiple independent `and` clauses. Keep exceptions with the obligation they limit. Define a term once and use it consistently.

## Sentence Patterns

Use a pattern only when it makes the condition and obligation clearer:

```text
The <entity> shall <observable outcome>.
When <event>, the <entity> shall <observable outcome>.
While <state>, the <entity> shall <observable outcome>.
Where <option applies>, the <entity> shall <observable outcome>.
If <unwanted condition>, the <entity> shall <observable response>.
```

These are drafting aids, not mandatory syntax. Combine condition types only when the combined sentence remains singular and unambiguous.

## Normative Words

- Use `shall` for an artifact-defined obligation when that is the artifact's convention.
- Preserve `must` for an external constraint or when the source deliberately uses it as binding language.
- Use `should` only for a recommendation whose exception is allowed.
- Use `may` only for permission or a genuinely optional behavior.

Do not change one modal to another for style. Replace vague modifiers such as `fast`, `normal`, `user-friendly`, or `as needed` with a defined measure or condition when the distinction affects acceptance.

## Verification

Name the cheapest method that can directly establish the requirement:

- Inspection for static content, configuration, or visible structure.
- Test for behavior under controlled inputs with observable outputs.
- Demonstration for an end-to-end user or operator workflow.
- Analysis for a property established from measurements or other verified evidence.

State what evidence passes and, when useful, what result fails. Do not use an implementation detail as the only check for a user-visible outcome.
