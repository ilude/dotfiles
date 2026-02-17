# Rules Audit -- CLAUDE.md + Shared Instructions

## Files Analyzed

1. ~/.dotfiles/claude/CLAUDE.md -- Global rules (96 lines)
2. ~/.dotfiles/CLAUDE.md -- Project-level dotfiles rules (308 lines)
3. ~/.dotfiles/claude/shared/commit-instructions.md -- Commit workflow (57 lines)
4. ~/.dotfiles/claude/shared/do-this-instructions.md -- Task router (233 lines)
5. ~/.dotfiles/claude/shared/plan-with-team-instructions.md -- Team orchestration (218 lines)
6. ~/.dotfiles/claude/shared/research-instructions.md -- Research command (423 lines)
7. ~/.dotfiles/claude/shared/dig-into-instructions.md -- Background research (264 lines)
8. ~/.dotfiles/claude/shared/yt-instructions.md -- YouTube ingest (97 lines)
9. ~/.dotfiles/menos/.claude/CLAUDE.md -- menos project rules (49 lines, plus 6 auto-loaded rule files)

---

## Critical Issues (contradictions, paradoxes)

### Issue 1: ALWAYS ask vs Complete ALL steps without asking

- **File(s)**: claude/CLAUDE.md lines 16 and 37
- **Rule A**: "ALWAYS Ask, do not assume - Never guess or fill in blanks." (line 16)
- **Rule B**: "Complete ALL steps of clear-scope tasks without asking between steps" (line 37)
- **Problem**: These two rules directly conflict. "ALWAYS ask" is an absolute mandate, but "complete without asking between steps" is also an absolute mandate. The qualifier "clear-scope" is subjective. An agent facing ambiguity in step 3 of a 5-step task has contradictory guidance: ask (rule A) or keep going (rule B). Agents either (a) stop at every micro-decision seeking approval (annoying) or (b) barrel through making wrong assumptions (dangerous).
- **Suggested fix**: Replace the "ALWAYS Ask" rule with scoped guidance: "Ask when scope is unclear - When the task goal, target files, or approach is ambiguous, ask clarifying questions before starting. Once scope is confirmed and the task is clear, execute all steps without asking between them."

### Issue 2: 1-3-1 Rule vs commit/do-this auto-execution

- **File(s)**: claude/CLAUDE.md lines 18-21; shared/commit-instructions.md; shared/do-this-instructions.md
- **Rule A**: "1-3-1 Rule... Do not proceed implementing any option until I confirm." (CLAUDE.md)
- **Rule B**: Commit instructions auto-categorize and auto-stage files (commit-instructions.md line 34)
- **Rule C**: Do-this medium route: "No approval gate -- execute immediately." (do-this-instructions.md line 128)
- **Problem**: The 1-3-1 rule says "do not proceed until I confirm" but commit-instructions and do-this medium route both skip confirmation. The 1-3-1 rule has no scope boundary -- it reads as applying to ALL decisions.
- **Suggested fix**: Add scope: "1-3-1 Rule applies to ambiguous design/implementation decisions, NOT to routine execution within structured command workflows like /commit or /do-this."

### Issue 3: No proactive file creation vs do-this/plan-with-team creating .specs/ files

- **File(s)**: claude/CLAUDE.md line 5; shared/do-this-instructions.md line 134; shared/plan-with-team-instructions.md line 42; shared/dig-into-instructions.md line 53
- **Rule A**: "No proactive file creation - Only create files when explicitly requested" (CLAUDE.md)
- **Rule B-D**: do-this, plan-with-team, and dig-into all create .specs/ files as part of their workflow
- **Problem**: The "no proactive file creation" rule could block these commands from creating their plan/research files, even though the user invoked the command.
- **Suggested fix**: "No proactive file creation - Only create files when explicitly requested or when required by an invoked command/skill. Do not create helper files the user did not ask for."

### Issue 4: --no-verify in commit-instructions vs system prompt prohibition

- **File(s)**: shared/commit-instructions.md lines 4-9, 46; Claude Code system prompt
- **Rule A**: Commit instructions mandate --no-verify after running tests once (line 9)
- **Rule B**: System prompt says "NEVER skip hooks (--no-verify) unless the user explicitly requests it"
- **Problem**: Direct contradiction. Commit instructions mandate --no-verify; system prompt prohibits it.
- **Suggested fix**: Add a note in commit-instructions: "Note: This workflow intentionally uses --no-verify after pre-validating tests. This is authorized by the user and overrides the default system prohibition."

---

## Moderate Issues (ambiguities, overly broad)

### Issue 5: One at a time rule is ambiguous about scope

- **File(s)**: claude/CLAUDE.md lines 22-24
- **Rule**: "When working through multiple issues, present them one at a time."
- **Problem**: "Fix ALL errors and warnings" says fix them all, but "one at a time" says present them individually. Does this mean fix one, report, wait for approval, then fix the next?
- **Suggested fix**: "One at a time - When presenting multiple issues that each require a separate user decision, present them one at a time. This does NOT limit execution -- if the user asked you to fix all warnings, fix all of them, then report."

