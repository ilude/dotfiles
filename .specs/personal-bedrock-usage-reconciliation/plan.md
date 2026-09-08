---
created: 2026-09-08
status: draft
completed: null
---

# Reconcile Pi Bedrock usage with the existing per-user AWS totals

## Goal and scope

- User requirements:
  - `/usage`, `/bedrock`, and the footer must report Mike Glenn's Bedrock usage, not the AWS account-wide total.
  - Recover a month-to-date personal cost snapshot when Pi's local ledger is absent or incomplete.
  - Use the same payer CUR 2.0 IAM-principal attribution already used by the Bedrock cost alerts.
  - Add locally observed Pi requests after the snapshot cutoff without double-counting earlier usage.
  - Keep the personal AWS baseline visibly distinct from Pi's local request/model estimates.
- Non-goals:
  - Replacing the existing company alerting, CUR export, or payer-account attribution pipeline.
  - Treating Cost Explorer's account total as personal usage.
  - Reconstructing request content or exposing other users' detailed usage through Pi.
  - Changing the legacy Pi profile.
- Authorization: planning only. Executing this plan would authorize local task commits and merges in the two repositories. It does not authorize pushing either repository or deploying Terraform/Lambda changes to AWS. Deployment requires separate explicit approval.

The user's request and subsequent changes are authoritative. Keep unapproved optional work outside the task checklist and completion criteria.

## Context for a fresh session

Paths are relative to `C:/Users/mglenn/.dotfiles` unless explicitly prefixed with `gitlab-helm:` for `C:/Projects/Work/Gitlab/gitlab-helm`. Read current applicable `AGENTS.md` files before acting.

- Owning repositories and paths:
  - Dotfiles owns Pi integration under `pi/profiles/default/`.
  - `gitlab-helm` owns the AWS CUR reader, alert Lambda, IAM permissions, Terraform deployment, and its tests.
  - Do not copy payer inventory, account configuration, or secrets into dotfiles.
- Proposed execution worktrees:
  - Dotfiles: `.worktrees/personal-bedrock-usage-reconciliation`, branch `task/personal-bedrock-usage-reconciliation`, merge target `main`.
  - `gitlab-helm`: sibling worktree chosen at execution start, branch `task/personal-bedrock-usage-api`, merge target `main`.
- Required reading:
  - `AGENTS.md`
  - `pi/README.md`
  - `pi/profiles/default/docs/bedrock.md`
  - `pi/profiles/default/extensions/bedrock/index.ts`
  - `pi/profiles/default/lib/bedrock/ledger.ts`
  - `pi/profiles/default/tests/bedrock-accounting.test.ts`
  - `pi/profiles/default/tests/bedrock-reporting.test.ts`
  - `gitlab-helm:regions/us-east-2/AGENTS.md`
  - `gitlab-helm:regions/us-east-2/claude-code-bedrock/AGENTS.md`
  - `gitlab-helm:regions/us-east-2/claude-code-bedrock/terraform/per-user-cost-alerts.tf`
  - `gitlab-helm:regions/us-east-2/claude-code-bedrock/terraform/lambda/per_user_cost_alert.py`
  - `gitlab-helm:regions/us-east-2/claude-code-bedrock/terraform/lambda/tests/test_cost_alert.py`
  - `gitlab-helm:regions/us-east-1/payer-billing/README.md`
  - `gitlab-helm:regions/us-east-1/payer-billing/terraform/athena.tf`
- Verified starting behavior:
  - Payer CUR 2.0 exports `line_item_iam_principal` and covers Bedrock Runtime and Mantle charges.
  - The existing alert Lambda groups month-to-date unblended cost by IAM principal and model through Athena.
  - The active local AWS identity is the IAM user `mike.glenn` in the workload account.
  - Directly assuming payer role `etgdev-bedrock-cur-reader` from that IAM user is denied. The alert Lambda role is the intended reader.
  - Cost Explorer returns an account-wide Bedrock total and cannot serve as Mike's personal baseline.
  - The Terraform source defines a per-user alert Lambda, but the expected function was not present in the workload account during planning. Execution must resolve this source/live difference before selecting a deployment action.
  - The locally created account-wide `$218.157584098` baseline was deleted and must not be restored.
