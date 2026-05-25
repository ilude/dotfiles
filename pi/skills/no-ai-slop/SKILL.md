---
name: no-ai-slop
description: "Use when writing, editing, or reviewing prose to remove generic machine-style wording, filler, hype, vague claims, repetitive structure, uncited specifics, and detection tells."
---

# No Slop Writing

**Auto-activate when:** Writing, editing, or reviewing prose, documentation, reports, PRDs, plans, summaries, user-facing copy, or explanations where the output should sound concrete and human-written.

## Core Principle

Replace vague claims with specific, checkable facts. If a sentence cannot be verified, attributed, or tied to a concrete mechanism, rewrite it or remove it.

Good prose should answer at least one of these questions:

- Who did the thing?
- What changed?
- When did it happen?
- What number, version, file, law, command, component, or source proves it?
- What mechanism explains the difference?

## May 2026 Notes

Current sources point to the same durable pattern: detector tools and human reviewers flag surface regularity, but surface regularity is not proof of authorship. Treat these rules as editing guidance, not accusation logic.

- Wikipedia's March 2026 field guide warns that signs are descriptive, not proof. It highlights generic importance claims, legacy language, excessive boldface, broken markup, canned notability language, and formulaic transitions as common LLM-style patterns: <https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>
- Chicago Booth's detector review found commercial detectors performed better on medium and long samples but degraded on very short passages. It recommends policy caps and regular audits rather than blanket trust: <https://www.chicagobooth.edu/review/do-ai-detectors-work-well-enough-trust>
- UCLA's 2025 guidance stresses that detector outputs can create false accusations, especially for non-native English writers, and should not be the only evidence: <https://humtech.ucla.edu/technology/the-imperfection-of-ai-detection-tools/>
- The broader detector literature still points to repeated discourse markers, formulaic transitions, recurring rhetorical templates, unusually consistent grammar, and low variation in sentence structure as common signals: <https://en.wikipedia.org/wiki/Artificial_intelligence_content_detection>

Practical consequence: edit for specificity, provenance, varied rhythm, and source-grounded claims. Do not turn the checklist into a rigid ban list when the word appears in a quote, title, command, product name, or technical term.

## Practical Steps

### 1. Remove banned punctuation and filler

Do not use em dashes. Use a period, comma, semicolon, colon, parentheses, or split the sentence.

Cut phrases that add setup instead of meaning:

- In today's world
- In today's digital age
- In an era of
- In the ever-evolving landscape of
- In the realm of
- It is important to note
- It is worth noting that
- When it comes to
- Furthermore
- Moreover
- That being said
- With that in mind
- At its core
- To put it simply
- In essence
- In conclusion
- To sum up
- At the end of the day

Wrong:

```text
In today's world, repair restrictions are becoming increasingly important.
```

Right:

```text
The FTC voted 5-0 in July 2021 to increase enforcement against illegal repair restrictions.
```

### 2. Replace intensifiers with evidence

Intensifiers usually hide missing evidence. Replace the word with the measurement, example, source, or mechanism it was standing in for.

Flag these first:

- absolutely
- actually
- basically
- certainly
- clearly
- definitely
- essentially
- extremely
- fundamentally
- incredibly
- interestingly
- naturally
- obviously
- quite
- really
- significantly
- simply
- surely
- truly
- ultimately
- undoubtedly
- very

Wrong:

```text
The repair was significantly more expensive than the part.
```

Right:

```text
The shop quoted $1,200 for a repair that required a $5 chip.
```

### 3. Prefer plain verbs

Replace inflated verbs with direct verbs.

| Avoid | Use instead |
| --- | --- |
| delve into | examine, investigate, look at |
| leverage | use, apply, draw on |
| utilize | use |
| facilitate | help, enable, support |
| foster | encourage, support, develop |
| bolster | strengthen, support |
| underscore | show, highlight, stress |
| unveil | reveal, show, introduce |
| navigate | handle, manage, work through |
| streamline | simplify, make faster |
| enhance | improve, strengthen |
| endeavor | try, attempt |
| ascertain | find out, determine |
| elucidate | explain, clarify |

