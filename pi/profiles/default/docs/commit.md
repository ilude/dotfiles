# Quiet commits

`/commit` runs the private Git workflow directly from its command handler. `/commit push` also requests publication. F10 invokes `/commit`; F9 invokes `/commit push`. These are operator conveniences, not the route for ordinary conversational commit or push requests, which the main agent handles with Git through Bash.

There is no main-agent commit tool, tool discovery, hidden commit prompt, or model-selected dispatch. The command calls the existing in-memory Luna runner directly. `/bro` remains prompt-backed. Legacy is unchanged.

## What you see

- The command invocation and immediate progress.
- Ignore questions for new files likely to belong in `.gitignore`, with `Include in commit`, `Add to .gitignore`, and `Leave untracked` choices. Adding a rule updates that repository's `.gitignore` and resumes the same Luna task. Cancelling the question stops the workflow.
- Brief retry progress for transient model-response failures. Terminal provider failures and actual Git, hook, or tool failures show an error and actual Git state. Successful commits are not undone.
- One interface-only completion entry containing actual short hashes and commit subjects, plus `Pushed` only when confirmed. Remaining changes, skipped files, or errors appear only when present. If nothing was committed, the result says so. The main model is not asked to present the result or repeat Git work.

The command waits for an active main-agent turn to finish before starting Git work. Shortcuts use the same idle boundary rather than rejecting busy input. Escape cancels a waiting or running command; session shutdown also cancels it. Existing ignore dialogs retain their normal Escape behavior. Temporary progress and input listeners are cleared after completion, failure, or cancellation.

## Git behavior

Groups/messages need no approval. Unclear grouping defaults to one commit for eligible changes. Existing hooks run normally. The runner retains its existing review and Git instructions, read/shell tools, ignore-file questions, model selection, and response retries. Removing the main-agent tool does not introduce new validation, secret-scanning, staging, or publication gates.

Every initialized submodule is reviewed independently. Dirty submodules are committed deepest-first, followed by refreshed parent gitlinks. Detached repositories remain eligible for local commits but are silently skipped for publication. When push is requested, clean attached submodules with outgoing commits referenced by the parent are also published before parents.

Bare `/commit` performs no publication-related branch, upstream, outgoing, remote, or push checks. `/commit push` captures that invocation's push choice directly from its arguments. Eligible repositories use their attached branch and `git push --recurse-submodules=no origin HEAD:refs/heads/<own-branch>`. Force-push, tags, other branches, and automatic merge/rebase remain excluded. This command option does not limit separately authorized ordinary Git work.

## Implementation

`extensions/commands.ts` calls `runCommitReviewer()` in `commands/commit/reviewer.ts`. The runner owns one awaited, in-memory Pi `Agent`, uses the profile's catalog/auth, and supplies repository inventory, initial status, tracked AGENTS.md paths, and the absolute repository root. It does not change the selected conversation model. Luna has paginated Git inspection, ordinary read/bash tools, and the ignore-file UI. Initial status is supplied; status refreshes and diff inspection use the existing `commit_git_review` helper. Untracked contents still require reads. Broad recursive discovery remains excluded by the runner's existing instructions.

The three-minute active-work budget pauses during ignore questions. Git reads and shell commands retain their existing 15-second timeouts. Transient response failures share three retries with 1s/2s/4s abortable backoff. Completed tool history is retained; Git, hook, cancellation, timeout, and other deterministic failures are not retried. Existing runner fallback behavior is unchanged.

After failure or cancellation, read-only queries report actual commits and remaining status without reusing the cancelled signal. Those queries may extend wall time. There is no rollback or atomic transaction. Private agent calls and reasoning do not enter the main conversation; result entries are interface-only. No child session/report files are saved.

Run `/reload` after code changes. Offline tests do not establish live UI or Git mutation behavior.
