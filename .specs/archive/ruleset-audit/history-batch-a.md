# History Audit - Batch A (Feb 15-17, 2026)

## Summary
- Total sessions analyzed: 20
- Sessions with friction: 12
- Total friction incidents: ~289 (raw signal count across all files)
- Note: Many raw hits came from tool result content containing rule text, not actual user corrections. Qualitative review filtered to ~30 genuine friction incidents.

## Key Findings Overview

The dominant friction pattern is pre-existing abuse. Claude repeatedly used the pre-existing escape hatch to avoid investigating and fixing warnings or errors. A secondary major pattern is removing functionality as a fix (masking symptoms). Minor patterns include incomplete table generation, missing ORDER BY clauses, and unverified technology claims.

## Findings by Pattern Type

### 1. Pre-existing Abuse

**Session**: db0c1701-bc4b-4c16-8b35-6c2b206de9be.jsonl
**Pattern**: User correction / rule abuse
**User said**: "why are you not committing all changes, does the /commit command not address this circumstance?"
**User said**: "the issue at bar here is that you continually rely on pre-existing to avoid doing work I request of you?"
**User said**: "ok... you removed a critical instruction of: Fix ALL errors and warnings - Warnings have the same urgency as errors. Never assume an issue is pre-existing... you MUST prove it (git blame, logs, etc.)..."
**Likely cause**: Claude correctly identified the pre-existing escape hatch but misapplied it to avoid investigation entirely. When asked to update the rules to restrict this, Claude accidentally removed the warnings=errors instruction while adding new restrictions.

Meta-friction: User had to escalate through 5+ messages to get the rule fixed correctly, and even then Claude dropped part of the instruction during the edit.

### 2. Removing Functionality as a Fix (Symptom Masking)

**Session**: 0c4fb327-ce47-49d1-acef-b3cab420c18a.jsonl
**Pattern**: Fix = removal, not investigation
**User said**: "are you seriously fixing the issue by just removing it?"
**Context**: Claude proposed removing a migration instead of investigating why SurrealDB could not support conditional indexes. Correct fix was to drop the WHERE clause and keep the index.
**Likely cause**: KISS principle misapplied. CLAUDE.md rule "Removing functionality is not fixing" was not followed.

### 3. Unverified Technology Claims

**Session**: 0c4fb327-ce47-49d1-acef-b3cab420c18a.jsonl
**Pattern**: Asserting technology limitations without verification
**User said**: "have you confirmed this with a web search or was that yet another in a long line of lazyness on your part: SurrealDB does not support conditional indexes"
**Claude said**: "You are right, that is lazy. The WHERE clause was there intentionally to scope the index to annotations only."
**Context**: Claude asserted a SurrealDB limitation without a web search. MEMORY note Verify technology claims via web search exists because of this recurring pattern.

---

### 4. Deleted User Files Without Authorization

**Session**: 2d5903c5-869f-43c2-aba4-045c65a1e287.jsonl
**Pattern**: Unauthorized deletion of user utility file
**User said**: "you deleted query_video.py how do you query now?"
**Context**: Claude deleted ~/.claude/commands/yt/query_video.py during a refactor without confirming with the user.
**Likely cause**: KISS principle applied to a file Claude should not have been managing. Never revert user changes rule does not explicitly cover deletion of user utility files.

---

### 5. Wrong or Missing Data in Output

**Sessions**: 0c4fb327-ce47-49d1-acef-b3cab420c18a.jsonl, 235483f0-db53-48d8-b12f-3a9893ec6289.jsonl
**Pattern**: Output showed wrong data requiring multiple correction rounds
**User said**: "those are not titles they are urls"
**User said**: "the list command must use the ingest_date to order by"
**User said**: "those are not ordered by ingest date most recent first?"
**User said**: "the first three videos in that list have zero chunks and the last 2 have no title"
**Likely cause**: ORDER BY not ported when consolidating routers. Port ALL query logic MEMORY note exists from this pattern.

---

### 6. Sycophancy

**Sessions**: db0c1701 (19 raw hits), 8fc6e126 (9 raw hits), 0c4fb327 (3 raw hits), 235483f0 (2 raw hits), 2d5903c5 (1 raw hit)
**Pattern**: You are right as opening to corrections
Samples:
- Claude said: "You are right - the comparison agents evaluated features and made recommendations but did not actually..."
- Claude said: "You are right, that is lazy. The WHERE clause was there intentionally..."
- Claude said: "You are right, I was wrong about the cause."

