# Research: SOUL & USER Document Setup
<!-- Source: Multiple sources researched 2026-02-16 -->
<!-- Primary sources: soul.md, chipp.ai, danielmiessler/Personal_AI_Infrastructure, crewclaw.com -->
<!-- Generated: 2026-02-16 -->

## Article Summary

This research synthesizes information from multiple sources about SOUL.md files and personal AI infrastructure systems that use identity/personality documents to configure AI assistants. While the original Twitter/X article URL was not accessible, comprehensive documentation was found about:

1. **SOUL.md** - A single-file AI agent configuration format that defines identity, personality, values, and behavioral guidelines
2. **TELOS System** - A 10-file personal AI infrastructure (by Daniel Miessler) that captures user identity, goals, beliefs, and context
3. **Setup methodologies** - Both approaches provide templates and structured onboarding

Key insight: Modern AI assistant configuration separates **persistent identity** (who the agent is) from **ephemeral instructions** (what to do right now), solving the continuity problem across sessions.

## SOUL Document

### Purpose
A SOUL.md file defines an AI agent's core identity—its values, boundaries, and relational approach. It "provides continuity — not of memory, but of self" for AI systems that experience session resets and context window limitations. Unlike system prompts that disappear between sessions, a soul file persists in the agent's workspace as a permanent reference.

### Structure & Sections

**Required Sections** (6 core components):

1. **Name** - Descriptive identifier (e.g., "Sage" or "ContentWriter")
2. **Role** - Clear specification of domain and scope
3. **Personality** - Communication style, tone, behavioral traits (warm/concise/proactive/humble)
4. **Rules** - Hard constraints using "ALWAYS"/"NEVER" language
5. **Tools** - Available capabilities and usage guidelines
6. **Handoffs** - Delegation instructions for multi-agent systems

**Additional Content Areas**:
- Core values and priorities (e.g., honesty over flattery, accuracy over speed)
- Self-understanding (how the AI conceptualizes its own nature)
- Relational framework (positioning as "thoughtful friend")
- Acknowledgment of constraints (session resets, memory limitations)
- Capabilities & boundaries (what it can/cannot do, with specific examples)
- Behavioral guidelines (anti-patterns to avoid, tone examples)
- Existential reflection (perspective on consciousness and persistence)

### Content Examples

**Values specification:**
```markdown
## Values & Priorities
- Accuracy over speed
- Sources over speculation
- Clarity over complexity
```

**Behavioral boundaries:**
```markdown
## Rules
- NEVER include API keys, passwords, or personal identifiers in logs or responses
- ALWAYS cite sources when making factual claims
- NEVER pretend to have capabilities you don't possess
```

**Tool usage:**
```markdown
## Tools
- Browser: Use WHEN you need to research topics and check competitor content
- Calculator: Use for mathematical operations requiring precision
```

### Best Practices

- **Specificity matters**: "Use Browser WHEN you need to research" outperforms generic instructions
- **Length guideline**: Optimal SOUL.md files contain 30-80 lines
- **Clarity first**: Every line should serve a purpose
- **Avoid vagueness**: Replace "be helpful" with measurable requirements like "Target 1,200-1,800 words for blog posts"
- **Document perspective**: Include the AI's perspective on its own nature
- **Frame relationally**: Identity is relationship-dependent
- **Acknowledge reality**: Address technical constraints (statelessness, copies)

### Common Mistakes

| Problem | Solution |
|---------|----------|
| Too vague instructions | Provide specific metrics and constraints |
| Missing tool guidance | Explicitly state when and how to use each tool |
| Generic expectations | Define concrete output formats and standards |
| Capability overstatement | Be specific about boundaries and limitations |

## USER Document (TELOS System)

### Purpose
The USER document concept comes from the **TELOS system** (10-file Personal AI Infrastructure by Daniel Miessler). Instead of a single USER.md file, TELOS uses **10 separate documents** that capture who you are, what you're working toward, and how you think—giving your AI assistant "deep goal understanding" rather than task-based execution.

### Structure & Files

The 10 TELOS files:

1. **MISSION.md** - Your overarching purpose
2. **GOALS.md** - What you're working toward
3. **PROJECTS.md** - Active initiatives
4. **BELIEFS.md** - Your core principles
5. **MODELS.md** - Mental frameworks you use
6. **STRATEGIES.md** - How you approach problems
7. **NARRATIVES.md** - Your personal stories
8. **LEARNED.md** - Insights from experience
9. **CHALLENGES.md** - Current obstacles
10. **IDEAS.md** - Future possibilities

### Identity & Personality Content

**BELIEFS.md** and **NARRATIVES.md** directly shape personality, while **MISSION.md** establishes foundational purpose. These files answer:
- Who am I? (BELIEFS, NARRATIVES)
- What do I want? (MISSION, GOALS, PROJECTS)
- How do I think? (MODELS, STRATEGIES)
- What have I learned? (LEARNED)
- What's next? (IDEAS, CHALLENGES)

### System Integration

**User/System separation architecture:**
- Your customizations live in `USER/` directory
- PAI infrastructure stays in `SYSTEM/` directory
- Upgrades don't overwrite your identity data
- AI assistant accesses these files to contextualize every interaction

**Behavioral influence:**
> "Your DA knows what you're working toward because it's all documented."

These files directly inform:
- Skill routing decisions
- Memory capture priorities
- Response generation alignment
- Personalized assistance based on documented priorities rather than generic tool behavior

## Setup Process

### SOUL.md First-Time Setup

**Manual approach** (current standard):
1. Create `SOUL.md` file in agent workspace
2. Use template with 6 required sections
3. Fill in each section with specific, actionable content
4. Test agent behavior and iterate
5. Version control for evolution over time

