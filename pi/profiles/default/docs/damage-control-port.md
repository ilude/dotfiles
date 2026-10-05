# Default Damage Control behavior contract

## Design purpose

Damage Control exists to prevent meaningful unrecoverable harm, not to block every suspicious-looking action. Routine recoverable work should proceed without approval. Judge the actual effects, target and available recovery, not merely command names, flags, unfamiliar syntax, variables, helper scripts, or whether an operation is local or remote.

Intervene when there is a credible risk of losing meaningful data or uncommitted work, destroying recovery mechanisms or important system state, irreversible sensitive disclosure, or other substantial irreversible consequences. Uncertainty warrants intervention when it materially affects that risk; an analysis limitation alone is not evidence of danger. Do not require universal proof of harmlessness or turn routine maintenance into a security review.

Prefer the least intrusive effective response: allow established low-risk work, use contextual judgment where consequences need interpretation, and require operator approval or block when consequential risk or an explicit retained prohibition justifies it. Known recovery matters; merely being Git-tracked or named `temp` does not prove current contents disposable. Independent user/project authorization requirements still apply.

This is the operator's governing design requirement, clarified on 2026-09-08. Legacy parity is historical compatibility evidence, not the philosophical goal. The [risk and proportionality review](../../../../.specs/archive/damage-control-risk-alignment-and-preapproval/damage-control-risk-review.md) records the findings that drove the implemented alignment. Historical decisions remain recorded rather than rewritten.

## Explorer inspection policy

Normal mode retains the meaningful-unrecoverable-harm purpose above. Explorer has an additional role-bound inspection restriction: observation is allowed, but intentional changes to files, managed resources, configuration, or processes are blocked even when temporary or recoverable. Ordinary incidental client-cache updates and server access logs do not disqualify observation. This is best-effort tool-call enforcement, not an OS sandbox or a guarantee of zero side effects.

The gate selects inspection from frozen Explorer child authority on both visible and headless surfaces, including trusted project definitions named `explorer`. The role receives Bash and PowerShell, not native edit/write tools. Existing explicitly operator-issued `!`/`!!` shell input remains outside model-tool enforcement.

Classification checks the complete call, including pipelines, substitutions, redirects, nested execution, and supported script bodies. Established observational forms pass inspection directly; established mutations are denied before approval or judgment. Unfamiliar operations receive a tool-free inspection-specific Luna review of the unchanged pending input and relevant available supported script source through protected, bounded, redacted evidence. Missing source and unresolved execution remain explicit limitations. An executable name, HTTP GET, `kubectl exec`, an AWS `get-*` prefix, or absence of modeled mutations is not proof of observation.

Only an explicit observational verdict can pass review. Mutation, uncertainty, malformed output, unavailable or disabled review, timeout, stale results, and cancellation deny the call with a concrete reason. Inspection verdicts are not saved as script trust. Normal preapproval never skips inspection body analysis, and task authorization or recoverability cannot turn mutation into observation.

Inspection adds to protected reads, disclosure rules, sequence checks, and the failed-call watchdog. Normal approval can settle an independently approval-gated read, but cannot override inspection denial. `/dc off`, default mode, reload, retained instructions, and user text cannot weaken the frozen restriction; `noshell` may impose a stricter shell block. Initialization failure retains an Explorer blocker rather than allowing unguarded shell calls. Denials are recoverable tool results: Explorer can choose another allowed inspection or report the blocker to its parent for reassignment.

Other roles, the orchestrator, the Claude adapter, and legacy retain their existing policy. Inspection is not a global mode control or a migration of every read-only role.
## Browser and selected outbound effects

Default-profile browser page evidence is untrusted context, not direct operator intent. Deterministic browser boundaries cover represented session/frame/destination checks and local secret bindings; Damage Control uses independently interpreted task intent and bounded contextual review for consequential or inconsistent effects. Screening flags are risk signals, not authority or keyword-based page blocking. These checks are not universal taint tracking or a network sandbox. See the [browser operation and limitations guide](../../../../docs/browser-security.md) for the exact boundaries and operator workflow.

