# F1 manual validation

Manual validation required by the Validation Contract for live Windows Terminal branch behavior.

User-provided sanitized results on 2026-05-11:

- `/branch` opens a branched Windows Terminal session: pass (`branch works`).
- `/branch custom-name` opens a branched Windows Terminal session with custom title/name behavior: pass (confirmed yes).
- Branch independence marker appears only in the branched session: pass (confirmed yes).
- Unsupported-terminal fallback command resumes the branch: pass (confirmed yes).
- `/tasks help`, settings hidden-to-visible recovery, and `/team` migration guidance are discoverable: pass (confirmed yes).
- Subagent team/lead discovery or examples are visible to the operator: pass (confirmed yes).

Result: F1 manual validation complete with sanitized pass/fail evidence. No secrets or raw prompts recorded.