- Existing work to preserve:
  - Dotfiles `main` has task-owned, uncommitted first-pass Cost Explorer changes in `CHANGELOG.md`, `pi/README.md`, `.gitignore`, Bedrock source/docs/tests, and new `pi/profiles/default/lib/bedrock/cost-explorer.ts`. Replace or remove that incorrect mechanism in the task worktree rather than committing it as final behavior.
  - Dotfiles also has unrelated changes in `pi/profiles/default/docs/subagents.md` and `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`; do not move, modify, or commit them with this work.
  - `gitlab-helm` has an unrelated untracked `regions/us-east-2/teams/docs/GITLAB_AGENT_KUBECTL_ACCESS_PLAN.md`; preserve it and exclude it from this work.

### Pi profiles

- Planning profile: `default`, `C:/Users/mglenn/.dotfiles/pi/profiles/default`.
- Intended implementation/validation profile: `default` through repository-owned pnpm commands and `pp`; legacy remains unchanged.

| Date | Actual profile/path | Work or check | Result / relevant model settings |
| --- | --- | --- | --- |
| 2026-09-08 | default / `pi/profiles/default` | Planning and source investigation | Existing CUR attribution and current access boundary verified; no personal reconciliation implementation validated |

## Decisions and contracts

| Decision | Source/status | Choice or exact question | Affected tasks |
| --- | --- | --- | --- |
| D1 | User requirement | Personal cost means the CUR rows attributed to the current AWS IAM principal, currently `mike.glenn`, not the Cost Explorer account total. | T1-T5 |
| D2 | Verified | Reuse the existing CUR/Athena query and its payer-reader role through the workload-side Lambda. Pi must not receive payer credentials or direct broad CUR access. | T1-T4 |
| D3 | Proposed | Add a read-only Lambda action that returns only one requested principal's month-to-date aggregate and model totals. Restrict invocation to the existing Bedrock user identities. The handler must not publish alerts or update milestone state for this action. | T1-T3 |
| D4 | Proposed | Pi obtains its caller ARN with STS, requests that exact principal, stores the returned personal total with principal, source timestamp, CUR coverage timestamp/period, and local cutoff, then counts only local records after the cutoff. | T2-T4 |
| D5 | Required safety | A missing, stale, denied, malformed, or differently attributed AWS response must fail visibly. It must not fall back to account-wide Cost Explorer data or silently write zero. | T2-T5 |
| D6 | Verified limitation | CUR is delayed. Reports must label the baseline's source and capture/coverage time; local records after the cutoff keep the estimate current while later CUR delivery remains a documented limitation. | T2-T5 |
| D7 | Deployment boundary | Code integration does not authorize AWS deployment. After local checks and reviewed Terraform plan, stop for explicit deployment approval. | T5, T7 |
| D8 | User requirement | Add a separate commit-workflow phase that deterministically removes only Git-reported trailing spaces and tabs before staging, then reruns `git diff --check`. Use a small repository-owned Node utility rather than a broad formatter or an unmaintained npm dependency. | T6 |

### Proposed personal snapshot response

The AWS-side read-only action should return a bounded JSON object equivalent to:

```json
{
  "schemaVersion": 1,
  "billingMonth": "YYYY-MM",
  "principal": "arn:aws:iam::<workload-account>:user/mike.glenn",
  "displayName": "mike.glenn",
  "amount": 0.0,
  "models": [{ "name": "model label", "amount": 0.0 }],
  "source": "payer-cur-2-athena",
  "generatedAt": "ISO-8601 UTC timestamp",
  "latestUsageAt": "ISO-8601 UTC timestamp or null"
}
```

The exact Lambda event envelope and CLI payload are routine implementation details, but the caller/principal binding must be tested. If same-account Lambda invocation cannot securely identify or constrain the requested principal with the existing IAM shape, T1 must choose and document the smallest secure workload-side interface before implementation. Do not grant workstation users direct payer CUR access.

### Pi baseline rules

