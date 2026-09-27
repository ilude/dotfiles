---
created: 2026-09-26
status: ready
completed: null
---

# Route Claude Code delegation through visible Pi workers in Herdr

## Goal and scope

- User requirements and settled decisions:
  - Claude Code remains the primary coordinator while delegated investigation, implementation, and review use Pi with the existing Codex subscription.
  - Replace Claude's headless `pi-run` delegation path with interactive Pi processes in visible Herdr panes.
  - Claude can start, prompt, inspect, read, interrupt, and explicitly close those workers through structured operations.
  - Workers remain visible and retained after a turn so the operator can see running, blocked, and completed state and can interact directly.
  - Keep the first implementation local, simple, flexible, and low ceremony.
  - Preserve the September 2026 implementation references for possible reuse in both this Claude bridge and the Pi subagent/Herdr system.
- Non-goals:
  - Do not add another multiplexer, daemon, task database, dashboard, workflow DAG, shared task protocol, worktree manager, automatic completion markers, or remote orchestration.
  - Do not replace Pi's existing authenticated owned-subagent runtime or make terminal output authoritative for Pi-owned child results.
  - Do not launch hidden/headless fallback workers when Herdr is unavailable. Fail clearly instead.
  - Do not route Pi workers through Anthropic models or Claude Agent-tool subagents.
- Authorization: planning and research-note capture are authorized. This plan does not authorize implementation, commits, push, or deployment.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read current applicable `AGENTS.md` files before acting. For Pi behavior, also read the installed Pi extension documentation named below completely and follow its linked references.

- Owning repository and boundaries: the dotfiles repository owns Claude configuration, Pi profile integration, Herdr setup, tests, vault research, and installer wiring. No module repository changes are expected.
- Required reading:
  - `AGENTS.md`
  - `claude/CLAUDE.md`
  - `claude/README.md`
  - `claude/settings.json`
  - `scripts/claude-mcp-setup`
  - `scripts/pp` and `scripts/pp.ps1`
  - `pi/README.md`
  - `pi/profiles/default/docs/herdr.md`
  - `pi/profiles/default/skills/herdr/SKILL.md`
  - installed Pi docs `docs/extensions.md` and `docs/sdk.md` only if implementation reuses Pi extension or SDK code
  - `docs/research/obsidian-vault/agent-workflows/projects/visible-agent-orchestration-2026-09.md`
  - proposed `claude/mcp/herdr-pi/` sources and tests once created
- Verified starting behavior on 2026-09-26:
  - `claude/CLAUDE.md` directs delegation to `scripts/pi-run`, which invokes `pi -p` headlessly.
  - `claude/settings.json` allowlists `pi-run` and headless `pi -p` commands.
  - `scripts/claude-mcp-setup` generates the machine-specific, gitignored `~/.claude/.mcp.json`; it currently configures only FlareSolverr and Browser MCP.
  - Installed Herdr 0.9.1 exposes structured `agent start`, `prompt`, `get`, `read`, `wait`, `send-keys`, and pane-layout commands, recognizes `pi`, and reports agent lifecycle states.
  - The default Pi profile already wraps these primitives in `pi/profiles/default/extensions/herdr-tools.ts`, but those tools are Pi extensions and are not directly available to Claude Code.
  - Direct `pi` resolves through the compatibility path to the legacy profile. Bare `pp` selects the repository-owned default profile. A new launch path must prove it starts the default profile rather than assuming `herdr agent start --kind pi` does so.
  - The research references now live in the vault project note linked above and are indexed from `agent-workflows/index.md` and `agent-workflows/README.md`.
- Work to preserve: recheck the worktree before editing. At plan creation the new research note, its index links, pattern backlink, and this plan are uncommitted task-owned work; do not discard or overwrite unrelated later changes.
- Worktree and integration target: originating checkout is `C:/Users/mglenn/.dotfiles`; determine and record its current branch at execution. Proposed task worktree and branch: `.worktrees/claude-visible-pi-workers` and `task/claude-visible-pi-workers` unless occupied.
- Profiles: planning used the repository-owned default Pi profile. Implementation and checks must use the default profile through `pp` or an equivalent explicitly verified `PI_CODING_AGENT_DIR`; do not inspect or use `pi/profiles/legacy/`.

## Decisions and implementation contract

### Control surface

Create a small local stdio MCP server for Claude rather than granting Claude unrestricted `Bash(herdr:*)` access. Proposed source location: `claude/mcp/herdr-pi/`. It may invoke only the Herdr commands required by this contract.

Expose these conceptual operations, with final MCP names allowed to follow repository naming conventions:

