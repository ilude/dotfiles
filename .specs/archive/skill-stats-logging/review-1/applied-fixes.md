# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Forward logging required/optional contradiction | Bug | Context, Objective, Execution Waves, Success Criteria, Validation Contract, Execution Status | Add explicit T1 decision gate: forward logging requires proven durable hook; otherwise pause for user scope approval and do not archive as complete | No new task ID; clarify T1/T4/F gates |
| Ambiguous `.pi` and runtime paths | Bug | Constraints, Automation Plan, T1 | Replace ambiguous greps with exact `pi/` and `$HOME/.pi/agent/sessions`; require path existence recording | No checklist count change |
| Top-level test auto-discovery hazard | Bug | Constraints, T5, Validation Contract | Forbid `pi/extensions/*.test.ts`; require tests under `pi/tests/` or non-autodiscovered fixture path with exact command | No checklist count change |
| Missing de-duplication key/count matrix | Bug | T2, T5, Success Criteria | Define key `{sessionFile, turnIdOrLine, skill}` and exact fixture matrix; structured suppresses weaker same-turn evidence | No checklist count change |
| Unsafe rollback/archive and no Execution Status | Bug | Automation Plan, Validation Contract, new Execution Status | Add owned-file preflight, exact rollback guidance, secret-like file check, durable status section | Add no executable task; F5 covers archive preflight |
| Missing durable evidence paths | Hardening | Automation Plan, Validation Contract, Handoff Notes | Define `.specs/skill-stats-logging/evidence/*.txt` artifacts and checklist evidence update requirement | No checklist count change |
| Session evidence redaction | Hardening | Constraints, T1, Validation Contract | Require summarized/redacted evidence only; no raw prompts/tool outputs/skill content/tokens/private paths | No checklist count change |
| Event payload minimization | Hardening | T2, T4 | Limit structured event fields to skill/source/normalized paths/timestamp/session metadata only | No checklist count change |
| `SKILL.md` reads misleading as usage | Hardening | Objective, T2/T3/T5 | Exclude manual reads from default ranking; show separate candidate/manual reads section | No checklist count change |
| Manual validation pollution | Hardening | Manual validation | Prefer automated harness; if manual, use disposable session and capture exact JSONL event/output evidence | No checklist count change |
| Lead-like task agents in plan | Hardening | Task Breakdown, Execution Waves | Replace `planning-lead`/`validation-lead`/unknown task agents with worker/domain agents | No checklist count change |
