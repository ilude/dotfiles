# Product Manager Review: Simplicity / Scope

## Findings

### 1. Severity: High — Objective couples a simple reporting command to uncertain forward instrumentation
- **Evidence:** The user asks for `/skill-stats` plus durable logging, but the plan makes completion depend on proving and potentially implementing a durable skill-load hook that may not exist outside `node_modules` (`Objective`, `T1`, `T4`, `Success Criteria #2`). This turns a user-visible command into a possibly blocked upstream/runtime architecture task.
- **Required fix:** Split the deliverable into two explicit phases: Phase 1 ships `/skill-stats` using historical/best-effort parsing plus structured-event parser support; Phase 2 is a separate decision/plan for forward logging if T1 proves a local durable hook. Make best-effort-only an acceptable Phase 1 completion state without requiring a mid-execution user approval unless the user explicitly restates forward logging as must-have for this iteration.

### 2. Severity: Medium — Test fixture matrix is larger than needed for first value
- **Evidence:** T5 requires fixtures for structured event, `<skill name>`, `/skill:name`, candidate `SKILL.md` read, duplicate same-turn evidence, duplicate structured event, malformed custom content, missing skill field, and unknown source. This is comprehensive but heavy for a local stats command whose historical signals are explicitly approximate.
- **Required fix:** Reduce required tests to the minimum correctness risks: one structured event, one explicit `/skill:name`, one manual `SKILL.md` read excluded from totals, one duplicate de-dupe case, and one malformed record skip. Move expanded `<skill name>`, duplicate structured event, missing skill field, and unknown source to optional follow-up coverage unless implementation complexity already makes them trivial.

### 3. Severity: Medium — Report scope risks becoming a dashboard instead of a command
- **Evidence:** T2 requires windows `1/7/30`, optional `60`, `90`, `all`, tables by skill, by evidence/source, separate candidate/manual reads, generated timestamp, and session path. Combined with multiple evidence types, this can overproduce output and obscure the main answer.
- **Required fix:** Define a smallest default report: top skills for `7` and `30` days, evidence caveat, and candidate/manual reads only when present. Support extra windows via arguments if simple, but do not require all windows/sections for initial acceptance.

### 4. Severity: Low — Validation burden may be disproportionate to a small extension
- **Evidence:** The plan requires Pi typecheck, skill tests/smoke, `git diff --check`, forbidden-path scan, `make check`, archive preflight, and optional manual validation. For a single local Pi extension, repo-wide `make check` can introduce unrelated failures and slow iteration.
- **Required fix:** Make task-specific validation the blocking gate (`pnpm run typecheck` plus parser/report smoke). Keep `make check` as best-effort/recommended, not mandatory for declaring the feature implemented, unless changed files cross repo-wide Python/shell surfaces.

### 5. Severity: Low — Evidence artifacts may create process churn without improving product outcome
- **Evidence:** P1/P2 and the automation plan require multiple `.specs/.../evidence/*.txt` files before implementation, including owned-file lists, preflight status, discovery, diffs, rollback, archive files. This is useful for regulated changes but heavy for a local command.
- **Required fix:** Collapse evidence requirements to three artifacts: `discovery.md`, `validation.txt`, and `implementation.diff` if needed. Keep owned-file safety as an in-memory/status check unless pre-existing conflicts are found.
