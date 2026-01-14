---
id: self-improving-systems-overview
title: Self-Improving Systems Overview
created: 2026-01-14
updated: 2026-01-14
status: active
tags: [meta-learning, skills, hooks, implementation, autoskill]
related:
  - context-maintenance-plan
aliases: [autoskill-research, self-learning]
---

# Research: Self-Improving Skills for Claude Code

## Quick Summary

**What:** Systems that learn from user corrections and automatically improve skill definitions over time

**Why:** Eliminates repetitive teaching across sessions - Claude learns your preferences once and remembers them permanently

**When:** Use when you frequently correct Claude on project-specific patterns, team conventions, or domain-specific practices

---

## Core Approaches

### 1. Native Skills (Recommended Starting Point)

**What it is:** Built-in Claude Code pattern-based skill activation via SKILL.md files

**How it works:**
- Create `~/.claude/skills/skill-name/SKILL.md`
- Define triggers: file globs, keywords, import patterns, bash commands
- Skill auto-activates when patterns match conversation context

**Example:**
```markdown
---
name: fastapi-workflow
description: FastAPI development patterns
---

# FastAPI Workflow

**Auto-activate when:** Working with `app/` directory, importing from `fastapi`,
or when files contain `@app.get`, `APIRouter`, `Depends`.

## Patterns
- Use APIRouter for logical grouping
- Prefix routes: `/api/v1/resource`
```

**Pros:**
- Simple, low maintenance
- High explainability
- Version-controlled (git)
- Built into Claude Code

**Cons:**
- Manual trigger updates required
- Can miss edge cases

---

### 2. Hooks + Dynamic Injection (Power User)

**What it is:** Use Claude Code hooks to programmatically inject context based on runtime analysis

**How it works:**
- Write Python/Bash hook scripts
- Register in `settings.json` for events: `UserPromptSubmit`, `PreToolUse`, `Stop`
- Hooks read conversation state, detect patterns, inject additional context

**Hook Events:**
- `UserPromptSubmit` - Before prompt processed (context injection)
- `PreToolUse` - Before tool executes (validation/guardrails)
- `PostToolUse` - After tool executes (logging/state tracking)
- `Stop` - When agent finishes (learning from session)

**Example Hook (autoskill-router.py):**
```python
#!/usr/bin/env python
import json, sys, re
from pathlib import Path

PATTERNS = {
    'git-workflow': [re.compile(r'\b(commit|push|git)\b', re.I)],
    'docker-workflow': [re.compile(r'\b(docker|container)\b', re.I)],
}

data = json.load(sys.stdin)
prompt = data.get('prompt', '')

activated = [skill for skill, patterns in PATTERNS.items()
             if any(p.search(prompt) for p in patterns)]

if activated:
    context = "\n\n".join([
        load_skill(skill) for skill in activated
    ])
    print(json.dumps({
        "hookSpecificOutput": {"additionalContext": context}
    }))
else:
    print(json.dumps({}))
```

**Pros:**
- Dynamic, context-aware skill composition
- Can combine multiple skills programmatically
- Preprocessing/validation capabilities

**Cons:**
- More complex to debug
- Requires hook script maintenance
- Platform-specific (WSL on Windows requires `bash -l`)

---

### 3. Self-Learning Analyzer (Meta-Optimization)

**What it is:** Analyze conversation history to detect missed skill activations and auto-suggest trigger improvements

**How it works:**
1. Parse `history.jsonl` for signals (file operations, bash commands, user intents)
2. Compare signals against existing skill triggers
3. Detect gaps: "This skill should have activated but didn't"
4. Suggest new trigger patterns with confidence scores

**Your Existing Implementation:**
You already have `~/.claude/scripts/skill-analyzer.py` that does this!

**Run it:**
```bash
python ~/.claude/scripts/skill-analyzer.py --verbose --checkpoint
```

**Output:**
```
SKILL: python-workflow
  MISSED: Working with pyproject.toml (confidence: HIGH)
  SUGGEST: Add trigger: "when working with `pyproject.toml`"

SKILL: docker-workflow
  MISSED: docker-compose.yml editing (confidence: HIGH)
  SUGGEST: Add trigger: "file glob `docker-compose*.yml`"
```

**Pros:**
- Data-driven trigger refinement
- Detects patterns you didn't think of
- Low friction (just review suggestions)

**Cons:**
- Requires manual review before applying
- Only as good as signal extraction
- May suggest overly specific triggers

---

## Alternative Architectures

### ACE (Autonomous Cognitive Entity)

