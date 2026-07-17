# Rationalization phase 2 decision ledger

## Contract and instruction decisions

| Item | Nominal prevention | Originating incident | Recurrence since introduction | Decision | Rationale | Task | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/do-it` four-way completion classification | Ambiguous final outcomes | `.specs/rationalization-phase2/plan.md` - fabricated blocker, session 019f6c3b | One documented contradiction on 2026-07-16 | Delete | Observable state plus validation and archive facts are sufficient; the enum forced an unsupported failure label. | T1 | Executed |
| `/do-it` incomplete-report checklist | Lost resume state | `.specs/rationalization-phase2/plan.md` - fabricated blocker, session 019f6c3b | One documented contradiction on 2026-07-16 | Consolidate | One checkpoint paragraph preserves durable state without making stopping the dominant path. | T1 | Executed |
| `/do-it` stale blocker and review-artifact handling | Obsolete evidence blocking repaired work | `research/friction-work-gitlab-networkiac.md`; `research/friction-dotfiles-homelab-onramp.md` | Two documented incidents | Keep in one owner | Current state must re-verify recorded evidence; the rule belongs in `/do-it` and is not duplicated in `/review-it`. | T1 | Executed |
| Model-narrated workflow telemetry contract | Missing machine-readable execution evidence | `pi/docs/workflow-eval-telemetry.md` | Runtime never emitted the prescribed detailed events | Delete | The only consumer reads mechanically written dispatch JSONL; schema-shaped plan prose was not machine telemetry. | T2 | Executed |
| Hedge-word certainty detector | Overconfident agreement with user hypotheses | `unknown` | No documented detector-specific prevention | Consolidate | Confidence now names its evidence or assumption without lexical rituals. | T3 | Executed |
| Four-rule ask/execute cluster | Unauthorized scope and unnecessary confirmation loops | `research/friction-gcc-automation.md`; `research/friction-work-gitlab-networkiac.md` | Recurred in both directions | Consolidate | One execution rule covers ambiguity, access, scope, denials, safety gating, and accepted risk. | T3 | Executed |
| 1-3-1 response template | Unstructured architecture choices | `unknown` | No documented template-specific prevention | Delete | Real choices need brief trade-offs and one recommendation, not a fixed presentation ritual. | T3 | Executed |
| `[N/total]` issue counter | Losing place in multi-issue responses | `unknown` | No documented prevention | Delete | Presentation ritual has no surviving failure class. | T3 | Executed |
| Question-tool format preference | Ambiguous user prompts | `unknown` | No documented prevention | Delete | The consolidated ask rule owns when a question is needed; tool mode is runtime judgment. | T3 | Executed |
| Philosophy restatements across instructions and skills | Poor implementation choices | `.specs/workflow-test-rationalization/summary.md` | Repeated drift across seven surfaces | Consolidate | `pi/AGENTS.md` is always loaded and now owns the policy; activation-triggered skills point to it. | T4 | Executed |
| Delegation restatements | Unnecessary or unsafe delegation | `research/context-reduction-research.md` | Repeated policy copies in two instruction files and skills | Consolidate | One always-loaded paragraph owns direct work, justified delegation, read parallelism, and single-threaded writes. | T4 | Executed |
| `/improve` UI-only help/error/empty output | Model cannot observe user-visible command state | `.specs/rationalization-phase2/plan.md` | Three branches in one command owner | Fix | All visible command output now uses the owner-specific transcript message path. | T6 | Executed |
| Generic hygiene on immutable paths | Migration checksum changes | `research/friction-work-gitlab-networkiac.md` - monorepo 2026-05-27 | One documented deployment break | Keep as code gate | Declared immutable paths are reported and skipped without validator execution or file mutation. | T7 | Executed |
| Reducer output without recovery marker | Lost raw failure evidence | `research/context-reduction-research.md` | Existing reducer dropped content without a model-visible recovery path | Fix | Every applied reduction now states bytes, rule, and a readable raw-output path; bypass and bounded raw retention are enforced. | T10 | Executed |
| Naive shell argv classification | Shell leaders hide the command rule | `.specs/rationalization-phase2/plan.md` corpus baseline | 47.88% unmatched at baseline | Keep bounded parser | Fallback normalization preserved existing matches and raised replay from 52.12% to 59.48% with 2,367 new matches. Per the task's shortfall clause, parser work stopped and residual top ten was recorded: python 2010, sed 1320, git 1247, head 962, true 855, tee 522, pnpm 442, uv 366, tail 355, echo 300. Failure-survival failures: 0. | T8 | Executed with recorded shortfall |
| Reducer stderr request field | Separate stderr and real exit status | Pi `BashToolDetails` exposes neither | Never populated by the hook | Delete | Request now contains combined stdout and Pi's isError encoded as `exit_code` 0/1; new corpus records omit stderr samples. | T12 | Executed |
| Unbounded reducer corpus | Cache growth | `.specs/rationalization-phase2/plan.md` | Daily files accumulated without retention | Fix | First write of a new daily corpus enforces seven-day and 64 MiB retention; dry-run reports exact removals without mutation. | T12 | Executed |
| Unreachable generic fallback | Large unknown output bypasses reduction | `.specs/rationalization-phase2/plan.md` corpus evidence | 15,370 stored records had no prior rule | Fix | Lazy loads append only the fallback rule; specific matches win, unknown large output clamps, tiny output stays raw, and markers remain recoverable. Replay reached 99.94% (20 empty argv records unmatched), zero failure-survival failures; p50 was 335.3 ms versus 524 ms baseline. | T9 | Executed |
| Per-call reducer interpreter startup | Repeated Windows process and Defender overhead | `pi/tool-reduction/docs/baseline-latency.md` | Baseline p50 524 ms across roughly 440 daily calls | Replace with persistent worker | Serialized NDJSON worker preserves one-shot output and fail-open behavior, restarts after crash, and cleans up on shutdown. Measured p50 329.9 ms one-shot versus 9.7 ms persistent (97.1% improvement). | T11 | Executed |

## Surface usage decisions

30-day counts are from `.tmp/rationalization-phase2/t5-usage-audit.md`. Command counts prefer timestamp-bounded fallback evidence.

### Skills

| Item | Calls (30d) | Decision | Rationale | Task | Status |
| --- | ---: | --- | --- | --- | --- |
| analysis-workflow | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| ansible | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| api-design | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| approval-aware-operations | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| brainstorming | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| browser-tab-capture | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| caveman | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| claude-code-workflow | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| code-review | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| csharp | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| database | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| development-philosophy | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| docker | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| docs | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| forgejo-actions | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| forgejo-git | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| git-workflow | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| go | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| grill-me | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| justfile | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| kubernetes-helm | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| least-astonishment | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| llmstxt | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| logging-observability | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| m365-tenant-automation | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| no-ai-slop | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| orchestration | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| pdf-reader | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| pi-command | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| pi-contributor-workflow | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| pi-extension | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| pi-goal | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| planning | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| playwright-e2e | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| prd | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| private-store | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| python | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| reddit | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| research-archive | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| ruby | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| rust | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| shell | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| skills-engineer | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| terraform | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| tui-ux | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| typed-agent-workflows | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| typescript | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| ux-design-workflow | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| war-report | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| workflow-design | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| x-twitter | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |
| zoom-out | 0 | Keep | Tracking excludes normal injected/manual-read usage. | T5 | Decided |

### Extension commands

| Item | Calls (30d) | Decision | Rationale | Task | Status |
| --- | ---: | --- | --- | --- | --- |
| /agents-context | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /bedrock-refresh | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /fast | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /usage | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /context | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /damage-control | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /dc | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /extension-stats | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /foreman | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /fable | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /goal | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /orchestration-stats | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /permissions | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /router-status | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /router-explain | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /router-reset | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /router-off | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /router-on | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /provider | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /refresh-models | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /router-stats | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /skill-stats | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /tasks | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /transcript-purge | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /usage-stats | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /commit | 1 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /branch | 2 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /new-instance | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /new-terminal | 1 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /plan-it | 9 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /prd-it | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /review-it | 12 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /do-it | 10 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /clear | 1 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /exit | 0 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |
| /improve | 1 | Keep | Preserve public interface and on-demand diagnostics. | T5 | Decided |

### Agents

| Item | Dispatches (30d) | Decision | Rationale | Task | Status |
| --- | ---: | --- | --- | --- | --- |
| backend-dev | 1 | Keep | Distinct role. | T5 | Decided |
| builder | 4 | Keep | Distinct role. | T5 | Decided |
| code-reviewer | 11 | Keep | Distinct role. | T5 | Decided |
| csharp-pro | 0 | Keep | Distinct role. | T5 | Decided |
| devops-pro | 6 | Keep | Distinct role. | T5 | Decided |
| frontend-dev | 0 | Keep | Distinct role. | T5 | Decided |
| orchestrator | 0 | Keep | Distinct role. | T5 | Decided |
| planner | 1 | Keep | Distinct role. | T5 | Decided |
| python-pro | 1 | Keep | Distinct role. | T5 | Decided |
| qa-engineer | 10 | Keep | Distinct role. | T5 | Decided |
| reviewer | 26 | Keep | Distinct role. | T5 | Decided |
| rust-pro | 0 | Keep | Distinct role. | T5 | Decided |
| security-reviewer | 0 | Keep | Distinct role. | T5 | Decided |
| skill-review-fable-high | 0 | Merge into `skill-review` | Preserve Fable model and high effort. | T5 | Decided |
| skill-review-fable-medium | 0 | Merge into `skill-review` | Preserve Fable model and medium effort. | T5 | Decided |
| skill-review-gpt | 0 | Merge into `skill-review` | Preserve GPT model and xhigh effort. | T5 | Decided |
| typescript-pro | 25 | Keep | Distinct role. | T5 | Decided |
| validator | 5 | Keep | Distinct role. | T5 | Decided |
| skill-review | n/a | Keep merged replacement | Dispatch explicitly preserves Fable medium/high and GPT xhigh model/effort. | T5 | Decided |

## Measurements

T14 will record final instruction bytes and tool-reduction context-growth measurements here.