### Issue 6: AskUserQuestion guidance contradicts itself across files

- **File(s)**: claude/CLAUDE.md line 17; menos/.claude/CLAUDE.md line 20
- **Rule A (global)**: "AskUserQuestion - Use this tool only for simple, clearly understood questions."
- **Rule B (menos)**: "Default to AskUserQuestion when clarification is needed."
- **Problem**: Global restricts to "simple questions"; menos makes it the default for ALL clarifications.
- **Suggested fix**: Align them. Update global rule to match menos: "AskUserQuestion - Default tool for asking clarification questions."

### Issue 7: /research asks questions but /dig-into does not -- undocumented relationship

- **File(s)**: shared/research-instructions.md; shared/dig-into-instructions.md
- **Problem**: Undocumented -- when should a user use one vs the other?
- **Suggested fix**: Add a note: "/dig-into is quick/non-blocking (flags only). /research is interactive/tailored (asks questions first)."

### Issue 8: Verify before acting tension with automated workflows

- **File(s)**: claude/CLAUDE.md line 13; shared/do-this-instructions.md step 5b
- **Problem**: "Verify before acting" could block automated workflows that skip verification.
- **Suggested fix**: "Verify before acting applies to your own analysis -- structured commands have their own verification logic."

### Issue 9: Changelog requirement scope is unclear

- **File(s)**: claude/CLAUDE.md lines 84-96
- **Problem**: "skills, or commands" is ambiguous -- which files trigger a changelog entry?
- **Suggested fix**: Enumerate the specific file paths.

### Issue 10: TodoWrite vs TaskCreate terminology inconsistency

- **File(s)**: claude/CLAUDE.md lines 39-42
- **Problem**: References TodoWrite but the system provides TaskCreate/TaskUpdate/TaskList.
- **Suggested fix**: Update to match actual tool names.

---

## Minor Issues (style, clarity)

### Issue 11: Stale CLAUDE.md in system prompt vs updated file

- **Problem**: System prompt injects an older version of CLAUDE.md missing the "provenance" rule. Agents see both old and new versions.
- **Suggested fix**: Verify symlink and ensure only one version loads.

### Issue 12: python not python3 rule needs platform context

- **Problem**: Correct for Windows but not Linux/WSL. Since uv run is preferred, rarely applies.
- **Suggested fix**: Add platform context note.

### Issue 13: Light mode joke in Critical Rules section

- **Problem**: Sits alongside safety rules. Overly literal agent could refuse light mode configuration.
- **Suggested fix**: Move to Preferences section.

### Issue 14: commit-instructions auto-ignore could discard tracked files

- **Problem**: Auto-ignoring *.csv, *.tsv could affect legitimate tracked files. Modifies .gitignore without confirmation.
- **Suggested fix**: Move *.csv and *.tsv to "ask the user" category, or add: "only for files NOT already tracked by git."

---

## Cross-File Conflicts

### Conflict 1: menos clarification rule vs global AskUserQuestion rule
See Issue 6. Global restricts to "simple questions"; menos makes it the default for all clarifications.

### Conflict 2: System prompt commit rules vs custom commit-instructions
System prompt says "NEVER skip hooks"; commit-instructions says use --no-verify. See Issue 4.
**Suggested fix**: Add override note at top of commit-instructions.

### Conflict 3: do-this/plan-with-team create files vs no proactive file creation
See Issue 3.

### Conflict 4: Root cause analysis duplicated with slight differences
Both claude/CLAUDE.md and menos/.claude/CLAUDE.md have Root Cause Analysis sections. Minimal conflict but maintenance burden.

---

## Missing Guardrails

### Gap 1: No guidance on /do-this vs direct execution
Structured commands should only be used when explicitly invoked via slash command.

### Gap 2: No submodule boundaries in commit workflow
Submodule pointer changes should be committed separately with descriptive messages.

### Gap 3: No error recovery for web search failures in research commands
Should synthesize from training knowledge with a disclaimer when search tools are unavailable.

### Gap 4: No rule about skill auto-activation vs invocation
Document which skills auto-activate vs require explicit /skill-name.

### Gap 5: Team cleanup on orchestrator failure
Should attempt TeamDelete before exiting on unrecoverable failure.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Critical (contradictions/paradoxes) | 4 |
| Moderate (ambiguities/overly broad) | 6 |
| Minor (style/clarity) | 4 |
| Cross-file conflicts | 4 |
| Missing guardrails | 5 |
| **Total issues** | **23** |

## Priority Recommendations

1. **Fix Issue 1 first** (ALWAYS ask vs complete without asking) -- root cause of the most common agent misbehavior.
2. **Fix Issue 4 next** (--no-verify contradiction with system prompt) -- causes commit failures.
3. **Fix Issue 2** (1-3-1 scope) -- prevents unnecessary approval gates in automated workflows.
4. **Fix Issue 3** (no proactive file creation scope) -- prevents command workflows from being blocked.
5. **Fix Issue 10** (TodoWrite terminology) -- prevents agent confusion about which tools to use.
