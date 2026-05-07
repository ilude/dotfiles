# Standalone Readiness Blockers

Repair loop limit reached after two plan repair passes. Remaining concrete blockers from final standalone-readiness reviewer:

1. Final gate numbering/order is inconsistent.
   - Current checklist lists `F6` before `F5` to match the dependency graph, but the reviewer requires sequential gate numbering/order.
   - Required fix: renumber final gates consistently, e.g. `F5: Forward logging scope decision recorded` and `F6: Archive preflight complete`, and update Dependency Graph / Validation Contract references.

2. T1 session-log shape discovery remains too open-ended for redaction safety.
   - Current text says targeted grep/read of `$HOME/.pi/agent/sessions` and summarized notes, which can still lead a fresh executor to capture raw prompts/tool output.
   - Required fix: define an explicit redaction-safe wrapper/command that emits only JSON field names, event types, counts, and redacted skill names/paths, with no raw prompt/tool content.
