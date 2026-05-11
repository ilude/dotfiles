# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---------|----------|-------------------------|-------------|------------------|
| Ambiguous install entrypoint/package managers | Bug | Objective, Automation Plan, T2, Success Criteria | Reduce v1 to optional runtime helper; avoid editing global install flows; specify npx smoke only and no durable install unless later reviewed | Rename T2 to optional availability/helper support; preserve unchecked item |
| Scope too broad | Bug | Objective, Task Breakdown, Execution Waves, Validation Contract | Narrow v1 to wrapper + one canonical Pi doc; defer global install hooks and pi-agent-browser-native | Update task descriptions, no new checklist item |
| Brave-vs-Chrome verification gap | Bug | T3, V2, Success Criteria | Require CDP/process/executable/user-data-dir checks proving Brave target | Preserve T3/V2 unchecked |
| Real-profile confirmation missing | Bug | Constraints, T3, Manual validation, Handoff Notes | Define exact typed confirmation, non-interactive abort, safe flag names | Preserve T3/manual final gate unchecked |
| Cleanup/session state unspecified | Bug | Constraints, T3, V2, Success Criteria | Define state path/schema, PID/start-time/command-line validation, stale handling, no broad kills | Preserve T3/V2 unchecked |
| Fixed CDP port default | Bug | Constraints, T3, Handoff Notes | Use ephemeral loopback port by default; 9222 only explicit override/test note | Preserve T3 unchecked |
| Evidence/archive sensitive data risk | Bug | Automation Plan, Validation Contract, Handoff Notes | Add redaction/minimal evidence rules; no raw authenticated snapshots/screenshots archived by default | Preserve final gates unchecked |
| Missing Execution Status | Bug | End of plan | Add `## Execution Status` section | Add no checklist item |
| Homebrew/global install unverified | Hardening | T2, Alternatives, Automation Plan | Move install hooks behind discovery/future task; no Brewfile edit in v1 | Preserve T2 unchecked |
| npx transient version drift | Hardening | Constraints, T2, Validation Contract | Treat npx as smoke/discovery only; if durable install added later, pin version/range | Preserve T2 unchecked |
| Platform support matrix missing | Hardening | Constraints, T3 | Add matrix for Git Bash/MSYS2, PowerShell, macOS, Linux, WSL | Preserve T3 unchecked |
| Pi extension scope unclear | Hardening | T1, T4, V3 | Make Pi docs/skills only; pi/extensions out of scope unless new reviewed task | Preserve T4 unchecked |
| Grep-only docs validation weak | Hardening | T5, V3 | Require targeted canonical-doc check and absence of conflicting recipes | Preserve T5 unchecked |
| X extraction fixture hardening | Hardening | T4, T5 | If timeline extraction guidance exists, add fixture/unit validation; otherwise mark out of scope | Preserve T4/T5 unchecked |
