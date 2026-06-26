---
description: Generate weekly WAR report from normal work repos plus gcc_automation
argument-hint: "[extra instructions]"
---
Generate my weekly WAR report.

Use the war-report skill workflow, with this scope override:

- Scan the normal WAR repos exactly as the skill defines them: `CLAUDE_WAR_ROOT` when set, otherwise `C:\\Projects\\Work\\Gitlab\\`.
- Also include this work repo even though it is under GitHub: `C:\\Projects\\Work\\Github\\gcc_automation`.
- Do not include any other GitHub or personal repos.
- Use exact author email matching via the skill's `get-user-commits.py` helper for every repo, including the extra repo above.
- Write the output to `~/.claude/war/war-YYYY-MM-DD.md` using the skill's required format.
- Apply the normal filters, but do not exclude `gcc_automation` merely because it is GitHub-hosted.

Extra instructions from invocation, if any: $ARGUMENTS
