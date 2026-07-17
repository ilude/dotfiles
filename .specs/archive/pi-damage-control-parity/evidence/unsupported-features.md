# Unsupported / Deferred Features

- Implemented: Claude `bashToolPatterns` loader/normalizer for non-`exfil` Bash rules; Phase B path/write sections mapped to Pi read/write/edit checks.
- Deferred: `exfil` semantics, semantic git analysis, AST bash analysis, dry-run/context relaxation, readonly search relaxation, allowed-host exfil bypass, taint/sequence detection, post-tool secret-output detection.
- Claim boundary: this change does not claim full Claude damage-control parity; it claims bounded command/path/write parity for the implemented surfaces only.