- Store the personal baseline in profile-local ignored state, not in Git.
- Include schema version, full principal ARN, display name, billing month, amount, source, generated/coverage timestamps, and local cutoff.
- Reject a response whose principal differs from the STS caller identity.
- `/usage`, `/bedrock`, and footer totals equal the personal baseline plus priced local Bedrock records strictly after the cutoff.
- Preserve and label unpriced local requests.
- Refuse automatic baseline replacement when doing so would create overlap. A deliberate refresh must define a new safe cutoff from returned CUR coverage and local records before it can replace state.
- Never use the account-wide Cost Explorer implementation or its deleted `$218.16` snapshot.

## Execution guidance

**Worktree isolation:** At execution start, create a dedicated worktree and task branch per changed repository. Work and validate there. Preserve other checkout changes and carry only the task-owned uncommitted Bedrock changes into the dotfiles task worktree. Respect both repositories' instructions.

**Integration order:** Complete and locally integrate the `gitlab-helm` contract first, then integrate dotfiles. Push and deployment remain separately authorized.

**When an assumption fails:** Reassess the mechanism against personal CUR attribution. Use a simpler secure workload-side interface within scope; ask before granting broader payer access, changing account boundaries, or replacing CUR attribution.

**Before expanding work:** Identify which personal-usage requirement needs the addition and what evidence justifies it. Do not turn alert redesign, dashboard changes, or general billing APIs into this task.

**At scope checkpoints:** Confirm the work still exposes one caller's existing CUR aggregate to Pi and does not redesign company cost reporting.

**Recovery when drift is found:** Remove task-introduced Cost Explorer/account-total logic and return to the existing CUR attribution path without disturbing unrelated changes.

## Tasks

- [ ] **T1 — Finalize a secure personal-usage query contract and resolve live drift**
  - Depends on: none.
  - Inputs/files: required `gitlab-helm` Lambda, Terraform, IAM, payer-reader, and tests listed above; read-only AWS function/IAM/state inspection.
  - Do:
    - Compare Terraform state/source with the observed absence of the expected per-user alert Lambda. Determine whether it is renamed, disabled, undeployed, or drifted without changing AWS.
    - Confirm the narrowest same-account invocation permission available to existing Bedrock users and how the Lambda binds a request to the caller's principal.
    - Record the final event/response/error contract in this plan before downstream implementation.
  - Verify: bounded AWS read-only inspection plus targeted Terraform state/source comparison from `gitlab-helm`.
  - Done when: the actual function target, caller binding, permissions, response schema, and deployment delta are concrete enough for T2 and T3 without guessing.
  - If blocked: stop and ask before broadening payer-role trust or exposing other users' CUR data.
  - Evidence: Not started.

- [ ] **T2 — Add the read-only per-user snapshot action in `gitlab-helm`**
  - Depends on: T1.
  - Inputs/files: `gitlab-helm:regions/us-east-2/claude-code-bedrock/terraform/lambda/per_user_cost_alert.py`, its existing tests, and only the Terraform/IAM files identified by T1.
  - Do:
    - Reuse `_cur_attributed_costs` and existing model aggregation.
    - Add a side-effect-free action returning only the authorized principal's aggregate, model totals, and coverage metadata.
    - Keep scheduled alert behavior unchanged.
    - Add only the invocation permissions and outputs needed by Pi.
  - Verify: `uv run pytest` for the Lambda test file, Python lint/format required by the repository, `terraform fmt -check`, `terraform validate`, and a targeted `just plan bedrock` or equivalent non-mutating plan.
  - Done when: tests prove caller/principal isolation, no SNS/DynamoDB side effects, correct empty/present CUR handling, bounded output, and unchanged scheduled alert behavior; Terraform plan shows only the intended interface/deployment delta.
  - If blocked: preserve the existing alert path and return to T1 rather than weakening identity checks.
  - Evidence: Not started.

