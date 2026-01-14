# Research Vault Design - Discussion Context

**Date**: 2026-01-14
**Participants**: User, Claude (Sonnet 4.5)
**Topic**: Structuring research/ directory as Obsidian-style vault with tooling

---

## Problem Statement

Current research structure is flat and doesn't scale:
- `research/self-improving-skills.md` - Single comprehensive file (463 lines)
- `claude/ideas/context-maintenance/PLAN.md` - Related implementation plan (1,320 lines) in different location
- No discovery mechanism beyond manual grep
- No link tracking or relationship awareness
- Claude must search/grep every document to find relevant information

**User quote**: "I would like to consolidate this under research/ though and provide you with a guide for more structure under research going forward."

**User insight**: "I'm thinking that research/ directory ends up like an obsidian vault over time"

---

## Solution: Research Vault Architecture

### Key Design Decisions

#### 1. Treat research/ Like an Obsidian Vault

**Structure:**
- Topic-based folders (e.g., `self-improving-systems/`)
- Wikilinks for cross-references: `[[note-id]]` or `[[note-id|display text]]`
- YAML frontmatter for structured metadata
- Templates for consistency
- Hidden directories: `_tools/`, `_templates/`, `.research/`

**Rationale:**
- Related notes stay together
- Easy to navigate by topic
- Scales to 100+ notes
- Supports both human browsing and tool indexing

#### 2. Build Tooling for Discovery

**Index-based (not grep-based):**
- SQLite database for metadata and relationships
- Parses YAML frontmatter, wikilinks, tags
- Sub-second queries vs multi-second grep
- Enables advanced queries (backlinks, orphans, tag intersections)

**Core tools:**
- `indexer.py` - Parse notes → build SQLite index
- `search.py` - Query index (keyword, tag, backlinks)
- `validator.py` - Check links, find orphans, validate metadata

**Rationale:**
- Claude can use structured queries instead of manual file reading
- Fast enough for interactive use
- Foundation for future enhancements (embeddings, MCP, graph viz)

#### 3. Design for Future Growth (But Start Simple)

**MVP Scope (Phase 1):**
- Basic structure with topic folders
- YAML frontmatter on all notes
- SQLite indexer
- CLI search and validation tools

**Future Enhancements (Explicitly Excluded from MVP):**
- Phase 2: Vector embeddings (ChromaDB) for semantic search
- Phase 3: MCP server for Claude integration
- Phase 4: Graph visualization (Plotly/PyVis)
- Phase 5: Auto-tagging, auto-linking, watch mode

**User guidance**: "Do not gold plate things... this is an mvp."

---

## Why This Structure Supports Tooling

### YAML Frontmatter = Machine-Readable Metadata

**Format:**
```yaml
---
id: unique-note-id
title: Human Readable Title
created: 2026-01-14
updated: 2026-01-14
status: active
tags: [tag1, tag2, tag3]
related:
  - other-note-id
  - another-note-id
aliases: [alternative-name, nickname]
---
```

**Benefits:**
- Parse metadata without reading full file content
- Build index of relationships before content analysis
- Query by tag, status, date range
- Auto-suggest related notes based on explicit relationships
- Stable IDs even if titles change

**Required fields:**
- `id` - Unique identifier for wikilinks
- `title` - Human-readable name
- `created` / `updated` - Track freshness

**Optional but recommended:**
- `status` - draft | active | archived (filter in queries)
- `tags` - Multi-dimensional categorization
- `related` - Explicit relationships
- `aliases` - Alternative names for flexible linking

### SQLite Index = Fast Queries

**Instead of:**
```bash
# Slow: Reads every file, no structure
grep -r "autoskill" research/
grep -r "hooks" research/
# Must read both files, parse manually
```

**With index:**
```sql
-- <1ms query
SELECT * FROM notes WHERE title LIKE '%autoskill%';

-- Find by tag
SELECT * FROM notes n
JOIN tags t ON n.id = t.note_id
WHERE t.tag = 'hooks';

-- Find backlinks
SELECT * FROM notes n
JOIN links l ON n.id = l.source_id
WHERE l.target_id = 'context-maintenance-plan';
```

**Schema:**
```sql
notes (id, title, path, status, created, updated, content_preview)
links (source_id, target_id, link_text)
tags (note_id, tag)
```

