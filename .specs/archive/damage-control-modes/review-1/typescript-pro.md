## Finding 1
severity: high
evidence: `activeDamageControlMode` is module-level state in `pi/extensions/damage-control.ts`, and every `tool_call` handler plus both command handlers read/write that same variable. Calling `default(piA)`, setting `/dc mode noshell`, then calling `default(piB)` resets the global to `default`; piA's already-registered handlers now run in `default` instead of `noshell`. This violates the plan's instance-local/session-local state requirement under repeated extension registration.
required_fix: Move mode state into the extension registration closure (`export default function`), pass getters/setters into command registration, and have handlers close over that per-registration variable.

## Finding 2
severity: medium
evidence: The command handler parses with `const [subcommand, rawMode] = trimmed.split(/\s+/, 2)`. `/damage-control mode whitelist extra` produces `subcommand === "mode"` and `rawMode === "whitelist"`, so it silently changes mode despite not matching the exact accepted commands and despite the plan requiring invalid args to show usage.
required_fix: Tokenize without truncating, require exactly two tokens for `mode`, and show usage when any extra token is present.
