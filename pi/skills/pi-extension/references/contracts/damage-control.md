# Damage Control

- Ownership: Pi owns its damage-control policy, parser, enforcement, decisions, and telemetry. Retired cross-client parity plans and shared-policy proposals are not current authority.
- Authorization: a direct request authorizes its named target and mutation, but does not erase executable safety controls. Do not ask for a second conversational approval when the tool-level damage-control boundary already governs the action.
- Outcomes: covered calls resolve to allow, ask, or block. Hard blocks have no approval path. Ask-tier calls use the runtime confirmation boundary; denial, Escape, or unavailable UI fails closed.
- Policy health: missing, malformed, invalid, or unsupported policy fails closed for covered tools. Never silently fall back to an allow policy.
- Scope: enforcement occurs before registered covered Pi tools execute. It does not automatically govern unrelated external harnesses or processes that bypass Pi tool hooks.
- Shell modes: current modes are `default` and `noshell`. `noshell` blocks Bash and PowerShell. Retired whitelist and plan-grant modes must not be restored implicitly.
- Paths and commands: canonicalize targets before decisions. Apply tool-, platform-, path-, semantic Git-, AST-, sequence-, taint-, and secret-output controls together; one narrow allow does not suppress other matching rules.
- Deletion: auto-allow ask-tier deletion only when every statically proven target stays inside the session cwd or an approved scratch root. Dynamic targets, traversal, protected floors, symlink prefixes, parse failure, and remote payloads retain confirmation or blocking.
- Repetition: stop repeated equivalent failures, blocks, or successful no-op calls with the circuit breaker. Reset on direct user input or settlement, not on automatic continuation.
- Audit: record bounded, redacted decisions and rule-load failures. Debug logging is opt-in. Shadow judging is asynchronous and non-authoritative; telemetry thresholds never grant execution authority automatically.
- Live failure: the first failed live mutation stops broader rollout. Diagnose and recover that boundary before continuing.