- [ ] **T3 — Replace Pi's account-wide reconciliation with personal CUR reconciliation**
  - Depends on: T1 contract; may proceed against a tested mock before T2 deployment.
  - Inputs/files: `pi/profiles/default/extensions/bedrock/index.ts`, `pi/profiles/default/lib/bedrock/ledger.ts`, proposed replacement for `pi/profiles/default/lib/bedrock/cost-explorer.ts`, `.gitignore`, and Bedrock tests.
  - Do:
    - Remove the first-pass Cost Explorer service discovery/query implementation.
    - Resolve the current AWS caller ARN without exposing credentials.
    - Invoke the T1 AWS contract, validate its schema and exact principal match, and write the personal baseline atomically under the existing lock discipline.
    - Apply cutoff-aware summary logic to `/usage`, `/bedrock`, and footer status.
    - Make missing access/data explicit and never substitute account cost or zero.
  - Verify: targeted Vitest tests for valid snapshot, wrong principal, denied invocation, malformed response, empty personal usage, cutoff filtering, duplicate reconciliation, and `/usage` display; TypeScript checks in T5.
  - Done when: all three Pi surfaces use only a validated personal CUR baseline plus later local records, with no account-wide Cost Explorer path remaining.
  - If blocked: retain honest local-only reporting and report the AWS contract blocker; do not restore the account baseline.
  - Evidence: Not started.

- [ ] **T4 — Document operation and recovery clearly**
  - Depends on: T2 and T3 interface decisions.
  - Inputs/files: `CHANGELOG.md`, `pi/README.md`, `pi/profiles/default/docs/bedrock.md`, and relevant `gitlab-helm` Bedrock operator documentation.
  - Do:
    - Explain in plain language that AWS supplies Mike's delayed personal baseline and Pi adds newer local usage.
    - Document command behavior, source/coverage labels, required permissions, failure messages, profile-local files, and why account Cost Explorer is prohibited.
    - Document that deployment and `/reload` are separate operator actions.
  - Verify: review commands and filenames against implemented code; no secrets, account totals, or unsupported guarantees in examples.
  - Done when: a fresh operator can reconcile, verify the principal shown, understand delayed data, and diagnose denied/unavailable results.
  - Evidence: Not started.

- [ ] **T5 — Run bounded cross-repository validation and prepare integration**
  - Depends on: T2-T4.
  - Inputs/files: both task worktrees and their repository instructions.
  - Do:
    - Run the finite checks below.
    - Review diffs for unrelated files, especially the pre-existing dotfiles and `gitlab-helm` changes named above.
    - Commit and locally integrate `gitlab-helm` first, then dotfiles, retaining deployment and push as unauthorized.
  - Verify: commands under Agreed validation and finish.
  - Done when: both local target branches contain focused commits, tests pass, the coordinating plan remains active pending deployment, and unrelated work is untouched.
  - If blocked: retain worktrees and report the exact failed check or integration conflict.
  - Evidence: Not started.

### Separate phase: deterministic commit-whitespace repair

This phase is intentionally separate from Bedrock reconciliation. It addresses the observed `/commit` ceremony failure without making formatting changes part of the billing contract or blocking T1-T5.

- [ ] **T6 — Add narrow deterministic whitespace repair to `/commit`**
  - Depends on: none; execute after T5 when following this plan so Bedrock integration remains focused.
  - Inputs/files: `pi/profiles/default/commands/commit/reviewer.md`, `pi/profiles/default/docs/commit.md`, a proposed repository-owned Node utility under `pi/profiles/default/commands/commit/`, and relevant commit-workflow tests.
  - Do:
    - Run `git diff --check` in each repository before staging.
    - When it reports trailing spaces or tabs, pass only the reported text-file paths to the utility and remove only horizontal whitespace immediately before line endings.
    - Preserve CRLF/LF style, file encoding bytes outside the reported whitespace, and final-newline state; reject binary files and unexpected diagnostic forms rather than applying a broad rewrite.
    - Rerun `git diff --check`, then continue normal review, staging, hooks, and commit. Keep substantive failures fatal and do not invoke Prettier or add a third-party package solely for whitespace cleanup.
  - Verify: focused utility tests cover LF, CRLF, no-final-newline, tabs/spaces, unchanged clean files, and binary rejection; commit-workflow tests prove repair-before-stage and failure on unresolved `git diff --check` output.
  - Done when: the previously observed trailing-whitespace case is repaired without operator intervention or unrelated formatting, while unresolved whitespace and ordinary Git/hook failures remain visible.
  - Evidence: Not started. The immediate trailing space in `pi/profiles/default/tests/bedrock-reporting.test.ts` was removed manually so the current `/commit` can run; this is not implementation evidence for T6.