Wrong:

```text
This tool streamlines collaboration and unlocks productivity.
```

Right:

```text
This tool writes reviewer findings to `.specs/<name>/review-*/<reviewer>.md` so the coordinator can merge duplicate issues before implementation.
```

### 4. Replace inflated adjectives and metaphors

Cut or replace adjectives that add tone instead of detail.

| Avoid | Use instead |
| --- | --- |
| robust | reliable, thorough, solid |
| comprehensive | complete, thorough, full |
| pivotal | key, central, critical |
| crucial | important, required, blocking |
| vital | necessary, required |
| transformative | major, structural, visible |
| cutting-edge | new, recent, advanced |
| groundbreaking | new, original |
| innovative | new, original, unusual |
| seamless | smooth, easy |
| intricate | complex, detailed |
| nuanced | specific, subtle, conditional |
| multifaceted | complex, varied |
| holistic | complete, end-to-end |

Avoid metaphorical gravitas unless literal:

- tapestry
- symphony
- beacon
- realm
- testament
- watershed moment
- indelible mark
- stark reminder
- deeply rooted

### 5. End claims on concrete details

A sentence that asserts importance without a detail says nothing.

Wrong:

```text
This workflow provides a powerful improvement for developers.
```

Right:

```text
This workflow runs the markdown fence patch immediately after `pnpm add -g` installs Pi.
```

### 6. Write like a researcher, not a copywriter

If a sentence could appear on a marketing site without changing a word, anchor it to a source, number, event, file, command, or mechanism.

Wrong:

```text
People deserve better control over their devices.
```

Right:

```text
The FTC voted 5-0 in July 2021 to increase enforcement against illegal repair restrictions.
```

### 7. Avoid hedge overload

Do not hedge a claim into meaninglessness with `may potentially`, `can help to`, `might be able to`, or similar phrases. Say what happens, or say what is unknown.

Flag these hedge markers:

- may
- might
- could
- potentially
- probably
- generally
- usually
- arguably
- likely
- I think
- I believe
- it seems
- it appears
- remains to be seen
- further research is needed
- one could argue that
- it is widely acknowledged that

Use hedging only when the fact is pending, disputed, or not verified. More than three hedges in one paragraph usually means the claim is not ready.

Wrong:

```text
This change may potentially improve install reliability.
```

Right:

```text
This change reapplies the local Pi TUI patch after each successful Pi package update.
```

If evidence is incomplete, say that directly:

```text
I verified the script patches pi-tui 0.75.3 and 0.75.4. I did not test a fresh global install.
```

### 8. Use headings that name the content

Headings should describe the section, not tease it. A good heading reads like an entry in a technical manual index.

| Bad pattern | Bad example | Better heading |
| --- | --- | --- |
| The [concept] Trap | The Initialization Trap | Import vs. initialize metadata risk |
| The [adjective] [noun] | The Hidden Danger | Firmware corruption after sudden power loss |
| The [noun] [dramatic noun] | The Silent Killer | Gradual bad sector growth on aging platters |
| Why [action] [dramatic verb] [object] | Why Rebuilding Destroys Everything | Forced rebuilds overwrite parity on degraded arrays |
| [noun]: The [adjective] [noun] | Encryption: The Hidden Trap | Hardware AES-256 encryption on WD Passport bridge boards |

### 9. Vary structure when writing long prose

Repeated section shapes read like generated text. Avoid giving every section the same opening sentence, paragraph count, list length, and conclusion.

Watch for these structure tells:

- Every paragraph has the same sentence count.
- Every paragraph starts with a transition word.
- Three or more consecutive paragraphs start with the same phrase pattern.
- A 500-word block has no short sentences and no long sentences.
- The document follows a predictable `Background > Details > Impact > Response` template without a reason.
- Claims about importance, legacy, impact, or broader trends appear without evidence.
- Sources are clustered at paragraph ends instead of attached to the claims they support.
- Boldface appears on many ordinary concepts or product names.
- More than two contrasting parallelisms appear in 500 words: `It is not X, it is Y`; `The issue is not X. The issue is Y.`

