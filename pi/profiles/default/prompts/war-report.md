---
description: Generate weekly WAR report from normal work repos plus gcc_automation
argument-hint: "[extra instructions]"
---
Generate my weekly WAR report.

Use the war-report skill workflow, with this scope override:

- Scan the normal WAR repos exactly as the skill defines them under `C:\\Projects\\Work\\Gitlab\\`.
- Also include this work repo even though it is under GitHub: `C:\\Projects\\Work\\Github\\gcc_automation`.
- Do not include any other GitHub or personal repos.
- Use exact author email matching via the skill's `get-user-commits.py` helper for every repo, including the extra repo above.
- Resolve the output directory from `WAR_ROOT`, then `CLAUDE_WAR_ROOT`, then `~/.claude/war`, and write `war-YYYY-MM-DD.md` there using the skill's required format.
- Apply the normal filters, but do not exclude `gcc_automation` merely because it is GitHub-hosted.

Write for the government contracting officer reviewing contract progress:

- Describe contract outcomes, readiness, risk reduction, or operational value rather than implementation activity.
- Make it clear that this work supports the local development, staging, and testing environments. Use concise wording such as "local environments" after establishing that context.
- Consolidate related commits across repositories into 3-5 entries for the week, normally no more than one entry per active day.
- Keep each entry to one short sentence, ideally under 20 words.
- Retain program or system names needed for context, but omit low-level engineering terminology, internal mechanics, and unnecessary acronyms.
- Do not merely restate commit subjects.
- After writing the file, include the complete report text in the response, followed by its saved path. Do not respond with only a completion notice or path.

Extra instructions from invocation, if any: $ARGUMENTS