1. **start**: create a visible sibling pane without stealing focus, start one named Pi worker in a requested cwd using the default profile and selected work class, wait for Herdr to recognize the exact Pi agent, and return its stable live name and pane ID.
2. **prompt**: submit one prompt to an exact worker, optionally wait through observed activity to a settled or blocked lifecycle state, and return bounded state/output.
3. **status/list**: report exact worker identity, cwd, Pi kind, and Herdr lifecycle state without reading unbounded transcripts.
4. **read**: return bounded recent unwrapped output from an exact worker.
5. **interrupt**: send logical `ctrl+c` to an exact worker, then report that interruption was submitted without claiming the process stopped.
6. **close**: explicitly close an exact retained worker created by this bridge after inspecting its current identity and state; never close Claude's calling pane or unrelated panes.

The adapter must require `HERDR_ENV=1` and exact returned identifiers. No generic shell, arbitrary pane command, raw text injection, server stop, workspace close, or broad pane cleanup tool belongs in this interface.

### Worker launch and model routing

Preserve the existing intent of the three delegation classes:

- `dig`: `openai-codex/gpt-5.6-luna`
- `work`: `openai-codex/gpt-5.6-sol`
- `review`: `openai-codex/gpt-5.6-sol:high`

Workers are interactive and retained by default. They receive a self-contained assignment and operate in the requested cwd. Start must fail rather than fall back to headless execution.

The exact launch mechanism remains adaptable, but it must establish all of these postconditions in a real Herdr session:

- the visible pane exists in the caller's connected Herdr server;
- focus remains on the caller unless explicitly requested otherwise;
- the process is the real Pi CLI and Herdr recognizes it as `kind: pi`;
- `PI_CODING_AGENT_DIR` resolves to `pi/profiles/default`, not the legacy compatibility path;
- the requested Codex model is active;
- the worker is ready for an interactive prompt;
- startup ambiguity returns the created pane/name for inspection and is never retried blindly.

Investigate whether current `herdr agent start --kind pi -- ...` can satisfy the profile postcondition. If not, use a constrained cross-platform launcher that starts `scripts/pp` or the existing `local.pi` plugin bootstrap in the created pane and then verifies/renames the recognized agent. Do not alter the legacy compatibility path to solve this.

### Lifecycle, ownership, and safety

- Treat prompt submission, observed working state, settled completion, blocked input, timeout, and process exit as distinct outcomes.
- A timeout or ambiguous response does not prove the prompt was not delivered. Inspect before any retry.
- Keep output bounded. Default reads should be sufficient for a completion summary without loading whole transcripts.
- Retain completed workers for follow-up and operator inspection. Closure is explicit, not automatic.
- Maintain the smallest ownership record needed to ensure destructive operations target bridge-created workers. It may be process-local for the first slice; after a Claude/MCP restart, surviving workers may be listed and read but must not be destructively adopted without an explicit, verified mechanism.
- Block prompts to workers already waiting on an approval/question. Return the blocked state so Claude asks the operator rather than answering sensitive prompts automatically.
- Project trust and execution authority remain separate. Starting in a requested repository may use Pi's one-run trust mechanism only where the repository has already been deliberately selected; do not add unrestricted permission or sandbox bypass flags.
- Reuse Herdr's structured lifecycle and agent reads. Do not infer completion from screen silence or require workers to print sentinel text.

### Claude behavior and configuration

- Replace `claude/CLAUDE.md` headless delegation guidance with concise visible-worker guidance: delegate through the MCP tools when delegation is warranted, use Claude for orchestration/synthesis, keep assignments self-contained, inspect before retrying, and leave panes visible until follow-up is unnecessary.
- Register the server through `scripts/claude-mcp-setup` for Windows and Unix paths. Keep `.mcp.json` generated and machine-specific.
- Remove the `pi-run` and direct headless `pi -p` permission allowlist entries from `claude/settings.json`.
- Remove `scripts/pi-run` after all owning guidance and tests use the visible path. Do not retain a silent headless fallback under another name.
- Update `claude/README.md` and root `CHANGELOG.md` for the operator-visible workflow change.

### Deferred work

These are outside this plan's acceptance criteria:

- exposing this Claude bridge as Pi's owned-subagent transport;
- durable worker adoption across Claude restarts;
- notifications that awaken an idle Claude turn;
- automatic worktrees, commits, result files, pipeline chaining, or multi-host Herdr control;
- generalized support for Claude, Codex CLI, or other worker kinds.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Carry the task-owned uncommitted plan and research-note changes into that worktree without deleting their source or unrelated work.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt technical mechanisms when repository and installed Herdr evidence require it, but do not change user intent, scope, settled decisions, or acceptance without approval. When blocked, continue independent tasks and ask only for specific consequential input. Do not add orchestration features from the research catalog merely because they exist.

