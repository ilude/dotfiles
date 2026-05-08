# DevOps Review: Provider-Architecture Spike

## Findings

1. **Severity: high**
   - **Evidence:** `.specs/prompt-router-control-plane/provider-architecture-spike.md` proposes a new before-generation provider/model resolution layer but does not name the concrete runtime file/function/seam to modify, nor the exact test command beyond a generic "provider-level or generation-dispatch harness." A fresh `/do-it` session cannot distinguish implementation work from research and may mutate the old input hook path again.
   - **Required fix:** Convert the spike into an executable plan section with explicit target files/functions, a first read-only discovery command, and a named validation harness/test file before any behavior-changing edits.

2. **Severity: high**
   - **Evidence:** The parent plan requires all post-W0 work to run from `../.dotfiles-prompt-router-control-plane`, but the spike document contains no worktree guard or command prefix. Its artifact path is inside the current checkout, while `worktree-preflight.md` records the isolated worktree path as `C:/Users/mglenn/.dotfiles-prompt-router-control-plane`, which is easy to confuse with the original checkout name.
   - **Required fix:** Add a mandatory preflight gate to the spike: `git rev-parse --show-toplevel`, `git branch --show-current`, and `test "$(git branch --show-current)" = plan/prompt-router-control-plane`, with evidence saved before edits; state that implementation must stop if not in the isolated worktree.

3. **Severity: medium**
   - **Evidence:** The spike's "Next validation gate" lists fields to record but omits exact commands, package-manager setup, exit-code capture, and repo-wide gates. Existing evidence shows `pnpm run test -- prompt-router.test.ts` can run a broader suite and expose unrelated failures, so a future executor may claim success from partial output.
   - **Required fix:** Specify exact validation commands and evidence files, including `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`, `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts`, expected named test(s), exit-code recording, and how unrelated suite failures are classified.

4. **Severity: medium**
   - **Evidence:** The spike requires prompt hash and dispatch observer evidence, but does not define artifact schema, destination filenames, raw-prompt prohibition, or archive/rollback handling. The parent plan explicitly requires durable evidence and no raw prompt/excerpt logging by default.
   - **Required fix:** Add a fixed evidence contract: write sanitized markdown/JSON under `.specs/prompt-router-control-plane/evidence/`, include command, exit code, timestamp, prompt hash only, applied provider/model/thinking, dispatch order, and a raw-prompt/secret scan before archive.

5. **Severity: medium**
   - **Evidence:** The proposed architecture says provider/model/thinking must be passed atomically into generation dispatch, but gives no rollback boundary if the provider seam is unavailable or only partially mockable. That creates a failure mode where partial router/provider rewiring remains in the worktree without a clear stop condition.
   - **Required fix:** Define explicit stop/rollback criteria: if no before-generation seam can be instrumented, write a blocker artifact, revert tracked code changes, list untracked artifacts in a rollback manifest, and do not continue into resolver/context/control-plane work.
