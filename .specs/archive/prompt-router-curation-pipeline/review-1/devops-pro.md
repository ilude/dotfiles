# DevOps Review: Prompt Router Curation Pipeline Plan

## Finding 1
severity: high
evidence: Plan says generated raw pulls/caches/scored rows should be ignored, and output goes under `pi/prompt-routing/experiments/curation/`. Repository checks found no matching `.gitignore` coverage for `experiments` or `curation`; `pi/prompt-routing` has no project `.gitignore` except `.venv/.gitignore`. Generated prompt rows could be accidentally tracked.
required_fix: Add an explicit ignore policy before any pull/run task, e.g. ignore `pi/prompt-routing/experiments/curation/**` while allowing only intentional tracked docs/config if needed. Add validation that `git status --short -- pi/prompt-routing/experiments/curation` does not show raw/cache/jsonl outputs after smoke runs.

## Finding 2
severity: high
evidence: The plan permits `--output-dir` from CLI and requires writes only under experiments, but acceptance checks only inspect production corpus/model paths after runs. A malicious or mistaken `--output-dir ../../...` could write outside the experiment tree without being caught.
required_fix: Require path canonicalization and refusal unless the resolved output directory is under `pi/prompt-routing/experiments/curation/`. Add tests for traversal, absolute external paths, symlink escapes if supported, and pre-existing file collisions.

## Finding 3
severity: medium
evidence: Network handling says unavailable/gated sources are skipped, but the automation commands use live public network pulls and the final smoke allows exit 0 with skipped sources. This can pass with zero candidates if all sources fail, producing weak evidence that the pipeline works.
required_fix: Split validation into deterministic fixture mode plus network smoke. Require fixture mode to produce candidates for at least three source normalizers. For network smoke, require per-source timeout, explicit failure reason, and a summary gate: either at least one public source produced candidates or the run is marked network-blocked, not successful.

## Finding 4
severity: medium
evidence: Summary report acceptance allows examples or hashes, but raw prompts and scored candidate rows are generated locally. The plan does not require prompt redaction, size limits, or a safe summary format before archive.
required_fix: Require `summary.md/json` to avoid raw prompt text by default and include stable row IDs/hashes plus counts/reasons. Add a test asserting summaries do not include full prompt fields, while JSONL candidate files remain ignored and confined to the experiment output directory.

## Finding 5
severity: medium
evidence: Rollback only covers `git restore` for changed source paths if explicitly requested. Generated experiment directories, caches, and partial pulls are not covered, and destructive cleanup is deferred without an explicit non-destructive cleanup command.
required_fix: Add a documented cleanup command that removes only validated run directories under `pi/prompt-routing/experiments/curation/`, with a dry-run/list mode. Archive preflight should record generated run directories and confirm no ignored outputs remain outside the allowed experiment tree.
