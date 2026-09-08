# Default Damage Control behavior contract

## Design purpose

Damage Control exists to prevent meaningful unrecoverable harm, not to block every suspicious-looking action. Routine recoverable work should proceed without approval. Judge the actual effects, target and available recovery, not merely command names, flags, unfamiliar syntax, variables, helper scripts, or whether an operation is local or remote.

Intervene when there is a credible risk of losing meaningful data or uncommitted work, destroying recovery mechanisms or important system state, irreversible sensitive disclosure, or other substantial irreversible consequences. Uncertainty warrants intervention when it materially affects that risk; an analysis limitation alone is not evidence of danger. Do not require universal proof of harmlessness or turn routine maintenance into a security review.

Prefer the least intrusive effective response: allow established low-risk work, use contextual judgment where consequences need interpretation, and require operator approval or block when consequential risk or an explicit retained prohibition justifies it. Known recovery matters; merely being Git-tracked or named `temp` does not prove current contents disposable. Independent user/project authorization requirements still apply.

This is the operator's governing design requirement, clarified on 2026-09-08. Legacy parity is historical compatibility evidence, not the philosophical goal. The [risk and proportionality review](../../../../.specs/damage-control-risk-alignment-and-preapproval/damage-control-risk-review.md) records the findings that drove the implemented alignment. Historical decisions remain recorded rather than rewritten.

## Current runtime behavior

The implementation retains the legacy rule inventory as migration history while changing authority according to actual consequences:

- Established rebuildable caches, empty-directory removal, ordinary generated artifacts and lockfiles, harmless decoded output, and public certificates do not prompt merely because of syntax or names.
- Root/home destruction, meaningful unique or uncommitted work, recovery mechanisms, important system state, sensitive disclosure, and consequential remote mutations remain protected. Independent push and deployment authorization still applies.
- Mixed-risk deletion, Git, container, infrastructure, publication, scheduling, database, and process operations can use contextual Luna judgment. Relevant inherited/static variable evidence is bounded and redacted; unknown syntax or names alone are not danger.
- Sensitive-read/upload correlation is review evidence. Actual sensitive-source upload retains direct intervention, and sequence state clears with its session.
- Matching script preapproval is bound to source SHA-256 and optional exact argv/helper hashes. It skips only that body analysis; substitutions, redirects, and adjacent commands remain checked. Git repositories store records under their common Git directory; non-Git projects use the current cwd's `.pi/` directory.
- `/dc scan` discovers tracked and nonignored project scripts, excludes generated/dependency output, and uses bounded parallel read-only subagents without executing scripts. Completed unchanged results are reused.
- Eligible prompts add `Allow once and review for future use`. The current call proceeds without waiting; only a completed, source-stable qualifying review grants future reuse.
- The failed-call watchdog counts adjacent exact tool/input/effective-cwd failures. It permits twelve failures and blocks attempt thirteen. Unrelated calls, success, and direct operator resumption reset the streak; successful polling has no limit.
- `/dc on`, `/dc off`, `/dc scan`, `/dc mode default`, and `/dc mode noshell` are supported. There is no `/dc status`; `pp --dc-recovery` remains available.
- There is no mandatory project scan, environment inventory, sandbox, dependency resolver, persistent telemetry, or change to legacy.

The earlier parity audit is historical: [restoration plan](../../../../.specs/archive/damage-control-provenance-audit/plan.md) and [audit report](../../../../.specs/archive/damage-control-provenance-audit/full-audit.md). The approved environmental changes above supersede its exact-parity decisions only for the named behavior.
