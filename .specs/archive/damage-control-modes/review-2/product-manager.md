# Product Manager Review: Damage-Control Session Modes

## Findings

1. **Severity: High — Scope combines three features into one delivery.**
   - **Evidence:** The plan bundles slash-command UX, shell-mode state management, PowerShell dangerous-command expansion, rule schema changes, handler integration, audit/status mechanisms, and repo-wide validation in one implementation path.
   - **Required fix:** Split into a smaller MVP or phase explicitly: first ship `/damage-control status` plus `noshell` only, then add whitelist, then add expanded `pwsh` dangerous rules. If kept together, justify why PowerShell rule expansion must block delivery of mode toggles.

2. **Severity: High — Whitelist v1 is likely too broad for an initial safety feature.**
   - **Evidence:** Initial whitelist includes package/test runners (`pnpm test [file]`, `uv run pytest [path]`, `uv run ruff [path]`) that execute project code, while the mode is positioned as a stricter safety posture.
   - **Required fix:** Consider a simpler read-only whitelist MVP (`pwd`, simple listing, `git status`, `git diff`, `git log`) and defer code-executing commands unless there is a clear user story requiring them.

3. **Severity: Medium — Acceptance criteria may overfit implementation details.**
   - **Evidence:** Requirements mandate exact helper placement, exact regex strategy, specific test function names, and per-category PowerShell positives/negatives rather than focusing on user-visible behavior and risk outcomes.
   - **Required fix:** Reframe product acceptance around behavior: active mode is visible, unsafe shell calls are blocked, file protections remain on, state is session-local. Move helper/function-level details to engineering notes unless they are contractual.

4. **Severity: Medium — Audit/status requirement is underspecified and may invite unnecessary plumbing.**
   - **Evidence:** Objective says mode transitions must be recorded through existing permission/metrics/status mechanisms “or equivalent session-visible audit record,” but does not define what user needs to see, retention, or testable output.
   - **Required fix:** Define a minimal MVP audit requirement, e.g. status command shows current mode and last transition in memory, or remove audit from v1 if status is sufficient.

5. **Severity: Low — Repo-wide `make check` may be disproportionate for this scoped change.**
   - **Evidence:** The focused validation already runs damage-control tests and Pi extension typecheck; full `make check` can add unrelated lint/test failures and baseline-exception overhead.
   - **Required fix:** Make focused tests/typecheck the required completion gate and classify `make check` as best-effort unless this repo’s release process requires it for every Pi extension change.

## Simpler recommended path

Ship a two-mode MVP: `default` and `noshell`, with `/damage-control status`, `/damage-control mode default|noshell`, `/dc` alias, per-registration state, and focused handler tests. Defer whitelist and expanded PowerShell dangerous rules to follow-up specs once the command/state UX is proven.
