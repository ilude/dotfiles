# Technical Prose

Use these rules for comments, diagnostics, release notes, interface text, runbooks, and other prose that sits next to code or operational commands.

## Preserve Technical Meaning

- Keep exact identifiers, command names, paths, flags, field names, units, and domain terms.
- Use one term for one concept. Do not rotate synonyms when they could imply different objects or states.
- Expand an unfamiliar abbreviation at first use when the audience may not know it. Keep standard abbreviations and exact protocol terms unchanged.
- Distinguish cause, action, and result. Do not replace a precise relation with a smoother but less accurate sentence.
- Keep qualifiers, limits, and uncertainty that affect correctness.

## Write for the Reader's Action

- State the action before background when the reader is following a procedure.
- Use direct imperatives for instructions. Name the responsible component in descriptions of system behavior.
- Put conditions before or next to the action they control.
- In an error message, identify the failed operation, the relevant object, and the next safe action when the program knows them.
- Keep each sentence focused on one main action or claim. Split it when separate conditions or outcomes must be checked independently.

## Edit Without Mechanical Rules

Prefer familiar words, concrete verbs, and positive statements when they remain accurate. Passive voice, a long sentence, or a domain term is acceptable when it best preserves emphasis, sequence, or technical meaning. Do not claim compliance with a controlled-language standard unless the work actually uses and verifies that standard.