Wrong pattern:

```text
In 2021, X happened. This affected Y. The company responded with Z.
In 2022, X happened. This affected Y. The company responded with Z.
In 2023, X happened. This affected Y. The company responded with Z.
```

Better pattern:

```text
Open one section with the timeline.
Open another with the stated justification.
Use a short section for thin evidence.
Use a list only where the list adds scanability.
```

### 10. Name the root-cause difference

When contrasting two things, state the exact part, version, date, mechanism, dependency, policy, or data path that makes them different.

Wrong:

```text
The new versions are unaffected.
```

Right:

```text
The new versions are unaffected because they no longer call `codeBlockBorder` for fenced-code delimiters.
```

If you do not know the difference, do not imply one exists.

### 11. Remove markup artifacts

These strings are evidence of unedited pasted output and should not appear in final prose:

- `oaicite`
- `contentReference`
- `grok_card`
- `attributableIndex`
- `turn0search0`

## Anti-Patterns

| Slop pattern | Replace with |
| --- | --- |
| Generic importance claim | A specific fact, number, file, command, or source |
| Intensifier | The measurement it was standing in for |
| Dramatic heading | A plain content label |
| Marketing verb | A direct verb |
| Repeated section template | Varied paragraph and sentence structure |
| Hedge stack | A clear claim or a clear unknown |
| Inferred attribution | The exact quote, action, vote, commit, or source |
| Citation cluster at paragraph end | Citations tied to the exact sentence they support |
| Excessive boldface | Plain text except where emphasis changes meaning |

Academic and formal prose needs the same cuts. Replace these:

| Avoid | Use instead |
| --- | --- |
| shed light on | clarify, explain, reveal |
| pave the way for | enable, allow |
| a myriad of | many, various |
| a plethora of | many, several |
| paramount | essential, required |
| pertaining to | about, regarding |
| prior to | before |
| subsequent to | after |
| in light of | because of, given |
| with respect to | about, for |
| in terms of | about, for |
| the fact that | that, or rewrite |

## False Positive Rules

Do not flag a word or phrase when it appears inside:

- Direct quotes from cited sources.
- Titles, names, package names, product names, or statute names.
- Code, configuration, logs, command output, or examples being discussed.
- Literal uses of metaphor words, such as `tapestry` for woven fabric or `beacon` for a signal light.
- Style-guide-required language, legal language, academic terminology, or accessibility wording that must stay precise.

Reduce severity when a flagged word sits next to a specific date, dollar amount, statute number, file path, command, version, or named source. Specifics often mean the sentence is technical rather than empty.

Never accuse a writer based on this checklist. Use it to improve prose. Short passages, non-native English writing, highly constrained templates, and heavily edited formal prose can all look detector-friendly while being human-written.

## Self-Check Before Returning Prose

1. Search for em dashes and remove every one.
2. Cut filler openers, transitions, and conclusion cliches.
3. Replace inflated verbs with plain verbs.
4. Replace inflated adjectives and intensifiers with numbers, examples, or narrower claims.
5. Check every number. If it is not real and attributable, remove it.
6. Check every paragraph for at least one concrete detail.
7. Check headings. Each should name the section content.
8. Check for repeated paragraph shapes, repeated openings, and transition-heavy structure.
9. Count hedges. More than three in a paragraph usually means the claim is not ready.
10. Check citations. They should support specific sentences, not sit in a vague cluster at the end.
11. Search for markup artifacts: `oaicite`, `contentReference`, `grok_card`, `attributableIndex`, `turn0search0`.
12. Read the answer aloud. Rewrite any phrase that would sound unnatural to a colleague.

## Quick Reference

Before:

```text
This comprehensive solution significantly improves the developer experience by streamlining the workflow.
```

After:

```text
The installer now runs `install.d/50-pi-markdown-code-fence-fix.py` immediately after Pi updates, so new `pi-tui` package versions are patched before the next Pi launch.
```

## Source

Adapted from `realrossmanngroup/no_ai_slop_writing_rules`, including the `no-ai-slop` skill and its writing-detection reference.
