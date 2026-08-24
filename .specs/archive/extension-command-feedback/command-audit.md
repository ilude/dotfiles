# Extension Command Feedback Audit

## Inventory method

The deterministic inventory in `command-inventory.txt` is the sorted set of runtime names produced by all `registerCommand` sites under `pi/extensions/**/*.ts`. Literal registrations are collected directly; `COMMAND_NAME` in `bedrock-refresh.ts`, the `damage-control`/`dc` shared registration, and the `at`/`cron`/`schedule` loop are resolved from their runtime values. A secondary `rg -n -C 8 'registerCommand|COMMAND_NAME' pi/extensions --glob '*.ts'` call-site check reconciled 37 names with no omissions or duplicates.

Classification meanings:

- `change`: work can be noticeable and no visible acknowledgement precedes it.
- `compliant`: existing acknowledgement or meaningful UI can render before work.
- `immediate`: the command performs no potentially noticeable work, or its terminal output is the immediate operation.

## Classification

| Command | Registration/shared handler and material branches | First noticeable operation | Existing output and classification | Chosen pre-work acknowledgement |
|---|---|---|---|---|
| `at` | `scheduler.ts`, `handleAt`; valid/invalid schedule | schedule validation and persistence | terminal result only; change | notification before valid creation |
| `bedrock-refresh` | `bedrock-refresh.ts`; poll, `--apply`, invalid | AWS environment and polling | invalid is immediate; poll/apply change | notification before polling |
| `branch` | `workflow-commands.ts`; invalid, Herdr, terminal launcher | Herdr subprocess or synchronous launcher | errors/terminal result only; change | notification, then event-loop yield before launcher |
| `budget` | `session-budget.ts`; report only | in-memory report formatting | terminal report is immediate | none |
| `clear` | `workflow-commands.ts`; replacement session setup | session settling/replacement and Codex status | no pre-work output; change | notification before replacement |
| `commit` | `workflow-commands.ts`; TUI and non-TUI | Git inspection and commit flow | TUI loader compliant; non-TUI change | non-TUI notification before execution |
| `context` | `context.ts`; report/widget, clear/hide | `waitForIdle`, report generation | clear/hide immediate; report/widget change | notification before waiting |
| `copy-all` | `copy-all.ts`; empty, clipboard, fallback file | `waitForIdle`, clipboard/filesystem | no pre-work output; change | notification before waiting |
| `cron` | `scheduler.ts`, `handleCron`; valid/invalid schedule | schedule validation and persistence | terminal result only; change | notification before valid creation |
| `damage-control` | `damage-control.ts`, shared handler; status/stats/recent/judge/label/mode | bounded in-memory/session operations | terminal output is immediate | none |
| `dc` | `damage-control.ts`, alias of `damage-control` | same as `damage-control` | immediate | none |
| `do-it` | `workflow-commands.ts`; raw/canonical, discovery/preflight | repository discovery and worktree setup | display-only slash echo precedes work; compliant | existing slash echo |
| `effort` | `effort.ts`; show/set/invalid | in-memory model effort update | terminal notification is immediate | none |
| `exit` | `workflow-commands.ts` | shutdown request | immediate lifecycle request | none |
| `extension-stats` | `extension-stats.ts`; time windows | session filesystem scan/report | report only after scan; change | notification before scan |
| `fable` | `fable.ts`; invalid, model switch, dispatch | model resolution/switch and model turn | start notification precedes dispatch; compliant | existing notification |
| `fast` | `codex-fast.ts` | in-memory toggle | status and notification are immediate | none |
| `foreman` | `fable.ts`; invalid, model switch, dispatch | model resolution/switch and model turn | start notification precedes dispatch; compliant | existing notification |
| `goal` | `goal.ts`; status/stop/resume/start, foreground/unattended | process stop/resume or workflow worktree setup | status terminal output immediate; mutation branches change | branch-specific status message before mutation |
| `loop` | `loop.ts`; help/status/stop/resume/start | process control, Git preflight, launch | help/status immediate; dirty-start pre-commit message compliant; other mutation branches change | branch-specific display message |
| `new-instance` | `workflow-commands.ts`; invalid, Herdr, terminal launcher | Herdr subprocess or synchronous launcher | errors/terminal result only; change | notification, then event-loop yield before launcher |
| `new-terminal` | `workflow-commands.ts`; invalid, Herdr, terminal launcher | Herdr subprocess or synchronous launcher | errors/terminal result only; change | notification, then event-loop yield before launcher |
| `orchestration-stats` | `orchestration-stats.ts`; valid/invalid days | telemetry filesystem scan/report | invalid immediate; valid change | notification before report scan |
| `permissions` | `permissions.ts`; list/filter/retry | retry dispatch for retry branch | list/filter output immediate; retry change | notification before retry dispatch |
| `plan-it` | `workflow-commands.ts`; discovery/fallback/dispatch | repository discovery and lifecycle persistence | display-only slash echo precedes work; compliant | existing slash echo |
| `prd-it` | `workflow-commands.ts`; dispatch | skill load and model turn | display-only slash echo precedes work; compliant | existing slash echo |
| `provider` | `provider.ts`; interactive/list/set/remove | credential read/write and dialogs | interactive dialog is immediate UI; list/set/remove without dialog can work first; change where needed | notification before non-dialog credential work |
| `ps` | `background-terminal/index.ts` | dashboard opens and returns control | meaningful dashboard UI; compliant | existing dashboard |
| `refresh-models` | `refresh-models.ts`; invalid/unsupported/one/all | provider network refresh | existing `Refreshing model availability...` precedes refresh; compliant | existing notification |
| `schedule` | `scheduler.ts`, `handleSchedule`; list/cancel/invalid | schedule listing or cancellation | list terminal output immediate; cancel change | notification before cancellation |
| `skill-stats` | `skill-stats.ts`; report/filter | session filesystem scan/report | report only after scan; change | notification before scan |
| `subagents` | `subagent/index.ts`; non-TUI rejection/dashboard filters | dashboard construction | mode rejection immediate; TUI dashboard is meaningful UI; compliant | existing dashboard/rejection |
| `summarize` | `summarize/index.ts`; optional focus | `waitForIdle`, evidence serialization, model turn | no pre-work output; change | display-only slash echo before waiting |
| `tasks` | `tasks.ts`; help/list/show/settings and mutations | task-store read/write | bounded terminal operations with immediate result; immediate | none |
| `transcript-purge` | `transcript-purge.ts`; invalid/default/age | filesystem retention sweep/deletion | invalid immediate; purge change | notification before sweep |
| `usage` | `codex-status.ts` | forced credential/network usage refresh | report only after refresh; change | notification before refresh |
| `usage-stats` | `usage.ts`; cached and `--refresh-pricing` | usage/session scan; optional network pricing refresh | report only after work; change | notification before report generation |

## Mutation list

The handlers requiring implementation are: `at`, `bedrock-refresh`, `branch`, `clear`, non-TUI `commit`, report/widget `context`, `copy-all`, `cron`, `extension-stats`, mutating `goal` branches, mutating `loop` branches not already acknowledged, `new-instance`, `new-terminal`, valid `orchestration-stats`, retrying `permissions`, non-dialog `provider` branches, cancelling `schedule`, `skill-stats`, `summarize`, valid `transcript-purge`, `usage`, and `usage-stats`.
