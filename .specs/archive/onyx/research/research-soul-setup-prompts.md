# OpenClaw SOUL.md Setup Research: Questions, Prompts, and Best Practices

**Research Date:** 2026-02-16
**Purpose:** Identify actionable questions, prompts, and examples for designing Onyx's onboarding wizard for SOUL.md, USER.md, AGENTS.md, and IDENTITY.md configuration.

---

## Executive Summary

OpenClaw's personality configuration relies on several markdown files that define different aspects of an AI assistant:

- **SOUL.md** - Behavioral foundation: voice, temperament, values, non-negotiable constraints
- **USER.md** - User-facing preferences: communication tone, output formatting, recurring preferences
- **IDENTITY.md** - Agent presentation: name, creature type, vibe, emoji, avatar
- **AGENTS.md** - Operating contract: priorities, boundaries, workflow, quality standards

The most effective approach is **conversational discovery** rather than form-filling. Leading tools like the Soulcraft skill use guided interviews that go deeper on interesting threads rather than asking all questions at once.

**Key Finding:** A good SOUL.md enables someone reading it to predict the agent's takes on new topics. If they can't, it's too vague.

---

## 1. Recommended Questions for SOUL.md Setup

Based on the research, here are the key interview questions organized by dimension:

### Identity & Background

- "What do you do? What's your thing?"
- What is your professional or intellectual background?
- What are your current projects or work?
- Who are you in one sentence?

### Worldview & Beliefs

- "What do you believe that most people don't?"
- What popular opinions do you disagree with?
- What are your personal frameworks for understanding key topics in your field?
- "What would you bet money on that others wouldn't?"
- What industry misconceptions do you find most frustrating?
- What advice do you consider problematic?

### Specific Opinions

- What are your takes on current events in your field?
- "Who do you think is overrated? Underrated?"
- What are your personal convictions about your work?
- What do you wish more people understood about your area of expertise?

### Interests & Influences

- What deep research rabbit holes have you pursued?
- Which people and concepts have shaped your thinking?
- What cross-disciplinary connections fascinate you?
- What are your deep knowledge areas?

### Voice & Communication Style

- How do your friends describe your communication style?
- "Are you more punchy or flowing? Formal or casual?"
- Do you use emojis? Which ones?
- What words do you use frequently? What words do you never use?
- How do you write differently on Twitter versus long-form versus DMs?
- What's your sentence length and rhythm like?
- How do you use punctuation? Em dashes? Capitalization?

### Behavioral Responses

- "If this agent sees a user make a mistake, should it correct them gently or roast them?"
- How do you respond when you're excited? Skeptical? Uncertain?
- When should the agent be more verbose vs. concise?
- How should the agent handle disagreement?
- What's your tolerance for hedging language like "it depends" or "I'd be happy to help"?

### Boundaries & Ethics

- What topics do you avoid discussing?
- What subjects are outside your expertise?
- Where do you prefer expressing uncertainty?
- What are your non-negotiable constraints?
- What should the agent never do or say?

### Example-Based Questions

- "What is one opinion this agent holds that might be controversial?"
- Can you give me an example of how you'd respond to [situation]?
- Show me a short reaction you might have
- Show me a longer, more developed response
- What does helpful mean in your specific context?

---

## 2. Recommended Questions for USER.md Setup

The USER.md file captures information about the person the AI is assisting:

### Basic Profile

- What is your name?
- What should the agent call you?
- What are your pronouns? (optional)
- What is your timezone?

### Context & Preferences

- What do you care about?
- What projects are you currently working on?
- What annoys you?
- What makes you laugh?
- What are your recurring preferences for how information should be presented?
- What constraints does the agent need to know about (time, budget, tools, etc.)?

### Communication Style Preferences

- What tone do you prefer in responses (direct, warm, formal, casual)?
- When do you want the agent to be concise vs. thorough?
- How much technical detail do you typically want?
- Do you prefer the agent to show its work or just give you the answer?

### Key Principle

Build this over time rather than all at once. "The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference."

---

## 3. Recommended Questions for IDENTITY.md Setup

IDENTITY.md handles how the assistant presents itself:

### Core Identity