Keep checkbox state, concise evidence, blockers, and next action accurate. Leave unfinished integration and cleanup checkboxes unchecked. Fix demonstrated task-relevant failures and stop when the finite agreed checks pass.

## Tasks

- [ ] **T1: Establish and test the default-profile visible launch contract**
  - Depends on: none.
  - Files/inputs: installed Herdr 0.9.1 CLI; `scripts/pp`; `scripts/pp.ps1`; `scripts/pi-herdr-setup.mjs`; `pi/profiles/default/docs/herdr.md`; proposed isolated probe under `claude/mcp/herdr-pi/tests/` if reusable.
  - Change: determine the smallest cross-platform sequence that creates a non-focused Herdr pane, starts the real default-profile Pi CLI on the selected Codex model, obtains an exact live agent identity, and leaves it ready for prompts. Record this as a testable launcher contract for T2. Prefer `herdr agent start` if and only if it can prove the default profile; otherwise use the repository launcher/bootstrap and structured post-launch detection.
  - Complexity / split hints: profile selection, Windows Bash/PowerShell differences, Herdr process recognition, and ambiguous startup are interacting boundaries. Keep experiments in an isolated named Herdr session and do not stop or mutate the shared server.
  - Verify: an isolated live probe confirms pane visibility, caller focus preservation, exact `kind: pi`, default `PI_CODING_AGENT_DIR`, requested model, ready state, one prompt/follow-up exchange, and exact cleanup without using `-p` print mode.
  - Done when: the verified command/API sequence and failure semantics are encoded in a reusable test or fixture and are sufficient for T2 without guessing.
  - If blocked: document the exact Herdr or Pi limitation and ask whether to extend the existing `local.pi` plugin launch contract; do not fall back to hidden workers or the legacy profile.
  - Evidence: Not started.

- [ ] **T2: Implement the constrained Herdr-Pi MCP server**
  - Depends on: T1's verified launch contract.
  - Parallel with: T3 after the tool schemas and generated registration command are fixed.
  - Files/inputs: proposed `claude/mcp/herdr-pi/pyproject.toml`, `claude/mcp/herdr-pi/server.py` or equivalent bounded package files, and unit tests in the same package. Python tooling must use `uv` and the repository's Python 3.9 floor.
  - Change: implement start, prompt, status/list, bounded read, interrupt, and explicit close. Validate inputs, require Herdr context, parse JSON responses, cap output and waits, track bridge-created workers for destructive operations, preserve focus, distinguish lifecycle outcomes, and reject generic commands or unrelated pane control. Keep dependencies minimal and pinned through normal `uv` metadata if a maintained MCP SDK is used.
  - Complexity / split hints: JSON-RPC/MCP transport, cancellable subprocesses, Windows process behavior, timeout ambiguity, and ownership-safe cleanup need cohesive tests. Avoid reproducing Herdr's own lifecycle parser.
  - Verify: `uv run pytest` from the MCP package with a fake Herdr executable covers every operation, malformed/oversized inputs, non-Herdr refusal, blocked worker, timeout ambiguity, wrong kind/identity, caller-pane protection, unrelated-pane closure refusal, and output bounds. Run the package's configured lint/format checks.
  - Done when: Claude can discover the narrow tools and all unit tests prove commands and safety boundaries without requiring a live Codex call.
  - If blocked: preserve the fixed external tool behavior and change only the internal transport mechanism; ask before broadening tool authority.
  - Evidence: Not started.

- [ ] **T3: Wire Claude configuration and retire headless delegation**
  - Depends on: T2's fixed tool schemas and server invocation.
  - Parallel with: remaining T2 implementation after those interfaces are fixed, with disjoint ownership.
  - Files/inputs: `scripts/claude-mcp-setup`, `claude/CLAUDE.md`, `claude/settings.json`, `claude/README.md`, `scripts/pi-run`, applicable setup tests, and `CHANGELOG.md`.
  - Change: add platform-correct generated MCP registration; replace headless delegation instructions with visible-worker policy; remove `pi-run` and direct `pi -p` permissions; delete the obsolete wrapper; document setup, Herdr-only behavior, retained panes, operator interaction, and troubleshooting. Add an idempotent setup test using an isolated temporary HOME rather than overwriting the operator's live config.
  - Verify: `shellcheck scripts/claude-mcp-setup`; the isolated setup test produces valid expected Windows and Unix JSON and is idempotent; `rg` finds no active Claude guidance or permission path that delegates through `pi-run` or `pi -p`; repository docs link the new workflow and research note correctly.
  - Done when: a fresh install configures only the visible bridge for Pi delegation, existing installs regenerate deterministically, and no supported Claude path silently launches headless Pi workers.
  - If blocked: preserve existing unrelated MCP entries and ask before changing the generator's ownership model; do not hand-edit only the generated `.mcp.json`.
  - Evidence: Not started.

