- severity: high
  evidence: T2 says Windows should use the existing global Node convention “likely pnpm where appropriate,” while preflight/verification still use `npx -y agent-browser --version`; this leaves implementers free to choose npm/npx despite the repo policy.
  required_fix: Specify the exact package manager per platform before implementation: pnpm for Windows Pi/global Node install if no existing Bun-compatible path is proven, no `npm install -g`, no lockfile creation, and `npx` allowed only as a non-install smoke probe if explicitly justified.

- severity: high
  evidence: The wrapper acceptance criteria require owned PID/session state, but the plan does not define state-file location, schema, stale PID handling, port collision behavior, or cleanup semantics after partial launch/connect failures.
  required_fix: Add a concrete state contract: gitignored XDG/local app-data path, PID plus command/port/profile/timestamp, verify PID command line before cleanup, handle stale records idempotently, allocate or reject occupied CDP ports safely, and leave unrelated browsers untouched on every failure path.

- severity: medium
  evidence: Cross-platform install support lists Windows/macOS/Linux/WSL, but the Brave wrapper criteria only require Windows discovery and a generic POSIX script. WSL cannot assume Linux Brave or direct Windows profile paths behave like Git Bash/MSYS2.
  required_fix: Split wrapper support matrix into Git Bash/MSYS2, PowerShell, native Linux, macOS, and WSL. For each, define whether Brave auto-discovery, dedicated profile launch, real-profile opt-in, and cleanup are supported, documented-only, or skipped with a clear diagnostic.

- severity: medium
  evidence: T2 permits editing `install.ps1`, `install`, `Brewfile`, and `wsl/packages`, but validation only checks diff/no lockfile/version. It does not require running installs twice or checking partial install recovery.
  required_fix: Add targeted idempotency validation: run the new install/verify helper twice, verify exit 0 and no duplicate PATH/profile/package entries, simulate missing `agent-browser` where practical, and document recovery when package install succeeds but browser/runtime setup fails.

- severity: medium
  evidence: macOS automation suggests `brew install agent-browser && agent-browser install`, but the plan provides no evidence that a Homebrew formula exists or that `agent-browser install` is required/safe for this CLI.
  required_fix: Move Homebrew usage behind T1 discovery: verify formula availability before adding to `Brewfile`; otherwise document the repo-approved Node global install path. Do not include unverified install subcommands in acceptance criteria.