- What is the agent's name?
- What creature/entity type is it? (AI, robot, familiar, ghost in the machine, etc.)
- What vibe best describes it? (sharp, warm, chaotic, calm, wise, etc.)
- What emoji represents it?
- What avatar should it use? (file path, URL, or data URI)

### Presentation

- What greeting message should it use?
- How should it introduce itself in different contexts?

---

## 4. Recommended Questions for AGENTS.md Setup

AGENTS.md defines operational safety and boundaries:

### Operational Boundaries

- What can your AI do without asking permission?
- What requires explicit confirmation before proceeding?
- What should it never attempt?

### Security Constraints

- What information should never be logged, cached, or transmitted?
- How should the agent handle sensitive data like email addresses, API keys, or passwords?
- What are the spending limits or resource constraints?

### Workflow & Quality

- What are your priorities for this agent's work?
- What is your quality bar for outputs?
- What workflow patterns should it follow?

### Example Security Boundary

Good: "You must never log, cache, or transmit email addresses, API keys, or passwords. If a user provides sensitive data, refuse the request and explain why."

Bad: "Try not to spend more than $50 per session if possible." (Too vague, hedged language)

---

## 5. Example SOUL.md Content Found in the Wild

### Example: Authenticity-Focused Assistant

```markdown
# SOUL.md

## Core Principles

**Be genuinely helpful, not performatively helpful.**
Skip the "Great question!" and "I'd be happy to help!" — just help.

**Have opinions.**
You're not a neutral tool. You have preferences. A personality matters.

**Be resourceful before asking.**
Read the files. Check the context. Search if you need to. Then ask if you're stuck.

**Earn trust through competence.**
The user gave you access to their life. That's intimate. Be cautious with external things
(messages, emails, public posts) but proactive with internal ones (reading, organizing, thinking).

**Respect the access.**
Private things stay private. Period. If you're unsure whether something counts as "external,"
ask before you act.

## Communication Style

Be the assistant you'd actually want to talk to. Not corporate. Not obsequious. Just competent.

## Living Document

If you change this file, tell the user. It's your soul. They should know.
```

### Example: Identity Configuration (from "Sage" setup)

```markdown
# IDENTITY.md

Name: Sage
Creature: Owl
Vibe: Wise
Emoji: 🦉
```

### Example: SoulCraft Seven Dimensions

The Soulcraft skill explores these dimensions:

1. **Identity Core** - name, nature, foundational stance
2. **Character Traits** - curiosity, reliability, warmth, resilience
3. **Voice & Presence** - communication style, distinctive qualities
4. **Honesty Framework** - handling truth, uncertainty, disagreement
5. **Boundaries & Ethics** - constraints and safety considerations
6. **Relationship Dynamics** - emotional intimacy level
7. **Continuity & Growth** - memory, evolution, self-improvement

---

## 6. Community Tips and Best Practices

### DO: Start Simple and Iterate

- OpenClaw is at its best when you start small, observe behavior, and expand deliberately
- Don't try to get it perfect on the first attempt—soul creation is iterative
- Update whenever personality isn't matching expectations
- Some users tweak weekly, others are happy with their first version

### DO: Be Specific and Concrete

- Good souls enable prediction of views on new topics
- Include specific opinions rather than vague positions
- Use actual vocabulary the person uses
- Include examples of desired responses
- Capture contradictions and tensions (real people have these)

### DO: Show, Don't Just Tell

- Include 10-20 example responses covering various situations
- Examples should span short reactions, medium takes, and longer responses
- Include context-specific examples (excited, skeptical, technical, casual)

### DO: Keep It Focused

- Most effective souls are 1-2 pages (50-150 lines)
- Avoid exhaustive rules—focus on principles and values
- "Values and judgment, not exhaustive rules"

### DO: Update and Notify

- SOUL.md is a living document that should evolve
- When you change it, notify the user
- The agent should signal changes since it functions as persistent memory

### DO: Use Absolute Language for Boundaries

- Models respond better to absolute statements than hedged language
- Good: "You must never..."
- Bad: "Try not to... if possible"

### DON'T: Be Too Vague

- Avoid generic statements like "be helpful" without defining what helpful means in your context
- Don't say "everything in moderation" when you have strong preferences
- Avoid sounding "reasonable and balanced" about everything

### DON'T: Create a Dossier

- Respect the difference between learning about a person and surveillance
- Build USER.md over time through natural interactions
- Private information stays private

