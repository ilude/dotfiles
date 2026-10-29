# Quiet commits

`/commit` runs the private Git workflow directly from its command handler. `/commit push` also requests publication. F10 invokes `/commit`; F9 invokes `/commit push`. These are operator conveniences, not the route for ordinary conversational commit or push requests, which the main agent handles with Git through Bash.

There is no main-agent commit tool, tool discovery, hidden commit prompt, or model-selected dispatch. The command calls the in-memory Luna runner directly. `/bro` remains prompt-backed. Legacy is unchanged.

## What you see

- The command invocation and Pi's standard animated loader above the editor, with phase messages for waiting, inventory, model resolution, review, plan validation, execution, and result collection. It stays non-modal so ignore questions work, and stops on completion, failure, or cancellation. RPC uses status text instead.
- Ignore questions for new files likely to belong in `.gitignore`, with `Include in commit`, `Add to .gitignore`, and `Leave untracked` choices. Questions happen after staging. Adding a rule updates and stages that repository's `.gitignore` and unstages the candidate without deleting its working copy. Leave untracked also unstages it; Include keeps it eligible. A filename containing `.local` alone does not require a question. Cancelling the question stops the workflow.
- Brief retry progress for transient model-response failures. Routine inspection errors are returned to Luna for correction. Terminal provider failures, failed Git/ignore mutations, hooks, cancellation, and deadlines show an error and actual Git state. Successful commits are not undone.
- One displayed completion entry containing actual short hashes and commit subjects, plus `Pushed` only when Git confirms publication and the workflow is complete. Remaining changes, skipped files with their reasons, preserved index references, or errors appear when present. If nothing was committed, the result says so. The same outcome is persisted in model context without starting an extra turn, so the main model can explain failures on your next message. It is not asked to present the result or repeat Git work.

The command waits for an active main-agent turn to finish before starting Git work. Shortcuts use the same idle boundary rather than rejecting busy input. Escape cancels a waiting or running command; session shutdown also cancels it. Existing ignore dialogs retain their normal Escape behavior. Temporary progress and input listeners are cleared after completion, failure, or cancellation.

## Review and execution

The AI proposes a structured commit plan. Runner code stages, validates, executes, verifies, and publishes it. The AI reviews staged diffs and repository instructions, chooses related whole-file groups and subjects, and gives concrete reasons for exclusions. Groups and messages need no approval. Unclear grouping defaults to one sensible commit. Tracked feedback records are ordinary eligible changes; a record's lack of independent commit authority does not override `/commit`.

Before review, code preserves sole index-only content in a retained Git stash when staging would overwrite it. It uses `git stash create` and `git stash store`, constructing an equivalent index snapshot when Git omits submodule-only changes. The retained reference is reported, not applied or dropped. Code runs `git add -A`, respecting normal ignores, applies the fixed settings policy, and stages required child gitlinks. Outside the dotfiles repository, the settings policy adds the exact `.pi/settings.json` path to the repository's `.gitignore`, unstages that settings file, and stages `.gitignore`.

Normal review tools are `submit_commit_plan`, read-only `inspect`, `read`, and `ask_ignore`. There is no normal mutation `bash` or `publish_repository` tool. `ask_ignore` accepts only staged new files, not tracked modifications. Code applies the answer; resulting status and `.gitignore` changes feed plan validation.

The plan has this shape:

```text
{ repo, commits: [{ subject, paths: string[] }], exclusions: [{ path, reason }] }
```

Paths are repository-relative and must match current Git status. Every changed path, including staged gitlinks, must appear exactly once in a commit or an exclusion. Rename endpoints must stay in the same commit or both be excluded. Code rejects missing, unknown, duplicate, empty, absolute, or parent-traversal paths, unresolved conflicts, empty groups, invalid subjects, and exclusions without reasons. Subjects must be trimmed, nonempty single lines. An empty commit list is valid only if every changed path is excluded or the repository is clean.

Validation returns specific errors to the same agent. It allows the initial proposal and two corrections, then stops with the last errors. No part of an invalid plan is committed. Ending review without submitting a valid plan fails when changes remain; a clean repository may finish without a plan as a no-op.

For an accepted plan, code builds each group's index from the reviewed staged contents, leaving exclusions unstaged and preserving working contents. It commits with normal hooks, verifies that HEAD advanced, and checks that the resulting commit contains exactly the reviewed paths. A Git error or hook failure stops that repository and dependent parents. Any unfinished eligible changes, including files changed by hooks, prevent success and publication. Only applicable unstaged exclusions may remain. Final result collection also checks for unfinished work. There is no rollback or atomic transaction; actual earlier commits and publication outcomes remain reported after a later failure.

