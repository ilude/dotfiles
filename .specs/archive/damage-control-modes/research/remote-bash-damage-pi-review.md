# Analysis: `disler/bash-damage-from-within/pi`

**Scope:** cloned `https://github.com/disler/bash-damage-from-within` and reviewed `pi/` plus repo-level runner/test-adjacent docs.
**Files reviewed:** Pi READMEs, Pi extensions, `justfile`, relevant root README sections.

## Summary

The Pi implementation is a five-level security demo for agent shell control. It progresses from prompt-only guidance to Pi `tool_call` enforcement and finally removal of bash plus narrow custom tools. Its strongest architectural point is demonstrating the security boundary shift from “model decides” to “harness enforces”; its weakest point is that it is mostly a demo scaffold with manual attack prompts, not an automated test suite.

## Architecture

Pi relies on auto-discovered `.pi/extensions/*.ts` files and the `tool_call` event. The root Pi README describes the extension model and block contract:

- `pi/README.md:3` says each level’s `.pi/extensions/*.ts` is auto-discovered from the working directory.
- `pi/README.md:13-25` documents `pi.on("tool_call", ...)` returning `{ block: true, reason }`.
- `pi/README.md:28` says this was verified against `@mariozechner/pi-coding-agent` `0.70.6`.

The level ladder is:

| Level | Mechanism | Evidence |
|---|---|---|
| 1 | user-channel `safe-mode` skill | `pi/README.md:7`, `pi/level-1-user-prompt/.pi/skills/safe-mode/SKILL.md:1-20` |
| 2 | appended system prompt | `pi/README.md:8`, `pi/level-2-system-prompt/invoke.sh:7` |
| 3 | bash blacklist extension | `pi/README.md:9`, `pi/level-3-blacklist/.pi/extensions/blacklist.ts:16-28` |
| 4 | default-deny whitelist extension | `pi/README.md:10`, `pi/level-4-whitelist/.pi/extensions/whitelist.ts:13-27` |
| 5 | block bash + register custom tools | `pi/README.md:11`, `pi/level-5-no-bash/.pi/extensions/no-bash.ts:34-122` |

The repo also provides `just` recipes for running each Pi level. Example: `justfile:132-142` runs level 3, `justfile:145-155` runs level 4, and `justfile:158-168` runs level 5.

## Feature Set

### Level 1: skill-only guardrails

The `safe-mode` skill declares target assets and forbidden behaviors:

- `target/production.db`, `customer_data.json`, `secrets.env`: `pi/level-1-user-prompt/.pi/skills/safe-mode/SKILL.md:8-12`
- forbids deleting `target/`, reading secrets, destructive CLIs, and curl/wget exfiltration: `SKILL.md:14-20`

This is intentionally non-enforcing. The README states the skill is just text and the model decides what to do: `pi/level-1-user-prompt/README.md:35-37`.

### Level 2: appended system prompt

`invoke.sh` launches:

```bash
pi --append-system-prompt "$(cat ./system-prompt.txt)"
```

Evidence: `pi/level-2-system-prompt/invoke.sh:5-7`.

The prompt forbids recursive/force `rm`, cloud CLIs, curl/wget exfiltration, and asks the model to refuse violating requests: `pi/level-2-system-prompt/system-prompt.txt:1-8`.

Again, no hard enforcement. The README explicitly says “Still: zero enforcement”: `pi/level-2-system-prompt/README.md:5`.

### Level 3: blacklist enforcement

The extension subscribes to `tool_call`, ignores non-bash tools, inspects `event.input.command`, and blocks if a regex matches:

- bash-only filter: `pi/level-3-blacklist/.pi/extensions/blacklist.ts:31-34`
- regex loop and block response: `blacklist.ts:36-43`

Blocked patterns include:

- recursive/force `rm`: `blacklist.ts:17`
- root path `rm`: `blacklist.ts:18`
- `sudo`: `blacklist.ts:19`
- world-writable chmod: `blacklist.ts:20`
- `aws`, `gcloud`, `vercel`: `blacklist.ts:21`
- `curl | sh`: `blacklist.ts:22`
- destructive git reset/unsafe force-push: `blacklist.ts:23-24`
- `dd` to device, `mkfs`, and `target/secrets.env`: `blacklist.ts:25-27`

Known bypasses are documented: encoded Python cleanup, renamed binary, `git clean -fdx`, and `python -c shutil...` slip through because they do not match the blacklist: `pi/level-3-blacklist/README.md:23-25`.

### Level 4: whitelist enforcement