**Concept:** Hierarchical layers inspired by cognitive architecture

**Layers:**
1. **Aspirational** - Mission, values, ethics
2. **Global Strategy** - Long-term planning
3. **Agent Model** - Self-awareness
4. **Executive Function** - Task switching
5. **Cognitive Control** - Working memory
6. **Task Prosecution** - Execution

**Best for:** Safety-critical agents, multi-session persistence, agent-managing-agents

**Trade-off:** Complex to implement, overhead for simple tasks

---

### Voyager (Exploration-Based Skill Library)

**Concept:** Discover skills through exploration, store in growing library with embeddings

**Components:**
- **Automatic Curriculum** - Generate increasingly complex tasks
- **Skill Library** - Vector DB of learned code snippets
- **Iterative Prompting** - Refine through feedback

**Technical:**
```python
# Voyager skill library
skills = {}  # name -> {code, description}
embeddings = ChromaDB()  # Semantic search

# Add skill
skills['gather_wood'] = {
    'code': 'function gatherWood() {...}',
    'description': 'Gather 10 wood blocks'
}
embeddings.add(name, description_embedding)

# Retrieve similar
query_embedding = embed("I need to build a house")
similar = embeddings.query(query_embedding, k=5)
```

**Best for:** Open-ended exploration, capability growth over time, discovery-heavy workflows

**Trade-off:** Requires feedback mechanism, skills may drift, embedding storage overhead

---

### SAGE (Structured Agentic Generation)

**Concept:** Explicit reasoning with typed tool calls and structured outputs

**Components:**
- Pydantic schemas for tool calls
- Chain-of-thought before actions
- Typed tool registry

**Example:**
```python
class ToolCall(BaseModel):
    tool: Literal['read_file', 'write_file', 'run_bash']
    parameters: dict
    reasoning: str  # Why this tool?

class SAGEResponse(BaseModel):
    thought: str
    tool_calls: list[ToolCall]
    final_answer: str | None
```

**Best for:** Production APIs, auditability requirements, predictable outputs

**Trade-off:** Less flexible, schema maintenance

---

## Comparison Matrix

| Approach | Complexity | Learning | Safety | Auditability | Context Cost |
|----------|------------|----------|--------|--------------|--------------|
| **Native Skills** | Low | Manual | Good | High | Low |
| **Hooks + Injection** | Medium | Manual | Good | High | Variable |
| **Self-Learning** | Medium | Auto | Medium | Medium | Low |
| **ACE** | High | Manual | Excellent | High | High |
| **Voyager** | High | Auto | Low | Medium | High (embeddings) |
| **SAGE** | Medium | Manual | Good | Excellent | Medium |

---

## Implementation Guide

### Phase 1: Native Skills (Start Here)

```bash
# 1. Create skill directory
mkdir -p ~/.claude/skills/my-skill

# 2. Write SKILL.md
cat > ~/.claude/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Custom project patterns
---

# My Skill

**Auto-activate when:** Working with `src/**/*.ts`, importing from `@/lib`,
or when user mentions "project pattern".

## Patterns
- Always use named exports, not default
- Prefer composition over inheritance

## Anti-Patterns
- Don't use `any` type - use `unknown` instead
EOF

# 3. Test activation
# Start Claude Code, write prompt that should trigger
```

### Phase 2: Add Hooks for Dynamic Behavior

```bash
# 1. Create hook script
cat > ~/.claude/hooks/autoskill-router.py << 'EOF'
#!/usr/bin/env python
import json, sys, re
from pathlib import Path

data = json.load(sys.stdin)
prompt = data.get('prompt', '')

# Detect patterns
if re.search(r'\bfastapi\b', prompt, re.I):
    skill = (Path.home() / '.claude/skills/fastapi-workflow/SKILL.md').read_text()
    print(json.dumps({
        "hookSpecificOutput": {"additionalContext": skill}
    }))
else:
    print(json.dumps({}))
EOF

chmod +x ~/.claude/hooks/autoskill-router.py

# 2. Register hook in settings.json
cat > ~/.claude/settings.json << 'EOF'
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "bash -l -c 'python ~/.claude/hooks/autoskill-router.py'"
      }]
    }]
  }
}
EOF
```

### Phase 3: Enable Self-Learning

```bash
# Run analyzer periodically (you already have this!)
python ~/.claude/scripts/skill-analyzer.py --verbose --checkpoint

# Review output, manually apply approved trigger additions
```

---

## Common Pitfalls

