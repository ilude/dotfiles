# Research Command

Conduct comprehensive research on any technical concept, adapting to your learning goals and expertise level.

## Parameters
- `<topic>`: The concept, technology, or pattern to research (e.g., "event sourcing", "CQRS", "consensus algorithms")
- `--academic`: Focus heavily on papers and formal research
- `--practical`: Focus on implementation and code examples
- `--compare`: Research multiple alternatives for comparison

## Process Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  PHASE 1        │     │  PHASE 2        │     │  PHASE 3        │
│  Detect Intent  │────▶│  Multi-Source   │────▶│  Synthesize     │
│  (sonnet)       │     │  Research       │     │  (opus)         │
│                 │     │  (parallel)     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
┌─────────────────┐     ┌─────────────────┐            │
│  PHASE 5        │     │  PHASE 4        │◀───────────┘
│  Present        │◀────│  Format Output  │
│  + Offer Save   │     │  (opus)         │
└─────────────────┘     └─────────────────┘
```

---

## PHASE 1: Detect Intent (sonnet)

**Goal:** Understand what the user needs and how to structure the research.

1. Parse the topic and extract domain terms
2. Ask 2-3 clarifying questions using AskUserQuestion:

### Question 1: Research Goal (Multi-Select)
**What's your goal with this research?** (Select all that apply)
- Understand the concept (theory + examples + mental models)
- Evaluate if it fits my use case (trade-offs + decision guidance)
- Implement it (patterns + code samples + pitfalls)
- Compare approaches (multiple strategies/tools for same problem)

**Note**: Set `multiSelect: true` when using AskUserQuestion for this question.

### Question 2: Familiarity Level
**What's your familiarity with this topic?**
- New to this (need fundamentals and context)
- Have basic understanding (skip basics, go deeper)
- Experienced (looking for advanced patterns/edge cases)

### Question 3: Output Format
**What format works best?**
- Narrative explanation (essay-style, flows like an article)
- Structured reference (sections, bullet points, scannable)
- Code-focused (minimal theory, lots of examples)

**Output:** Intent profile with search strategy.

**Example:**
```
Topic: "event sourcing patterns"
Goals: UNDERSTAND + IMPLEMENT (multi-select)
Familiarity: BASIC
Format: STRUCTURED

Search strategy:
- Academic: Event sourcing theory, CQRS papers (for UNDERSTAND)
- Practical: Implementation patterns, anti-patterns (for IMPLEMENT)
- Code: Python/Go examples, event store libraries (for IMPLEMENT)
- Community: Common pitfalls, production lessons (for IMPLEMENT)
- Theory: Mental models, analogies (for UNDERSTAND)
```

---

## PHASE 2: Multi-Source Research (sonnet, parallel)

**Goal:** Gather comprehensive information from diverse sources.

Launch parallel search agents for:

1. **Academic/Formal**: Papers, RFCs, specifications
   - Google Scholar, arXiv
   - RFC repositories
   - W3C, ISO standards

2. **Technical Articles**: In-depth explanations
   - Martin Fowler, Thoughtworks
   - Technical blogs (e.g., High Scalability)
   - Architecture documentation

3. **Reference Implementations**: Real code
   - GitHub, GitLab repositories
   - Official SDK examples
   - Open-source projects using the pattern

4. **Community Wisdom**: Practical experience
   - Stack Overflow (common questions)
   - Reddit, Hacker News (discussions)
   - Conference talks, blog postmortems

For each promising result, fetch and extract:
- Core concepts and principles
- Practical applications
- Trade-offs and considerations
- Code samples (if relevant)
- Common pitfalls
- Related concepts

**Output:** Categorized research findings with sources.

---

## PHASE 3: Synthesize Findings (opus)

**Goal:** Organize research into a cohesive narrative matching user's intent.

### Handling Multiple Goals

When multiple goals are selected, combine sections in a logical flow:
- **UNDERSTAND + EVALUATE**: Theory first, then trade-offs
- **UNDERSTAND + IMPLEMENT**: Theory, then practical patterns
- **EVALUATE + IMPLEMENT**: Decision guidance, then implementation details
- **All three**: Comprehensive guide (theory → evaluation → implementation)

Ensure transitions between sections are smooth and avoid redundancy.

### Organization by Goal

#### For UNDERSTAND goal:
1. Start with fundamentals and context
2. Build mental models with analogies
3. Show concrete examples
4. Connect to related concepts
5. Address common misconceptions

#### For EVALUATE goal:
1. Define the problem space
2. Present the solution approach
3. List trade-offs and constraints
4. Compare alternatives
5. Provide decision criteria and use cases

#### For IMPLEMENT goal:
1. Quick concept overview
2. Implementation patterns (2-3 approaches)
3. Step-by-step guidance
4. Code samples in relevant languages
5. Common pitfalls and anti-patterns
6. Testing/validation strategies

#### For COMPARE goal:
1. Define comparison dimensions
2. Matrix of features/trade-offs
3. Use case recommendations
4. Migration considerations (if applicable)

### Cross-Referencing
- Verify claims across multiple sources
- Note disagreements or debates
- Highlight consensus best practices
- Tag speculation vs. proven patterns

**Output:** Structured outline with integrated sources.

---

## PHASE 4: Format Output (opus)

**Goal:** Create polished output matching requested format.

**CRITICAL**: Every research output MUST include a comprehensive Sources section at the end with all URLs and references used during research. Organize by category (Academic, Practical, Tools, etc.) with clickable markdown links `[Title](URL)`.

### Narrative Format
```markdown
# <Topic>: A Deep Dive

