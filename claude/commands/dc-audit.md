---
description: "Generate the shared damage-control noise/signal report"
---

Run this deterministic proposer exactly once:

```bash
python ~/.dotfiles/shared/damage-control/audit.py
```

Return the emitted report path and summarize the narrow/allowlist,
strengthen/add, and retire candidate counts. Do not edit policy or apply any
proposal.
