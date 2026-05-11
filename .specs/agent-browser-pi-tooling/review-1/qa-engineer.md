- severity: high
  evidence: T3 and Success Criteria accept `agent-browser get title` after wrapper launch, but do not require proving the connected CDP target is Brave. A wrapper could launch Chrome or connect to an existing Chrome debug port and still return `Example Domain`.
  required_fix: Add assertions that inspect the browser executable/process or CDP `/json/version` metadata and fail unless it identifies Brave/Brave Browser for Brave-mode tests.

- severity: high
  evidence: Real-profile validation accepts logged-in UI labels and `agent-browser get url`; this can pass with an unauthenticated or wrong-profile session if the page shell loads or redirects. It also lacks a negative check for `agent-browser --profile Default` selecting Chrome.
  required_fix: Require wrapper output to show explicit Brave user-data-dir/profile-directory, CDP endpoint ownership, and an authenticated-only selector/snapshot signal; add a regression test/docs check forbidding `agent-browser --profile Default` as the Brave recipe.

- severity: medium
  evidence: Offline, missing Brave, missing Node/pnpm, blocked `npx`, and unsupported Linux/macOS/WSL paths are only handled as ad hoc smoke-test failures. Acceptance criteria require version output or docs fallback, but not graceful wrapper/install behavior.
  required_fix: Add tests or documented checks for unsupported/missing-dependency cases that assert clear exit codes/messages and no profile/process side effects.

- severity: medium
  evidence: Several doc-validation gates rely on `grep ... | head` and manual review. These pass when stale/conflicting recipes exist after the first 100-120 matches or when docs mention keywords without providing runnable behavior.
  required_fix: Replace brittle grep-only acceptance with targeted tests that parse canonical doc/link locations and assert required commands, warnings, and absence of conflicting Chrome/default-profile recipes.

- severity: medium
  evidence: X/timeline guidance requires bounded loops and partial reporting, but no test validates virtualization behavior, dedupe, or fail-visible short reads. Tests could pass while extraction repeatedly reads the same articles or silently uses unauthenticated X.
  required_fix: Add a fixture-based/unit test for timeline extraction logic using repeated/partial snapshots, asserting max attempts, unique item dedupe, auth-required failure reporting, and explicit partial-result status.
