---
description: "Pre-approve a damage-control ask pattern for the current session"
argument-hint: "<command>"
---

The user wants to pre-approve a command so damage-control won't prompt for it again this session.

Run the dc-allow helper script with the user's argument:

```bash
python ~/.claude/hooks/damage-control/dc-allow.py $ARGUMENTS
```

Report the result. If successful, explain that the pattern is now approved for this session and matching commands will auto-allow without prompting.
