# Known Blocker Fixes

- Source blocker file: `.specs/damage-control-modes/review-1/standalone-readiness-blockers.md`
- Blocker addressed: no-secret evidence gate could produce a zero-byte clean result while Success Criteria required `test -s`.
- Sections edited: Automation Plan, V2 validation gate, Success Criteria, Validation Contract.
- Fix intent: make the no-secret check write to a temp file, then always write a non-empty sentinel/log to `.specs/damage-control-modes/evidence/no-secret-check.txt`.
- Intentionally not applied: none.