**Benefits:**
- Sub-second queries for any metadata combination
- Relationship queries (backlinks, orphans)
- No need to re-read files for metadata
- Index rebuild is fast (<5 sec for 100 notes)

### Wikilinks = Explicit Relationships

**Syntax:**
- `[[note-id]]` - Link to note by ID
- `[[note-id|display text]]` - Link with custom text
- `[[#heading]]` - Link to heading in same note (future)
- `[[note-id#heading]]` - Link to heading in other note (future)

**Extracted into links table:**
```python
# Parser extracts
[[context-maintenance-plan]] → ('overview', 'context-maintenance-plan', 'context-maintenance-plan')
[[context-maintenance-plan|implementation]] → ('overview', 'context-maintenance-plan', 'implementation')
```

**Enables:**
- Backlink queries: "What notes reference this?"
- Orphan detection: Notes with no incoming/outgoing links
- Link validation: Catch broken links (target doesn't exist)
- Graph visualization: Nodes = notes, edges = links

---

## Implementation Decisions

### Why Python + SQLite (Not Custom DB)

**Alternatives considered:**
- PostgreSQL - Overkill, requires server
- Vector DB only (ChromaDB, Pinecone) - Missing structured queries
- JSON files - Slow queries, no relationship queries
- Full-text search (Elasticsearch) - Complex, heavy

**Why SQLite wins for MVP:**
- **Simple**: Built into Python, no setup
- **Fast**: Efficient for 1000s of notes
- **Portable**: Single .db file, works anywhere
- **Queryable**: Full SQL for complex queries
- **Incrementally upgradable**: Can add ChromaDB later for embeddings

### Why CLI Tools (Not Web UI)

**Alternatives considered:**
- Web UI (Flask/FastAPI + React)
- VS Code extension
- Obsidian plugin

**Why CLI wins for MVP:**
- **Faster to build**: Hours vs days
- **Terminal workflow**: Fits developer workflow
- **Scriptable**: Can be called from other tools
- **Upgradeable**: Can wrap in MCP server or web UI later
- **No complexity**: No frontend build, auth, hosting

### Why Explicit Re-Index (Not Auto-Watch)

**Alternatives considered:**
- File system watcher (watchdog) - Auto-rebuild on save
- Git hook - Rebuild on commit
- Background service - Always running

**Why explicit re-index wins for MVP:**
- **Simpler**: No daemon, no event handling
- **Predictable**: User controls when index updates
- **Debuggable**: Can see exactly when indexing happens
- **Upgradeable**: Can add `--watch` mode later

**Trade-off accepted**: User must remember to rebuild after editing

---

## Relationship to Self-Improving Systems Research

### How Context-Maintenance Plan Fits

The `context-maintenance-plan.md` is the **implementation roadmap** for one approach described in the `overview.md` research.

**Overview** (conceptual):
- Compares 6 approaches: Native skills, Hooks, Self-learning, ACE, Voyager, SAGE
- Academic foundations: Meta-learning, RLHF, catastrophic forgetting
- 40+ sources organized by category

**Context-Maintenance Plan** (actionable):
- 5-phase implementation roadmap (20-28 hours)
- Specific files to create (`.githooks/lib/commit_analyzer.py`, etc.)
- Code examples for hooks, git automation, status updates
- Success metrics ("Claude checks context: 15% → 65-75%")
- Design enhancements from memory systems research

**Why both belong in research vault:**
- **Theory informs practice**: Overview explains why plan works
- **Practice validates theory**: Plan tests ideas from overview
- **Cross-referenced**: Plan references overview, overview links to plan
- **Discoverable together**: Both show up in searches for "autoskill" or "hooks"

### Integration with Autoskill Research

The vault consolidates two complementary learning systems:

**1. Autoskill (Session-based):**
- Learn from user corrections during sessions
- Analyze conversation transcripts
- Detect patterns like "use X instead of Y"
- Update skill triggers

**2. Context Maintenance (Behavior-based):**
- Learn from actual work (git commits)
- Analyze commit patterns
- Detect conventions after 3+ occurrences
- Draft CLAUDE.md/skill updates

**Combined architecture:**
```
Session → Hooks inject context (state delta + summaries)
    ↓
Claude works (with current state)
    ↓
User corrections → Autoskill learns (transcripts)
    ↓
Work committed → Git automation extracts (commits)
    ↓
Patterns compound in skills/CLAUDE.md (structured)
    ↓
Old context archived (forgetting as technology)
    ↓
Memory health tracked monthly (compounding metrics)
```

Both systems benefit from the research vault:
- Store learned patterns as research notes
- Cross-reference related approaches
- Track which patterns work (status: active vs archived)
- Discover existing knowledge to prevent duplication

---

## Future Tool Capabilities

### Phase 2: Semantic Search (When >20 Notes)

**Add ChromaDB for embeddings:**
```python
# Instead of keyword match
search("autoskill hooks")  # Miss "context injection" even if related

# Use semantic similarity
semantic_search("learning from corrections")
# Returns: autoskill, context-maintenance, RLHF notes
# Even if they don't contain exact words
```

**Benefits:**
- Find by meaning, not just keywords
- Discover related research you forgot about
- Less precise wikilink creation needed

**Cost:**
- Embedding generation (OpenAI API or local model)
- Vector storage (ChromaDB database)
- Slower queries (~100ms vs <1ms)

**Trigger**: When keyword search misses too often

### Phase 3: MCP Server (When Claude Needs Research)

**Expose tools to Claude:**
```json
{
  "tools": [
    {"name": "research_search", "description": "Search vault by keyword"},
    {"name": "research_semantic", "description": "Find by meaning"},
    {"name": "research_backlinks", "description": "Find references"},
    {"name": "research_related", "description": "Suggest related notes"}
  ]
}
```

**Claude workflow:**
```
User: "How do we implement autoskill?"

Claude: [calls research_search("autoskill implementation")]
Found: overview.md, context-maintenance-plan.md

[calls research_backlinks("overview")]
Referenced by: context-maintenance-plan.md

Let me read the implementation sections...
[reads specific parts, not entire files]

Based on our research: [detailed answer with citations]
```

**Benefits:**
- Claude discovers research without manual prompting
- Fast structured queries vs slow grep
- Automatic citation of sources
- Reduces need to load entire research files into context

**Trigger**: When research vault becomes primary knowledge source

### Phase 4: Graph Visualization (When >50 Notes)

**Interactive knowledge graph:**
- Nodes = notes (sized by backlink count)
- Edges = wikilinks (weighted by frequency)
- Colors = status or topic
- Clusters = related research areas

**Insights:**
- Which notes are central vs peripheral?
- Which topics are well-connected vs isolated?
- Where are knowledge gaps? (sparse areas)
- Which notes might be outdated? (no recent links)

**Tool:**
```python
python _tools/graph.py --output graph.html
```

**Trigger**: When navigating vault by browsing becomes hard

### Phase 5: Auto-Maintenance (When Vault is Mature)

**Auto-suggest tags:**
```python
# Based on content analysis
suggest_tags("new-note.md")
# Returns: [meta-learning, implementation, hooks]
```

**Auto-suggest links:**
```python
# Based on content similarity
suggest_links("new-note.md")
# Returns: [context-maintenance-plan (0.85), overview (0.78)]
```

**Detect duplicates:**
```python
# Find notes with very similar content
find_duplicates(threshold=0.9)
# Returns: [(note1, note2, similarity=0.92), ...]
```

**Trigger**: When manual maintenance becomes burdensome

---

## Design Principles from Discussion

### 1. Start Simple, Enhance Incrementally

**User's approach:**
- MVP first: Structure + basic indexing
- Add features when pain points emerge
- Don't build what might be needed

**Anti-pattern to avoid:**
- Building full Obsidian clone upfront
- Adding graph viz before having 50+ notes
- Semantic search before keyword search proves insufficient

### 2. Structure Enables Tools (Not Vice Versa)

**Correct order:**
1. Define structured format (YAML frontmatter, wikilinks)
2. Migrate existing content to format
3. Build tools that leverage structure

**Wrong order:**
1. Build tool that tries to extract structure from unstructured content
2. Hope it works well enough
3. Realize limitations and restructure anyway

**Key insight**: Pay upfront cost of structured metadata, get tools for free

### 3. Tools Should Feel Invisible

**Good tool UX:**
```bash
# Fast enough to not think about
python _tools/search.py "hooks"  # <100ms
```

**Bad tool UX:**
```bash
# Slow enough to be annoying
python _tools/search.py "hooks"  # 5 seconds
# User gives up and uses grep
```

**Design goal**: Tools should be faster/better than manual alternatives, not just "automated"

### 4. Validate Early, Catch Drift

**Validator as quality gate:**
- Broken links caught immediately
- Orphaned notes highlighted
- Missing metadata flagged

**Prevents:**
- Links breaking as notes rename
- Notes becoming isolated (forgotten)
- Inconsistent metadata creep

**Pattern**: Run validator after bulk edits, before commits

---

## Success Criteria

### After Phase 1 (MVP), We Should Have:

**Structure:**
- [ ] Topic folders (starting with `self-improving-systems/`)
- [ ] All notes have YAML frontmatter
- [ ] Templates in `_templates/`
- [ ] Tools in `_tools/`
- [ ] Cache in `.research/` (gitignored)

**Tooling:**
- [ ] Indexer parses notes → SQLite in <5 seconds
- [ ] Search responds in <100ms
- [ ] Validator catches broken links/orphans
- [ ] All tools have `--help` and README

**Migration:**
- [ ] `self-improving-skills.md` → `self-improving-systems/overview.md`
- [ ] `context-maintenance/PLAN.md` → `self-improving-systems/context-maintenance-plan.md`
- [ ] Both notes have frontmatter with `id`, `title`, `tags`, `related`
- [ ] Wikilinks between notes work

**Documentation:**
- [ ] `research/README.md` explains structure and tools
- [ ] `_tools/README.md` explains tool usage
- [ ] `DISCUSSION.md` captures design context
- [ ] `PLAN.md` has implementation steps

**Quality:**
- [ ] Zero broken links (validator passes)
- [ ] Zero missing metadata warnings
- [ ] Search finds notes by keyword and tag
- [ ] Backlinks work (overview ↔ plan)

### Metrics:

**Performance:**
- Index build time: <5 seconds for 10 notes
- Search response time: <100ms
- Validator scan time: <1 second

**Quality:**
- 0 broken links
- 0 notes without required metadata
- All notes reachable (no orphans, or documented exceptions)

**Usability:**
- Tools documented with examples
- Templates available for new research
- Clear README for onboarding

---

## Lessons Learned for Future Research

### What Works:

**Structured metadata upfront:**
- YAML frontmatter forces consistency
- Makes tooling possible
- Small upfront cost, big long-term benefit

**Simple tools first:**
- SQLite + Python is plenty for MVP
- CLI faster to build than web UI
- Can always upgrade later

**Explicit relationships:**
- Wikilinks make connections clear
- Easier to reason about than inferred links
- Validation catches mistakes

### What to Avoid:

**Gold-plating:**
- Don't add features before pain points emerge
- Semantic search not needed for 10 notes
- Graph viz not useful until 50+ notes

**Over-automation:**
- Manual re-index is fine for MVP
- Watch mode adds complexity for little gain
- Let user control when things happen

**Tool complexity:**
- Simple grep-like search beats complex query language
- Three focused tools (index, search, validate) beats one monolith
- CLI args easier than config files for MVP

---

## Related Files

**In this directory:**
- `PLAN.md` - Implementation steps for migration and tooling
- `DISCUSSION.md` - This file, design context

**In research vault (after migration):**
- `research/self-improving-systems/overview.md` - Autoskill research
- `research/self-improving-systems/context-maintenance-plan.md` - Implementation roadmap
- `research/README.md` - Vault entry point
- `research/_tools/` - Indexing and search tools

**Related concepts:**
- Obsidian vault structure
- Zettelkasten methodology
- Personal knowledge management (PKM)
- Digital gardens

---

## Quotes from Discussion

**On structure:**
> "I'm thinking that research/ directory ends up like an obsidian vault over time"

**On MVP:**
> "Do not gold plate things... this is an mvp."

**On tooling:**
> "does this structure support us adding tooling via python scripts and services in the future that would possibly help you to discover links and retrieval info without needing to search/grep every document"

**On consolidation:**
> "I would like to consolidate this under research/ though and provide you with a guide for more structure under research going forward."

---

**End of Discussion Document**
