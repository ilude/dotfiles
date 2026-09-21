---
created: 2026-09-21
status: in progress
completed: null
---

# Experimental Jev capability for default Pi

## Goal and authorization

User request: read TypeSafe's quickstart and plan a skill and practical ways to experiment with Jev in our workflow.

On 2026-09-21 the user authorized implementation of T1 and T2 only. Their client/tool contract below is approved. T3, skill packaging, experimental recipes, and live/paid calls remain deferred and are not dependencies or acceptance criteria for this delivery. Local task commits and integration follow the execution contract; push and deployment are not authorized. Planning performed no installation, secret retrieval, or paid inference.

User supplied Bitwarden Secrets Manager record:
- Name: `JEV_API_KEY`
- ID: `78faf76c-7df9-4ece-9c9a-b4cc01203215`
- Value and machine-account access have not been inspected or tested.

## Verified starting point

Paths are relative to the dotfiles repository, `C:/Users/mglenn/.dotfiles`.

- Planning date/profile: 2026-09-21, default, confirmed by `pi_session`.
- Starting revision: `main`, `e174b436`; worktree was clean before creating this spec. Recheck at execution.
- Intended execution profile: `pi/profiles/default/`. Legacy is excluded.
- This repository owns workstation/Pi integration. No Onclave or homelab changes are proposed.
- `pi/README.md` documents on-demand skills, deferred tools, existing Luna web screening, and Damage Control. Neither existing judge needs to change to make Jev available.
- `pi/profiles/default/extensions/web-tools/credentials.ts` already retrieves exact BWS records lazily, checks record names, and caches values in memory. `credential.py` uses `BITWARDEN_ACCESS_KEY` and `bitwarden-sdk==2.1.0` through `uv`. Helper stdout contains the secret and must be consumed privately, never returned as a tool result.
- `pi/profiles/default/package.json` owns pnpm dependencies, TypeScript and Vitest. TypeSafe SDK is not currently a dependency.
- Native Pi skills expose descriptions at startup and load bodies on demand. The upstream skill installer is not necessary to create a repository-owned default-profile skill.

## What Jev actually provides

Primary sources read on 2026-09-21:

