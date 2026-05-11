---
reviewer: product-manager
status: complete
---

# Findings

- severity: high
  evidence: "Concrete end state" requires Windows install flow, macOS/Linux/WSL docs/install hooks, wrapper, Pi guidance, and automated tests for a CLI already usable via `npx -y agent-browser --version`.
  required_fix: Reduce v1 scope to one Pi-facing wrapper invocation path plus one canonical quick-start. Defer global installation, cross-platform install hooks, and repo-wide docs until repeated use proves `npx`/documented invocation is insufficient.

- severity: high
  evidence: T2 says add install support across `install.ps1`, `Brewfile`, optional `install`, `wsl/packages`, README notes, while also saying Linux/WSL package availability is uncertain.
  required_fix: Do not modify global install flows for uncertain platforms. Make `agent-browser` optional and verified at runtime; add a small helper that checks availability and prints install commands instead of changing OS/package installers.

- severity: medium
  evidence: T3 proposes `scripts/agent-browser-brave` plus optional PowerShell helper/state tracking, CDP status, cleanup, real-profile warnings, and profile modes.
  required_fix: First implement only `--help`, `--open`, and `--connect-port` for dedicated profile; remove cleanup/state management and real-profile mode from v1 unless a specific manual workflow requires it. Avoid building a browser session manager prematurely.

- severity: medium
  evidence: T4 and T5 target `pi/skills/...`, `AGENTS.md`, `pi/README.md`, `README.md`, docs cross-links, and tests, risking several authoritative recipes.
  required_fix: Choose exactly one canonical Pi skill/doc surface for usage instructions and link to it from at most one repo-level location. Add a test that enforces a single canonical quick-start rather than spreading examples across multiple files.

- severity: medium
  evidence: Validation contract requires `make check`, every acceptance criterion, browser smoke verification, and manual authenticated X validation classification before archive.
  required_fix: Split validation into v1 automated smoke only: wrapper help plus `npx -y agent-browser --version`; make authenticated X/real-profile validation explicitly out of scope for this plan unless the user asks for that workflow now.
