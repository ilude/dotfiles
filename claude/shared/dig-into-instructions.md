# Dig Into — Background Research Command

Non-blocking research command that launches a background coordinator agent to deeply investigate a topic. Returns control to the user immediately while research runs in parallel.

## Parameters

```
/dig-into <topic> [--file <path>] [--stub <name>] [--academic] [--practical] [--compare]
```

- `<topic>` (required): The concept, technology, or pattern to research
- `--file <path>`: Write output to an existing file (coordinator reads it to determine best placement)
- `--stub <name>`: Override the auto-generated `.specs/` subdirectory name
- `--academic`: Weight toward papers, RFCs, and formal research
- `--practical`: Weight toward implementation and code examples
- `--compare`: Research multiple alternatives for comparison

## Architecture

```
User runs /dig-into "event sourcing"
         │
         ▼
    Main agent parses args, determines output path
         │
         ▼
    Launch SINGLE background coordinator agent (general-purpose, run_in_background: true)
         │
         ├── Coordinator evaluates scope
         ├── Spawns 4 parallel research sub-agents (Task tool)
         ├── Collects results
         ├── Synthesizes findings
         ├── Writes output file
         └── Reports completion
```

The main agent returns control to the user immediately after launching the coordinator.

---

## Step 1: Main Agent — Parse and Launch

**You (the main agent) do this directly. Do NOT delegate this step.**

### 1a. Determine output path

Priority order:
1. If `--file <path>` provided → use that exact path (coordinator will read the file to determine insertion point)
2. If `--stub <name>` provided → `.specs/<name>/research-<datetime>.md`
3. Otherwise → auto-slugify the topic:
   - Lowercase, replace spaces/special chars with hyphens, trim to 50 chars
   - Example: "event sourcing patterns" → `event-sourcing-patterns`
   - Output: `.specs/<slug>/research-<YYYYMMDD-HHmmss>.md`

Create the `.specs/<stub>/` directory if it doesn't exist.

### 1b. Build the coordinator prompt

Construct a detailed prompt for the coordinator agent containing:
- The research topic (exact user input)
- Any flags (--academic, --practical, --compare)
- The output path (absolute)
- Whether it's a new file or existing file
- If existing file: instruct coordinator to read it first and determine best insertion point

### 1c. Launch the coordinator

```
Task tool:
  subagent_type: general-purpose
  run_in_background: true
  model: sonnet  (coordinator itself is Sonnet; it spawns Opus for synthesis)
  prompt: <the constructed prompt>
```

### 1d. Report to user

Tell the user:
- Research is running in the background
- Where the output will be written
- They can check progress with `Read` on the output file or check the background task

---

## Step 2: Coordinator Agent — Evaluate and Dispatch

The coordinator is a background `general-purpose` agent. It orchestrates the full research pipeline.

### 2a. Evaluate the request

- Parse the topic for domain terms and subtopics
- Determine research strategy based on flags:
  - `--academic` → heavier weight on Phase A agent, lighter on community
  - `--practical` → heavier weight on code/community agents
  - `--compare` → all agents look for alternatives and trade-offs
  - No flags → balanced across all four research tracks
- If the topic is ambiguous or too broad, the coordinator should narrow it to a reasonable scope and note what was excluded

### 2b. Launch parallel research agents

Spawn **4 parallel Task agents** using the Task tool. Each is a focused researcher:

#### Agent A: Academic/Formal (model: sonnet)
Search for papers, RFCs, specifications, and formal definitions.
- Google Scholar, arXiv, academic repositories
- RFC repositories, W3C/ISO standards
- Foundational papers and seminal works
- Extract: core theory, formal properties, proofs, historical context

#### Agent B: Technical Articles (model: sonnet)
Search for in-depth technical explanations and architecture docs.
- Martin Fowler, Thoughtworks, technical blogs
- High Scalability, architecture documentation
- Conference talks and presentations
- Extract: mental models, explanations, diagrams, design patterns

#### Agent C: Reference Implementations (model: haiku)
Search for real code and working examples.
- GitHub repositories, official SDK examples
- Open-source projects using the pattern/technology
- Documentation with code samples
- Extract: code patterns, library choices, API examples, project structures

#### Agent D: Community Wisdom (model: haiku)
Search for practical experience and lessons learned.
- Stack Overflow common questions and answers
- Reddit, Hacker News discussions
- Blog postmortems and production war stories
- Extract: common pitfalls, production lessons, gotchas, recommendations

**Each research agent must return:**
- 3-8 key findings, **each with its source URL** (no URL = finding gets discarded)
- Core concepts discovered
- Trade-offs and considerations
- Code samples (if found and relevant)
- Common pitfalls
- Related concepts worth exploring