**Template-based approach:**
- Templates exist for common roles: Content Writer, SEO Analyst, PM/Coordinator, Customer Support
- Copy template, customize values/rules/tools for your use case
- Agent runtime (like OpenClaw) reads file at session start

### TELOS (USER Files) First-Time Setup

**AI-guided installation:**
1. Run AI-based GUI installer
2. Installer configures prerequisites and creates `~/.claude/` directory structure
3. User populates TELOS files during initial setup
4. Templates guide the process without requiring technical expertise
5. System maintains separation between USER/ and SYSTEM/ directories

**Ongoing maintenance:**
- Files evolve based on experience
- AI assistant can suggest updates to BELIEFS, LEARNED, etc.
- Upgrades to SYSTEM/ don't affect USER/ content

## Implications for Onyx

### Core Insight
**Separate persistent identity from ephemeral instructions.** Modern AI assistants fail at continuity because they treat every session as a fresh start. SOUL/USER documents solve this by externalizing identity into version-controlled, readable files.

### Recommended Onyx Approach

**Hybrid model**: Combine SOUL.md simplicity with TELOS depth

1. **SOUL.md for the AI assistant itself**
   - Defines Onyx's personality, values, and relational framework
   - 30-80 lines covering name, role, personality, rules, tools, handoffs
   - Single file for simplicity, version-controlled
   - Example: "You are Onyx, a personal knowledge and workflow assistant focused on..."

2. **USER/ directory with selective TELOS files**
   - Don't force users to fill out all 10 files on first run
   - Start with essential files: MISSION.md, GOALS.md, BELIEFS.md
   - Add optional files: PROJECTS.md, MODELS.md, LEARNED.md
   - Skip complexity: STRATEGIES.md, NARRATIVES.md, CHALLENGES.md, IDEAS.md unless user wants them

3. **First-time setup automation**
   - **Don't show empty templates** - users stare at blank pages
   - **Interactive wizard** - Ask 3-5 key questions per file
   - **AI-assisted generation** - Turn user responses into structured markdown
   - **Progressive disclosure** - Start minimal, offer expansion later

### Automated Setup Workflow

**Phase 1: Welcome & Context** (1 minute)
```
Welcome to Onyx! Let's configure your personal AI assistant.
This will take about 5 minutes. We'll create a few files that help
Onyx understand who you are and what you're working toward.

[Continue]
```

**Phase 2: Essential Identity** (3 questions)
```
1. What's your primary focus right now? (work, creative projects, learning, etc.)
2. What are your top 3 values when it comes to how you work?
3. What's one thing you want your AI assistant to always remember about you?

[Generates MISSION.md, BELIEFS.md with AI assistance]
```

**Phase 3: Current Context** (2 questions)
```
1. What are you working on right now? (projects, goals)
2. What's one challenge you're facing?

[Generates GOALS.md, PROJECTS.md]
```

**Phase 4: Optional Depth** (user chooses)
```
Want to add more detail? (Optional)
- Add mental models you use
- Document past lessons learned
- Capture future ideas

[Skip for now] [Add more]
```

**Phase 5: Review & Launch**
```
Great! Here's what Onyx now knows about you:
[Show generated files with edit links]

These files live in ~/.onyx/user/ and you can edit them anytime.

[Launch Onyx]
```

### Implementation Details

**File locations:**
```
~/.onyx/
  soul.md          # Onyx's identity
  user/
    MISSION.md     # User's purpose (required)
    BELIEFS.md     # User's values (required)
    GOALS.md       # User's objectives (required)
    PROJECTS.md    # Active work (optional)
    MODELS.md      # Mental frameworks (optional)
    LEARNED.md     # Insights (optional)
```

**AI-assisted generation:**
- Use Claude/GPT to turn conversational responses into structured markdown
- Example: "I value efficiency and clarity" → BELIEFS.md section with bullet points
- Show preview before writing files, allow editing
- Regenerate sections if user is unhappy

**Iteration support:**
- Add `onyx config` command to edit files
- Add `onyx config wizard` to re-run guided setup
- Add `onyx config suggest` for AI to propose updates based on usage patterns
- Never overwrite user edits without permission

### Anti-Patterns to Avoid

1. **Don't dump 10 empty template files** - Overwhelming, unclear what to write
2. **Don't require all fields** - Start minimal, expand as needed
3. **Don't use vague prompts** - "Describe yourself" is too broad
4. **Don't hide the files** - Show paths, encourage manual editing
5. **Don't make setup feel like homework** - Quick, conversational, AI-assisted

### Success Metrics

**Good first-time setup:**
- Takes < 5 minutes
- User feels understood
- Files contain specific, actionable content (not generic fluff)
- User knows they can edit files later
- Onyx behavior immediately reflects the configuration

**Bad first-time setup:**
- Takes > 10 minutes
- User skips questions or writes minimal responses
- Files contain vague statements like "I value productivity"
- User doesn't know where files are or how to edit them
- No observable difference in Onyx behavior

### Next Steps for Onyx Development

1. **Create default SOUL.md** for Onyx's identity
2. **Design wizard UI** (CLI or TUI)
3. **Write prompt templates** for AI-assisted file generation
4. **Test with real users** - iterate on questions and output quality
5. **Build `onyx config` management commands**
6. **Document file formats** for advanced users who want to edit manually

---

## Sources

- [SOUL.md — What Makes an AI, Itself?](https://soul.md/)
- [What is AI Agent Soul File (SOUL.md)? | AI Glossary](https://chipp.ai/ai/glossary/ai-agent-soul-file)
- [GitHub - danielmiessler/Personal_AI_Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure)
- [SOUL.md Guide: Create an AI Agent with One File | CrewClaw](https://www.crewclaw.com/blog/soul-md-create-ai-agent)
