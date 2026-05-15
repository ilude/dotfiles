# Scope Contract

- Phase A: load Claude `bashToolPatterns` as canonical Bash policy when available; normalize `pattern`, strict boolean `ask`, `reason`, `platforms`, and `exclude_platforms`. `exfil` is counted and excluded from all-pattern parity claims until equivalent exfil behavior exists.
- Phase B: support `zeroAccessPaths`, `zeroAccessExclusions`, `readOnlyPaths`, `noDeletePaths`, `writeConfirmPaths`, `contentScanPaths`, and `injectionPatterns` for Pi read/write/edit/delete/content-scan decisions.
- Phase C: semantic git, AST bash, dry-run/context relaxation, readonly search relaxation, allowed-host exfil bypass, taint/sequence detection, and post-tool secret-output detection are deferred. Do not claim full Claude parity unless implemented and tested.
