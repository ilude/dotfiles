# Quiet commits

`/commit` delegates the whole workflow to **openai-codex/gpt-5.6-luna**, at **low** reasoning: review, grouping/messages, staging, commits, and an optional push. The current model only calls `commit_run` and presents its result; routine Git commands/output stay out of the main conversation.

## What you see

- `/commit` and brief progress.
- Include/leave-out questions for new files likely to belong in `.gitignore`. The same Luna task resumes after the answer; no review restart. Cancelling a question stops the workflow.
- Any actual tool/provider/Git/hook failure, followed by the current Git state. Failures stop further work; successful commits are not undone.
- One completion summary in the main response: actual `<short hash> <commit subject>` lines and `Pushed` only if applicable. Remaining changes, skipped files, or errors appear only when present; no clean-tree/not-pushed/“None” boilerplate. If nothing was committed, say so. The tool's progress disappears on successful completion, including when tools are expanded. The result still reaches model context; only the final reply displays it. Tool failures remain visible even if cancellation prevents a final reply.

Groups/messages need no approval. Unclear grouping defaults to one commit for eligible changes. Existing hooks run normally. No additional validation, secret-scanning phase, reports, path-accounting or staging-ambiguity gates are introduced. Submodules remain separate invocations.

## Implementation

`commit_run` owns one awaited, in-memory Pi `Agent`. It supplies initial status directly and uses this profile's catalog/auth without changing the selected conversation model. Luna has paginated Git inspection, ordinary `read`/`bash` tools, and `ask_ignore`. There is no extra filesystem sandbox or separate staging/commit executor. Its individual tool calls and reasoning are private.

The 30-second active-work budget pauses while waiting for an ignore decision. Git reads and shell commands retain 15-second timeouts. Cancellation/timeout can leave completed commits or staging in place; after the task stops, read-only Git queries collect actual commits and remaining status, including on failure. Those reporting queries may extend elapsed wall time. The budget remains a target, not an atomic transaction or rollback mechanism.

Push permission is captured from the slash invocation, not chosen by the main model's tool arguments. Bare `/commit` instructs Luna not to push; `/commit push` requests a normal explicit-branch push to origin, including existing outgoing commits, without force-push or automatic merge/rebase. As with ordinary shell use, these are agent instructions, not an OS permission boundary. Push failures do not undo local commits. An unavailable Luna produces an error, not a fallback model.

Only the final result enters main-model context. Successful nested usage is returned to Pi. No child session/report files are saved. Run `/reload` after code changes. Legacy is unchanged.
