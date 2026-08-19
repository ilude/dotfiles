---
name: skills-engineer
description: "SKILL.md, skill frontmatter/descriptions, activation triggers, agent definitions, or command/agent instructions. Not for Pi slash-command placement; use pi-command."
---

# Skills Engineering

## Boundary

| Work | Use |
| --- | --- |
| Skill content, descriptions, activation triggers, agent definitions | `skills-engineer` |
| Pi slash commands, prompt templates, command placement | `pi-command` |
| General documentation prose | `docs` |

## Core Principle: Progressive Disclosure

Startup context reads skill metadata first. Treat descriptions and other always-loaded guidance as context pointers: name the material and the distinct conditions for reading it. Put the leading trigger first, collapse synonyms, and keep the pointer tight because every word costs context on every turn.

Keep the body concise. Inline what every path needs; put branch-specific or bulky detail in a clearly named file and point to it where the branch starts.

## Information Hierarchy

Use this order:

1. **In-file steps** - ordered actions the agent performs.
2. **In-file reference** - rules and facts consulted while doing them.
3. **Disclosed reference** - branch-specific detail in a linked file, reached when its pointer condition is met.

When a skill has steps, keep them easy to find rather than burying them in reference. Keep a concept's rules and caveats together, and do not disclose material that every branch needs.

Every step ends with an observable completion criterion: the artifact, state, or check that proves it is done. Make the criterion clear and exhaustive, not an intent such as "understand" or "review." Sharpen the criterion before splitting the document to address premature completion.

## Source of Truth and Pruning

Treat the environment as authoritative: inspect package scripts, configuration, directory layout, and `--help` output instead of restating facts that can be looked up there. Document conventions, rationale, and gotchas the environment cannot show. Keep each meaning in one authoritative location.

Test instructions behaviorally. If removing a sentence does not change the observed actions or result on a representative task, it is a no-op; delete it rather than rewording it. When uncertain, compare runs with and without the instruction and check behavior, not whether the words are present.

## Frontmatter Rules

```yaml
---
name: skill-name
description: "Specific trigger scope. Use when ... Not for ..."
---
```

- `name` matches the directory and uses kebab-case.
- `description` names concrete triggers and excludes neighboring skills.
- Avoid broad words like "development", "review", or "docs" without qualifiers.

## Skill Body Rules

1. Start with `# Title`.
2. Put boundary guidance before detailed process.
3. Prefer checklists and tables over long prose.
4. Maintain prompts subtractively: remove or consolidate redundant and conflicting rules before adding instructions; prefer one governing principle to exception lists.
5. For Pi resources, keep skill-, command-, and tool-specific guidance in the owning skill, prompt, or extension rather than `pi/AGENTS.md`; reserve AGENTS for repository-wide rules that apply regardless of loaded resources.
6. Include anti-patterns that prevent common routing mistakes.
7. Keep examples minimal; reference files for long examples.

## Activation Design

Good triggers are exact: file patterns, command names, artifact names, and user phrases. Add "Not for" boundaries when two skills overlap.

## Anti-Patterns

- Description lists every related keyword and activates everywhere.
- Skill or prompt body duplicates generic advice, restates environment truth, or accumulates rules instead of clarifying the governing principle.
- Steps have vague completion criteria or reference material is disclosed without a clear pointer.
- Multiple skills claim the same primary trigger.
- Claude/OpenCode-specific assumptions in a Pi skill without boundary notes.