## Claude Code adapter

`claude/hooks/damage-control/pi-adapter.ts` reuses the default profile policy parser, Bash parser, deterministic request analysis, and decision engine for Claude Code Bash/Edit/Write PreToolUse calls. It intentionally does not invoke Luna: `review` dispositions become Claude `ask`; `user` requires ask and `block` denies. Allows emit no permission decision. Invalid hook data or an adapter/analysis error denies. Claude Edit `replace_all` is denied as unsupported rather than treated as a single replacement. Claude path-normalization and unrelated hooks remain separate. Focused adapter coverage runs with `bun test claude/hooks/damage-control/pi-adapter.test.ts`.

## Current normal-policy runtime behavior

Explorer inspection adds the restriction above; the routine mutation allowances and normal approval paths below do not override it.

The historical migration fixture remains evidence, not active policy authority. Runtime IDs name operations and path protections, while the task disposition table records old-to-new identities. Policy actions, not numeric ranges or matching reason text, determine review authority:

- Established rebuildable caches, empty-directory removal, ordinary generated artifacts and lockfiles, harmless decoded output, and public certificates do not prompt merely because of syntax or names.
- Root/home destruction, meaningful unique or uncommitted work, recovery mechanisms, important system state, sensitive disclosure, and consequential remote mutations remain protected. Independent push and deployment authorization still applies.
- Mixed-risk deletion, Git, container, infrastructure, scheduling, database, and process operations use contextual Luna judgment. Explicit publication and shared-history human boundaries remain. Generic recursive/forced deletion reaches the existing judge with the whole pending call and native session user/assistant text. The outbound request includes applicable rules but not prior tool activity, parser inventories, variable observations or sequence dumps. The full user/assistant conversation has no fixed message or byte cap. Older text is trimmed with explicit disclosure only after provider-reported context-window overflow; resume, reload and tree navigation follow the native active branch. The short contract judges meaningful harm without demanding universal disposability proof. No mktemp parser exception or diagnostic-only approval path is added; bounded judge diagnostics are persisted separately from model context. Unknown syntax or names alone are not danger.
- Sensitive-read/upload correlation can produce an applicable review rule. Actual sensitive-source upload retains direct intervention, and sequence state clears with its session.
- Matching script preapproval is bound to source SHA-256 and optional exact argv/helper hashes. It skips only that body analysis; substitutions, redirects, and adjacent commands remain checked. Git repositories store records under their common Git directory; non-Git projects use the current cwd's `.pi/` directory.
- `/dc scan` discovers tracked and nonignored project scripts, excludes generated/dependency output, and uses bounded parallel read-only subagents without executing scripts. Completed unchanged results are reused.
- Eligible prompts add `Allow once and review for future use`. The current call proceeds without waiting; only a completed, source-stable qualifying review grants future reuse.
- The failed-call watchdog counts adjacent exact tool/input/effective-cwd failures. It permits twelve failures and blocks attempt thirteen, terminates the batch, and keeps that run stopped across queued continuations and reload until new direct operator input. Before a trip, an unrelated call or success resets the streak; successful polling has no limit.
- `/dc on`, `/dc off`, `/dc scan`, `/dc mode default`, and `/dc mode noshell` are supported. There is no `/dc status`; `pp --dc-recovery` remains available.
- There is no mandatory project scan, environment inventory, sandbox, dependency resolver, persistent telemetry, or change to legacy.

The earlier parity audit is historical: [restoration plan](../../../../.specs/archive/damage-control-provenance-audit/plan.md) and [audit report](../../../../.specs/archive/damage-control-provenance-audit/full-audit.md). The approved environmental changes above supersede its exact-parity decisions only for the named behavior.
