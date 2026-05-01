# Pi-side parity gap for SSH use/inspect split

## What landed in Claude (this change)

`claude/hooks/damage-control/bash-tool-damage-control.py` now distinguishes
SSH USE commands from SSH INSPECT commands when matched against
SSH-protected zeroAccessPaths globs (`~/.ssh/`, `*.pem`, `*.ppk`,
`*.p12`, `*.pfx`):

- USE (ssh -i, scp -i, sftp -i, GIT_SSH_COMMAND=, ssh-keygen -l,
  ssh-keyscan): silent allow.
- INSPECT (ls, stat, file): downgraded to ask.
- Anything else (cat, cp, tar, base64, etc.): block (unchanged).
- Per-segment evaluation so `ssh -i key.pem && cat key.pem` correctly
  blocks on the second segment.

Tests: `claude/hooks/damage-control/tests/test_ssh_use_inspect_split.py`
(35 cases). Full suite: 747 passed, 0 regressions.

## What pi currently does

`pi/extensions/damage-control.ts` `checkZeroAccess()` is a flat glob match
that returns block-or-allow. There is no SSH command awareness. Result on
pi today, with `*.pem` and `~/.ssh/*` in `zero_access_paths`:

| Command                                | pi today | Claude today |
|----------------------------------------|----------|--------------|
| `ssh -i ./key.pem user@host`           | block    | allow        |
| `ssh -i ~/.ssh/id_ed25519 user@host`   | block    | allow        |
| `ls ~/.ssh/`                           | block    | ask          |
| `cat ./key.pem`                        | block    | block        |

So pi is currently more restrictive than Claude on legitimate SSH usage,
and has no concept of "ask" for zero-access paths.

## Why I didn't port in this change

- Real porting work: new regex lists, segment splitter, async
  `checkZeroAccess` returning a 3-state result, plus call-site update at
  line 565 to handle the ask path through `ctx.ui.confirm`.
- TypeScript test suite (`pi/tests/damage-control.test.ts`) needs
  parallel cases.
- Out of scope for the original "also allow ls ~/.ssh/" follow-up.

## Recommended follow-up

Open a tracked task: "Port SSH use/inspect split to pi/extensions/damage-control.ts."
Mirror the eight regex entries, port `_split_on_shell_operators` to TS,
refactor `checkZeroAccess` to return `{block} | {ask} | undefined`, and
wire ask through the existing `ctx.ui.confirm` plumbing already used by
`evaluateDangerousCommand`. Add parallel tests in
`pi/tests/damage-control.test.ts`.

Until then: if running pi against the same dotfiles environment,
`ssh -i *.pem user@host` will be blocked. Workaround is to either
(a) move the .pem into `~/.ssh/` and accept the same block,
(b) place keys in a path explicitly excluded from `zero_access_paths`,
or (c) temporarily comment out `*.pem` in `pi/damage-control-rules.yaml`
while doing AWS work and restore after.

None of those workarounds are great. The proper fix is the port.
