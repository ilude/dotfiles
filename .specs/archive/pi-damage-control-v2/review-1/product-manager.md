---
reviewer: product-manager
status: complete
---

# Findings

- severity: high
  evidence: "Execution Checklist defines 4 waves/9 tasks plus 5 final gates, but current files already show implemented health/status and pnpm recipes: `pi/extensions/damage-control.ts` contains `damage-control: active/failed`; `pi/justfile` has `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`; `pi/damage-control-rules.yaml` already has regex rules for rm/git push/git clean."
  required_fix: "Replace the wave plan with a gap-driven hardening plan: preflight diff, run existing tests, identify only missing acceptance gaps, then implement those. Remove T9 and any T2/T3 work already proven complete."

- severity: high
  evidence: "T5 requires `/permissions` replay payloads with `toolName`, `input`, and `cwd`; the plan also targets secret-read/exfil commands (`cat .env`, `cat ~/.ssh/id_ed25519`, `base64 ./key.pem`)."
  required_fix: "Do not persist raw tool `input` for denied safety events. Require a sanitized replay descriptor with command classification, redacted path tokens, cwd, and rule id/pattern only; add tests proving `.env`, SSH key paths, and inline secret-looking values are redacted."

- severity: medium
  evidence: "T4 mandates `/doctor --verbose` integration before proving the prompt/block loop is complete; Objective bundles status bar, doctor, permissions, shell wrappers, exfil, docs, and justfile updates into one execution plan."
  required_fix: "Split into MVP and follow-up. MVP: fail-closed rule loading, registered handler prompt/block coverage, high-confidence destructive/secret rules, Pi-specific tests. Defer `/doctor` and documentation unless a missing visibility requirement remains after status-bar and `/permissions` are verified."

- severity: medium
  evidence: "Validation Contract says manual live validation is required and blocks archiving; T7 already requires registered extension smoke tests with fake `pi.on`, status/prompt/block behavior, confirm true/false, no UI/failure, hard block, and safe command."
  required_fix: "Make manual validation optional/post-merge confidence, not an archive blocker, unless the automated smoke test cannot exercise Pi UI confirmation. Add a scripted harness or test fixture for the status/prompt path instead of relying on user restart and a potentially destructive `docker compose down`."

- severity: low
  evidence: "T6 asks to cover shell wrappers, secret reads, and exfil patterns from Claude hooks, including IMDS and secret-to-network pipelines, while saying 'Keep the set small and high-confidence' without a cap or explicit source list."
  required_fix: "Bound T6 to a named minimum rule matrix, e.g. 3 wrapper variants, 3 secret-read variants, and 1 IMDS pattern, all with safe negative tests. Move broader Claude parity to a separate backlog/spec to prevent unbounded pattern-porting."