[Opening hook and context]

## The Fundamentals

[Core concepts built progressively]

## How It Works

[Detailed explanation with diagrams]

## In Practice

[Real-world applications and examples]

## When to Use (and When Not To)

[Decision guidance]

## Going Deeper

[Advanced topics and further reading]
```

### Structured Format
```markdown
# Research: <Topic>

## Quick Summary
- What: [1 sentence]
- Why: [1 sentence]
- When: [1 sentence]

## Core Concepts
[Organized sections with examples]

## Practical Applications
- Use case 1: [description]
- Use case 2: [description]

## Trade-offs
| Pros | Cons |
|------|------|
| ... | ... |

## Implementation Guide
[Step-by-step if relevant]

## Common Pitfalls
1. [Pitfall + how to avoid]

## Sources

### Academic
- [Paper Title](https://arxiv.org/...) - Key insight about X
- [Research Paper](https://example.org/...) - Validates Y approach

### Practical
- [Blog Post](https://example.com/...) - Implementation guide
- [GitHub Repo](https://github.com/...) - Reference implementation

### Tools & Frameworks
- [Documentation](https://docs.example.com/...) - Official reference

## Follow-up Questions
[3-5 deeper topics to explore]
```

### Code-Focused Format
```markdown
# <Topic>: Implementation Guide

## Quick Concept
[2-3 sentence overview]

## Basic Implementation

### Approach 1: [Name]
```language
[code sample]
```
**Pros:** ...
**Cons:** ...

### Approach 2: [Name]
[Same structure]

## Anti-Patterns
```language
// ❌ Don't do this
[bad code]

// ✅ Do this instead
[good code]
```

## Testing
[Test examples]

## Production Considerations
[Performance, scaling, monitoring]

## Sources

### Documentation
- [Official Docs](https://docs.example.com/...) - Reference material

### Code Examples
- [GitHub Repo](https://github.com/...) - Reference implementation
- [Tutorial](https://example.com/...) - Step-by-step guide

### Community
- [Stack Overflow](https://stackoverflow.com/...) - Common issues
- [Discussion Forum](https://example.com/...) - Best practices
```

### Adaptation Rules
- **Familiarity: NEW** → Include glossary, more examples, gentler pacing
- **Familiarity: BASIC** → Skip basics, focus on depth and nuance
- **Familiarity: EXPERIENCED** → Advanced patterns, edge cases, performance optimization
- **Multiple Goals**: Blend sections logically (e.g., UNDERSTAND + IMPLEMENT = theory → patterns → code)

### Template Selection for Multiple Goals
- If **UNDERSTAND** is selected: Always include fundamentals section
- If **EVALUATE** is selected: Always include trade-offs section
- If **IMPLEMENT** is selected: Always include code samples section
- If **COMPARE** is selected: Use matrix/table format for comparisons
- Combine sections in logical order: Theory → Trade-offs → Implementation

**Output:** Complete formatted research document.

---

## PHASE 5: Present + Offer Save

**Goal:** Deliver findings and optionally persist them.

1. Display the complete research in terminal
2. Ask: **Save to file?**
   - **Yes** → Save to `~/.claude/research/<topic-slug>.md`
   - **No** → Already displayed, user can copy if needed
   - **Custom path** → User specifies location

**No automatic git operations, timestamps, or versioning** - user manages that if desired.

---

## Sub-Agent Configuration

| Phase | Agent | Model | Why |
|-------|-------|-------|-----|
| 1. Detect Intent | Main | sonnet | Fast question asking |
| 2. Research | Task (parallel) | sonnet | Multiple quick searches |
| 2b. Fetch | WebFetch | - | Get content details |
| 3. Synthesize | Task | opus | Complex reasoning |
| 4. Format | Task | opus | Writing quality |
| 5. Present | Main | - | User interaction |

---

## Example Invocation

```
/research "consensus algorithms"

Phase 1: Understanding your needs...
  [Shows 3 questions via AskUserQuestion]

  Answers:
  - Goals: UNDERSTAND + EVALUATE (multi-select: learn the concepts AND choose between options)
  - Familiarity: BASIC (know what consensus means, not the algorithms)
  - Format: STRUCTURED (want scannable comparison)

Phase 2: Researching...
  [Agent 1] Academic: Found Raft paper, Paxos paper, Byzantine generals
  [Agent 2] Technical: Found distributed systems articles
  [Agent 3] GitHub: Analyzing etcd, Consul, ZooKeeper
  [Agent 4] Community: Found Stack Overflow comparisons

Phase 3: Synthesizing...
  Creating comparison framework across 4 algorithms
  Organizing by: correctness guarantees, performance, operational complexity

Phase 4: Formatting...
  Created structured comparison with:
  - Quick summary of each algorithm
  - Trade-off matrix
  - Use case recommendations
  - Implementation references

[Displays research...]

Save to file?
  1. Yes → ~/.claude/research/consensus-algorithms.md
  2. Custom path
  3. No
```

---

## Edge Cases

1. **Ambiguous topic**: Ask clarifying question before Phase 2
   - "event sourcing" → CQRS pattern? Event store technology? Messaging?

2. **Too broad**: Suggest narrowing scope
   - "microservices" → "microservice communication patterns"?

3. **Very niche topic**: Warn if little research found, proceed with available sources

4. **Topic has subtopics**: Offer to research main topic first, then suggest follow-ups
   - "event sourcing" → Could also research: "event store technology", "CQRS patterns", "saga patterns"

5. **Conflicting sources**: Present both views, note the debate
   - "Some sources recommend X because Y, others recommend Z because W"

6. **Implementation language preference**: If user wants code, ask which language(s)
   - Only ask if IMPLEMENT is selected and format is CODE-FOCUSED

7. **Multiple goals with conflicting needs**: Balance depth vs breadth
   - UNDERSTAND + IMPLEMENT → Focus on theory needed for implementation
   - All four goals → Create comprehensive guide, may be longer
   - Warn user if output will be extensive

---

## Success Criteria

- Asks focused clarifying questions that adapt the research
- Finds diverse, credible sources (academic + practical + code)
- Synthesizes findings into coherent narrative
- Adapts depth and format to user's expertise
- Provides actionable insights (not just theory)
- Offers relevant follow-up research directions
- Respects user's time (concise for basics, detailed for advanced)

---

## Notes

- This command is **model-intensive** (uses Opus for synthesis/formatting)
- Parallel research agents keep Phase 2 fast despite breadth
- Phase 1 questions prevent wasted research effort
- Format flexibility ensures output matches how user thinks
- No auto-save keeps it simple and predictable
