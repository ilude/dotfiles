- category: substantive defect
  severity: high
  severity_rationale: The plan can pass all listed tests while the live `/goal` command is still hidden behind a suffixed collision or an active tool collision.
  evidence: T2 checks only `pi/settings.json` text, and V1 only says “checking only one local `/goal` registration exists in repo code”; no validation runs Pi’s extension loader or inspects the resolved command/tool registry after settings load.
  required_fix: Add an integration test or executable validation that loads Pi settings plus local extensions in the same path Pi uses and asserts the exposed command name is exactly `/goal`, no `/goal:1`, and `goal_complete` resolves to the local implementation.
  confidence: high

- category: substantive defect
  severity: high
  severity_rationale: Path safety is an explicit requirement, but the acceptance criteria allow ambiguous fallback behavior and do not require negative traversal/absolute-path cases.
  evidence: T1 AC3 says missing paths may “fall back to inline text or warning according to implementation rules” and only requires “an existing goal file and a non-existing path”; it does not require tests for `../`, symlinks, absolute paths outside cwd, directories, or Windows-style paths.
  required_fix: Define deterministic path rules and add tests for cwd-contained file, missing path, directory, traversal, symlink escape if supported by fs, absolute outside-cwd, and Windows drive/UNC-like inputs.
  confidence: high

- category: false positive
  severity: medium
  severity_rationale: Mock-only prompt tests may prove helper behavior without proving live hook/continuation semantics that affect user-visible regressions.
  evidence: T3 says to use `pi/tests/helpers/mock-pi.ts`; continuation scheduling is only “where feasible,” and ACs do not require proving hook ordering, pending-message guard behavior, or state restoration through Pi’s actual custom-entry/session APIs.
  required_fix: Require tests around the real extension registration callbacks: start goal, simulate `before_agent_start`, simulate turn end with and without pending messages, reload/restore session state, then assert compact reminders and continuation are emitted only in the intended cases.
  confidence: medium

- category: process defect
  severity: medium
  severity_rationale: The validation sequence is inverted, making Wave 1 validation depend on tests that are not created until Wave 2.
  evidence: T1 acceptance criteria repeatedly use `cd pi/tests && pnpm test goal.test.ts`, but T3 “Add focused goal extension tests” depends on V1, which depends on T1. V1 says to run T1 criteria before the test file exists.
  required_fix: Move test creation before T1 validation, split T1 into implementation/typecheck-only checks plus T3 behavioral checks, or explicitly require scaffolded failing tests before implementation.
  confidence: high

- category: low-value/theater
  severity: low
  severity_rationale: Several success checks can be mechanically satisfied by string matches while missing real behavior.
  evidence: Success Criteria 1 uses `rg 'registerCommand\("goal"'` and `rg 'name:\s*"goal_complete"'`; these pass for dead code, wrong extension export shape, duplicate registrations, or a tool schema that providers reject at runtime.
  required_fix: Replace string-grep success proof with loader/type-level or runtime registry assertions that the extension is discoverable, command and tool schemas are valid, and only the intended active package/extension owns the names.
  confidence: high
