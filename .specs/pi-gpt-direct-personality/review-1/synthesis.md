---
date: 2026-05-02
status: synthesis-complete
---

# Review: Pi GPT Direct Personality for OpenAI GPT-5+

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Completeness | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | Assume executor has no conversation context and grep checks can pass falsely |
| Red team | security-reviewer | Config and provider-breakage reviewer | Mandatory safety reviewer | Assume config changes affect every Pi session or send unsupported provider params |
| Simplicity | product-manager | Scope and smaller-solution reviewer | Mandatory simplicity reviewer | Challenge whether request-option plumbing is needed before proving a prompt-layer setting works |
| TypeScript | typescript-pro | Pi TypeScript provider-adapter and settings reviewer | Plan touches TS settings, prompts, and model options | Assume implementers patch the wrong layer or installed package instead of tracked repo |
| QA | qa-engineer | Pi behavior regression and model-option validation reviewer | Plan depends on mocked tests and provider gating | Assume grep checks pass while runtime behavior remains unchanged |
| Docs | technical-writer | Pi documentation consistency reviewer | User explicitly requested review against Pi docs | Assume docs drift from tracked `pi/README.md` and installed package docs |
| Rollout | devops-pro | Environment/config rollout reviewer | Plan changes user config behavior and env-driven cache guidance | Assume defaults make all sessions terse or rollback is unclear |

## Standard Reviewer Findings
### reviewer
- The plan lacks a branch after T1 for the likely outcome that request/prompt construction is upstream-only. It says to “narrow implementation” in handoff notes, but the task graph still forces T2/T3 as if repo-editable seams exist.
- Several acceptance criteria use grep as proof of behavior. Grep can prove strings exist but not that Pi actually injects prompt guidance or applies request options.
- The plan does not define the exact settings location semantics: repo-tracked `pi/settings.json` versus per-user `~/.pi/agent/settings.json`.

### security-reviewer
- Provider-option leakage is correctly identified, but rollback/default safety is underspecified: a repo default could make every install/direct model terse without a per-user opt-in.
- The plan does not require checking actual serialized requests or mocked provider calls, so unsupported `text.verbosity` could slip through.
- Patching installed `node_modules` is discouraged in handoff notes but not explicitly forbidden in task acceptance criteria.

### product-manager
- A smaller first implementation would add only Pi-side direct prompt guidance and docs, then defer API verbosity until T1 proves a stable repo-controlled hook exists.
- The plan risks overfitting to Codex terminology; using existing Pi “desired oververbosity”/style instructions may be simpler than adding a new personality abstraction.
- Prompt caching implementation is correctly out of scope; keep it as documentation/verification only.

## Additional Expert Findings
### typescript-pro
- T2/T3 should be conditional on T1 output. If prompt assembly/model request code lives inside the installed Pi package, the plan should not proceed to code changes in dotfiles as written.
- Tests should assert runtime effects through existing extension/test helpers, not just grep. At minimum, test settings load/defaults, prompt content, GPT-5.5 option mapping, and non-compatible provider no-op.
- The plan should name the actual candidate files after preliminary repo inspection (`pi/lib/settings-loader.ts`, `pi/extensions/*`, installed package model docs) or explicitly make T1 produce a mini design note consumed by later waves.

### qa-engineer
- Success criteria require tests for verbosity mapping, but T1 may discover no injectable hook. The plan should define pass conditions for the “not supported here; document upstream follow-up” path.
- `cd pi/tests && bun test` is necessary but insufficient if extension TS files change; add a TypeScript check against `pi/extensions/tsconfig.json` or the repo’s established Pi test command.
- Docs validation via grep should be paired with a manual consistency check against `pi/README.md` and installed Pi docs/changelog.

### technical-writer
- Verified tracked docs already mention `PI_CACHE_RETENTION=long` in `pi/README.md`; the plan must avoid duplicating or contradicting that section.
- The plan references installed Pi docs/changelog as evidence, but those are not tracked source. Use installed docs as citations only; write durable repo docs in tracked files such as `pi/README.md` or a tracked `pi/docs/*.md`.
- `pi/settings.json` is JSON and cannot carry comments. Documentation should not rely on comments in that file.