**CITATION RULE**: Every factual claim, code pattern, recommendation, and insight MUST trace back to a specific source URL. If a research agent cannot provide a URL for a finding, that finding is excluded from the final output. "Cite your sources" is not optional — it is the foundational integrity requirement of this command.

### 2c. Collect and cross-reference

After all 4 agents complete:
- Gather all findings into a unified dataset
- Cross-reference claims across sources (if 3+ sources agree, it's consensus)
- Note disagreements or active debates
- Identify gaps (topics mentioned but not well-covered)
- Tag speculation vs. proven patterns

### 2d. Synthesize (coordinator does this itself)

Organize the cross-referenced findings into a coherent research document. The coordinator (Sonnet) handles synthesis directly — it has all the context from the sub-agents.

**Organization structure:**

For general research (no flags or mixed):
1. Overview and context
2. Core concepts and fundamentals
3. How it works (detailed explanation)
4. Trade-offs and considerations
5. Practical implementation guidance
6. Common pitfalls and anti-patterns
7. Related concepts and further reading

For `--academic`:
1. Historical context and motivation
2. Formal definitions and properties
3. Theoretical foundations
4. Key papers and contributions
5. Current state of research
6. Open problems and active debates
7. Practical implications

For `--practical`:
1. Quick concept overview
2. Implementation patterns (2-3 approaches)
3. Code samples and examples
4. Step-by-step guidance
5. Anti-patterns to avoid
6. Testing and validation strategies
7. Production considerations

For `--compare`:
1. Problem space definition
2. Candidates overview
3. Feature/trade-off comparison matrix
4. Use case recommendations
5. Migration considerations
6. Decision framework

**Cross-referencing rules (preserve from original /research):**
- Verify claims across multiple sources
- Note disagreements or debates explicitly
- Highlight consensus best practices
- Tag speculation vs. proven patterns
- Never present single-source claims as universal truth

**Inline citation style:** Use markdown reference links in the body text to connect claims to their sources. Example: "Event sourcing provides a complete audit trail by persisting every state change as an immutable event [[Fowler]](https://martinfowler.com/eaaDev/EventSourcing.html)." Every section of the output should have at least one inline citation linking back to the Sources list.

### 2e. Write the output

**New file:** Write the full research document with this structure:

```markdown
# Research: <Topic>
<!-- Generated by /dig-into on <datetime> -->

## Quick Summary
- **What**: [1 sentence]
- **Why it matters**: [1 sentence]
- **Key insight**: [1 sentence]

[... organized sections per 2d ...]

## Sources

### Academic
- [Paper Title](URL) — Key insight about X

### Technical Articles
- [Article Title](URL) — Explains Y approach

### Code & Implementations
- [Repo/Doc](URL) — Reference implementation of Z

### Community
- [Discussion](URL) — Production experience with W

## Follow-up Questions
- [3-5 deeper topics worth investigating]
```

**Existing file (--file):** Read the file first. Determine the best insertion point:
- Look for an existing `## Research` or `## References` section → insert/append there
- Look for a `## Open Questions` section → insert research before it (answers inform questions)
- Look for a `## Background` or `## Context` section → append research after it
- If no clear fit → append a new `## Research: <Topic>` section at the end
- Always add a brief note at the insertion point: `<!-- Research added by /dig-into on <datetime> -->`
- Preserve all existing content — never delete or reorganize the user's file

**CRITICAL — CITE YOUR SOURCES**: Every research output MUST include a comprehensive Sources section with ALL URLs and references used. Every factual claim in the body of the document must have a corresponding entry in Sources. Organize by category with clickable markdown links `[Title](URL)`. A research document without thorough source citations is a failed research document — this is the single most important quality criterion.

---

## Edge Cases

1. **Ambiguous topic**: Coordinator narrows scope, notes exclusions in the output
2. **Too broad**: Coordinator picks the most relevant subtopic, lists others as follow-ups
3. **Very niche**: Warn in output if few sources found, proceed with what's available
4. **Conflicting sources**: Present both views, note the debate explicitly
5. **Existing file is large**: Read only structure (headings) to determine placement, don't try to comprehend all content
6. **Output directory doesn't exist**: Main agent creates it before launching coordinator
7. **Research agents find nothing useful**: Coordinator notes the gap, proceeds with available sources, suggests alternative search terms

## Success Criteria

- User gets control back immediately (background execution)
- Research covers diverse, credible sources (academic + practical + code + community)
- Cross-references claims across sources — consensus and debates are explicit
- Output is well-organized with clear sections
- Every claim has a source citation
- Existing files are modified respectfully (content preserved, logical insertion point)
- Follow-up questions suggest genuinely useful next investigations
