## Validation assessment: **Not release-gate complete**

I inspected the requested coverage surfaces and delegated QA/security review. Current coverage catches many pure logic regressions, but **ask/block regressions can still slip through at runtime integration boundaries**.

### Key gaps

1. **Pi damage-control is mostly unit-tested, not live extension-tested**
   - `pi/tests/damage-control.test.ts` directly tests exported helpers like:
     - `evaluateDangerousCommand`
     - `parseDamageControlRules`
     - `checkZeroAccess`
     - no-delete target extraction
   - Missing: instantiate `pi/extensions/damage-control.ts` default export with a fake `pi.on(...)`, then replay real-shaped `tool_call` events.
   - Risk: handler registration, `ctx` shape, `toolName` routing, `loadRules()`, or return semantics could break while helper tests still pass.

2. **Claude hook tests exercise internals, not enough live hook protocol**
   - `claude/hooks/damage-control/tests` has good `check_command()` coverage, especially git semantics and SSH use/inspect split.
   - Missing: subprocess-style hook simulations with Claude JSON stdin/stdout/exit-code behavior for:
     - allow
     - ask
     - block
   - Risk: logic remains correct but hook protocol output regresses.

3. **Common test commands can miss Pi regressions**
   - `make test` and `make test-pytest` run Python/Claude hook tests only.
   - Pi Vitest coverage runs under `make check-pi-extensions` or `make check`.
   - `pi/justfile` uses `bun vitest`, conflicting with repo policy that Pi TypeScript tests are pnpm-only.

4. **Ask/block policy matrix is incomplete**
   Missing or thin coverage:
   - `action` omitted defaults to block.
   - `action: block` ignores confirmation UI.
   - `action: ask` with `hasUI: false` blocks.
   - `exclude_platforms`.
   - platform aliases: `windows`, `win`, `macos`, `darwin`.
   - ask/block behavior through the actual registered bash handler.

5. **Security-sensitive bash zero-access gap**
   - Pi file tools enforce `zero_access_paths`, but Pi `bash` handler currently does not.
   - Tests document this behavior, but security-wise this leaves bypass-shaped cases unless covered by dangerous command rules:
     - `bash: cat .env`
     - `bash: cat ~/.ssh/id_rsa`
     - `bash: base64 ./key.pem`
     - `bash: grep secret ~/.aws/credentials`

## Proposed verification matrix

| Layer | Scenario | Expected |
|---|---|---|
| Pi pure unit | `action: ask`, user denies | block |
| Pi pure unit | `action: ask`, user confirms | allow |
| Pi pure unit | `action: ask`, no UI | block |
| Pi pure unit | `action: block` with confirm available | block, confirm not called |
| Pi pure unit | omitted `action` | block |
| Pi pure unit | `platforms` / `exclude_platforms` | applies only on intended platforms |
| Pi extension smoke | Load default extension with fake `pi.on` | handlers register successfully |
| Pi extension smoke | Replay `bash` dangerous command event | ask/block returned correctly |
| Pi extension smoke | Replay `pwsh Remove-Item package.json` | no-delete block |
| Pi extension smoke | Replay `read .env` | zero-access block |
| Pi extension smoke | Replay `ls ~/.ssh` with confirm true/false/no UI | allow/block/block |
| Pi extension smoke | Load rules from project `.pi/damage-control-rules.yaml` fixture | runtime uses configured rules |
| Claude unit | `check_command()` git destructive/safe cases | correct ask/block/allow tuple |
| Claude live hook | Subprocess JSON stdin: allow case | protocol allow response |
| Claude live hook | Subprocess JSON stdin: ask case | protocol ask response |
| Claude live hook | Subprocess JSON stdin: block case | protocol block response |
| Validation command | CI/release runs `make check` or explicit pnpm Pi test/typecheck | both Claude and Pi surfaces covered |

## Highest-priority additions

1. Add a **Pi extension-load smoke test** for `damage-control.ts` using fake `pi.on` and real-shaped `tool_call` events.
2. Add **Claude live hook protocol tests** for representative allow/ask/block cases.
3. Make release validation use `make check` / `make check-pi-extensions`, not only `make test`.
4. Decide whether Pi `bash` should enforce zero-access content reads; if yes, add regression tests for `.env`, SSH keys, PEMs, and compound commands.