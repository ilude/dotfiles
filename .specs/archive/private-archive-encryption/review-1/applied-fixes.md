# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Missing Execution Status | Bug | Add `## Execution Status` | Add initial status and evidence/update rules | Add no checklist item; status section only |
| Lead/pseudo agent names | Bug | Task Breakdown, Execution Waves | Replace with actual worker agents and persona labels | No ID change |
| age may skip | Bug | Automation Plan, Validation Contract, Handoff Notes | Make age/age-keygen hard prerequisites for completion | No ID change |
| multi-path check-ignore false positives | Bug | T1, Success Criteria | Replace with loop/per-path checks | No ID change |
| missing .gitattributes binary/no-diff validation | Bug | T1 | Add attr acceptance criterion | No new task; T1 criteria expanded |
| unsafe tar extraction | Bug | T2, T4 | Require safe member validation and malicious tar tests | No new task; T2/T4 criteria expanded |
| atomic writes/backups | Bug | T2, T3 | Require atomic replace and backup/refusal on overwrite | No new task |
| real Git conflict fixture | Bug | T3, T4 | Require temp repo merge conflict with stages 1/2/3 | No new task |
| hook install validation | Bug | T1 | Add temp repo hook installer acceptance criterion | No new task |
| hidden manual conflict resolution | Bug | T3, Risk, Validation Contract | Clarify fixture-only automation and real private runs outside plan | No new task |
| inventory/taxonomy missing | Hardening | Add T0 in checklist, Task Breakdown, Wave 1, dependency graph | Add private data inventory/report task before PRD | Add T0 checklist item |
| status/preflight missing | Hardening | T2, Success Criteria | Add `private-archive-status` or `--check` mode | No new task |
| x-private compatibility ambiguous | Hardening | T2 | Make wrapper/deprecation decision mandatory | No new task |
| temp plaintext under repo | Hardening | T2/T3 | Require OS temp outside repo, restrictive perms, no content logs | No new task |
| scanner blocklist variants | Hardening | T1 | Expand scanner criteria to archive/temp variants | No new task |
| track archive decision unclear | Hardening | Constraints, Objective, T5 | Document `private.tar.age` tracked-by-default retention tradeoff | No new task |
| py_compile not via uv | Hardening | V1 | Use `uv run python -m py_compile` | No new task |
