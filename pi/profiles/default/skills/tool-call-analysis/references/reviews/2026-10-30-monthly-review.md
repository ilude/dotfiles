# TCA-017: Monthly Pi tool-call review

Review date: 2026-10-30. Investigation only, with no runtime fixes, tests, reloads, commits, or publication.

## Scope and method

- Profiles: default and legacy, read-only history inspection explicitly covered by the requested Pi-session review.
- Fixed event interval: `[2026-09-30T16:14:00Z, 2026-10-30T16:14:00Z)`, equivalent to September 30 at 12:14 EDT through October 30 at 12:14 EDT. Session creation time was not used to exclude resumed sessions.
- Read classification feedback TCF-001 through TCF-006 and relevant prior reviews, particularly TCA-001, TCA-005, TCA-006, TCA-014, and TCA-016.
- Began with native analytics catalog and a both-profile SQL aggregate. Large mode selected about 6.063 GB, but staging exceeded its configured 8 GiB owned-disk budget. No partial aggregate was accepted. Limits were not raised.
- Used the documented read-only fallback: streamed parsed JSONL from the two actual profile session trees, with per-file byte horizons, retained session/file/record/line coordinates, and supplemental scans of subagent settlement messages. Extracted candidate evidence stayed in task-owned system-temp files and was removed after reporting. Source history was unchanged.
- Traversed 5,488 files totaling 6,064,788,468 bytes: 3,018 default files and 2,470 legacy files. Parsed 1,269,026 JSON records, including the non-session first record of the excluded backfill. No file-read errors or observed per-file size/mtime changes during the primary scan.
- Excluded one legacy `historical-backfill/2026-05-07T16-10-00-000Z_skill-stats-backfill.jsonl` because its header was not a native session header. Two malformed lines, 157 and 158, were found in a legacy May 18 archive file. Those lines could not be timestamped or reviewed. No valid legacy events were in the requested interval. No legacy runtime, dependency, or configuration operation was performed.
- The window contained 236,271 stored records in 843 default session files, including 42,889 stored tool results and 3,035 results flagged `isError`.
- Collapsed inherited copies using persisted result ID, event timestamp, tool-call ID, tool name, and profile. Candidate copies had no conflicting extracted text. Representatives were the earliest containing sessions, checked against session-header timestamps. This produced **36,196 distinct tool results**, **2,582 distinct error-flagged results**, and 36,231 distinct assistant tool calls. These are persisted-event counts, not counts of internal subprocesses or nested codemode operations. The call/result difference does not establish lost results.
- Scanned all valid selected records for error flags and supplemental textual failure signatures. The candidate scan produced 6,252 stored candidate occurrences, 5,176 after inherited-copy collapse. Also inspected 1,198 distinct subagent/closeout/command-error custom messages, including 20 explicitly failed subagent settlement notices.
- This is complete retrieval of valid selected input, followed by signature triage and representative contextual review. It is **not a semantic review of every message or a complete adjudication of all 2,582 flagged results**. Supplemental text matches can quote source, tests, or past errors, so they were not automatically counted as failures. Counts below restrict error-signature groups to actual error-flagged results and isolate codemode's terminal script error from preceding output.

The error-flagged total is not a tool-defect total or failure rate. Test failures, Git conflicts, remote HTTP errors, intentional probes, cancellation, policy refusals, caller mistakes, and implementation defects remain separate.

## Findings needing attention

### 1. Visible-child readiness repeatedly fails before work starts