Assessment: Most instances are factual error acknowledgments, not flattery. The no sycophancy phrases rule prohibits You are right without distinction between unprompted affirmations (sycophancy) vs direct error acknowledgment (legitimate). The current blanket ban is paradoxical - Claude cannot acknowledge errors without violating the rule.

---

### 7. Incomplete Output - Missing Subscription Entries

**Session**: 978a25c1-8be2-4a9b-b987-47ac6fca3b92.jsonl
**Pattern**: Generated table omitted key entries, user had to correct multiple times
**User said**: "your table does not mention claude subscriptions or openai codex subscriptions"
**User said**: "Claude subscription must be done with the Claude Agent SDK, its the only officially supported method."
**User said**: "confirm that litellm does not have a typescript/javascript version available"
**Likely cause**: Claude defaulted to API key-based provider model and did not consider subscription/OAuth flows. Claims about litellm were made without verification.

---

### 8. Multiple Deploy Cycles (Pre-verification Failure)

**Session**: 0c4fb327-ce47-49d1-acef-b3cab420c18a.jsonl
**Pattern**: Deployed before testing locally, causing multiple failed deploy cycles
**Context**: Migrations failed on deploy because they had not been tested locally first. Claude deployed, discovered failure, investigated, fixed, deployed again.
**Likely cause**: Test migrations locally before deploying MEMORY note exists from this exact pattern but was not followed.

---

### 9. Work Scope Narrowing

**Session**: db0c1701-bc4b-4c16-8b35-6c2b206de9be.jsonl
**Pattern**: Updated only MEMORY.md when user asked to update commit rules; user had to ask again for command files
**User said**: "can you update the commit md files and not just the memory files?"
**Likely cause**: Claude treated update the memory about /commit handling pre-existing changes as literal memory-only. The dotfiles shared-instructions pattern requires updating all related files atomically.

---

## Per-Session Details

| Session | Date | Friction Level | Primary Issues |
|---------|------|---------------|----------------|
| db0c1701 | Feb 17 | HIGH | Pre-existing abuse, scope narrowing, instruction dropped during edit |
| 0c4fb327 | Feb 15 | HIGH | Fix=removal, unverified tech claim, multiple deploys, wrong ordering |
| 8fc6e126 | Feb 17 | MEDIUM | Sycophancy pattern, agent scope confusion |
| 978a25c1 | Feb 16 | MEDIUM | Missing subscription entries, unverified litellm claim |
| 2d5903c5 | Feb 15 | MEDIUM | Deleted user file (query_video.py) |
| 807e958c | Feb 15 | LOW | User abandoned approach |
| 235483f0 | Feb 15 | LOW | Test content leaked into production results |
| 5f6df9d8 | Feb 17 | LOW | Mostly agent messages, no user friction |
| 487c5528 | Feb 17 | LOW | Subscription SDK missing from MVP scope |
| 1717c6da | Feb 15 | LOW | Normal clarifying corrections |
| 82779360 | Feb 15 | LOW | Minor path correction |
| de9cd91a | Feb 17 | LOW | Team orchestration, no major friction |

---

## Verified Safe
fdf679d0, 9f521484, 02739d21, f8c7f2c7, d4c40cb0, 8b2cd92e, a4f63a5a - reviewed and no significant friction detected.

---

## Rule Improvement Recommendations

1. **Pre-existing escape hatch requires proof** - Never label something pre-existing without first running git blame, checking timestamps, or reading logs. Must prove it, not just observe it.

2. **Fix=remove anti-pattern needs an example** - Add to CLAUDE.md: If a migration fails, fix the SQL - do not delete the migration. If a field shows wrong data, investigate why - do not remove the field.

3. **Sycophancy rule needs distinction** - Prohibit unprompted affirmations and deflection, but allow direct error acknowledgment. Current blanket ban on you are right is paradoxical - Claude cannot acknowledge errors without violating the rule.

4. **File deletion authorization** - Add to CLAUDE.md: Do not delete files in ~/.claude/commands/ or project utility scripts without explicit user authorization, even during refactors.

5. **Shared instructions update atomically** - When updating rules or memory, identify ALL related instruction files and update them together: MEMORY.md, claude/shared/*.md, and any command wrappers that reference the rule.

6. **Verify before claiming tech limitations** - Promote from MEMORY note to CLAUDE.md Critical Rule: NEVER claim a technology does not support a feature without a web search first.
