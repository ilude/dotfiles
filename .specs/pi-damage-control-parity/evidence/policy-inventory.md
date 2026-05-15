# Damage-Control Policy Inventory
| Area | Claude | Pi |
|---|---:|---:|
| Bash command rules | 352 | 22 |
| Ask command rules | 241 | 3 |
| Block command rules | 111 | 19 |
| zeroAccessPaths | 21 | 6 |
| zeroAccessExclusions | 68 | 0 |
| writeConfirmPaths | 9 | 0 |
| readOnlyPaths | 47 | 0 |
| noDeletePaths | 30 | 4 |
| contentScanPaths | 7 | 0 |
| injectionPatterns | 19 | 0 |

## Distinct keys observed in bashToolPatterns entries
- `ask` (241)
- `exfil` (24)
- `pattern` (352)
- `platforms` (6)
- `reason` (352)

## Key classification
- `ask`: supported-semantic
- `exfil`: deferred (excluded from Phase A parity claims)
- `pattern`: supported-semantic
- `platforms`: supported-semantic
- `reason`: supported-metadata
