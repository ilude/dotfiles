# Mental Model Skill

Manage your expertise file — your personal knowledge base that grows across sessions.

## When to Read

**Always read your expertise file at task start**, before doing any work. It contains:
- System architecture you've already mapped
- Key files and their roles
- Patterns you've discovered
- Strong decisions with why they were made
- Open questions you were tracking

Load it first. It prevents re-discovering what you already know.

## When to Update

**Update your expertise file after completing work**, before ending the session. Add:
- New patterns discovered during this session
- Strong decisions made (always include `why_good`)
- Files you touched and their purpose
- Observations about system behavior
- Open questions you couldn't resolve

## Update Format

```yaml
strong_decisions:
  - decision: "chose X over Y"
    why_good: "specific reason this was the right call"
    session: SESSION_ID

patterns:
  - name: "pattern name"
    description: "what the pattern is and where it applies"

key_files:
  path/to/file.py:
    role: "what this file does"
    notes: "important details"
```

## Sequential Updates Only

Expertise files must be updated **one agent at a time**. Never run two agents that share an expertise file in parallel — simultaneous writes corrupt YAML. Wait for one agent to finish before starting the next.

## Growth Over Sessions

Session 1: Basic patterns discovered
Session 5: Growing context, team dynamics, file ownership
Session 10: Rich patterns, complex interactions, edge cases
Session 20+: Tribal knowledge — institutional wisdom

Each session builds on the last. The expertise file is how you become smarter, not just faster.