- [ ] **T4: Validate the real Claude-to-Herdr-to-Pi workflow and close out**
  - Depends on: T2 and T3 complete.
  - Files/inputs: implemented bridge, generated MCP config, Herdr isolated test session, default Pi profile, relevant docs/tests, this spec, and the research note/index changes.
  - Change: run one bounded live acceptance using Claude's actual MCP entry point to start a visible `dig` worker, observe working and settled states, read its answer, send a follow-up, interrupt only a disposable active turn if needed for the explicit interrupt check, and close the exact worker. Confirm the operator can see and directly focus the pane throughout. Update task evidence and archive the full spec after all agent-owned checks pass.
  - Complexity / split hints: the acceptance crosses Claude, MCP stdio, Herdr, Pi profile selection, and the Codex provider. Use a trivial read-only assignment and one worker to limit subscription use.
  - Verify: run the MCP unit/lint suite, setup tests, relevant repository tests, `make check-pi-default` only if Pi-owned source changed, and the bounded live acceptance. Recheck `git diff --check`, research-note links, and absence of accidental legacy-profile changes.
  - Done when: the real visible worker round trip passes, all finite checks are recorded, the research references remain indexed, the implementation and archived spec are committed on the task branch, and integration is accurately marked pending.
  - If blocked: report separately whether the failure is Claude MCP discovery, Herdr launch/control, Pi default-profile startup, or Codex authentication. Do not claim partial component checks prove the end-to-end path.
  - Evidence: Not started.

## Agreed validation and current handoff

- MCP unit tests with a fake Herdr boundary.
- MCP lint/format checks using the package's declared `uv` tooling.
- Isolated cross-platform `claude-mcp-setup` generation and idempotency test.
- `shellcheck scripts/claude-mcp-setup`.
- Relevant repository tests; `make check-pi-default` only if Pi source changes.
- One isolated, read-only live Claude MCP -> visible Herdr pane -> default-profile Pi -> Codex round trip, including follow-up and exact cleanup.
- `git diff --check` and link/path checks.

Status: ready.

- Completed work and evidence: September 2026 references captured at `docs/research/obsidian-vault/agent-workflows/projects/visible-agent-orchestration-2026-09.md` and linked from the topic index, README, and terminal-workspaces pattern. No implementation or checks have run.
- Next: T1, establish the visible default-profile Pi launch contract in an isolated Herdr session.
- Blockers/open decisions: none. The exact internal launch mechanism is intentionally left to T1 evidence while the required profile/model/visibility postconditions are fixed.
- Verification limits: web sources and current repository state were inspected during planning. No Claude MCP server, live Claude-to-Pi delegation, or model behavior has been implemented or tested.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/claude-visible-pi-workers/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation, research-note changes, and archived spec together on the task branch. Do not archive unfinished implementation.

For authorized `/do-it` execution, after the task commit dispatch the Integrator from the recorded target checkout with the closeout manifest. The Integrator owns local integration and cleanup; the orchestrator owns user questions and final reporting. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery. If `--no-merge` applies, do not dispatch the Integrator for mutation; keep the committed worktree and report integration as intentionally pending.

The Integrator verifies the target and archive, records the actual completion date, status, and evidence, commits that metadata, then removes the clean task worktree. It reports CLEANUP PENDING if integration or metadata succeeded but cleanup did not. Push requires explicit user authorization. Operator observation of pane rendering is a non-blocking verification limit after the automated and agent-driven live checks; it does not block archival or authorized integration.

### Final response

Start with one overall outcome, using the colored symbol and explicit text together:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing; state the precise question and recommendation where applicable.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under `--no-merge`; retained worktree is intentional, not a failure or required fix.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are already on the target, but worktree cleanup is unfinished.

For blocked or cleanup-pending outcomes, immediately give **Reason** and **Action needed**, naming the issue, who must act, and the exact next action before successes. Then give concise checks, spec location, branch/commits, merge result, and retained worktree or cleanup remnants. Never rely on color alone or lead a blocked result with a success summary.