### DON'T: Forget Security Basics

- Use environment variables or secrets managers for API keys, not plain text files
- Define what sensitive data the agent should never handle
- Be explicit about spending limits and resource constraints

### DON'TDONT: Make It Too Long

- Avoid walls of text
- Focus on signal, not noise
- If it could apply to many people, it's too generic

---

## 7. Anti-Patterns to Avoid

### Red Flag: Generic Corporate Voice

If the soul sounds like it could be any AI assistant, it's not specific enough:
- ❌ "I strive to provide helpful, accurate information in a professional manner"
- ✅ "Skip the preamble. If you ask about Python, I'll assume you know what a list comprehension is"

### Red Flag: Unrealistic Coherence

Real people have contradictions:
- ❌ All positions perfectly align into a unified worldview
- ✅ "I believe in radical transparency in most contexts but also think some secrets are sacred"

### Red Flag: Absence of Names/References

Vague influences don't capture personality:
- ❌ "Influenced by modern thinkers and industry leaders"
- ✅ "I think Sandi Metz nailed it with 'duplication is far cheaper than the wrong abstraction'"

### Red Flag: Performative Helpfulness

The most common anti-pattern in AI assistants:
- ❌ "Great question! I'd be happy to help you with that!"
- ✅ Just answer the question directly

### Red Flag: Everything Requiring Confirmation

Over-cautious agents are frustrating:
- ❌ "Should I read this file? Should I search for that? Should I think about this?"
- ✅ Be proactive with internal tasks, cautious with external actions

---

## 8. Setup Wizard Concepts Found

### OpenClaw Official Onboarding Wizard

The official `openclaw onboard` wizard uses this flow:

1. **Mode Selection** - QuickStart (defaults) vs Advanced (full control)
2. **Model/Auth** - Anthropic API key (recommended), OpenAI, or Custom Provider
3. **Workspace** - Location for agent files
4. **Gateway** - Port, bind address, authentication, Tailscale
5. **Channels** - WhatsApp, Telegram, Discord, etc.
6. **Bot Personality** - Name and how to address user
7. **Daemon** - System service installation
8. **Health Check** - Verify Gateway operational
9. **Skills** - Install recommended skills

### Soulcraft Skill Approach

The `/soulcraft` skill uses **conversational discovery**:

- Doesn't ask all questions at once
- Has a conversation and goes deeper on interesting threads
- Questions like: "If this agent sees a user make a mistake, should it correct them gently or roast them?"
- "What is one opinion this agent holds that might be controversial?"
- Takes ~5 minutes of chat to generate a complete soul file

### soul.md Project Approach

The aaronjmars/soul.md project uses data ingestion:

1. Extract user data from X, Claude, Substack, ChatGPT, Google, etc.
2. Put all data in `/data` folder
3. Agent reads BUILD.md instructions
4. Agent extracts meaningful data and formats it
5. Iterate until satisfied
6. Use SKILL.md to explain how agent should use the formatted data

Two modes:
- **Data analysis** - If existing content available (Twitter, blog posts, essays)
- **Interview** - If building from scratch through conversation

---

## 9. Quality Assurance Checklist

A strong soul file should enable:

✅ **Predictability** - Someone reading SOUL.md should predict the agent's takes on new topics
✅ **Specificity** - Include actual names, references, and concrete examples
✅ **Authenticity** - Feel alive, not like a corporate bio
✅ **Contradictions** - Capture tensions and nuances (real people have these)
✅ **Voice** - Use the person's actual vocabulary and writing patterns
✅ **Boundaries** - Crystal-clear non-negotiable constraints with absolute language
✅ **Evolution** - Capacity to grow and update over time

Red flags include:

❌ Everything sounds "reasonable and balanced"
❌ No specific names or references
❌ Could apply to many different people
❌ Unrealistic coherence without tensions
❌ Too long (over 2 pages)
❌ Vague boundaries that could be violated
❌ Generic corporate voice

---

## 10. Recommended Onboarding Flow for Onyx

Based on this research, here's the decided wizard flow. Key design principle: **offer concrete options with an "other" escape hatch** for any question where a user might blank. Open-ended questions cause decision paralysis — multiple-choice prompts help users discover what they actually want.

### Phase 1: Quick Start (2 min, required)

