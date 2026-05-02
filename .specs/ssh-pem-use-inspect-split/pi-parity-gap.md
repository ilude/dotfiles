# SSH use/inspect split: status across Claude and pi

## Status: CLOSED for the metadata-tool case. SSH USE on bash is N/A on pi.

## What landed in Claude

`claude/hooks/damage-control/bash-tool-damage-control.py` (commit `f79ffe1`)
distinguishes SSH USE commands from SSH INSPECT commands when matched against
SSH-protected zeroAccessPaths globs (`~/.ssh/`, `*.pem`, `*.ppk`, `*.p12`,
`*.pfx`):

- USE (ssh -i, scp -i, sftp -i, GIT_SSH_COMMAND=, ssh-keygen -l,
  ssh-keyscan): silent allow.
- INSPECT (ls, stat, file): downgraded to ask.
- Everything else (cat, cp, tar, base64, etc.): block.
- Per-segment evaluation so `ssh -i key.pem && cat key.pem` correctly blocks
  on the second segment.

## What landed in pi

`pi/extensions/damage-control.ts` runs zero-access checks ONLY in the file-tool
handler (read/write/edit/find/ls). The bash handler runs dangerous_commands
and no_delete_paths, but NOT zero_access -- so `bash: ssh -i ./key.pem
user@host` was never blocked by pi, before or after this work. The earlier
draft of this doc claimed pi blocked it; that claim was wrong.

For file-tools, the pi-side change adds:

- `read|write|edit` on ssh-protected patterns -> block (content exposure;
  unchanged from before).
- `ls|find` on ssh-protected patterns -> ask via `ctx.ui.confirm`. Falls back
  to "Confirmation required" block when there is no UI.
- non-ssh zero-access patterns (e.g. `.env`, `~/.aws/`) -> block, regardless
  of tool. Unchanged.

`SSH_USE_COMMANDS` has no analog on pi: pi's bash handler doesn't run
zero_access in the first place, so there is no use-silent-allow to express.

## Tests

- Claude: 35 cases in `claude/hooks/damage-control/tests/test_ssh_use_inspect_split.py`.
- pi: 22 cases in `pi/tests/damage-control.test.ts` covering content-block,
  metadata-ask-with-confirm, metadata-block-without-UI, non-ssh-still-blocks,
  and `isSshProtectedPattern` unit checks.

## Known unrelated infra issue

The pi vitest run on this Windows-pnpm box has 103 pre-existing test failures
across other test files (not damage-control). Root cause: `pi/tests/vitest.config.ts`
aliases (`pi-tui`, `pi-ai`, `pi-agent-core`, `typebox`) resolve to
`piPackageRoot/node_modules/...` which works for bun/npm globals but not for
pnpm's content-addressable `.pnpm/` store layout. The `chore(pi/tests):
add pnpm-global probe` commit fixed the top-level pi-coding-agent lookup but
not the transitive-dep aliases. Tracked separately; out of scope for this
SSH work.
