# Standalone Readiness Review

- **blocker**: The `Secret/evidence scan` command can print secret-like matching diff lines via `grep -Ei`, violating the plan's own requirement that secrets must never appear in logs/review artifacts/validation output. Required fix: make the scan non-printing/redacted, e.g. use `grep -Eqi` and emit only a generic failure message plus instructions to inspect locally without printing matched content.