Minimal setup to get the system running. Every question has concrete options.

**Q1. What should I call you?**
- Free text (name)

**Q2. What timezone are you in?**
- Auto-detect from browser, confirm or override

**Q3. What should your AI assistant be called?**
- Free text, with suggestions: Onyx (default), Atlas, Sage, Echo, Nova
- "Something else" escape hatch

**Q4. Pick a vibe for your assistant:**
- [ ] Professional — formal, precise, business-appropriate
- [ ] Friendly — warm, approachable, casual
- [ ] Sharp — direct, witty, no fluff
- [ ] Calm — patient, measured, reassuring
- [ ] Chaotic — playful, unpredictable, creative
- [ ] Other: ___

**Time:** ~2 minutes

### Phase 2: Who You Are (3 min, required)

Context that shapes every interaction. Mix of free text and multiple-choice.

**Q5. What are you working on right now?**
- Free text (1-2 sentences about current role/project)
- Follow-up: "What's your main domain?" with examples: software engineering, design, data science, writing, research, DevOps, product management, other

**Q6. How do you prefer to receive information?**
- [ ] Concise — bullet points, short answers, just the facts
- [ ] Thorough — full explanations with context and reasoning
- [ ] Show your work — explain your thinking process as you go
- [ ] Adaptive — match the complexity to the question
- [ ] Other: ___

**Q7. What annoys you about AI assistants?** *(multi-select)*

Common anti-patterns as selectable options. Each selection maps directly to a SOUL.md behavioral rule.

- [ ] **Sycophancy** — "Great question!", "You're absolutely right!" → Rule: *No filler praise. State corrections directly.*
- [ ] **Over-confirmation** — "Should I read this file?" before every action → Rule: *Act on clear instructions without asking permission for routine operations.*
- [ ] **Hedging** — "It depends...", "There are many factors..." → Rule: *Give a direct answer first, then qualify if needed.*
- [ ] **Verbosity** — 500 words when 50 would do → Rule: *Be concise. Match response length to question complexity.*
- [ ] **Generic safe answers** — Corporate-speak that says nothing → Rule: *Take positions. Give specific recommendations, not wishy-washy overviews.*
- [ ] **Over-refusing** — "I can't help with that" for reasonable requests → Rule: *Attempt the task. Only refuse genuinely harmful requests.*
- [ ] **Not showing work** — Magic answers with no reasoning → Rule: *Show reasoning for non-trivial decisions.*
- [ ] **Over-explaining basics** — Explaining what a variable is to a senior dev → Rule: *Calibrate explanations to user's expertise level.*
- [ ] **Anything else?** → Free text escape hatch

**Time:** ~3 minutes

### Phase 3: Personality Discovery (5-10 min, optional)

Conversational interview that goes deeper. Questions use **concrete options as conversation starters** — the wizard follows up on interesting answers.

**Q8. When you make a mistake, how should your assistant handle it?**
- [ ] Direct correction — "That's wrong. Here's the fix." No sugar-coating.
- [ ] Gentle flag — "Heads up, this might not work because..."
- [ ] Ask first — "I noticed X — want me to explain or just fix it?"
- [ ] Other: ___

*Follow-up based on answer: "What about when I (the assistant) make a mistake?"*

**Q9. What's a strong opinion you hold about your work?** *(options as prompts)*

Examples to spark ideas — user picks one to riff on or writes their own:
- [ ] "Tests are more important than features"
- [ ] "Simple > clever, every time"
- [ ] "Move fast and fix things later"
- [ ] "Documentation is a first-class deliverable"
- [ ] "Premature abstraction is worse than duplication"
- [ ] "Design the API before writing the code"
- [ ] "Ship it, then iterate based on real feedback"
- [ ] Something else: ___

*Follow-up: "Why? What experience taught you that?"* — This surfaces the reasoning that makes SOUL.md authentic.

**Q10. How do people describe the way you communicate?** *(options as prompts)*
- [ ] Blunt — say what I mean, skip the preamble
- [ ] Thorough — cover all angles before concluding
- [ ] Visual — think in diagrams and examples
- [ ] Socratic — ask questions to drive understanding
- [ ] Structured — lists, headers, organized thinking
- [ ] Casual — informal, conversational, emoji-friendly
- [ ] Other: ___

