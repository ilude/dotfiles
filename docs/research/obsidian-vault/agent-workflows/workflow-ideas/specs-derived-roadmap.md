# Specs-derived roadmap ideas

These ideas combine the `.specs/` trajectory with the newer ecosystem research.

## 1. Pi cockpit status before Pi cockpit UI

The zellij cockpit specs and cmux research agree on the problem: once multiple agents/tasks exist, attention management matters most.

KISS slice:

```text
.pi/tasks/<id>/status.json
.pi/tasks/<id>/summary.md
.pi/tasks/<id>/needs-attention.md
```

Add one command that prints active tasks, blockers, changed files, and validation state. Do this before custom TUI work.

Related:

- [agent-terminal-workspaces](../patterns/agent-terminal-workspaces.md)
- [manaflow-cmux](../projects/manaflow-cmux.md)
- [specs-workflow-trajectory](specs-workflow-trajectory.md)

## 2. Reviewed learned helpers

The Browser Harness pattern fits the existing bias toward guarded mutation.

KISS slice:

- Agents may generate helper scripts in a narrow `helpers/` directory.
- Helpers are not automatically trusted.
- Promotion to default workflow requires review and tests or a manual smoke check.

Related:

- [self-healing-harnesses](../patterns/self-healing-harnesses.md)
- [browser-use-browser-harness](../projects/browser-use-browser-harness.md)

## 3. One memory promotion lane

The memory specs repeatedly warn against raw, implicit memory. Keep one explicit lane:

1. Raw session/content exists in runtime storage or menos.
2. Candidate insight is extracted.
3. Human reviews promotion.
4. Stable knowledge lands in Markdown, expertise logs, or project docs.

KISS slice:

```text
docs/research/<topic>/candidates.md
docs/research/<topic>/accepted.md
docs/research/<topic>/rejected.md
```

Related:

- [markdown-skills-memory](../patterns/markdown-skills-memory.md)
- [openclaw](../projects/openclaw.md)

## 4. Commit workflow remains the model for dangerous actions

The Pi commit specs have the clearest state-change contract:

- plan first;
- validate message;
- stage exact paths;
- create with token confirmation;
- no hidden broad mutation.

Use this same pattern for future risky actions: secret injection, sandbox artifact import, generated helper promotion, and background backfills.

## 5. Sandbox only when the threat model says so

Daytona, Multipass, and YOLO specs all support isolation, but the KISS default should remain local trusted execution.

Use sandboxing for:

- unknown repos;
- untrusted dependencies;
- long autonomous runs;
- browser automation with logins/payments;
- experiments that might dirty the host.

Related:

- [sandboxed-agent-runtimes](../patterns/sandboxed-agent-runtimes.md)
- [daytona](../projects/daytona.md)

## 6. Platform packs, not giant prompts

Convex agent plugins demonstrate a useful shape: rules + skills + reviewer + hooks. Translate this into Pi without overbuilding.

KISS slice for any platform:

```text
docs/platform-guides/<name>/
  rules.md
  examples.md
  validation.md
```

Only after the docs stabilize should we add a Pi skill or extension.

Related:

- [agent-friendly-platforms](../patterns/agent-friendly-platforms.md)
- [convex-agent-plugins](../projects/convex-agent-plugins.md)

## 7. Windows process safety is a first-class workflow feature

The bash crash specs show that agent tooling can fail from process orchestration, not code logic.

KISS rules:

- Prefer PowerShell for Windows-native hooks/tasks.
- Avoid spawning bash repeatedly from hooks.
- Add debouncing for background work.
- Make background jobs observable and killable.

## 8. Research ingestion should converge on menos

The YouTube, X research, and knowledge compiler specs all point to menos as the durable content store.

KISS slice:

- Try menos first.
- Local fallback only on connection/5xx.
- Store content IDs in notes.
- Backfill explicitly or via observable background jobs.

## Near-term practical sequence

1. Keep this vault as the human-readable research map.
2. Add a `workflow-ideas/backlog.md` note for candidate Pi improvements.
3. Pick one tiny implementation: status artifacts or reviewed helper directory.
4. Validate with one real workflow before expanding.