- **Category:** Subagent startup/mechanism failure symptom. The common deadline result does not establish one common root cause.
- **Count:** 8 failed exchanges in 4 distinct parent sessions over the whole interval. Six of these are recent, across 3 parent sessions on October 23, 29, and 30. Counts use distinct failed settlement events, not their copied history or subsequent parent inspection results.
- **Evidence:**
  - Parent `01a16974-8fc6-7141-acf3-729c8cb0eae3`, records `c985cbd2` and `a7236d27`, October 23: two developer launches failed with `Visible child did not become ready`, each reporting a 30-second duration.
  - Parent `01a187c4-253d-72ec-9ff9-129572f1bad3`, records `8dcb8dc3` and `25cac026`, October 29: developer and writer startup failures.
  - Parent `01a18525-aee6-734f-8ad2-c4d38cd3109e`, records `98dcd7d0` and `3bd761ee`, October 30: reopening a developer exchange and launching a reviewer both failed readiness.
  - Earlier parent `01a0f45a-6d00-75c0-a763-12e00924a8e0`, records `b32ff617` and `ddfc8370`, September 30: two similar startup deadline failures.
- **Recovery:** Replacement work proceeded in the October 29 parent, but retrying the failed child's saved conversation first returned `Saved subagent session is unavailable` (`83ec125a`). Later replacement results exist. Recovery of every individual failed exchange was not established.
- **Status/recommendation:** Still observed on October 30. Investigate exact failed launch/readiness transitions and available child startup evidence. Do not infer inactivity from model phase labels, blame a particular model, or increase deadlines merely from this symptom. This is separate from the older tool-ceiling defect below.

### 2. Analytics call rendering crashed a visible child

- **Category:** Isolated, high-impact tool/UI mechanism defect, not a recurring within-window finding.
- **Count:** 1 verified child crash in 1 parent session.
- **Evidence:** Parent `01a15446-5770-7481-945d-31db7ca67acb`, settlement `cd104a8f`, October 20 at 18:37:35Z. Child `01a15a97-37f3-73e6-a9ec-c0d0bca3eec4` exited with an uncaught `TypeError: args.profiles?.join is not a function`, with the stack pointing to `lib/log-analytics/render.ts:56`.
- **Current source:** `pi/profiles/default/lib/log-analytics/render.ts:41-56` still casts raw renderer arguments and calls `args.profiles?.join(...)` without checking that the present value is an array. Git history shows no change to this file after September 25 in the inspected checkout. This is a narrow persistence check, not a full renderer audit or live reproduction.
- **Limits/cause:** The exact in-flight argument fragment at the crash was not recovered. Persisted completed child calls do not establish that the final submitted `profiles` value was malformed. Partial or malformed renderer inputs are possible; the observed fact is that the renderer exception terminated the child.
- **Recovery:** Parent explicitly identified the renderer crash and relaunched the investigation while instructing the replacement not to use analytics (`18905a59`, `d1a22d69`). That avoided the defect rather than repairing it.
- **Recommendation:** Prioritize a narrow renderer robustness correction so an unexpected argument shape cannot terminate Pi. No permission or workflow gate is warranted by this evidence.

### 3. Browser attachment returns a repeated protocol-parameter error

- **Category:** Repeated browser/CDP operation failure, with root cause unresolved. Not evidence that every browser refusal is a defect.
- **Count:** 2 distinct errors in 2 independent session origins.
- **Evidence:**
  - `01a178f6-5464-7634-a43e-543bf198e8e6` / `ca27b15c`, October 27: screenshot through codemode failed with `CDP command Target.autoAttachRelated failed (code -32602)`.
  - `01a17e57-2d1e-72c1-955d-0c68cc192b58` / `c0ba96d4`, October 28: snapshot failed with the same method/code.
- **Recovery:** The October 28 caller could list tabs afterward, but did not establish that the failed snapshot subsequently worked. Thus transport was not wholly unavailable, and the requested operation remained unverified in the selected follow-up.
- **Status/recommendation:** No fix established in this review. Check the exact target lifecycle and method parameters in these two cases before choosing an implementation remedy. Do not combine these with expected TLS/security warnings, operator cancellations, or stale selector refusals.

## Recurring caller mistakes