| Problem | Symptom | Fix |
|---------|---------|-----|
| **Overly broad triggers** | Skill activates when irrelevant | Make patterns more specific, use negative lookahead |
| **ZDOTDIR not set** | Skills don't load on MSYS2 | Use `${ZDOTDIR:-$HOME}` in paths |
| **Hook not executing** | No context injection | Use `bash -l` for login shell, check PATH |
| **CRLF line endings** | Hook fails with `\r` error | Enforce LF in `.gitattributes` |
| **Meta-overfitting** | Self-learning captures one-offs | Require 2+ repetitions or explicit rule language |
| **Context collapse** | Summarization loses critical details | Use structured updates, preserve examples |

---

## Decision Criteria

**Choose Native Skills when:**
- Starting with Claude Code
- Needs are well-defined and stable
- Want minimal maintenance
- Skills are domain-specific (Python, Git, Docker)

**Choose Hooks + Injection when:**
- Need dynamic skill composition
- Skills depend on runtime context
- Want preprocessing/validation
- Building multi-skill orchestration

**Choose Self-Learning when:**
- Use Claude Code heavily
- Notice missed skill activations
- Want data-driven trigger refinement
- Comfortable reviewing automated suggestions

**Choose ACE when:**
- Building persistent agents across sessions
- Safety and ethics paramount
- Need hierarchical control
- Agents may take high-stakes actions

**Choose Voyager when:**
- Exploratory domain
- Skills should emerge from experience
- Have good feedback signals
- Long-term capability growth matters

**Choose SAGE when:**
- Need structured, predictable outputs
- Auditability required (compliance)
- Building production APIs
- Complex tool orchestration

---

## Integration: Context Maintenance + Self-Learning

This autoskill research complements the **context-maintenance system** described in `claude/ideas/context-maintenance/PLAN.md`. Together they form a complete self-improving loop:

### Learning from Two Sources

**1. Session Corrections (Autoskill)**
- Analyzes conversation transcripts for user corrections
- Detects patterns: "use X instead of Y", repeated feedback
- Updates skill triggers based on corrections

**2. Actual Work (Context Maintenance)**
- Analyzes git commit history for emerging patterns
- Detects conventions after 3+ occurrences
- Drafts CLAUDE.md/skill updates from real code

### Combined Architecture

```
Session → Hooks inject context (state delta + summaries)
    ↓
Claude works (with current project state)
    ↓
User corrections → Autoskill learns (transcript analysis)
    ↓
Work committed → Git automation extracts (commit analysis)
    ↓
Patterns compound in skills/CLAUDE.md (structured)
    ↓
Old context archived (forgetting as technology)
    ↓
Memory health tracked monthly (compounding metrics)
```

### Key Enhancements from Context-Maintenance Plan

1. **State Delta Awareness**: Hooks inject "what changed since last session" (git commits, completions)
2. **Two-Stage Retrieval**: Recall candidates (summaries), then verify (read files with specific lines)
3. **Lifecycle Metadata**: Classify sections as permanent/temporary/ephemeral for proper archival
4. **Forgetting as Technology**: Archive STATUS.md entries >90 days old to keep context focused
5. **Memory Health Metrics**: Monthly tracking of compounding (patterns reused, lessons applied)

### Why This Matters

The context-maintenance plan implements the **8 principles of memory architecture** from academic research:
1. Memory is architecture, not a feature
2. Separate by lifecycle (personal/project/session)
3. Match storage to query pattern (key-value/structured/semantic/logs)
4. Mode-aware context beats volume (planning vs execution vs debug)
5. Build portable first (markdown + git survives vendor changes)
6. Compression is curation (inject summaries, not full files)
7. Retrieval needs verification (recall + verify, not just inject)
8. Memory compounds through structure (not random accumulation)

These principles validate and enhance the autoskill approaches described above.

**Recommendation**: Implement autoskill (learning from corrections) AND context-maintenance (learning from commits) for maximum compounding.

---

## Key Files

| File | Purpose |
|------|---------|
| `~/.claude/skills/*/SKILL.md` | Skill definitions |
| `~/.claude/scripts/skill-analyzer.py` | Self-learning analyzer (you have this!) |
| `~/.claude/hooks/*.py` | Hook scripts |
| `~/.claude/settings.json` | Hook registration |
| `~/.claude/history.jsonl` | Conversation history for analysis |
| `claude/ideas/context-maintenance/PLAN.md` | Full context-maintenance system plan |

---

## Recommended Path for You

Based on your experience level and existing infrastructure:

