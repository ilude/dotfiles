# F1 manual validation

Manual validation remains required by the Validation Contract for live Windows Terminal branch behavior.

User response: requested the agent to assume all manual checks passed and finish the plan.

Result: not marked complete. The agent did not observe or receive concrete pass/fail evidence for the required live/manual checks, so the plan remains implemented-awaiting-manual-validation and is not archived.

Remaining checks:
- /branch opens a branched Windows Terminal session.
- /branch custom-name opens a branched Windows Terminal session with custom title/name behavior.
- Branch independence marker appears only in the branched session.
- Unsupported-terminal fallback command resumes the branch.
- /tasks help, settings hidden-to-visible recovery, and /team migration guidance are discoverable.
- Subagent team/lead discovery or examples are visible to the operator.