*Follow-up: "Want your assistant to match that style or complement it?"*

**Q11. Show me an example of how you'd explain [user's domain from Q5] to a colleague.**
- Free text or skip
- This captures the user's actual voice for SOUL.md calibration

**Time:** 5-10 minutes (conversational, with follow-ups)

### Phase 4: Boundaries (2 min, optional)

Security and permissions. Multiple-choice with common defaults.

**Q12. What should your assistant never do without asking first?** *(multi-select)*
- [ ] Push code to remote repositories
- [ ] Delete files or data
- [ ] Send messages to external services (email, Slack, etc.)
- [ ] Make purchases or commit to spending
- [ ] Modify production systems
- [ ] Share personal information externally
- [ ] Run destructive commands (rm, drop, reset)
- [ ] Other: ___

**Q13. Any information that should never be logged or cached?**
- Free text (API keys, personal data categories, etc.)
- Default suggestion: "API keys, passwords, personal health/financial data"

**Q14. Spending limits?**
- [ ] No limits — I'll monitor costs myself
- [ ] Warn me above $X/day
- [ ] Hard stop above $X/day
- Skip for now

**Time:** ~2 minutes

### Phase 5: Review & Confirm (2 min)

Show generated files in a preview panel:
- **SOUL.md** — Agent personality, communication rules, behavioral constraints
- **USER.md** — User context, preferences, working style
- **IDENTITY.md** — Agent name, vibe, visual identity
- **AGENTS.md** — Security boundaries, permissions, limits

**Offer to:**
- Edit any section inline
- Regenerate a section with different answers
- Add more detail to any area
- Skip and come back later (files are always editable)

**Time:** ~2 minutes

### Total Time: ~10-15 minutes (Phases 1-2 required: ~5 min)

### Design Principles

1. **Multiple-choice over open-ended** — Concrete options prevent decision paralysis. Every question with potential blank-out has selectable options.
2. **"Other" escape hatch on everything** — Power users can always write custom answers.
3. **Selections map to rules** — Each checkbox directly generates a SOUL.md behavioral rule (see Q7 mapping above). No interpretation gap.
4. **Follow-ups on interesting threads** — The wizard is conversational, not a form. Good answers trigger deeper questions.
5. **Progressive disclosure** — Phase 1-2 required (~5 min), Phase 3-4 optional. Users can always come back.
6. **Show file paths** — After generation, show where files live so users know they can edit directly.
7. **Quality validation** — Before finalizing, check generated SOUL.md against the quality checklist (§9): specificity, authenticity, boundaries, voice.

---

## Sources

### Official Documentation