### devops-pro
- The plan lacks an explicit rollback procedure: how to disable direct mode and restore default behavior.
- Windows/Git Bash environment guidance for `PI_CACHE_RETENTION=long` should point to existing shell-profile setup rather than asking users to mutate environment ad hoc.
- Default behavior must remain unchanged when the setting is absent, including subagents and non-interactive workflow commands.

## Suggested Additional Reviewers
- typescript-pro -- relevant for Pi TypeScript settings, prompt, and provider-option surfaces; focus on whether implementation seams are repo-editable and type-safe.
- qa-engineer -- relevant because acceptance criteria rely on tests/mocks; focus on false-positive grep checks and provider-gating coverage.
- technical-writer -- relevant by user request and because Pi docs already contain cache guidance; focus on tracked docs versus installed package docs and avoiding contradictions.
- devops-pro -- relevant for rollout/rollback of user settings and environment variables.

## Bugs (must fix before execution)
1. **The task graph forces T2/T3 even if T1 proves the needed hook is upstream-only.** The handoff note says to narrow implementation if T1 finds no repo-controlled hook, but the dependency graph has no decision gate or alternate path. This can lead `/do-it` to patch installed `node_modules` or make speculative changes.
2. **The settings location is ambiguous and risks changing repo defaults instead of user opt-in behavior.** T2 lists `pi/settings.json` as a likely file, but tracked `pi/README.md` distinguishes repo-tracked Pi settings from per-user runtime settings in several sections. The plan must define whether direct personality is a repo default, user setting in `~/.pi/agent/settings.json`, or both with precedence.
3. **Verification relies too much on grep and not enough on runtime/mocked behavior.** T2/T4 and success criteria allow grep to satisfy core claims. That would not prove prompt injection, default no-op behavior, or provider-option gating.
4. **Documentation task may target invalid/non-durable doc surfaces.** It mentions comments in `pi/settings.json` even though JSON cannot contain comments, and references installed package docs/changelog as if they were source files to update.

## Hardening
1. Add an explicit rollback/disable criterion: removing or setting the direct personality option to default restores previous prompt/request behavior.
2. Add a TypeScript validation command such as `bunx tsc -p pi/extensions/tsconfig.json --noEmit` if TS extension files change, in addition to `cd pi/tests && bun test`.
3. Require T1 to produce a short implementation note inside the plan or execution status naming exact files/functions before T2 begins.
4. Gate verbosity mapping by actual model capability metadata if available, not only provider/model-name regex.
5. Add doc acceptance criteria that compare new text against existing `pi/README.md` `PI_CACHE_RETENTION=long` language to avoid duplication/conflict.

## Simpler Alternatives / Scope Reductions
1. First ship only prompt-layer direct mode plus documentation; defer `text.verbosity` request mapping until T1 proves a stable repo-controlled option hook.
2. Reuse existing Pi oververbosity/style settings if present rather than adding a Codex-like “personality” namespace.
3. Treat prompt caching as documentation-only in this plan; do not inspect or modify provider caching code unless tests reveal a concrete regression.

## Contested or Dismissed Findings
1. **Dismissed: broad prompt caching implementation is required.** Research and installed Pi docs indicate direct OpenAI caching is already supported and OpenRouter OpenAI caching is automatic; implementation should not expand caching without a specific gap.
2. **Downgraded: “direct” must match Codex exactly.** Official docs found Friendly/Pragmatic/None more clearly than `direct`; Pi can expose `direct` as a user preference if docs explain it is Pi-side behavior, not Codex API parity.

## Verification Notes
1. Confirmed docs risk by reading `pi/README.md`: it already mentions `PI_CACHE_RETENTION=long` and distinguishes repo-tracked `pi/settings.json` from per-user runtime settings in some areas.
2. Confirmed plan ambiguity by reading T2, which lists `pi/settings.json` as a likely settings file without defining precedence or whether this should be per-user opt-in.
3. Confirmed grep weakness directly in the plan: multiple acceptance criteria use `grep -R` as primary verification for behavior that requires runtime/mocked assertions.
4. Confirmed missing branch by reading the dependency graph: `T1 → V1 → T2 → V2 → T3`, despite handoff notes saying T1 might find the work must narrow to docs/upstream follow-up.

## Review Artifact
Wrote full synthesis to: `.specs/pi-gpt-direct-personality/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- apply selected review fixes to the plan if requested
- execute via `/do-it .specs/pi-gpt-direct-personality/plan.md`
