---
name: no-ai-slop
description: "Prose cleanup for filler, hype, vague claims, repetition, detection tells, or uncited specifics. Not for Markdown architecture or archival work."
---

# No-Slop Writing

## Boundary

Use this skill for wording quality and `docs` for document structure. Archival work is outside this skill. `pi/AGENTS.md` owns implementation strategy.

## Core Principle

Keep only language that is specific, supported, and useful. Prefer plain words and direct statements, but preserve the author's meaning, voice, terminology, and level of certainty.

## Practical Steps

- Cut throat-clearing, repeated conclusions, and any word that can be removed without losing meaning.
- Prefer a familiar, precise word to jargon, stock phrases, stale metaphors, or inflated wording.
- Use concrete verbs instead of abstract noun phrases.
- Name the actor when responsibility matters. Use passive voice when the actor is unknown or the action or recipient deserves emphasis.
- Replace hype and unsupported superlatives with evidence, or delete the claim.
- Vary sentence shape and length around the content rather than imposing a mechanical style.
- Keep citations and qualifiers that prevent overclaiming. If a claim needs missing support, mark it or remove it.
- Break a style preference rather than distort meaning, voice, or audience expectations.

## Detection-Tell Pass

Before finalizing prose:

- Rewrite negated contrasts such as "it is not X, it is Y," "not just X," and "does not merely X." State Y directly unless rejecting X is necessary.
- Remove reader choreography such as "imagine this," "sit with that," "read that again," "let's unpack this," and "bring it full circle."
- Lead with the fact instead of withholding it behind "one problem," "what happened next," or similar reveal language.
- Do not invent scenes, representative people, motives, emotions, or causal explanations. Cite them, mark them as hypothetical, qualify them, or delete them.
- Replace ceremonial concessions such as "to be fair" with the actual counterevidence, uncertainty, or tradeoff.
- Use literal language instead of stacking metaphors.
- Keep one conclusion. Every later paragraph must add evidence, qualification, consequence, or action.
- Use sentence fragments, parallel triples, and rhetorical questions only when they improve meaning. Do not add them for cadence.
- Connect every statistic to the claim it supports, including its timeframe, denominator, and relevant comparison.
- Do not generalize from one or two examples without stating the limits of the evidence.

## Conditional Reference

For comments, messages, release notes, procedures, or other code-adjacent technical prose, read [Technical prose](references/technical-prose.md). Do not load it for general prose cleanup.

## Anti-Patterns

| Anti-pattern | Fix |
| --- | --- |
| "Comprehensive, robust, seamless" | Name the actual capability |
| Vague benefit claims | Add evidence or delete |
| Repeated intro/body/conclusion rhythm | Organize around the content |
| Automatic active-voice or sentence-length rewrites | Change only what improves meaning for this audience |
| Overconfident certainty | Match the evidence |
| "It is not X, it is Y" | State Y directly |
| Reader commands and reveal framing | Delete the framing and state the fact |
| Invented motives or scenes | Cite, qualify, mark hypothetical, or delete |
| Ceremonial concession | State the real counterevidence or uncertainty |
| Multiple metaphors for one claim | Use the literal relationship |
| Repeated conclusion | Keep the strongest version once |
| Decorative statistic | Explain its relevance or remove it |