These are tool-use failures, not evidence that codemode, edit, Bash, or pnpm failed their contracts. Counts are normalized signature counts after inherited-copy collapse, not a sum to be subtracted mechanically from the overall error total.

| Mechanism | Occurrences | Distinct originating sessions | Evidence and recovery/status |
| --- | ---: | ---: | --- |
| Calling unavailable `tools.*` members from codemode | 33 | 28 | Explicit missing-member errors: `subagent` 16, `subagent_control` 10, `tool_search` 7. Example `01a14774-b523-71e7-94ff-3e46ff6e54b7` / `01ee723b`; direct `subagent` launches then succeeded. Still observed October 30, e.g. `01a17d96-c183-76cb-9bc6-fb45ae7a3a2a` / `024c7e96`. Use direct orchestration tools and codemode's `searchTools`, respecting the callable set. Broader generic `not a function` results were not added to this count. |
| Non-unique edit replacement text | 80 | 59 | Examples `01a14774-b523-71e7-94ff-3e46ff6e54b7` / `e9631515` and `01a147bd-4fcd-7390-9803-56d58ffbdd56` / `7b03b5b0`: tool correctly identified multiple matches. Still occurs through October 30. Re-read the relevant region and supply unique minimal context. Not all recoveries were individually adjudicated. |
| Overlapping replacements in one edit | 6 | 5 | `01a13bcb-e5f7-73a0-b69f-c1054db8165c` / `80767037` and `01a17eda-04b8-70c8-8d52-530b3de2bf24` / `fc36609f`. Correctly rejected. Combine the touching replacements, rather than changing edit enforcement. |
| pnpm invoked where no package manifest exists | 34 | 29 | `01a0f80f-89d1-7045-a49b-05e443983f4e` / `21bfccd0` ran from dotfiles root; changing to `pi/profiles/default` yielded passing typecheck and 30 tests (`6304953a`, `6263a6ec`). Another example `01a16a19-568d-7429-9878-acda4208fff6` / `5aeb9125` ran browser profile tests from an EISA checkout. Use the package-owning cwd or explicit `--dir`. |
| Sending `Get-ChildItem` to Bash | 7 | 7 | Distinct Bash results reported `Get-ChildItem: command not found`. Example `01a13b4c-14e1-7736-9258-8eeef5160772` / `b73c916f`. Wrong shell selection, not Bash transport failure. |
| Regex metacharacters used as literal code | 4 | 3 | `01a159fd-67ca-74bd-810a-8478b7a458b4` / `59befc17` searched `registerCommand(name` without literal mode; `01a16a19-568d-7429-9878-acda4208fff6` / `1e322843` similarly searched `start(input`. Both produced unclosed-group errors. Same mechanism as TCA-006. |
| Exceeding codemode small-state storage limits | 7 | 6 | Explicit `RangeError: store...` failures. These limits were correctly reported. Large extracted history belongs in local variables or bounded temporary evidence, not persistent codemode small-state slots. |

An additional 74 exact-text-not-found edit results in 53 origins were observed. They are not edit mechanism defects; stale context, concurrent changes, and caller mismatch were not distinguished for every occurrence. Do not automatically call all of them the same caller mistake.

This review itself initially attempted unavailable `tools.tool_search` and recovered by using the direct tool. It also encountered the analytics disk budget. Both happened after the frozen cutoff and are excluded from all historical counts above. They reinforce the practical distinction between caller misuse and an explicitly enforced resource limit.

## Lifecycle noise and environment outcomes kept separate

