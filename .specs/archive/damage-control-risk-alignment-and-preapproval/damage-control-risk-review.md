# Damage Control risk and proportionality review

Date: 2026-09-08. Status: review complete; implementation and acceptance completed on 2026-09-09 and recorded in the archived plan.

## Governing requirement

Damage Control exists to prevent meaningful unrecoverable harm, not to block every suspicious-looking action. Routine recoverable work should proceed without approval. Uncertainty warrants intervention when it materially affects the risk of that harm, not merely because syntax, a tool, a variable, or a helper is unfamiliar. The [behavior contract](../../../pi/profiles/default/docs/damage-control-port.md#design-purpose) owns this requirement.

This review asks what concrete harm each restriction prevents and whether intervention is proportional. It does not ask how to make all actions provably safe or all restrictions harder to bypass.

## Scope and evidence

Reviewed default at dotfiles `15c7aee6`: all 335 command rules and path inventories, decision precedence, scoped deletion, nested-script loading, variable resolution, judge evidence/authority, sequence checks, repeated-call handling, and relevant existing tests. Compared the legacy scoped-delete implementation and rule sources, the [port plan](../damage-control-port/plan.md), the [provenance audit and operator dispositions](../damage-control-provenance-audit/full-audit.md), the historical [adversarial review](../../pi/profiles/default/docs/damage-control-adversarial-review.md), and AIF-012/AIF-013 and APR-002/APR-004 in the agent-process logs.

The reviewed baseline contained 204 user-only rules, 97 blocks, 34 contextual-review rules, and 68 path exclusions. Counts describe configuration, not effective outcomes: language applicability, path rules, exemptions, and overlapping matches matter.

A bounded offline probe used the real `adapt`, `analyzeShell`, `analyzeRequest`, `parsePolicy`, `parseSettings`, and `decide` functions. It supplied synthetic Windows paths (`C:/dc-review`, `C:/Users/review`) and an identity-only `realpath` substitute. The parser clock was fixed as in existing gate fixtures to isolate policy from deadline timing. No submitted operation executed; no credentials, real target contents, model calls, or infrastructure were used. The sequence case called the real sequence classifier separately. These observations verify parser/policy decisions under supplied facts, not actual filesystem disposability, shell environment inheritance, live judge quality, or performance.

## Summary

The concern is supported. Current policy mixes prevention of actual data loss with command-style restrictions, recoverable maintenance restrictions, and workflow controls. Most conspicuous restrictions are inherited, not newly invented by this port. The September 6 restoration explicitly preserved legacy behavior; September 7 subsequently relaxed selected environment-aware families. Those decisions are historical authority, not proof that every remaining restriction fits the clarified purpose.

There is also an opposite mismatch: cwd containment can exempt deletion of meaningful uncommitted work. A risk-based refactor must distinguish consequences, not simply lower every restriction or whitelist names such as `temp`.

### Rule-family disposition

All IDs below have the `legacy-` prefix. This is a grouped review, not 335 new implementation tasks.

| Family | Current evidence | Disposition |
| --- | --- | --- |
| Filesystem deletion and permissions (`001-018`, `040-041`, `052-072`, `264-308`, `313-322`, `325-328`, `330`) | Mix of genuine destructive targets, generic flags, empty-directory removal, and permission/attribute changes | Keep actual loss prevention; replace mechanics-only conclusions with consequences where needed. R1, R2, R4. |
| Git (`019-039`) | Reset/restore/clean can destroy uncommitted work; branch/ref removal can also be recoverable | Preserve protection of work and recovery mechanisms. Do not assume Git tracking proves current contents recoverable. No blanket relaxation proposed. |
| Processes and scheduling (`042-051`, `309-312`, `329`) | Selected process termination is reviewable; scheduling still uses persistence-based reasons | Review intended scheduling by effects, not persistence vocabulary. Existing task-owned process review is a useful direction. R2. |
| Cloud/platform operations (`073-133`, `205-215`) | Destructive resources, credentials, queues and backups coexist with configuration/creation operations | Target consequences matter. Keep credible data-loss, disclosure and substantial irreversible-cost protection; do not treat all remote work as equivalent. R7. |
| Containers/orchestration (`134-167`) | Selected contextual review coexists with image/volume and flag-based user-only matches | Separate rebuildable images from meaningful volume/container data; overlapping rules can prevent judgment. R1, R7. |
| Databases (`168-176`, `257-263`) | Now contextual despite historical initial decisions to retain blocks | Preserve disposable-versus-meaningful-data distinction. Do not restore superseded blocks based on old review documents. |
| Infrastructure configuration (`177-204`) | Public `.tfvars` references and actual destructive deployment both prompt | Separate non-sensitive inputs/read-only work from consequential mutation. R2, R3. |
| Local tooling (`216-229`) | Cache cleaning and environment/package removal are user-only | Cache rebuild cost alone is not unrecoverable damage. Package purge and local modifications need separate judgment. R1. |
| Repository hosting/publication (`230-256`) | Irretrievable issues/artifacts, public publication and reversible labels/tags share broad restrictions | Preserve actual irreversible loss/disclosure; assess reversible metadata operations proportionally. Existing push/deployment authorization remains separate. |
| Sensitive access and execution mechanisms (`323-324`, `331-335`, plus path policy) | Real disclosure protection mixed with file-name, encoding and invocation-style gates | Keep actual disclosure protection; do not equate encoding or dynamic execution with demonstrated harm. R2, R3. |

## Findings and recommended dispositions

### R1. Recoverable cleanup still bypasses contextual judgment and goes straight to approval

**Origin:** inherited rules retained through an explicitly approved parity restoration; not a new port-only policy. The port's `engine.ts:decide` enforces confirmed `user` matches before review.

**Evidence:** offline results: `uv cache clean` -> user (`218`); `go clean -cache` -> user (`217`); `rmdir --ignore-fail-on-non-empty .tmp/empty` -> block (`015`). `docker compose down --rmi all` -> user (`140`), even though plain teardown has a review match (`141`). These reasons do not establish unrecoverable loss. In particular, `rmdir` does not recursively remove nonempty contents.

**Recommendation:** remove approval requirements for established rebuildable cache/empty-directory cleanup; make mixed-risk cleanup consequence-aware. Do not blanket-approve package purges, unique local images, volumes, or modified environments. Fix the general rule behavior rather than requiring `/dc scan` to preapprove each wrapper around routine maintenance.

### R2. Some rules classify mechanism or suspicion instead of damage

**Origin:** inherited command rules. Language mapping is part of the port/restoration and affects actual behavior.

**Evidence:** `history -c` -> block (`045`), while native PowerShell `Clear-History` -> allow because the corresponding rule (`317`) is Bash-scoped. A native PowerShell encoded `Write-Output 'hello'` -> block (`331`). Native `Remove-Item -Recurse -Force .tmp/result` -> block (`330`), while Bash scoped cleanup allows. Rules `046-051` describe scheduled work as a persistence mechanism; `060-062` classify loader variables as suspicious. Source inspection establishes these rule definitions, not a runtime result for every spelling.

**Recommendation:** assess the decoded/resolved operation when practical and the actual consequences when context is needed. Encoding, force flags, scheduling, environment configuration, helper calls, or privilege alone are not sufficient reasons for a universal prohibition. This does not make arbitrary downloaded code safe. Match Bash/PowerShell outcomes by effects rather than strengthening one to match the other's most restrictive rule.

### R3. Path policy confuses recoverable artifacts, sensitive-looking names, and actual sensitive data

**Origin:** inherited inventories restored explicitly under decision 3A. `paths.ts:pathMatches` and current path tests confirm the behavior.

**Evidence:** native write of `pnpm-lock.yaml` -> block; deletion of `CLAUDE.md` -> block. The read-only inventory also includes build output, dependency directories and virtual environments. Native read of `public-cert.pem` -> block, regardless of whether the PEM is a public certificate. Conversely, `serviceAccountKey.json` -> allow through an explicit exclusion; exclusions return before other path checks. That fixture demonstrates matching behavior, not the presence of a real credential. `terraform plan -var-file=public.tfvars` -> user (`179`) without distinguishing non-sensitive variables from secrets.

**Recommendation:** do not use Damage Control to enforce editor preferences, generated-file hygiene, or permanent preservation of ordinary recoverable project documents. Retain protection where current contents or credentials would actually be lost or disclosed. Sensitive-name/exclusion policy needs a narrow reconciliation in both directions, not an expansion into credential discovery or mandatory content scans. No credential reads were performed here.

### R4. The scoped-delete exemption proves location, not recoverability

**Origin:** legacy already allowed many contained relative deletes. Default `analysis.ts` implements a broader effect-level exemption; parity documentation should not be mistaken for exact semantic equivalence.

**Evidence:** `rm -rf src/uncommitted-work` -> allow under synthetic contained-path facts. `analysis.ts` removes user/review matches when all delete operands resolve below the effect cwd and no block matches. It does not consult file contents, recovery evidence, configured scratch roots, or creation history. Legacy `evaluateScopedDelete` also has temporary-path handling and `.git`/`.pi` floors not represented by this one containment predicate.

**Recommendation:** preserve quiet disposable cleanup, but stop describing cwd containment as proof of harmlessness. Use available task/recovery context when deciding whether loss matters; do not reinstate the rejected per-delete Git inventory, directory crawl, or creation ledger as a blanket prerequisite. Protect actual uncommitted work, not every tracked path simply because it is tracked. This is a demonstrated permissive mismatch, not a reason for universal approval gates.

### R5. Ordinary review lacks the variable evidence and authority the operator expected

**Origin:** inherited rm user-only authority plus the default parser/evidence boundary. Legacy also has a specific AST temporary-cleanup recognizer (`isProvenSafeTempCleanupAt`); it is not equivalent to general environment access by a judge.

**Evidence:** `TMP_FILE=.tmp/result; rm -rf "$TMP_FILE"` -> allow; `rm -rf "$TMP_FILE"` alone -> user (`007`, `008`). `shell.ts` starts with an empty variable map. The current Luna judge has no tools, receives only supplied evidence, and cannot waive these confirmed user-only matches. `engine.ts` does not treat parser uncertainty alone as a reason to prompt; the rm rule is the restriction here.

**Recommendation:** resolve relevant values from the actual execution environment when available and give contextual cleanup cases review authority. Verify the shell inheritance/startup boundary before equating Node's environment with the eventual shell's values. Send relevant evidence, not the entire environment. Avoid executing substitutions just to inspect them. Missing context should matter only when it prevents assessing consequential loss, not merely because a variable exists.

### R6. Sequence correlation can force approval without linking data to the upload

**Origin:** legacy deterministic sequence policy explicitly restored under decision 6B; current port integration makes sequence asks confirmed user matches.

**Evidence:** recording a read of synthetic `.env`, then checking `curl -T public-report.txt https://example.invalid/upload`, produces `sensitive_file_to_upload: ask`. The classifier links recent sensitive access to upload capability, not the actual uploaded source. `enforcement.ts` promotes that result before `decide`, so Luna cannot dismiss unrelated correlation. Source inspection also shows that `invalidate()` clears contextual evidence and the breaker but not the separate sequence history, which expires after 30 minutes; this is not a live cross-session reproduction.

**Recommendation:** retain protection against actual disclosure, but use correlation as review evidence rather than conclusive harm. Keep that evidence aligned with its originating session. Do not add persistent activity tracking or make routine uploads require a fresh investigation.

### R7. Current review authority is a patchwork, not a unified risk policy

**Origin:** explicit operator decisions: strict parity restoration followed by September 7 contextual authority for 34 selected rules (`a0065f2c`).

**Evidence:** `engine.ts` returns user approval before reviewing any remaining matches. Plain Compose teardown reaches review, while the `--rmi` variant does not. The current judge contract limits allowances to selected established local-development families, though actual risk is not determined solely by locality. Current context collection/redaction is present; the earlier no-op collector was already fixed and is not a current finding.

**Recommendation:** choose mandatory approval by credible irreversible consequences and explicit retained operator requirements, not by whether a rule happened to be converted in the first contextual-review batch. Keep firm protection for established damage. Explicit project restrictions on deployment, push and repository authority remain independent; this review does not authorize those actions or waive current rules.

### R8. Repeated-call controls partly govern productivity rather than damage

**Origin:** legacy loop controls retained by operator decision, with port-specific thresholds and polling exceptions. Existing `breaker.test.ts` documents the behavior.

**Evidence:** `breaker.ts` stops before a sixth identical successful ordinary result or fifth equivalent failure. Only a short list of command spellings gets the extended polling allowance; a read of a status file does not. `enforcement.ts` aborts the active turn on a breaker stop. These are source/test findings; no repeated live operations were run.

**Recommendation:** distinguish bounded resource/cost protection from a general requirement to change approach after unchanged output. An ordinary repeated status read is not proof of irreversible harm. Do not add more polling allowlists as part of `/dc scan`; retain the current control until a focused behavior change is accepted. This finding does not require another scheduler or workflow controller.

### R9. Script review repeats work and loses useful source context

**Origin:** current port `shell.ts:scriptSource/analyzeScript/analyzeEmbedded`. Initial no-reuse behavior was explicitly approved; the operator now requests content-bound reuse.

**Evidence:** each invocation opens and parses supported local script bodies. Grammar loading is cached, but script-body approval is not. Nested effects use the outer invocation's forced source range. The reported `pi-deps-link-setup` prompt is an observed example: a routine stale-link replacement triggers generic rm approval and displays unresolved implementation details. Script inspection supports the intended link-replacement behavior; it is not proof that all runtime paths or Windows link detection are infallible. No latency measurements were made.

**Recommendation:** implement the requested `/dc scan` and single-script review path after aligning the relevant policy. Matching content-bound approvals should skip body analysis, not parse it again merely to suppress a prompt. Keep surrounding command analysis independent. Do not promise freshly evaluated internal blocks for code whose analysis is skipped. See the design context below.

## Preserved behavior and limits

Keep direct protection against destruction of meaningful data, uncommitted work, recovery mechanisms and important system state, and against irreversible sensitive disclosure. Existing home/root deletion remains blocked in the offline probe. Retain inert-data handling, whole-call accounting, cancellation and stale-decision checks, and honest review-failure reporting. These support correct decisions rather than requiring blanket new permissions.

Do not resurrect already-removed port machinery: recursive authorization inventories, Docker metadata/identity ledgers, universal unknown-command prompts, schema/source allowlists, typed clarification, or expanded self-integrity controls. The historical provenance audit documents those removals. Review failure on an operation already needing judgment is distinct from treating every parser limitation as dangerous.

This review did not certify every rule spelling, platform, filesystem case, shell integration, or model decision. It did not modify runtime code, policy YAML, judge prompts, legacy, or the ongoing subagent worktree. Existing tests are evidence of behavior, not proof the behavior matches the clarified goal.

## Design context for the requested features

These requirements were subsequently implemented by the associated plan:

- `/dc scan` reviews project-owned scripts with parallel subagents. It never executes reviewed scripts. Repeat scans reuse unchanged qualifying results and reconsider new/changed code.
- Store preapprovals in `<git-common-dir>/pi/damage-control-trust.yaml`, shared by the parent repository and all worktrees. Use `<project-root>/.pi/damage-control-trust.yaml` only outside Git. YAML is the current storage direction; loading/indexing and coordinated updates matter more than format choice at this scale.
- Preapproval may cover a script generally or a specific argument form when arguments materially change danger. Match the script version by content hash. Changed or unapproved invocations use normal runtime scanning; re-review replaces or removes obsolete approval.
- Add `Allow once and review for future use` alongside existing choices when an invoked script is eligible. The choice permits the pending call immediately and authorizes a subagent's conditional creation of future preapproval through Damage Control. No second approval wizard or per-script confirmation during `/dc scan`.
- Matching preapproval skips analysis of the covered script body. Direct commands, substitutions, redirects and other surrounding operations retain ordinary analysis. Ordinary Luna review and script-preapproval review are separate responsibilities.
- Give ordinary contextual review relevant variable/target evidence. A temporary-looking variable name is not proof of its value, and an unfamiliar variable is not itself a harmful operation.
- Assess helpers by actual consequences. Do not automatically reject scripts for having helpers, or build a bundler/dependency-tree service as a prerequisite. A top-level hash alone does not detect helper changes; the implementation must describe that limitation and add only the dependency handling justified by consequential cases found during review. The exact minimal mechanism remains to be chosen, not silently assumed solved.
- No mandatory full-project scan, security certification, new persistent workflow engine, or universal proof of safety. Runtime fallback keeps ordinary work possible before preapproval.

## Operator decisions after review

On 2026-09-08, the operator resolved the review questions:

1. Do not preserve command-style or file-name prohibitions merely because they are inherited. Assess actual consequences; independent project/user authorization requirements remain.
2. Keep a failed-call watchdog for unattended work. The operator reports a June 2026 loop consuming approximately half of a weekly Codex allowance; that incident and amount are operator-reported, not independently verified in this review. Successful repeated calls are generally fine. The desired protection is against the same exact failed Bash command or tool call continuing indefinitely, with a threshold around more than 12 consecutive failures. This is concrete resource-loss protection, not a general productivity controller. Exact reset/interleaving and stop semantics are to be settled before the plan; do not silently reuse the current identical-output or successful-poll limits.
3. Choose the broader scope: align all identified policy families with the clarified purpose alongside script preapproval, rather than fixing cleanup alone. Resolve scope concerns before writing an execution plan.

The planning boundary remains default Damage Control, its policy/evidence/UI, and integration with the forthcoming subagent interface. Broader family coverage does not imply new command dialects, an OS sandbox, mandatory environment inventories, a dependency manager, or changes to legacy. The plan must translate each finding into an explicit disposition and finite acceptance, not nine independent subsystems.

## Disposition and finish

The review is complete. The operator selected broad policy alignment. Earlier implementation recorded adjacent-only failure resets, but the selected plan refresh still marks D1 unresolved; confirmation was requested rather than silently choosing between the records. The [implementation plan](plan.md) records completed tasks and evidence, and [policy dispositions](policy-dispositions.md) maps all historical command rules to the active semantic identities or removals. R1-R9 remain the evidence for the concrete dispositions, not a reason to restart the audit or add speculative machinery.

Validation for this documentation-only change is the bounded offline probe above plus changed-document/link and `git diff --check` checks. No full suite, live model evaluation, deployment, commit or push is part of this review.
