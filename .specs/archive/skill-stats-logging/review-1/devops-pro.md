## Finding 1
severity: high
evidence: T1 verify command uses `grep ... -n pi .pi 2>/dev/null`; in this repo `.pi` is not a documented project path, while session/runtime state is under `~/.pi`. A fresh Git Bash/MSYS2 executor will silently ignore missing `.pi` due stderr redirection and may miss the actual skill/session extension points.
required_fix: Replace `.pi` with explicit portable paths (`pi`, `$HOME/.pi` where runtime inspection is intended) and require recording whether each path exists before grepping.

## Finding 2
severity: high
evidence: Rollback is `git checkout -- pi/extensions <other touched files>`. This is destructive to any pre-existing unstaged user changes in those paths and `<other touched files>` is not executable. It also provides no pre-change snapshot or owned-file list.
required_fix: Add preflight `git status --short` capture, abort/escalate on pre-existing changes in target paths, write an owned files list, and rollback only those files with exact paths or via a generated patch/stash created by the executor.

## Finding 3
severity: medium
evidence: Evidence is specified as “terminal output captured in `/do-it` notes” and checklist `Evidence: --`, but no durable evidence directory/file names are defined under `.specs/skill-stats-logging/`. Archive gates require proof, yet a fresh agent has no path to write typecheck, smoke, `make check`, manual validation, or JSONL excerpts.
required_fix: Define generated evidence artifacts, e.g. `.specs/skill-stats-logging/evidence/{preflight,typecheck,smoke,make-check,manual}.txt`, and require each gate to update checklist evidence with those paths.

## Finding 4
severity: medium
evidence: T1 says “ask the user only if no durable forward-logging path exists and an upstream Pi change is required,” while Success Criteria allow “implemented or precise upstream limitation documented.” This can block `/do-it` unnecessarily in non-interactive execution even though a documented limitation is an accepted outcome.
required_fix: Make the non-interactive boundary explicit: do not ask unless user approval is needed to expand scope; otherwise document the upstream limitation, continue best-effort `/skill-stats`, and mark manual/forward-logging status accordingly.

## Finding 5
severity: medium
evidence: Manual validation requires running `/skill-stats all` and `/skill:docs...` in a Pi session, but the plan does not define how to capture success without triggering LLM turns or where to store screenshots/log snippets. It also says do not archive if manual validation is required and not confirmed, but no status section exists.
required_fix: Add exact manual evidence capture steps using session JSONL paths or copied output, and add an `## Execution Status` section with allowed states including `implemented-awaiting-manual-validation`.
