# Default Damage Control behavior contract

## Design purpose

Damage Control exists to prevent meaningful unrecoverable harm, not to block every suspicious-looking action. Routine recoverable work should proceed without approval. Judge the actual effects, target and available recovery, not merely command names, flags, unfamiliar syntax, variables, helper scripts, or whether an operation is local or remote.

Intervene when there is a credible risk of losing meaningful data or uncommitted work, destroying recovery mechanisms or important system state, irreversible sensitive disclosure, or other substantial irreversible consequences. Uncertainty warrants intervention when it materially affects that risk; an analysis limitation alone is not evidence of danger. Do not require universal proof of harmlessness or turn routine maintenance into a security review.

Prefer the least intrusive effective response: allow established low-risk work, use contextual judgment where consequences need interpretation, and require operator approval or block when consequential risk or an explicit retained prohibition justifies it. Known recovery matters; merely being Git-tracked or named `temp` does not prove current contents disposable. Independent user/project authorization requirements still apply.

This is the operator's governing design requirement, clarified on 2026-09-08. Legacy parity is historical compatibility evidence, not the philosophical goal. The [risk and proportionality review](../../../../.specs/damage-control-risk-alignment-and-preapproval/damage-control-risk-review.md) records current mismatches and the requested `/dc scan` design context. This documentation update does not change enforcement or grant Luna authority beyond current rules; those changes require implementation. Historical decisions remain recorded rather than rewritten.

## Current runtime behavior

The implemented baseline is legacy Damage Control, with these operator-approved departures:

- Of 335 migrated command rules, 34 use contextual Luna review, 204 require operator approval, and 97 remain blocks. The migration fixture records history; tests explicitly enumerate current authority changes rather than rewriting that history.
- Luna may dismiss non-executing false-positive candidates and allow selected review-tier operations in an established local development environment. It cannot waive a remaining confirmed block or user-only rule. Shared/production impact, meaningful data loss, unresolved target scope, or review failure requires approval.
- Contextual families are plain Compose teardown (`141`); Kubernetes apply/scoped delete/restart/scale/port-forward (`153–157`); Helm install/uninstall/delete/rollback and local repo/plugin removal (`159–164`); database reset/delete/restore (`168–176`, `257–263`); and targeted process termination (`043`, `044`, `309`, `310`, `312`, `329`). IDs have the `legacy-` prefix. See the [review contract](../lib/damage-control/judge-prompt.md) for the boundaries.
- Known read-only `crontab -l` and `schtasks /query` forms do not prompt. Mutations, unresolved/unsupported query forms, substitutions, other commands in the call, and protected redirections retain their checks. Kubernetes/Helm leading environment options are normalized for command-rule matching, with the original operation retained for review.
- Context consists of up to 16 direct interactive/RPC inputs and eight successful covered tool observations, each collection limited to 16 KiB and 30 minutes. Tool operation, cwd, output, call ID, and time remain untrusted evidence. Queued input is withheld until delivery. Context expires or clears on session changes, tree navigation, reload, shutdown, or cancellation; it is not reconstructed from session history. Outbound evidence is redacted and bounded. No resource ownership or approval is cached.
- Other command and path rules remain unchanged, including Compose volume/image-removal approval, broad cluster deletion, secret protection, destructive Git operations, and system-file protections. No daemon inspection, filesystem authorization inventory, mount translation, or mandatory environment scans were added.
- Deep interpreter analysis remains limited to concealed file/process mutations and loads grammars on demand.
- `/dc on`, `/dc off`, `/dc mode default`, and `/dc mode noshell` remain supported. There is no `/dc status`. The explicit `pp --dc-recovery` maintenance path remains available.
- Bounded operational diagnostics, deterministic sensitive-read/upload sequence protection, and repeated-call protection remain. No background shadow evaluator, labels, persistent telemetry, or diagnostic slash commands are added.
- Prompts use `Deny` / `Allow once`; no prompt requires typed input. Use `/reload` to activate the changes in an existing default session. Legacy is unchanged.

The earlier parity audit is historical: [restoration plan](../../../../.specs/archive/damage-control-provenance-audit/plan.md) and [audit report](../../../../.specs/archive/damage-control-provenance-audit/full-audit.md). The approved environmental changes above supersede its exact-parity decisions only for the named behavior.
