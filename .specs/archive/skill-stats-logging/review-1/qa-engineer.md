## Finding 1
severity: high
evidence: T2 only says define precedence, and T5 only requires “expected skill names and counts appear.” There is no exact de-duplication key or expected count matrix for one session containing `customType: skill-load`, `<skill name=...>`, `/skill:name`, and `SKILL.md` read for the same skill. A parser can pass while double-counting one load across all signals.
required_fix: Add fixture cases with exact expected per-skill/per-source counts and explicit de-dupe rules, e.g. structured event suppresses weaker same-skill evidence in the same session/turn or defined time window.

## Finding 2
severity: high
evidence: The plan’s session-shape discovery accepts grep notes, and T5 allows synthetic fixtures “based on known Pi message shapes.” No acceptance criterion requires real JSONL examples for assistant tool calls, tool results, custom messages, and user messages. Tests can falsely pass against invented shapes while missing historical logs.
required_fix: Require at least one checked-in anonymized/minimized fixture for each real observed JSONL shape, or document exact real fields from sampled logs and mirror them byte-for-byte in synthetic fixtures.

## Finding 3
severity: medium
evidence: T5’s test command is not specified. `pi/extensions/package.json` has only `typecheck`; Vitest exists under `pi/tests`. The plan permits “a lightweight script documented in comments,” which gives no stable CI command or expected output.
required_fix: Define the exact regression command before implementation, preferably `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- skill-stats`, plus expected fixture output/count assertions. If using a script, add a package script and exact command.

## Finding 4
severity: medium
evidence: The parser contract says it must tolerate custom event content as JSON object or string, but acceptance tests do not require malformed JSON strings, missing fields, unknown `source`, or duplicate structured events. A brittle parser can pass happy-path fixtures and break on ambiguous historical JSONL.
required_fix: Add negative/edge fixtures asserting invalid custom content is skipped with no crash, missing skill/filePath handling is deterministic, and duplicate structured events do not inflate counts.

## Finding 5
severity: medium
evidence: Manual validation requires `/skill:docs test skill logging`, but no expected JSONL record path/content is specified after the command. The report could show `docs` via best-effort fallback while forward structured logging silently fails.
required_fix: Add a manual/automated check that greps the newest session JSONL for the exact `customType` and fields, e.g. `skill`, `source`, `filePath`, `timestamp`, before accepting forward logging.