## Repositories and publication

Code selects initialized repositories deepest-first for scoped passes in the same private agent. Children finish review, commits, and requested publication before the parent's pass. The runner compares immediate child HEADs with the parent's committed gitlinks and stages required pointer updates for the AI to include in the parent plan. It does not commit unreviewed pins. Distinct index-only/conflicted gitlinks, explicit exclusions, and staged submodule removals/replacements are respected. Local child and parent-pin commits require neither pulling nor publication. Detached repositories remain eligible for local commits but are silently skipped for publication.

Bare `/commit` performs no publication-related branch, upstream, outgoing, remote, or push checks. `/commit push` captures its push choice directly from the command arguments. After a successful repository pass, code checks outgoing commits and publishes attached repositories that need it, including otherwise clean children with outgoing commits. Children publish before parents.

Code runs `git pull --no-rebase --ff origin <own-branch>` before `git push --recurse-submodules=no origin HEAD:refs/heads/<own-branch>`. Git fast-forwards where possible and creates a merge on divergence; history is not rewritten. The publication helper refreshes parent gitlinks before pulling and after integration. Missing pins return to staged review and plan execution before any parent push. The runner does not push the same unchanged HEAD twice and verifies uncertain push outcomes against Git. Force-push, tags, and other branches remain excluded. This command option does not limit separately authorized ordinary Git work.

Only when a publication pull establishes merge conflicts does the runner temporarily offer the AI a mutation `bash` tool instead of plan and ignore tools. The AI may inspect, resolve conflicts when intent is clear, stage resolved paths, and commit the merge with normal hooks. It does not pull or push. Code verifies that a merge commit was created and no conflicts or unfinished eligible changes remain, then retries publication. Unresolved conflicts, lack of progress, and non-conflict pull failures stop dependent work.

## Repository IDs and filesystem paths

Inventory entries, plan targets, ignore decisions, and result labels share the repository-ID helpers in `lib/path-identity.ts`. IDs use forward-slash separators, for example `modules/onclave`, with `.` for the root. On Windows, private-tool lookup also accepts native backslash spelling. On POSIX, literal backslashes and case remain significant. Lookup stays limited to discovered inventory entries; normalization does not resolve arbitrary paths or change publication eligibility.

Native absolute paths are retained separately and passed to filesystem and Git operations. Windows, Git Bash, and WSL path conversion is not done by rewriting repository IDs. Existing absolute-path comparisons use the separate platform-aware helper.

## Implementation and limits

`extensions/commands.ts` calls `runCommitReviewer()` in `commands/commit/reviewer.ts`. The runner owns one awaited, in-memory Pi `Agent`, uses the profile's catalog/auth, and supplies repository inventory, initial status, tracked AGENTS.md paths, the selected repository, and the absolute repository root. `commands/commit/plan.ts` validates and executes whole-file plans. Model selection remains latest Luna with the existing Anthropic Haiku fallback; the selected conversation model is unchanged.

`inspect` uses the native Bash tool for normal Git commands, searches, and focused discovery. It returns nonzero results to Luna for interpretation or correction, including compound commands, pipes, search no-matches, and `git check-ignore` exit 1 (not ignored). Read-only tool guidance is not a shell sandbox. Failed conflict-resolution `bash` calls stop queued work. Failure diagnostics preserve the complete command, including its tail and original whitespace.

The three-minute active-work budget pauses during ignore questions. Git reads, plan execution, and shell commands retain 15-second timeouts. Pulls and pushes use the 120-second publication timeout. Transient response failures share three retries with 1s/2s/4s abortable backoff, separate from plan corrections. Completed tool history is retained; Git, hook, cancellation, timeout, and other deterministic failures are not retried. No new tests, lint, builds, secret scans, approval steps, or other gates run as part of `/commit`.

After failure or cancellation, read-only queries report actual commits and remaining status without reusing the cancelled signal. Those queries may extend wall time. Private agent calls and reasoning do not enter the main conversation. Final results, including full failure diagnostics, enter model context as hidden custom messages with `triggerTurn: false`; the existing interface entry supplies the single displayed result. No child session/report files are saved.

Run `/reload` after code changes to load this behavior in an existing Pi process. Deterministic-provider tests use the real Agent lifecycle and temporary real Git repositories for staging and publication semantics. They do not establish live model judgment or attached UI acceptance.
