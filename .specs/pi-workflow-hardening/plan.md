---
created: 2026-05-02
status: draft
completed:
---

# Plan: Pi Workflow Hardening from Ecosystem Review

## Context & Motivation

Recent review of Pi ecosystem projects and videos surfaced several concrete ideas that fit this dotfiles Pi setup without compromising its current workflow model. The highest-value ideas are lightweight workflow hardening rather than large new agent frameworks:

- Babysitter-style explicit source-of-truth and verify loops.
- On-demand diagnostics instead of continuous LSP feedback.
- Git-backed checkpoints before risky multi-file `/do-it` waves.
- Lightweight usage/spend visibility.
- Focused handoff summaries for new sessions.

SCIP/code-intelligence notes are intentionally captured separately in `.specs/code-intelligence-notes/notes.md` because that area may become a broader generic language-intelligence design rather than a direct SCIP adoption.

## Objective

Improve Pi workflow reliability and observability by adding lightweight gates and commands that make `/do-it`, `/review-it`, and related workflows safer and more auditable, while avoiding heavyweight always-on systems.

## Constraints

- Preserve Pi's lightweight feel; avoid adopting full Babysitter or continuous LSP as defaults.
- Prefer opt-in commands and validation-phase hooks.
- Keep workflows provider/model-family aware when delegation is needed.
- Do not introduce mandatory external services.
- Do not commit generated runtime state, secrets, or local caches.
- Maintain Windows/Git Bash compatibility.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Install full Babysitter | Rich process/iteration framework | Heavy, slower, overlaps with our workflow skills | Rejected for default setup |
| Continuous LSP feedback | Fast diagnostics while editing | Noisy for agents; can produce premature feedback | Rejected |
| On-demand diagnostics command | Explicit validation signal, low noise | Requires per-language command mapping | Selected |
| Full file-change undo system | Works outside git | More complexity; user explicitly deferred filechanges | Rejected for now |
| Git-backed checkpoints | Simple safety before risky waves | Git-only and must avoid destructive resets | Selected |
| Full cost dashboard | Rich cross-session analytics | Privacy/storage complexity | Deferred |

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|---|---|---|---|---|---|
| T1 | Add source-of-truth and verify-loop guidance to workflow skills | 3-4 | docs/workflow | medium | planning-lead | — |
| T2 | Design and implement lightweight `/diagnostics` command | 2-4 | feature | medium | typescript-pro | — |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2 |
| T3 | Add opt-in git checkpoint command for risky workflow waves | 2-4 | feature | medium | typescript-pro | V1 |
| T4 | Add lightweight usage/handoff summaries | 2-4 | feature | medium | engineering-lead | V1 |
| V2 | Validate wave 2 | — | validation | medium | validation-lead | T3, T4 |

## Execution Waves

### Wave 1 — Workflow gates and diagnostics

**T1: Add source-of-truth and verify-loop guidance** [medium] — planning-lead

Update workflow skills so plans and reviews explicitly identify:

- source of truth files/docs/commands
- success criteria
- verification commands
- evidence required before marking a task done
- stop conditions when evidence contradicts assumptions

Likely files:

- `pi/skills/workflow/do-it.md`
- `pi/skills/workflow/review-it.md`
- `pi/skills/workflow/plan-it.md`
- possibly `pi/skills/workflow/research.md`

Acceptance criteria:

1. `/do-it` requires task completion claims to cite verification evidence.
2. `/review-it` distinguishes suspected issues from verified issues and names source-of-truth evidence.
3. `/plan-it` asks plans to list source-of-truth files/commands and validation evidence.

**T2: Design and implement lightweight `/diagnostics` command** [medium] — typescript-pro

Add a Pi extension command that runs on-demand project diagnostics based on marker files. It should be explicit and not continuous.

Possible behavior:

```text
/diagnostics
/diagnostics quick
/diagnostics typescript
/diagnostics python
```

Initial command mapping:

- TypeScript/Pi extensions: `cd pi && npx esbuild ...` or existing targeted checks where available.
- Python: `make lint-python` or `uv run ruff check ...` when configured.
- Repo tests: suggest, not automatically run, expensive `make test` unless requested.

Acceptance criteria:

1. Command reports detected project markers and selected checks.
2. Command runs only explicit diagnostics, not background watchers.
3. Command output is shown via `pi.sendMessage` or UI notification with pass/fail status.
4. Missing tools are reported clearly without crashing.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead

Checks:

1. Review workflow skill diffs for source-of-truth and evidence language.
2. Run targeted TypeScript parse/check for new extension files.
3. Manually exercise `/diagnostics quick` if possible.
4. Confirm command does not mutate files.

### Wave 2 — Checkpoints, usage, and handoff

**T3: Add opt-in git checkpoint command** [medium] — typescript-pro

Implement a lightweight checkpoint command, avoiding destructive restore behavior unless separately confirmed.

Possible commands:

```text
/checkpoint create [label]
/checkpoint list
/checkpoint status
```

Recommended initial implementation:

- Create annotated/lightweight git tags or refs only when working tree is clean enough, or create a patch file under ignored local state.
- Do not run `git reset --hard` or automatic restore.
- For dirty working trees, write a patch snapshot to ignored `.pi/checkpoints/` and report path.

Acceptance criteria:

1. Checkpoint creation never discards work.
2. Dirty-tree checkpoint uses an ignored local artifact path.
3. Restore is not implemented or requires explicit separate confirmation.
4. `/do-it` guidance recommends checkpoint creation before risky multi-file waves but does not force it.

**T4: Add lightweight usage/handoff summaries** [medium] — engineering-lead

Improve visibility without building a full dashboard.

Possible outputs:

```text
/usage
/handoff [brief]
```

`/usage` can summarize current session usage/cost from session entries, similar to `/context` but focused on spend and turn counts.

`/handoff` can generate a compact session summary for a new focused session:

- objective
- decisions
- files changed
- commands run
- remaining risks
- next command suggestions

Acceptance criteria:

1. Usage summary is local-only and does not export secrets/session content externally.
2. Handoff summary warns users to review for sensitive content before sharing.
3. Handoff output is concise enough to paste into a new session.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [medium] — validation-lead

Checks:

1. Checkpoint command tested on clean and dirty working tree scenarios without destructive operations.
2. Usage/handoff command outputs contain no secret-looking tokens from tool outputs in normal use.
3. Targeted extension parse/check passes.
4. Documentation or command descriptions explain safety boundaries.

## Success Criteria

1. Workflow skills require clearer source-of-truth and verification evidence.
2. `/diagnostics` provides explicit validation-phase feedback without continuous LSP noise.
3. Checkpoints provide a safe pre-wave recovery aid without destructive restore behavior.
4. Usage/handoff summaries improve observability and session continuity locally.
5. SCIP/code-intelligence exploration remains separate in `.specs/code-intelligence-notes/notes.md`.

## Validation Commands

Likely commands during implementation:

```bash
cd /c/Users/mglenn/.dotfiles/pi && npx esbuild extensions/<changed>.ts --bundle=false --format=esm --platform=node --outdir=/tmp/pi-check
node --check pi/extensions/web-fetch/fetch.js
make lint-python
```

Use narrower checks when files touched are limited.

## Follow-up / Out of Scope

- Full Babysitter adoption.
- Continuous LSP integration.
- Full cost dashboard/web UI.
- SCIP/backend code-intelligence implementation; see `.specs/code-intelligence-notes/notes.md`.
- Filechanges session log/undo; explicitly deferred.