1. [Quickstart](https://docs.typesafe.ai/introduction/quickstart.md), including Other agents.
2. [Upstream agent skill](https://raw.githubusercontent.com/typesafe-ai/skills/main/skills/typesafe-ai/SKILL.md) and [installation guidance](https://docs.typesafe.ai/agent-skill.md).
3. [HTTP API](https://docs.typesafe.ai/api.md), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md), [confidence](https://docs.typesafe.ai/confidence.md), and [models](https://docs.typesafe.ai/models.md).
4. Opening architecture and examples from [citation checking](https://docs.typesafe.ai/cookbooks/citation_check.md) and [skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion.md). These cookbook reads were partial, not full code reviews.

Findings:
- `POST https://api.typesafe.ai/v1/systemone` accepts text/structured state, a model ID, and named questions. It returns typed answers, actual model ID, and token usage, not generated explanations.
- Choice selects one defined option and returns its probability distribution and confidence. Score returns a probability-weighted position on ordered rubric levels, not necessarily an integer. Noul returns the probability of yes and has no separate confidence field.
- Question IDs are not inference instructions. Meaning must be explicit in instructions and criteria. Independent questions can share state in one request but cannot consume each other's answers.
- Confidence measures distribution concentration, not factual correctness or authorization. Preserve raw probabilities rather than presenting confidence as an accuracy guarantee.
- Current documented version is `jev-1.13.0`; `jev-latest` moves. Record the actual response model for comparisons.
- Current advertised price is $0.042 per million input tokens, with output tokens free. That implies about $0.00042 for 10,000 billed input tokens. This is a documentation-based estimate, not measured account billing or end-to-end latency.
- Documented limits: 64k tokens for the complete request, 32k for state plus the longest question; text input only. Choice supports up to 255 options, Score two to ten levels. Do not silently truncate evidence to fit.
- JavaScript SDK: `@typesafe-ai/sdk`, Node 20+, ESM and types. Its conventional environment name is `TYPESAFE_API_KEY`. Passing the retrieved key explicitly avoids renaming the user's BWS record or modifying global environment state.
- The Python SDK requires Python 3.10+, while repository Python tooling has a 3.9 floor. A TypeScript integration avoids raising that floor.
- Vendor documentation says requests/responses are not training data; it describes enterprise ZDR separately. That is not evidence this account has zero retention. Sending private work/session data needs a deliberate scope decision.
- The jaggedness page was blocked by the existing web screening tool. Its detailed limitations were not reviewed. No accuracy claims are made from it.
- The skill-suggestion cookbook measures a Hermes/Haiku setup, not our Pi setup. Its reported improvement is a hypothesis for local testing, not proof we need automatic skill routing.

## Approved client/tool contract and deferred skill proposal

Build one default-profile `jev` skill plus one deferred `jev_evaluate` tool. The skill teaches both using Jev during agent work and designing Jev-backed application experiments. The tool performs real evaluations without bringing credentials into agent context.

A skill alone would teach usage but leave ad hoc API/credential handling to shell commands. A tool plus skill gives a reusable experimental capability while leaving the main workflow unchanged. Do not install a second overlapping upstream skill; adapt its high-value guidance with source attribution and appropriate license handling if copying text.

Approved T1/T2 tool contract:
- Inputs: caller-supplied state and typed question map, optional model. Default to pinned `jev-1.13.0` for repeatable experiments; allow explicitly choosing an alias.
- Outputs: answers with probabilities/confidence where defined, actual model, usage, and measured request elapsed time. Return no fabricated rationale.
- No automatic file reads, transcript collection, fetching, action execution, or safety decisions. The agent supplies the evidence it selected for the experiment.
- Resolve `JEV_API_KEY` from the process environment if present, otherwise retrieve the exact BWS ID above. Validate the returned name and nonempty value. Pass the key privately as SDK configuration. Reuse the existing BWS helper pattern without a repository-wide secrets refactor.
- Credentials stay in process memory, not arguments, tool results, logs, fixtures, or committed configuration. SDK error bodies must not echo credentials or submitted state into diagnostics.
- Use explicit request timeout and cancellation. Surface unavailable/invalid responses as failures, not low-confidence answers. Follow the SDK's bounded retry facilities rather than adding an independent retry loop.
- Match existing deferred-tool discovery and visibility conventions. No startup BWS lookup or Jev request. No new provider entry, background hook, session injection, or automatic fallback from Luna.
- SDK/runtime boundary validation must check the answer IDs and types against the submitted questions, not just trust TypeScript declarations.

Proposed skill contents:
- When Jev helps: semantic selection, comparison, ranking, and narrow evidence-backed judgments. Ordinary code still handles exact matching, arithmetic, lookups, and actions.
- How to discover `jev_evaluate`, supply enough named evidence, choose primitives, batch independent questions, and read uncertainty correctly.
- Include no-match/insufficient-evidence options where appropriate. Keep rubrics in reviewable references rather than inventing thresholds on each call.
- Read live API/SDK docs before writing application integrations; link the index and relevant cookbooks instead of copying the documentation site.
- Explain that supplied state leaves the machine for TypeSafe. Initial examples use synthetic or public data, not automatic uploads of sessions or private repositories.
- Results are advisory in this slice. No changes to AGENTS.md, delegation authority, browser safeguards, or safety judges.

## Experimental menu

These are candidate recipes, not commitments to implement every integration.

| Experiment | Concrete use | Comparison and boundary |
| --- | --- | --- |
| Citation support, recommended first | Given a claim and source passage, choose supports/contradicts/not addressed/insufficient context | Exact quote existence stays in code. Compare against labeled public examples; retain source for inspection. |
| Relevance ranking | Score retrieved document passages against one research question | Compare top-k ordering against existing retrieval order and labeled relevance. Do not hide or delete sources automatically. |
| Skill suggestion | Rank current skill descriptions for supplied synthetic requests, including no matching skill | Compare with expected skills, including multi-skill requests. No per-turn hook or assumption that one skill always suffices. |
| Tool-result triage | Classify selected examples as mechanism failure, application failure, legitimate negative result, or insufficient evidence | Later use with the existing tool-call-analysis workflow, not raw error-flag counting. Real session samples require separate data scope approval. |
| Review-finding triage | Score whether a finding is supported by a supplied diff, requirement, and evidence | Advisory second opinion. Do not replace Steward or authorize added scope. |
| Safety-judge comparison | Compare Jev with current screening decisions on a selected fixture corpus | Later offline/shadow experiment only. No replacement or gate changes are included here. |

Start with citation support and skill suggestion: they exercise evidence comparison and workflow fit, have concrete expected outcomes, and do not need new retrieval or automation infrastructure. Relevance ranking is a useful alternative if research is the immediate priority.

Evaluation proposal: a small fixed fixture set per selected recipe, expected labels recorded before inference, with ambiguous/no-match cases. Report observed agreement, concrete errors, request latency, actual model and token usage. Keep fixture/rubric versions with the report. Do not turn a small experiment into a production accuracy claim or introduce a threshold-based promotion gate. Live batch size and spending permission remain open.

## Decisions needed

1. Approve the recommended first slice: on-demand skill plus deferred tool, with citation support and skill suggestion examples? Alternative: skill and local runner only, with no Pi tool registration.
2. Live experiments: recommend a first batch of at most 20 requests on synthetic/public inputs after implementation, with no private sessions or repository content. Confirm whether to include this paid batch or leave live use to the operator. Account terms/retention and spending limits are not verified.

T1 and T2 were approved on 2026-09-21 and are executable. The decisions above now apply only to deferred T3/experiments and do not block T1/T2.

## Proposed tasks

- [x] **T1: Add a bounded Jev client and private credential resolution**
  - Evidence: `6d905fe9`, `11e8a3e0`; SDK 0.6.0 pinned, private lazy/cached credentials, reconstructed validated responses. Cancellation mock/environment isolation corrected in `9cc4ee08`. Final focused checks passed without exclusions.
  - Depends on: T1/T2 authorization, granted 2026-09-21.
  - Proposed ownership: `pi/profiles/default/lib/jev/`, package manifest/lockfile, `tests/jev-client.test.ts`. Existing BWS helper is a read dependency; any extraction must preserve web behavior and stay narrowly scoped.
  - Implement the request/response contract and injectable transport/credential boundaries. Select and pin the current compatible SDK version during implementation.
  - Verify offline: all three answer types, fractional Scores, absent Noul confidence, malformed/mismatched responses, missing/wrong BWS record, environment override, credential redaction, timeout/cancellation and bounded failure handling. Synthetic keys only.
  - Done when the tested client can be consumed without knowledge of BWS plumbing and makes no startup calls.

- [x] **T2: Expose the experimental tool through existing deferred discovery**
  - Evidence: `9cc4ee08`, `7459a82`; deferred tool, typed schema/runtime validation, error results, changelog and offline native-loader smoke.
  - Depends on: T1's client contract.
  - Proposed ownership: `pi/profiles/default/extensions/jev.ts`, existing deferred registry as required, `tests/jev-tool.test.ts`.
  - Read current Pi extension docs, local pi-extension skill, and comparable image/tool-search registration before implementing. Adapt to native lifecycle and test conventions, not a new registration framework.
  - Verify offline: discover/activate, input validation, output mapping, cancellation, credential-safe error results, no startup API calls. Confirm registration does not change existing tool visibility or trigger automatic evaluations.
  - Done when the native tool works against a mocked service through the actual adapter.

- [ ] **T3: Package the Jev skill and selected experimental recipes**
  - Deferred: not authorized by the T1/T2 implementation request.
  - Depends on: approved experiments and T1/T2 interface. Drafting may run alongside T2 after that interface is settled.
  - Proposed ownership: `pi/profiles/default/skills/jev/SKILL.md`, its `references/`, `pi/profiles/default/docs/jev.md`, and root `CHANGELOG.md`.
  - Follow skill-creation/prompting guidance. Keep only discovery text always loaded; do not duplicate the API reference or add global workflow instructions.
  - Add selected fixed synthetic/public fixtures with expected outcomes and a bounded opt-in runner using the same client, not a second HTTP implementation. Document BWS bootstrap dependency and actual SDK/key naming.
  - Verify skill discovery/frontmatter/references offline and fixture construction with mocked inference. A live batch is included only if explicitly approved; record date, profile, input scope, model, outcomes and usage separately from offline checks.
  - Done when an agent can discover the capability and run a documented example without exposing the secret or guessing the tool contract.

## Execution and closeout contract

- Actual execution worktree: `C:/Users/mglenn/.dotfiles/.worktrees/jev-client-tool`, branch `feature/jev-client-tool`, baseline `e174b436`. Integration target: originating `C:/Users/mglenn/.dotfiles` checkout on `main`. Preserve unrelated changes and the original task-owned untracked plan until safe integration. Execution profile: default.
- T1/T2 delivery includes the material-change root CHANGELOG entry even though originally grouped with T3. It does not include skill discovery or recipe checks.
- Consult Strategist before delegation unless explicitly handed to a single agent. A Team Lead retains its Strategist-first workflow. Assign at most one named task per subagent; T3/T2 may have disjoint ownership once interfaces are settled.
- Continue independent work around blockers. Adapt equivalent technical details, but ask before changing scope, behavior, data sharing, or acceptance.
- Proposed finite checks from `pi/profiles/default`: `pnpm test jev-client.test.ts jev-tool.test.ts`, `pnpm run typecheck`, and an offline native-loader/skill-discovery check using the repository's current smoke pattern. If existing credential code changes, also run `pnpm test web-tools-credentials.test.ts`. Establish test ownership and mocking with the testing skill at implementation time.
- No live service availability or accuracy requirement is implied by offline success. If live tests remain operator-owned, record them as non-blocking limits rather than unfinished implementation.
- For this partial T1/T2 delivery, keep the spec active with T3 deferred, commit task changes and plan evidence, and merge into the recorded target. Do not archive unfinished T3 or claim whole-plan completion. After all future authorized work is finished, archive the entire spec under `.specs/archive/jev-workflow-experiments/`. Do not push or deploy without separate authorization.
- If merge is blocked, retain the worktree and report the blocker, next action, and owner. Routine conflicts remain agent-owned. Honor explicit `--no-merge` by retaining the committed worktree.
- After merge, verify delivered content and archive, record completion metadata in a target commit, and remove the task worktree only when it has no uncommitted/unmerged work. Keep integration/cleanup unchecked until actually finished.
- Execution final response must lead with explicit outcome: 🟢 COMPLETED; 🔴 NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED; 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED; or 🟡 CLEANUP PENDING. Foreground blockers and required actions before passed checks.

## Current handoff

- Status: T1/T2 completed and integrated locally into main via fast-forward through `60d79d4e` on 2026-09-21. Task worktree removed after clean/ancestor checks. T3 remains deferred, so whole-plan completion and archival are intentionally pending.
- Actual checks, 2026-09-21, default profile in recorded task worktree: `pnpm test jev-client.test.ts jev-tool.test.ts tool-visibility.test.ts tool-search.test.ts` coverage passed (19 tests, final run split between tool and other three files); `pnpm run typecheck` passed; `node scripts/jev-smoke.mjs` passed through installed Pi 0.85.1. Tests used synthetic credentials and mocked transport. No live BWS or Jev requests.
- Lasting checkout setup: frozen pnpm install and default dependency link setup passed; `pnpm run check:runtime` and `node scripts/jev-smoke.mjs` passed after installation on main. No push performed.
- Next action: operator may reload Pi to discover `jev_evaluate` through tool search. T3 and live experiments need separate authorization; no T1/T2 implementation work remains.
- Verification limits: live BWS access/key validity, model availability, production latency/billing and domain accuracy remain untested. The native-loader check establishes offline module registration, not live provider calls. The model-limitations page was unavailable through screening.
- [x] Authorized T1/T2 implementation and agreed offline checks complete.
- [ ] Whole spec archived, deferred until T3 is resolved.
- [x] T1/T2 delivery and evidence integrated into recorded target.
- [x] T1/T2 task worktree cleanup verified.