- **100 `cancel-question` attempts in 83 child sessions** returned `already resolved by parent answered`. All 100 calls were cancellation actions, not failed attempts to deliver the parent's answer. Representative `01a1357b-167b-733f-8263-d7eee116049c` / `f2a76009` then continued ordinary work. This is unnecessary cleanup traffic, not 100 broken delegations.
- **61 `subagent_control` results in 37 origins** said `Conversation is not retained by a live process`. Sixty predate the October 27 saved-conversation reopening change, commit `898a1ff1`. One occurs October 30 (`01a18819-d2aa-731f-8486-8beea738e395` / `75ff2714`). The old live-retention restriction explains the historical rejection contract; one later failure does not establish recurring breakage of the new reopening implementation. The exact loaded runtime for that later event was not established. Current code on disk and historical loaded processes must not be conflated.
- **12 `web_search` calls in 5 sessions** returned `BWS SERPER_API_KEY unavailable`, e.g. `01a147bd-9eee-7554-9cbc-dd990a86f7ef` / `3ac8b569`. This establishes a repeated search credential prerequisite failure, not a demonstrated search adapter crash. It does not establish that a secret was deleted or absent on every workstation. Live credential resolution/recovery was not tested.
- One historical analytics result exceeded its owned-disk budget (`01a15f79-2b2e-776c-87f0-8548945a734d` / `b5ef5c21`). This review encountered the same configured capacity limit and completed retrieval through streaming. Do not call correct limit enforcement a mechanism crash or raise the limit without a separate decision.
- Eight parent-connection timeout results were concentrated in one session, `01a17ed7-c415-77d6-ab1c-6f45c9e4f694`, within milliseconds on October 27. This is one isolated high-volume incident, not cross-session recurrence.
- One child settlement reported an OpenAI response stream ending before a terminal event. Provider/transport cause was not established; it is not evidence of a recurring subagent dispatcher defect.
- Test/typecheck failures, Git merge/push conflicts, remote HTTP errors, policy refusals, and deliberate cancellations were not promoted into tool-defect totals. In particular, no blanket classification was assigned to explorer inspection refusals or browser security warnings without proving that the rejected operation should have been allowed.

## Historical defects with recovery evidence

### Visible tool-ceiling gate

Ten failed child assignments across six parent sessions reported `Visible child tool ceiling mismatch`, all October 1-2. TCA-014 previously examined two of these in one parent; this broader scan establishes cross-session recurrence. The gate was removed in `d24e49ef` on October 3. No later settlement with this exact error signature was found in the complete selected scan. That is stronger evidence than the earlier isolated review, but does not explain the separate later readiness timeouts.

### Closeout result parsing

Eleven error-flagged no-argument `closeout_successor_handoff` calls in two successor sessions returned JSON parse errors on October 5:

- `01a10cb6-534d-7384-8e14-387e2ac60f09`, e.g. `8a4fec87`.
- `01a10d0b-8adf-7487-b433-f6f84333ea65`, e.g. `ae598fc3`.

These are mechanism/result-contract failures, not malformed JSON supplied by the model: the recorded calls used the valid empty argument object. Follow-up inspection in the second session found an already-started conflicting integration. Thus a parsing failure did not imply that no side effect occurred. The Git conflicts themselves are ordinary application outcomes.

The second session's final report identifies parser correction `a4707cd3b60e7797b8146b37b410f68863c7f0cc`; Git confirms that commit bounded and normalized closeout evidence in `lib/plan-integration/closeout.ts` and added focused coverage. Both sessions later obtained `COMPLETED` from the canonical handoff: `dc0cceef` and `e17945a6`, respectively. No later occurrence of this exact handoff parse-error signature was found. Treat this as recovered historical work, not a new implementation request.

## Recommended order

1. Correct the still-unguarded analytics renderer crash path.
2. Diagnose the recent visible startup/readiness failures using their exact launch evidence, without assuming that the old ceiling gate or a particular model caused them.
3. Reduce codemode callable-set mistakes and package-cwd mistakes through the existing owning guidance, if the operator wants instruction changes. Do not broaden tool authority or add workflow gates.
4. Investigate the two `Target.autoAttachRelated` parameter errors if browser reliability is the next runtime priority.

No runtime or instruction remediation was implemented by this review. The report and its analysis-log entry are the only intended repository changes.
