# QA Engineer Review

## Finding 1
severity: high
evidence: The plan allows source tests to pass from “bounded samples or local fixtures” and final validation accepts network smoke exiting 0 with skipped unavailable sources. This can pass with zero real external rows, so normalizers may only validate synthetic fixtures while the pipeline produces no useful candidates from the named datasets.
required_fix: Add a final gate requiring either at least one successful public-source network pull with nonzero candidates and summary counts, or an explicit blocked result that prevents archive when all sources are skipped.

## Finding 2
severity: high
evidence: T2 permits “at least three external sources can produce normalized candidate rows from bounded samples or local fixtures,” but does not require fixtures to mirror each real source schema. Tests could use hand-shaped rows that bypass dataset parsing failures.
required_fix: Require checked-in minimal raw fixtures captured from each supported source shape, with tests exercising raw-to-normalized parsing for three sources and failing on missing prompt/license/source fields.

## Finding 3
severity: medium
evidence: Several gates use `pytest -k curation`, but T1/T2/T3/T4 use selector names like `curation_schema`, `curation_sources`, etc. Pytest `-k` matches test names, not file intent; if tests are named differently, selectors can deselect everything and still exit 0.
required_fix: Require test files/classes/functions to include the selector tokens, and add validation that targeted commands collect at least one test, e.g. via named files or `--collect-only`/expected collection counts.

## Finding 4
severity: high
evidence: Output confinement checks only inspect `git status` for production data/model paths. That misses untracked writes outside the experiment directory, absolute-path traversal, symlink escapes, or writes to other sensitive repo paths.
required_fix: Add tests that run the CLI against a temp output dir and assert every created file is under that dir, rejects output paths inside production corpus/model paths, and fails on `..`/symlink escape attempts.

## Finding 5
severity: medium
evidence: The plan records router weak labels and conservative triage, but tests only require statuses/reasons/counts. A useless classifier path could auto-accept malformed prompts if superficial fields exist, and tests would pass without quality-oriented negative cases.
required_fix: Add regression fixtures for empty/truncated/ambiguous/security/refactor/debug prompts, low-confidence router output, and classifier failure; assert these cannot become `auto_accept_candidate` and `accepted_route` remains unset.
