# completeness-explicitness-review

## findings

### F1
- severity: high
- evidence: `T4` requires `pi.appendEntry("skill-load", data)` from `before_agent_start`, but the plan never specifies whether the hook fires before a session JSONL path/session id exists or whether `appendEntry` is legal during `before_agent_start`. `G1` says proceed unless typecheck/runtime smoke proves APIs unavailable, while `T4` success requires newest-session JSONL evidence. This leaves an untested lifecycle assumption that can pass typecheck and still fail to persist.
- required_fix: Add an explicit lifecycle verification gate before implementation: a disposable/control run must prove `before_agent_start` can call `pi.appendEntry` and that the resulting `skill-load` entry lands in the same/current session log. If not proven, stop for scope decision instead of relying on typecheck.

### F2
- severity: high
- evidence: The structured schema requires `content.timestamp`, but T4 says persist `timestamp` while the observed hook source is `event.systemPromptOptions.skills`; the plan does not define whether timestamp comes from the event, wall clock, session entry timestamp, or JSONL envelope. It also does not define precedence when payload timestamp and JSONL entry timestamp disagree.
- required_fix: Define a single timestamp source for `skill-load` events and parser windows. Prefer JSONL/envelope timestamp when available or a controlled `new Date().toISOString()` at append time; document conflict handling and add tests for payload/envelope disagreement.

### F3
- severity: medium
- evidence: `/skill-stats` argument behavior is incomplete. The plan defines defaults and single arguments (`60`, `90`, `all`) but not combinations, duplicate windows, zero/negative/decimal/non-numeric values, casing (`ALL`), excessive values, or ordering of displayed windows. Invalid args only produce a usage note, but the exact accepted grammar is not testable.
- required_fix: Specify the command grammar exactly, including allowed tokens, max window, case sensitivity, duplicate handling, sort order, and behavior for mixed valid/invalid args. Add fixture/smoke assertions for invalid and boundary arguments.

### F4
- severity: medium
- evidence: The report contract says tables include by skill, by evidence/source, and candidate/manual reads, but it does not define stable sort keys or tie-breaking. Without this, snapshots can be flaky across filesystem traversal order or object iteration order, and acceptance criteria cannot distinguish deterministic output from accidental order.
- required_fix: Define deterministic sorting for every table, e.g. descending count, then most recent timestamp, then normalized label ascending. Tests must assert order under ties and across multiple session files.

### F5
- severity: high
- evidence: The plan relies on scanning `$HOME/.pi/agent/sessions/**/*.jsonl`, but does not define error handling for unreadable files, concurrently appended JSONL, huge logs, symlink cycles, or partial trailing lines. Acceptance criteria only require malformed JSON/custom content handling, not filesystem/session traversal failure behavior.
- required_fix: Add traversal contract: ignore or count unreadable files with diagnostics, do not follow symlink loops, tolerate partial trailing lines, cap or stream large files without loading all sessions into memory, and include tests or smoke fixtures for unreadable/partial/concurrent-like files where feasible.