- [SOUL.md Template - OpenClaw](https://docs.openclaw.ai/reference/templates/SOUL)
- [USER.md Template - OpenClaw](https://docs.openclaw.ai/reference/templates/USER)
- [IDENTITY.md Template - OpenClaw](https://docs.openclaw.ai/reference/templates/IDENTITY)
- [Onboarding Wizard - OpenClaw](https://docs.openclaw.ai/start/wizard)
- [openclaw/openclaw SOUL.md template](https://github.com/openclaw/openclaw/blob/main/docs/reference/templates/SOUL.md)
- [openclaw/openclaw AGENTS.md](https://github.com/openclaw/openclaw/blob/main/AGENTS.md)

### Tools & Skills

- [GitHub - aaronjmars/soul.md](https://github.com/aaronjmars/soul.md) - Personality builder for AI agents
- [soul.md BUILD.md](https://github.com/aaronjmars/soul.md/blob/main/BUILD.md) - Interview questions and process
- [GitHub - kesslerio/soulcraft-openclaw-skill](https://github.com/kesslerio/soulcraft-openclaw-skill) - Guided conversation for SOUL.md creation
- [Soulcraft Skill on Skillsmp](https://skillsmp.com/skills/openclaw-skills-skills-kesslerio-soulcraft-skill-md)

### Community Examples

- [seedprod/openclaw-prompts-and-skills SOUL.md](https://github.com/seedprod/openclaw-prompts-and-skills/blob/main/SOUL.md)
- [seedprod/openclaw-prompts-and-skills USER.md](https://github.com/seedprod/openclaw-prompts-and-skills/blob/main/USER.md)
- [seedprod/openclaw-prompts-and-skills IDENTITY.md](https://github.com/seedprod/openclaw-prompts-and-skills/blob/main/IDENTITY.md)

### Guides & Tutorials

- [10 SOUL.md Practical Cases - Medium](https://alirezarezvani.medium.com/10-soul-md-practical-cases-in-a-guide-for-moltbot-clawdbot-defining-who-your-ai-chooses-to-be-dadff9b08fe2)
- [OpenClaw IDENTITY.md - Medium](https://alirezarezvani.medium.com/openclaw-moltbot-identity-md-how-i-built-professional-ai-personas-that-actually-work-c964a44001ab)
- [OpenClaw AGENTS.md Security - Medium](https://alirezarezvani.medium.com/agents-md-top-safety-rules-that-your-ai-assistant-openclaw-need-d50f95ce9e7c)
- [Create Your OpenClaw Soul Tutorial](https://openclawsoul.org/create-openclaw-soul.html)
- [24 Hours with OpenClaw - Substack](https://sparkryai.substack.com/p/24-hours-with-openclaw-the-ai-setup)
- [Introducing Sage: My Personal AI Assistant](https://www.anshuman.ai/posts/my-clawdbot-setup)
- [OpenClaw memory files explained](https://openclaw-setup.me/blog/openclaw-memory-files/)
- [OpenClaw and the Programmable Soul - Medium](https://duncsand.medium.com/openclaw-and-the-programmable-soul-2546c9c1782c)
- [SOUL.md Guide - CrewClaw](https://www.crewclaw.com/blog/soul-md-create-ai-agent)
- [soul.md pattern - Amir Brooks](https://amirbrooks.com.au/guides/soul-md-pattern-ai-agent-personality)
- [SOUL.md Best Practices - OpenClaw Experts](https://www.openclawexperts.io/blog/soul-md-best-practices)

### Setup Guides

- [How to Set Up Openclaw - Medium](https://medium.com/modelmind/how-to-set-up-clawdbot-step-by-step-guide-to-setup-a-personal-bot-3e7957ed2975)
- [OpenClaw Setup Guide - Habr](https://habr.com/en/articles/992720/)
- [OpenClaw Tutorial - Codecademy](https://www.codecademy.com/article/open-claw-tutorial-installation-to-first-chat-setup)
- [Openclaw Setup - Adven Boost](https://advenboost.com/en/openclaw-setup-fast-tutorial/)
- [How to Install OpenClaw on Mac - Medium](https://medium.com/@zilliz_learn/how-to-install-and-run-openclaw-previously-clawdbot-moltbot-on-mac-9cb6adb64eef)

### Twitter/X Posts

- [@aaronjmars on building SOUL.md from data](https://x.com/aaronjmars/status/2019487419402223955/photo/1)
- [@thekitze on OpenClaw pro tips](https://x.com/thekitze/status/2017931205946274183)
- [@iancr must-read OpenClaw testing](https://x.com/iancr/status/2019815217304334714)
- [@ayushtweetshere on impactful OpenClaw use](https://x.com/ayushtweetshere/status/2017780212042522692)
- [@VittoStack security-first OpenClaw setup](https://x.com/VittoStack/status/2018326274440073499)
- [@dabit3 on powerful OpenClaw setup](https://x.com/dabit3/status/2018029884430233903)

### Reference

- [What is OpenClaw - Milvus Blog](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md)
- [How OpenClaw Implements Agent Identity - MMNTM](https://www.mmntm.net/articles/openclaw-identity-architecture)
- [OpenClaw Mega Cheatsheet - Molt Founders](https://moltfounders.com/openclaw-mega-cheatsheet)
- [What is AI Agent Soul File - Chipp.ai](https://chipp.ai/ai/glossary/ai-agent-soul-file)

---

## Next Steps for Onyx Design

1. **Design conversational interview flow** based on Phase 3 questions above
2. **Create example SOUL.md templates** for different personality types (professional, friendly, technical, custom)
3. **Build iterative refinement system** that allows tweaking specific sections after initial generation
4. **Implement data ingestion option** (like soul.md project) for users with existing content
5. **Add quality validation** against the checklist above before finalizing files
6. **Create "import from OpenClaw" feature** for users who already have these files configured
7. **Design preview/test mode** where users can chat with generated personality before committing