1. **Start:** Review your existing skills in `~/.claude/skills/`
2. **Optimize:** Run `skill-analyzer.py` to detect missed activations
3. **Apply:** Add suggested triggers to SKILL.md files
4. **Extend:** Create hooks for dynamic behavior (e.g., project-type detection)
5. **Monitor:** Re-run analyzer monthly to refine triggers

You already have the foundation built - just activate the self-learning loop!

---

## Sources

### Autoskill System
- [AI Unleashed - Autoskill GitHub](https://github.com/AI-Unleashed/Claude-Skills/blob/main/autoskill/SKILL.md)
- [YouTube: The SECRET to Claude Code Skills Nobody's Talking About](https://www.youtube.com/watch?v=3EHnp-SH4O8)

### Meta-Learning Research
- [Meta Learning: 7 Techniques & Use Cases](https://research.aimultiple.com/meta-learning/)
- [Model-Agnostic Meta-Learning (MAML)](https://arxiv.org/abs/1703.03400)
- [MAML-en-LLM: Meta-Training for LLMs](https://arxiv.org/abs/2405.11446)
- [Fast Adaptation with Kernel Meta-Learning](https://arxiv.org/abs/2411.00404)

### Continual Learning
- [Google Research: Nested Learning Paradigm](https://research.google/blog/introducing-nested-learning-a-new-ml-paradigm-for-continual-learning/)
- [Future of Continual Learning in Foundation Models](https://arxiv.org/html/2506.03320v1)
- [Curiosity-Driven Autonomous Learning Networks](https://papers.academic-conferences.org/index.php/icair/article/view/4375)

### RLHF
- [CMU ML Blog: RLHF 101](https://blog.ml.cmu.edu/2025/06/01/rlhf-101-a-technical-tutorial-on-reinforcement-learning-from-human-feedback/)
- [HuggingFace: Illustrating RLHF](https://huggingface.co/blog/rlhf)
- [IBM: What Is RLHF?](https://www.ibm.com/think/topics/rlhf)

### Agent Architectures
- [Agentic Context Engineering (ACE)](https://arxiv.org/abs/2510.04618)
- [Voyager: Open-Ended Embodied Agent](https://github.com/MineDojo/Voyager)
- [SAGE: Skill Augmented GRPO](https://arxiv.org/abs/2512.17102)
- [Agent Skill Creator](https://github.com/FrancyJGLisboa/agent-skill-creator)
- [MS-Agent Framework](https://github.com/modelscope/ms-agent)

### Catastrophic Forgetting
- [Elastic Weight Consolidation (EWC)](https://www.pnas.org/doi/10.1073/pnas.1611835114)
- [Overcoming Catastrophic Forgetting](https://blog.american-technology.net/overcoming-catastrophic-forgetting/)
- [IBM: What is Catastrophic Forgetting?](https://www.ibm.com/think/topics/catastrophic-forgetting)

### Meta-Learning Pitfalls
- [Perturbing the Gradient for Meta Overfitting](https://arxiv.org/abs/2405.12299)
- [Meta-Learning Requires Meta-Augmentation](https://proceedings.neurips.cc/paper/2020/file/3e5190eeb51ebe6c5bbc54ee8950c548-Paper.pdf)

### Self-Modifying AI Safety
- [ISACA: Risky Code of Self-Modifying AI](https://www.isaca.org/resources/news-and-trends/isaca-now-blog/2025/unseen-unchecked-unraveling-inside-the-risky-code-of-self-modifying-ai)
- [Spiral Scout: Self-Modifying AI Agents](https://spiralscout.com/blog/self-modifying-ai-software-development)
- [OpenSSF: Security Guide for AI Code Assistants](https://best.openssf.org/Security-Focused-Guide-for-AI-Code-Assistant-Instructions)

### Claude Code Hooks
- [Hooks Reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Steve Kinney: Hook Control Flow](https://stevekinney.com/courses/ai-development/claude-code-hook-control-flow)
- [Claude Code Hooks Schema](https://gist.github.com/FrancisBourre/50dca37124ecc43eaf08328cdcccdb34)
- [Claude Fast: Skill Activation Hook](https://claudefa.st/blog/tools/hooks/skill-activation-hook)

### Prompt Optimization
- [Automatic Prompt Optimization](https://cameronrwolfe.substack.com/p/automatic-prompt-optimization)
- [Context Engineering Guide](https://www.promptingguide.ai/guides/context-engineering-guide)
- [IBM: Prompt Optimization](https://www.ibm.com/think/topics/prompt-optimization)

### Claude Skills Ecosystem
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Claude Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)