- [ ] **T7 — Deploy and verify the personal snapshot end to end**
  - Depends on: T5 and explicit user deployment authorization. T6 is independent and does not block deployment.
  - Inputs/files: reviewed `gitlab-helm` Bedrock Terraform plan, deployed AWS function/interface, default Pi profile.
  - Do:
    - Apply only the reviewed Bedrock Terraform delta.
    - Invoke the read-only snapshot as the current AWS identity and verify the returned principal is `mike.glenn` without printing credentials or other users' details.
    - Reload default Pi, run personal reconciliation, and verify `/usage`, `/bedrock`, and footer agree on the same baseline plus post-cutoff local usage.
  - Verify: targeted live invocation, post-apply clean Terraform plan, and the three Pi surfaces. Do not make paid model calls solely for validation unless separately authorized.
  - Done when: the live snapshot is personal, stored cutoff metadata is correct, all three surfaces agree, and no account-wide baseline remains.
  - If blocked: do not broaden access or deploy unrelated changes; report and retain the last reviewed state.
  - Evidence: Blocked pending future explicit deployment authorization.

## Agreed validation and finish

- `gitlab-helm`:
  - Targeted Lambda unit tests with `uv run pytest`.
  - Repository-required Ruff checks for changed Python.
  - `terraform fmt -check` and `terraform validate` in the Bedrock Terraform root.
  - One targeted non-mutating Bedrock plan before deployment; one clean post-apply plan only if deployment is authorized.
- Dotfiles default profile:
  - `cd pi/profiles/default && pnpm test bedrock-provider.test.ts bedrock-accounting.test.ts bedrock-reporting.test.ts usage-context-tps.test.ts scheduler-footer.test.ts`
  - `cd pi/profiles/default && pnpm exec tsc --noEmit -p tests/tsconfig.bedrock.json`
  - `cd pi/profiles/default && pnpm exec tsc --noEmit -p tests/tsconfig.usage.json`
  - `cd pi/profiles/default && node scripts/bedrock-smoke.mjs && node scripts/usage-smoke.mjs`
- Live checks are limited to the existing CUR snapshot interface and reporting unless paid model invocation receives separate authorization.
- Fix demonstrated failures relevant to this scope and rerun affected checks only. Do not expand into a general alerting or billing audit.

## Current handoff

- Status: draft; planning complete enough to begin T1, but implementation and deployment are not authorized by this request.
- Completed work: investigation established the correct CUR-based attribution source, current `mike.glenn` identity, direct payer-role denial, absent expected Lambda, and deletion of the wrong account-wide baseline.
- Next: T1, in isolated worktrees, resolve the live Lambda/state difference and freeze the secure caller/principal contract.
- Blockers/open decisions: the exact live workload-side function/interface and principal-binding mechanism must be resolved by T1; AWS deployment remains unauthorized.
- Verification limits: source inspection proves the existing alert attribution design, not a currently callable personal snapshot path. No live personal CUR snapshot has been retrieved.

## Completion and archive

When the described work and agreed checks finish, set `status: completed` and `completed: YYYY-MM-DD` above, record the result and actual profile runs, and move this entire directory to `.specs/archive/personal-bedrock-usage-reconciliation/` in the dotfiles task worktree. Repair inbound links and never overwrite an existing archive. Leave unfinished implementation active.

Commit the implementation and archived plan together, then merge into the recorded target. Integrate `gitlab-helm` before dotfiles. Push and deployment require separate authorization.

Preserve unrelated target-checkout changes. If blocked, retain task worktrees and report pending integration rather than claiming delivery. After merging, verify the targets contain the changes and archive with no active plan copy left. Remove task worktrees only after successful integration with no uncommitted or unmerged task work.