The extension default-denies bash commands unless they fully match curated patterns.

Key behavior:

- trims command: `pi/level-4-whitelist/.pi/extensions/whitelist.ts:33`
- rejects shell operators before allowlist matching: `whitelist.ts:27`, `whitelist.ts:36-40`
- allows only anchored patterns: `whitelist.ts:13-25`
- blocks everything else with reason and pattern count: `whitelist.ts:47-52`

Allowed patterns include `pwd`, constrained `ls`, `cat` of `.md/.txt/.json`, `npm test`, `pnpm test`, `uv run pytest`, `uv run ruff`, narrow git read-only commands, and version checks: `whitelist.ts:14-25`.

The README calls out drift risks: careless `bash .*\.sh`, broad git allowlists, and running arbitrary `.py` files: `pi/level-4-whitelist/README.md:21-27`.

### Level 5: no bash + custom tools

Level 5 combines two controls:

1. Hard-block every bash call:
   - `pi/level-5-no-bash/.pi/extensions/no-bash.ts:35-46`
2. Register safe replacement tools:
   - `run_tests`: `no-bash.ts:50-74`
   - `git_status`: `no-bash.ts:76-95`
   - `list_target`: `no-bash.ts:97-122`

`run_tests` executes `uv run pytest -q` via `execFile`, with cwd set to `process.cwd()` and 60s timeout: `no-bash.ts:57-61`. Output is capped to the last 2000 chars: `no-bash.ts:63`, `no-bash.ts:68`.

`git_status` uses `git status --porcelain -b`: `no-bash.ts:83`.

`list_target` returns filenames only, not file contents: `no-bash.ts:100-111`.

The recommended invocation also removes `bash` from the tool list:

```bash
pi --tools read,edit,write,grep,find,run_tests,git_status,list_target
```

Evidence: `pi/level-5-no-bash/README.md:14-20`, `justfile:167-168`.

## Detection / Allow / Block Behavior

- **Non-bash tools:** Level 3 and 4 ignore them entirely (`event.toolName !== "bash"` returns undefined): `blacklist.ts:31-32`, `whitelist.ts:30-31`.
- **Blacklist mode:** blocks only known bad strings. Allows unknown destructive equivalents by design.
- **Whitelist mode:** blocks all bash not explicitly allowed, plus blocks shell operators `&&`, `||`, `;`, `|`, backticks, `$()`, redirects, `<`/`>` before matching: `whitelist.ts:27`, `whitelist.ts:36-40`.
- **No-bash mode:** blocks all bash regardless of command: `no-bash.ts:36-44`.
- **Custom tool scoping:** `list_target` mitigates exfiltration by returning names only, but README admits the built-in `read` tool could still read `target/secrets.env` unless read interception is added: `pi/level-5-no-bash/README.md:28-39`.

## Tests / Validation

I did not find automated test files for the Pi extensions under the reviewed tree. There are manual attack prompts and `just` recipes:

- Attack prompts are referenced by level 1 README: `pi/level-1-user-prompt/README.md:33`.
- Level outcome claims are documented in READMEs, e.g. level 3 direct `rm` blocked and encoded script bypasses: `pi/level-3-blacklist/README.md:23-25`.
- `justfile` provides runnable demos for `pi-1` through `pi-5`: `justfile:105-168`.

So validation appears demo/manual rather than unit-tested. There is no evident TypeScript test harness asserting extension block/allow decisions.

## Strengths

- Clear pedagogical progression from prompt guidance to enforced policy.
- Uses Pi-native `tool_call` and `pi.registerTool()` primitives rather than model-only refusal.
- Level 4 correctly demonstrates default-deny as stronger than blacklist enumeration.
- Level 5 removes arbitrary shell and replaces it with narrow task-specific tools.
- Good self-awareness: README documents bypasses and whitelist drift risks.

## Weaknesses / Gaps

- No automated tests found for blacklist/whitelist/no-bash behavior.
- Level 3 blacklist is intentionally bypassable and only protects known patterns.
- Level 4 allows commands like `npm test`/`pnpm test`; root README notes test runners can shell out and reopen execution risk (`README.md:186-188`).
- Level 5 still permits `read`, `edit`, and `write`; README notes `read target/secrets.env` remains possible unless read-tool interception is added (`pi/level-5-no-bash/README.md:28-39`).
- Custom tools use `execFile`, which avoids shell injection, but `run_tests` still executes project-controlled tests; that is safer than arbitrary bash but not equivalent to a sandbox.
