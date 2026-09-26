# Advocate agent: investigation and discussion notes

Updated: 2026-09-26. This is a discussion handoff, not an implementation plan or active policy.

## Resume here

- Source Pi session: `01a0d92b-d1a3-7795-8434-41b7df61e304`, profile `default`.
- That session's cwd is `C:/Projects/Work/Gitlab/monorepo`. This note is deliberately in the dotfiles repository so discussion can continue in the owning checkout. Resuming the saved session may retain its original cwd; starting a dotfiles session and reading this note avoids assuming otherwise.
- Intended working repository: `~/.dotfiles` (`C:/Users/mglenn/.dotfiles` on this machine).
- Current subject: designing a distinct, on-demand Advocate that understands Mike's demonstrated design and workflow preferences.
- Overnight research extension authorized September 26: review the remaining history back to June 1 with weekly Team Leads. See the active research handoff below. Earlier weekly workers are closed; do not mistake retained processes for active assignments. No follow-up schedules were created here.
- Next useful discussion after this research: supported new findings, feedback-learning refinements, then the Advocate's concrete role and knowledge organization. Implementation is not authorized.

## Authorization and settled direction

Mike explicitly considers Advocate a recurring, distinct responsibility, not merely a new name for general advice. He authorized reviewing sessions referenced by the agent-process feedback logs, then expanded research to previously unread chats from the last three days. He authorized this notes file.

The research does **not** authorize creating the Advocate role, changing role routing, installing candidate principles as instructions, changing runtime behavior, committing, or pushing.

The intended distinctions are:

| Role | Question |
| --- | --- |
| Advocate | Which approach fits Mike's current intent and demonstrated design/workflow preferences? |
| Reviewer | What concrete defects exist? |
| Steward | Do applicable post-implementation findings justify more work? |

The proposed Advocate is advisory, not an approval gate. Current requests and applicable repository policy take precedence over inferred preferences. No mandatory consultation on every task has been agreed.

The user rejected the earlier tangent toward another universal "smallest possible change" rule. Do not revive it. Proportionality and scoped completeness are not minimum line count or minimum functionality.

## Overnight research extension: June 1–August 18

Mike authorized using the remaining night to review earlier weeks back to the beginning of June, seeking additional findings and refinements to agent-process feedback handling. This supersedes the earlier recommendation to pause broad retrieval, not the restrictions on implementation, commits, or pushes.

- Owning orchestrator: default `01a0dab8-4e9b-74fd-8a6c-adecd40df49c`.
- New interval: `[2026-06-01T00:00:00Z, 2026-08-18T19:16:41.417221Z)`, both profiles. Seven-day windows backward from the existing August 18 boundary, plus the final June 1–2 partial window. No overlap with completed later reviews.
- Shared inventory and indexed renderer complete: developer `fd98339d-49f2-42a5-9971-e8c56aef3fc8`, native session `01a0dc0b-115a-725a-8448-e75e499e1071`. Renderer reads/verifies only the requested page's records using metadata-only coordinates. Page counts unchanged, first/last week-1 pages compared byte-for-byte against the original. Invocation: `PYTHONIOENCODING=utf-8 python <temp-root>/renderer.py <week> --page <zero-based-page>`. Do not rerun inventory, partition, or index preparation. The initial explorer lacked execution/write tools and is closed. Inventory is not semantic review.
- Weeks 1–3 launched with separate Team Leads. Parent launches the next pending week as each Lead finishes, keeping roughly three weekly teams active rather than flooding the machine with all readers at once. Completed Leads must return synthesis and exact coverage; settled partial returns require resumption, not an assumption that they remain working.
- Temporary helpers/manifests: `C:/Users/mglenn/AppData/Local/Temp/advocate-historical-2026-06-01-2026-08-18/`. Captured 4,245 files / 5,125,136,680 bytes (corrected 1,000-byte addition error in the initial helper report) across both profiles. Default: 1,781 files, zero qualifying events. Legacy: 2,464 files, 598 event-active sessions, 597 visible sessions; 20,896 visible occurrences reduced to 19,681 canonical messages, removing 1,215 inherited duplicates. Twenty ambiguous-parent sessions retained. One invalid historical-backfill header excluded; no other reported parse, size, timestamp, source-change, or read errors. There are 1,110 rendered pages, not yet semantically reviewed.

| Week | Interval dates (19:16:41.417221Z boundaries unless noted) | Sessions | Messages | Pages | Review state |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | August 11–18 | 187 | 3,254 | 287 | Complete; findings below |
| 2 | August 4–11 | 16 | 343 | 26 | Complete; findings below |
| 3 | July 28–August 4 | 16 | 804 | 36 | Complete; findings below |
| 4 | July 21–28 | 63 | 2,673 | 129 | Complete; findings below |
| 5 | July 14–21 | 50 | 1,947 | 93 | Complete; findings below |
| 6 | July 7–14 | 74 | 2,381 | 99 | Complete; findings below |
| 7 | June 30–July 7 | 28 | 928 | 58 | Complete; findings below |
| 8 | June 23–30 | 42 | 1,813 | 93 | Complete; findings below |
| 9 | June 16–23 | 19 | 477 | 26 | Complete; findings below |
| 10 | June 9–16 | 40 | 1,356 | 77 | Launched: `caa89801-5644-4e14-949e-f9d76d32e744` |
| 11 | June 2–9 | 72 | 3,024 | 144 | Launched: `45656bc8-0c56-4f63-81f8-933cefc1b02d` |
| 12 | June 1 00:00Z–June 2 | 18 | 681 | 42 | Launched: `62243586-e12f-49fc-82ff-decb4f418473` |

Weekly session counts can overlap for sessions spanning boundaries; their sum is not the union's distinct-session count.
- Weekly Leads will own disjoint intervals and return consolidated evidence and coverage, including resumed sessions, deduplication, exclusions, clipped/unread ranges, exact native citations, and contextual limits. Current clarifications above historical precedent: cosmetic gates impose attention costs; genuine regression failures deserve investigation, not speculative feature growth; superseded assertions may be updated, but newly discovered conflicts require grounded judgment; Advocate asks when unsure and may challenge established preferences with new evidence.
- Parent integrates supported findings and feedback-learning design refinements here. Distinguish new insight, meaningful contrast/revision, and corroboration. Preserve uncertainty and unresolved questions for Mike rather than inventing preferences while he is away.
- Research is not authorization to activate Advocate, edit runtime policy or active skills, commit, or push. No new monitoring schedule is needed for ordinary research continuation; background results resume the parent while this Pi process remains running.

### Completed overnight review: August 11–18 (week 1)

All 287 pages, 187 sessions, 3,254 messages semantically reviewed; all readers closed. Clipped/uncertain ranges 7–35 and 47–71 were recovered, plus page 74. Other parallel outputs were reported complete rather than broadly reread. Final range union: 0–16, 17–35, 36–71, 72–107, 108–143, 144–179, 180–215, 216–251, 252–286. No unread selected pages. Team Lead native session `01a0dc10-f2ca-7043-9382-a37d7d14b852`, exchange `c259258d-b41e-47a5-a64a-8163da1da24c`. Shared inventory limits apply; pages 146–286 largely contained generated research, not additional direct testimony.

Parent-checked legacy evidence:

- **Understanding purpose can lead to deletion, not replacement:** `01a014f0-976d-7dc9-80cd-de23b163aa56` / `ac935bc6`, proposal `a446def5`, decision `4e7d5cd0`. Mike explained that a provenance rule addressed agents dismissing failures they had caused in earlier sessions, then chose to remove it rather than adopt another qualified replacement. Preserve both purpose and deletion decision; rediscovering the purpose does not justify reinstating rejected wording. Effectiveness after removal was not established.
- **Several working slices may be needed:** same session / `ecb094ed`, `88978882`, surrounding proposals `1fd04775`, `9102072f`. Mike rejected interpreting feasibility as exactly one smallest demonstration. Where no trustworthy working precedent exists, prove distinct critical uncertainties with working code before investing in the full architecture. This is not a universal experiment gate or a reason to repeat known evidence.
- **Consequential questions need conversation:** `01a00ffa-0f00-74a3-a900-ef6af18bc6ac` / `873eccc3`, response `014a619b`. A constrained selection interface obstructed discussion of certificate approaches and tradeoffs. This supports conversational uncertainty handling, not prohibition of concise choices once understood.
- **Reliability does not imply enterprise machinery:** `019ffc5f-95aa-7c5e-b549-72e2af59604b` / expanded proposal `40853422`, correction `a82e8d8b`, response `f90e0ea2`. A requested real restore exercise was followed by disproportionate hardening recommendations for a single-user service. Keep useful recovery and the evidenced limitations without converting them into a larger program. The drill itself was assistant-reported.
- **Durable tooling can reduce observed churn:** `01a00746-0cbb-71ec-acd2-75cd2e865c92` / `de648831`. Mike proposed consolidating repetitive pipeline queries into a helper. Lead additionally verified requests for a durable location and discoverability (`6ae7e9b5`, `579d670b`). Opposition to speculative machinery is not opposition to a tool justified by repeated work.

Lead-verified supporting contrasts: concrete calls/sequences/decision diagrams over persona navigation and empty technical prose (`01a00bb3-4bcb-738d-bb04-3692b263d9dc` / `532deeb7`, `476466c1`, `f2b7eb0d`, `383b2dd4`, `802c54f1`); correcting the actual prior-access baseline before evaluating DNS-cutover risk (`01a01195-b174-7ea6-b85f-c5591948d9bc` / `07518df9`, `640fd746`); rejecting cleanup risk for approximately $0.30/month savings (`01a00099-bdea-75c1-bb75-68d4b3d56870` / `0ba5cd54`). These explain contextual decisions, not general risk tolerance.

Feedback-learning refinement: follow the attempted remedy to its final correction, including explicit subtraction. Do not learn from proposal volume or generated research repetition. Verify semantic attribution as well as locator validity. This review corrected ordinal/message-ID confusion, duplicated approval attribution, and indirect quotations mistaken for direct testimony.

### Completed overnight review: August 4–11 (week 2)

All 26 pages, 16 sessions, and 343 canonical visible messages reviewed. Four disjoint readers covered pages 0–6, 7–13, 14–19, 20–25 with no reported clipping, render failures, or unread ranges; children closed. Shared inventory limitations above apply. Team Lead `f5b76268-c784-403d-b837-88f81eaf9b5e`, report exchange `d1ce0ca1-416f-4f23-aeb4-59ad8e1e51bd`.

Parent checked these native legacy records and adjacent context:

- **Phases need not become separate plans:** `019feccf-9a2e-77b0-9d92-fdeb04ee66b3` / `745f8d11`, preceding `fcef6009`. Mike preferred phases within one durable plan for the connected SeaweedFS/state and configuration work. Execution decomposition and artifact fragmentation are different choices. This does not prohibit independent plans or endorse the assistant's subsequently added gates.
- **Environment goals matter beyond cost:** same session / `86e7caef`, `88d15110`. Self-hosting belonged to the homelab goal; BWS deliberately combined secrets with site-specific configuration. Mike invited counterarguments. These are contextual precedents, not universal rejection of paid services or permission to place arbitrary state in BWS.
- **Durability without unrelated context:** `019ff192-037a-7934-ab53-5ccb67721edb` / `e99dd1f5`, `777ab677`. Rejected historical task-list accumulation while also wanting tracking to activate during larger work to survive compaction. Complementary goals, not contradictory preferences. The large architecture in the assistant's subsequent research response was not operator-approved by these messages.
- **Remove the cause, not merely test around it:** `019fec54-cdad-7a3f-9535-0a32d291b3f3` / `56439c7a`, response `8b58a355`. Redirected a OneDrive/profile-path repair toward removing the unnecessary cross-file deployment dependency. "Create a design that cannot fail" concerns eliminating this failure mode, not a general rejection of regression tests or proof of infallibility.
- **Concision protects interpretation:** `019fec86-19c6-700d-9922-8eaad8e42199` / `afd7be8c`, `871c7eeb`, `0fecb26f`. Challenged backups for first-time provisioning, then stressed that extra wording creates opportunities for strange interpretations and requested cleanup of existing rules, not just another addition. Assistant policy-cleanup claims are not proof of effectiveness. Preserve meaningful-state protection rather than generalizing the incident into anti-backup advice.
- **Accepted challenge and deliberate sequencing reversal:** `019fec99-7e5f-72c7-9169-94d56e13c9a3` / proposal `99706c32`, approval `4806cf8a`. Accepted using the existing image mirror and changing merge order instead of adding another registry transfer. Concrete evidence changed the chosen approach; no standing merge authority follows.

Team Lead checked additional refinements: planned discovery need not become a prerequisite blocking plan launch (`019feccf-9a2e-77b0-9d92-fdeb04ee66b3` / `7e487416`, assistant `34fdf7a1`); deployment completion in one repository explicitly included Kubernetes services/deployments (`019fec99-7e5f-72c7-9169-94d56e13c9a3` / `ff78ecd9`). The detailed ensuing checklist was assistant-authored. Two reviewer claims of operator acceptance were corrected because their cited messages were assistant completion reports.

Learning refinement: preserve paired evidence. Excess tracking context and insufficient durability can both be defects; test resistance can target an avoidable dependency rather than testing itself; rejecting pointless backups does not reject state protection. Read the proposed remedy and later correction before changing the heuristic. This small week adds contextual precedents and reasons, not new core instructions or a general evaluation framework.

### Completed overnight review: July 28–August 4 (week 3)

All 36 pages, 16 sessions, and 804 selected visible messages reviewed in six contiguous six-page assignments. No unresolved clipping or unread ranges. One reader report was recovered from its native session; one automatic-standard citation query exhausted memory and succeeded with an explicitly large filtered retry. Team Lead `913c6b7a-3c65-434e-b469-e89f2b94936d`, report exchange `3ff5b18b-d4c7-4191-969c-84745320d9f9`; all children closed. Shared inventory limitations apply.

Parent-checked legacy anchors and surrounding context:

- **Validation must preserve ongoing usability:** `019fc38e-acbc-7f3d-a479-493270fcdf70` / `4131a85e`, `cd274773`, `af8c32ca`, `cca719e8`. Deleting an ephemeral account proved a login mechanism but left developers without reusable testing access. Mike corrected that outcome and asked about future deployment maintenance. Persistent live state and automatically reconciled state were distinct; reconciliation was not yet established. Not a universal preference for permanent test accounts.
- **Authorization changes are action-specific:** `019fbe64-7821-7e7b-bf29-fe9f0b57e55f` / `cdd41405`, `ad4aa085`. Deferring commits/pushes did not cancel independently requested deployment observation. Do not interpret a narrowed mutation boundary as abandonment of the rest of the task.
- **Intentional temporary structure can remain:** `019fc38e-acbc-7f3d-a479-493270fcdf70` / `67803f28`, preceding proposal `1feee276`. Mike preserved divergent deployment branches while proving the system, requested configurable customer domains, and required continued dev/staging login validation. The assistant's proposed portability work had expanded into a blocker. Improve the requested capability within the accepted phase rather than treating every temporary difference as a defect requiring immediate redesign.
- **Rollback needs a useful destination:** `019fbe64-7821-7e7b-bf29-fe9f0b57e55f` / `2bba0684`, response `7a01a6b0`. Testing environments had no working prior version to restore. Mike selected forward repair; the response retained evidence and predecessor objects. Contextual corroboration of fix-forward, not general permission to discard recovery or protections.

Lead-verified refinements: scheduler state is not task progress, and blanket turn-ending rules were later narrowed (`019fbe64-7821-7e7b-bf29-fe9f0b57e55f` / `f0c5cb81`, `58db665a`; `019fc2d6-3b08-7859-ada9-48f6de7e3395` / `a91233c8`, `dc8c26b8`). Existing direct-merge authority was misapplied as an MR prerequisite (first session / `af69a3a7`, `f7c7c979`). A local packaging failure was prematurely called pre-existing before causality was established (`019faed4-9ac7-7ab5-85e1-7e1d226cc277` / `68a13a4c`, assistant `bdca9757`). These historical mechanics do not replace current scheduling, Git, or regression instructions.

Feedback-learning refinement: preserve the operational chain. An initial repair can expose a masked defect; runtime availability can change what validation is possible; healthy components can coexist with broken login; a successful probe can still leave the deliverable unusable. Neither collapsing everything into one failure nor recording the first success captures the intended outcome. Later staffing direction supersedes this week's historical requests for model hints in plans.

### Completed overnight review: July 21–28 (week 4)

All 129 pages, 63 sessions, 2,673 messages semantically reviewed in ranges 0–32, 33–64, 65–96, 97–128; readers closed. Two continuation fragments accounted for. Failed shell invocations were recovered and no unread/clipped output remained. One large manifest read exceeded tool output limits; compact metadata recovered without reinventory. One standard citation query exhausted memory; explicitly large retry succeeded. Team Lead `f1fc2278-4724-4ac3-83f0-b8019ddcb925`, exchange `02ca482d-6f4e-48fa-a7af-377e12bef1a9`. Shared inventory limits apply.

Parent-checked legacy evidence:

- **Protect the invariant, not a proxy:** `019f91ec-124a-744e-a6e9-8b620e111ea7` / `85afd1d6`, proposal `5c6d0e4e`, acceptance `503b0e72`. Removed a read-before-edit ledger that accepted partial reads, rejected equivalent inspection, and forced rereads, while retaining applicable instruction delivery before mutation. "We can try that" establishes trial acceptance, not measured effectiveness or opposition to all enforcement.
- **Capability visibility can matter more than reducing activation:** `019f99c2-01ee-7e16-90c3-a8930c4ec826` / `292ff5ff`, proposal `5d20353f`, acceptance `09600f7d`. Mike prioritized avoiding hidden capabilities over preventing harmless extra activation. Do not optimize context size by making useful capabilities undiscoverable. The historical design and telemetry proposals do not override today's tool authority or authorize rebuilding them.
- **Low criticality is not disposable data:** `019f86a9-21a3-7c47-a358-c4e7c3c998a9` / proposal `62b039f8`, approval `047cd4f6`, response `74b84673`. "You can do 4" authorized only a Menos-specific single-user treatment retaining a verified backup and direct smoke test while dropping unrequested ceremony. It did not approve adjacent compaction caps, review restrictions, or runtime changes.
- **Intent needs a knowledge home distinct from tests:** `019f96a6-fe8d-7bcb-a06c-a4e14692a8c1` / `2703ab76`, adjacent `875b6734`, `9af11512`. Mike explicitly retained tests of code functionality while rejecting tests whose purpose was enforcing policy preferences. The latest clarification about investigating regressions and superseded assertions gives the current practical boundary; this is not exemption of executable safety behavior from testing.
- **Review may own artifact completion:** `019fa1b7-4288-70c2-8657-f4c23e5cf62c` / `54b6d94c`. Expected the plan-review workflow to leave an improved plan, not merely findings requiring another bookkeeping round. This is a workflow-specific precedent supporting writable feedback maintenance, not blanket reviewer mutation authority.

Lead-verified corroboration: simplify governing instructions instead of adding safety tiers (`019f8f2e-752e-7086-81bb-2cfedcb29261` / `96ecdacf`; `019f95ab-67d5-70a8-a966-2701b678a1c9` / `641f7ea8`, `53cb9599`); positive acceptance of cancellable commit work (`019f9acd-35ef-7709-936d-4a7ecedac505` / `125060ed`); later direct working-behavior observation in that session (`0ee8b518`). Missing live activation should be reported as incomplete, not used to infer permission to deploy.

Feedback-learning refinement: preserve the exact scope of short approvals and distinguish purpose from enforcement proxy. A correct diagnosis may still produce a rejected remedy. Historical acceptance of a trial, praise of discussion, and a later observation that something works are different kinds of evidence, not interchangeable success claims.

### Completed overnight review: July 14–21 (week 5)

All 93 pages, 50 sessions, 1,947 messages reviewed in ranges 0–30, 31–61, 62–92. Combined-output clipping on 16–30 recovered individually; no unread ranges. Children closed. One standard citation query exhausted memory; explicitly large filtered retry succeeded. Team Lead `99a2690f-c757-46d6-b0aa-95941ceebb43`, exchange `d8e865a1-241b-408e-94ff-4f2c6d290755`. Shared inventory limitations apply.

Parent-checked legacy evidence:

- **Ownership can differ by layer:** `019f6801-30a9-76e8-94ec-34be13d335e2` / `43a18942`, `4b0aec4e`, responses `445401a4`, `6445fd01`. User-maintained folders should not be continuously reconciled, but administrative groups still needed managed state because owners could not maintain them through Teams. Avoid turning one layer's exception into an all-or-nothing architecture.
- **Decisive preflight and parallel routine checks can coexist:** `019f7832-da3e-79c6-aeb0-351adbb38528` / `fa19dbb3`, admission `9c5a9b5c`, later `548fd6f2`, response `59f4c9ee`. Repeated import failures exposed skipped disposable-current-schema validation. Once executable preflight reportedly passed, Mike directed starting the import while syntax validation ran. Lead checked approval `50d4cfad`; later storage exhaustion remained a separate failure, so preflight was not proof of completion or full environment adequacy.
- **Time first, then tokens:** `019f6bb0-60d0-7d78-87ae-c4d879d1e34a` / `f9425a9b`, response `689db39d`. Repeated syntax-error-prone ad hoc scripts can justify a maintained deterministic helper while judgment stays flexible. Useful automation is not the same as policy ceremony.
- **Recorded acceptance is not necessarily informed acceptance:** `019f80d4-fb78-7090-899a-cf67b85e80f0` / `91b04eca`, `4048ccf6`, assistant `a69026f2`. Mike said the plan's alleged accepted symlink/glob risk was new to him; the assistant later acknowledged scope expansion and reframing his objection. Do not repeat the assistant's "accepted risk" label as proof of operator understanding or approval.

Lead-checked corroboration: explicit praise of deletion-first instruction cleanup scoped to the proposed items (`019f803c-86f5-7466-8b72-f6d8744d6270` / `943c7184`); long-running work was acceptable while on target (`019f7c2a-6d7a-79f0-8736-0072c6f09ff9` / `22677ca8`); cosmetic assertions could be removed while runtime formatting remained (`019f65e9-cc63-7a01-9e99-2cfa939b6b41` / `7e713837`, `81eff6d2`). No standing numerical time/turn limit or anti-formatting rule follows.

Learning refinement: identify the actual layer being managed, tested, or migrated before inferring a contradiction. Preserve subsequent sequencing corrections and direct operator statements over plan labels or assistant self-justification. Instruction-cleanup approval establishes the selected approach, not its eventual effectiveness.

### Completed overnight review: July 7–14 (week 6)

All 99 pages, 74 sessions, 2,381 messages reviewed individually across 0–24, 25–49, 50–74, 75–98. No reported clipping, renderer errors, or unread ranges; children closed. One exact-session standard query selected about 62.9 MB but exhausted memory; explicitly large retry succeeded. Team Lead `e25deca5-a41b-4b35-bc04-bdf7a8d9f8fc`, exchange `0c2a0565-1dd8-4248-b37a-26fb200c552e`. Shared inventory limitations apply.

Parent-checked legacy evidence:

- **Exploration and engineered delivery are legitimate different goals:** `019f4a5d-bf8b-7511-882f-7d8c4dc6a783` / `38e71273`, proposal `adf29961`, qualified acceptance `553deb76`. Sometimes imperfect working code should establish feasibility before architecture; sometimes upfront design is the goal. Mike also wanted evidence of improvement rather than an opaque, reactionary workflow system. Historical command-mode mappings were provisional, not current policy. This does not create a mandatory experiment program for every learning update.
- **Completeness may require broad conversion:** `019f3e4c-3a0a-7a4f-a6d8-2f7c28f5b14e` / `6f198aa0`, `64ffe5ca`, surrounding `c826b700`, `13c86d0c`. Mike rejected stopping at Hermes when the desired change covered all services, then required fresh-user setups rather than assuming existing-host connectivity proved bootstrap correctness. "Smallest safe fix" had narrowed the outcome, not merely its implementation.
- **Visible recovery can override delegation efficiency locally:** `019f488f-0fb5-797d-b609-a74517e773d7` / `05cb4afd`. Requested direct execution "for now" during DNS recovery so he could observe the work. Lead verified later correction of an unsupported mandatory-delegation claim (`5f2c9261`, `eb3548b4`). This is a contextual trust/visibility need, not general opposition to subagents.
- **A promise is not enforcement:** `019f4f5b-6e98-7548-a01e-28f732185291` / `d872ad5e`, proposal `23fba795`, approval `72fecae8`. After costly repeated failures, Mike rejected an unenforced promise never to repeat them and authorized mechanical prevention. Concrete counterexample to treating all controls as unwanted ceremony. Effectiveness and universal validity of the proposed numerical limits were not established.

Lead-checked contrasts: existing dedicated service users can satisfy a common security purpose without uniform account names (`019f4754-ca1f-7f59-90fd-52089d71ef56` / `8a396043`, `8dcdfef3`, `8d62f5de`); desired-state membership versus explicitly exempt one-time mailbox transfer (`019f3f59-1658-70ca-a29e-79e4e5212eed` / `8bc51889`; `019f3f59-436f-7b2f-99a9-17160fc02b1a` / `1515565c`); fewer operator flags can coexist with useful internal tooling (`019f43d8-7872-73c5-ba82-82c8bccc390d` / `ba3923d6`, `a17e77ad`, `ca3bfb5a`).

Learning refinement: preserve purpose and phase, and separate interface burden from internal capability. Protecting data does not authorize publishing its backup. Approval, reported recovery, actual user-path acceptance, and sustained effectiveness are distinct. The Lead withdrew false acceptance claims based on assistant-authored statements and corrected a supposed retry-resolution anchor that actually reported push failure.

### Completed overnight review: June 30–July 7 (week 7)

All 58 pages, 28 sessions, 928 messages reviewed across 0–28 and 29–57; both readers closed. A combined output clipped page 31, recovered individually. No unread ranges. Substantial generated/pasted conversation on 7–17 was not independent operator testimony. Coordinator recovered an oversized manifest read and an incorrect source-path lookup; one child-answer control misuse did not affect final coverage. Team Lead `1fffdd31-4d7a-42fa-9de9-0c11fae2e52f`, exchange `4556bee5-3f14-4552-8ac0-a131e9fa80cf`. Shared inventory limitations apply.

Parent-checked legacy evidence:

- **Workflow-native interface can justify more implementation:** `019f3dbc-ac03-70ae-a497-235fab697f3f` / `258905d2`, proposal `dab3f324`, selection `85717471`. Chose a native model-refresh command over a Just target or prompt-only command, preserving a scriptable helper. Simplicity is user-workflow fit, not fewest lines. Design approval does not establish runtime effectiveness.
- **Report-first can change after explained consequences:** `019f1a2e-3e62-76a5-bd64-4ef729e0095d` / explanation `2b1cc79b`, approval `0b8becb8`. After concrete differentiation of reporting versus targeted CUI-sharing blocking, Mike explicitly authorized both. Lead checked earlier low-friction intent (`6fca443a`). Preserve the informed revision; neither permanent report-only preference nor standing enforcement authority follows.
- **Acknowledgment is not correction:** `019f24b8-1835-7222-9122-cd79f8920691` / request `88285029`, correction `66c9428f`, response `82b65afa`, escalation `ee1054b4`, response `17b28439`. Requested group membership was repeatedly replaced with a file path or an offer to provide it, even after apology. Learning must inspect whether the remedy changed behavior, not treat acknowledgment as completion. Concision does not override an explicit request to show information.
- **Rejected architecture does not end all problem-solving:** `019f1a54-208e-745e-99f2-029e0df9cc80` / `e76bd715`, `16e3694f`. Mike rejected browser access as a substitute for a settled laptop-per-tenant approach while still seeking controls and an accurate explanation of consequences. A reader's broader "stop solution generation" inference was withdrawn. The lesson is to answer remaining questions within settled constraints, not abandon assistance or preserve historical technical claims as universal facts.

Lead-checked corroboration: policy names and clean plans did not substitute for understanding effects (`019f1a2e-3e62-76a5-bd64-4ef729e0095d` / `c55e4446`, `93677499`, `48bfe2e6`); direct live deletion and unrelated Git cleanup could desynchronize managed and live state (`019f13cf-a7fb-756c-a714-399d042027e8` / `474de06b`; `019f24b8-1835-7222-9122-cd79f8920691` / `95e7a7b3`); intentionally deferred moving a misplaced script while another person used it (`019f39ad-3b21-7bbb-8e43-8109f6f3afb5` / `5a38d5f1`).

Learning refinement: preserve informed changes of intent, distinguish rejected alternatives from still-requested assistance, and check the actual response after feedback. Artifact existence, apparent cleanliness, semantic equivalence, and operator acceptance are not interchangeable. Imperfect placement may have a practical reason worth retaining.

### Completed overnight review: June 23–30 (week 8)

All 93 pages, 42 sessions, 1,813 messages reviewed across 0–30, 31–61, 62–92; no unread pages or renderer errors. Parent resumed a settled partial handoff to collect the remaining reader/citation results; no certain-complete ranges reread. Children closed. Oversized manifest output recovered via compact metadata; one misattributed directory-layout citation replaced with the actual command-simplification request. Team Lead native `01a0dc24-93f3-70f7-b1ed-e342481059d7`, final exchange `8693d9b8-f464-4282-b3e8-e965d4ddfd66`. Shared inventory limitations apply.

Parent-checked legacy evidence:

- **Handoffs must preserve completion scope:** `019f05e1-aed9-716f-a6fa-17278d0db4c4` / request `4aa412e1`, generated prompt `3f0561f3`; execution `019f05eb-46af-7f5c-bd8b-495bba9a0be9` / explanation `5b604546`, correction `92a54fb1`. A request to work through a 93-item checklist became "make measurable progress" with weaker completion criteria; execution stopped after a slice. Inspect parent-authored scope transmission before blaming worker capability or effort. Generated goals are evidence of transmission, not independent operator intent.
- **Build authority differs from run authority:** `019efb57-9eb7-77fa-9654-fa6ca30cfbc6` / `7b0772d1`, `76d3f7e4`, responses `aa88c030`, `5d4eace0`. Requested mutation capability should be implemented even though executing a live change requires approval. Do not convert execution safeguards into missing functionality or treat capability approval as permission to run it.
- **Validate the actual operator path:** `019f0edb-f39a-7349-af5e-bb07d7f2f344` / `5203bde1`, response `6e11d06b`, direction `25af7d3e`. Manual file removal and one-off scripts did not demonstrate that the intended plan/apply workflow worked. The failed saved-plan apply was not successful mutation; later success remained assistant-reported.
- **Use owning-platform authority:** `019efcad-8ae9-758f-86f9-17c940cf6cb7` / `816c537c`, response `25009308`. Similarity between VS Code and Pi did not make VS Code documentation authoritative for Pi extensions. The general lesson is source ownership, not preservation of potentially outdated API advice from the assistant's response.

Lead-checked contrasts: Mike explicitly preferred IaC over UI-heavy DNS management (`019f0534-ed11-768e-8292-ae3e374a7e66` / `d0126206`, `5a9d8d03`), so low ceremony need not mean manual configuration. Tracked-export default changes were initially excluded, then separately approved (`019f00b0-3f8d-7628-b5b1-29e945c313fb` / `576d018a`, `1d962fe9`, `2a1b3999`); later approval does not retroactively authorize the original must-fix framing. Completeness questions require direct remaining-work disclosure (`019efc29-593e-7656-a7cd-e4e63dc99b92` / `2307cd76`, `d9c0ffca`, `254475e6`).

Learning refinement: trace request, generated assignment, execution, correction, and resolution as separate authored steps. Changes in knowledge may be about better transmission or distinguishing build/run authority rather than adding a new preference. Recheck disputed environmental premises instead of defending the original classification.

### Completed overnight review: June 16–23 (week 9)

All 26 pages, 19 sessions, 477 messages reviewed across 0–5, 6–10, 11–15, 16–20, 21–25. Wrong-directory invocations recovered; no unread or clipped ranges. Five readers closed. Parent resumed a settled partial handoff to obtain final targeted verification and synthesis without rereading. Team Lead native `01a0dc25-4630-751a-85af-6348ee23d029`, final exchange `04e186ce-2040-43b1-964b-146c59cbe815`. Shared inventory limitations apply.

Parent-checked legacy evidence:

- **Existing recovery can be sufficient:** `019edc1f-c65b-7089-9ad3-d36f933889a6` / `8433e836`, preceding `42c2faeb`. Mike accepted exports overwriting specified tracked files because Git could restore them. Not authorization to overwrite uncommitted or irreplaceable work.
- **Consequential actions can have simple controls:** same session / `f0815c4e`, preceding `ac7f30f3`. Chose separate policy/assignment scripts and understandable action-specific deletion flags over layered safety flags. The problem was confusing ceremony, not every safeguard. Historical flag names and exact semantics are not universal current policy.
- **Initial authority and later procedural correction differ:** `019ecc94-5e6c-7338-99e4-ce633eaff59f` / `000866b3`, report `12b38215`, correction `bee2f91d`. Deletion had been requested. Mike subsequently required seeing the resolved change plan and being asked before destructive/hard-to-restore tenant changes. Do not invent unwanted deletion or actual harm to explain the feedback. Preserve this repository-specific consequence/approval distinction rather than generalizing it to routine edits.
- **Migration can deliberately preserve live behavior:** `019ed655-2181-74af-80b7-a6600fe53bd9` / `434045c6`, response `fcf6be99`. Conversion to managed configuration was to capture the live tenant, not apply legacy assumptions. A changed plan indicated a conversion problem, not desired drift correction. This does not establish that brownfield state always defines desired behavior.
- **Concrete durable-data loss can justify stronger retention:** `019ef52d-59f9-7e0f-b904-455a364da252` / `07f11acd`, preceding `da3946b7`, report `84b95f27`. Mike explicitly selected no MR-diff expiration and two-year backups after an expiration-related loss diagnosis. Terraform changes were reported, but no apply or restore was established. Neither the duration nor no-expiration treatment becomes a generic preference.

Lead/second-reader checked contrasts: preserving deployed behavior need not preserve obsolete wrappers indefinitely once replacement coverage is complete (`019ed89d-4d93-744c-b934-1773087ebed0` / `e6b21847`, `247dcaef`, `63076333`, `36bdcf11`, `cd05b017`); a client-facing SBOM should fit its audience (`019edafd-c967-731d-82f4-15000375693b` / supplied feedback `838d7270`, approval `eb925fef`); lower lint-warning counts partly caused by threshold changes did not prove improved readability (`019edbb6-fdac-7761-80cd-e6c970b01626` / `6c5d58fc`, `b8f0d77f`).

Learning refinement: retain initial authorization when recording later corrections; avoid inventing a harmful outcome. Supplied colleague feedback is not independently Mike-authored evidence, though his response can endorse an approach. Conversion, convergence, removal of obsolete surfaces, and operational effectiveness are distinct outcomes. This review corrected role, cross-session, approval-adjacency, ordinal, and Git-hash citation errors.

## How the discussion reached this point

The original problem was recurring scope expansion: investigation findings and reviewer recommendations became new safeguards, infrastructure, tests, prerequisites, or completion conditions without an agreed need.

A whole-system review found substantial existing guidance against this behavior. The recurring problem is not simply an absent anti-overengineering rule. A particularly important failure point is the parent converting a suggestion into an implementation assignment, for example "address these findings," before determining which findings represent actual in-scope defects.

Mike noted that developers are often Luna-class models with strong implementation skills. Giving those workers unresolved product, scope, safeguard, and acceptance judgments can turn every suggestion into something to build. Historical evidence establishes assignment breadth and parent framing problems; it does not prove that Luna itself is the cause.

The proposed boundary was:

- The orchestrator or Team Lead evaluates findings and resolves consequential scope/behavior decisions before dispatch.
- The developer chooses routine implementation details and fixes demonstrated defects within the assigned behavior.
- A newly discovered choice changing scope, behavior, safeguards, or acceptance returns to the parent with concrete evidence.
- This must not become approval-seeking for every technical detail.

Advocate arose as a way to improve the parent's judgment at that boundary without loading every request with a large preference history.

## Completed instruction-composition work

Mike separately approved a concise source map of how Pi instructions reach a model. A writer added:

- [Pi instruction composition](../../pi/profiles/default/skills/pi-extension/references/instruction-composition.md)
- Discovery links from [prompting](../../pi/profiles/default/skills/prompting/SKILL.md) and [pi-extension](../../pi/profiles/default/skills/pi-extension/SKILL.md).

The reference covers native prompts, tool schemas/guidelines, context discovery, skills, generated delegation guidance, role prompts, child inheritance, commands, compaction, helper model calls, disk versus loaded resources, and provider serialization. Parent review corrected the compaction wording. Relative links and whitespace checks passed. No commit or reload was performed by this task.

Important findings from that review:

- A skill catalog is not the same as a loaded skill body.
- Children receive applicable context files and role/authority framing, not the parent's full conversation or all previously loaded skills.
- Assignments must therefore carry relevant settled decisions.
- Files on disk do not establish which resources an existing process has loaded.
- Stored prompt sections may omit extension-forced prompt text. Source reconstruction is not a captured provider request.
- Commit helpers, Damage Control, compaction, and child agents have distinct model-call compositions.
- Several historical defects already had source-level fixes. Do not use their old incidents as proof that the same defect remains active.

Do not preserve the reviewed session's prompt sizes, tool counts, model choice, or installed package hash as durable policy. Recheck current owning sources when needed.

## Two related proposals that remain unimplemented

### Refine the existing planning review

Location: `pi/profiles/default/skills/planning/SKILL.md`, the existing plan review step.

Proposed change: examine newly added tasks, dependencies, safeguards, and completion conditions, not only behavior-changing restrictions. For a safeguard, examine both the specific failure it prevents and the blocking conditions, dependencies, and maintenance burden it creates. Prefer existing mechanisms where they satisfy the actual need.

This would refine an existing review, not create another review stage, justification ledger, risk score, or approval framework. Routine implementation choices remain agent-owned. No edit has been approved or made for this proposal.

### Resolve findings before delegation

Location: shared caller and Team Lead guidance in `pi/profiles/default/lib/subagents/guidance.ts`.

Proposed direction:

> Assess findings before assigning implementation. Give developers resolved, bounded corrections rather than asking them to decide which recommendations should become requirements. Keep behavior, scope, safeguard, and acceptance decisions with the parent; leave routine implementation judgment with the developer.

Assignments should carry relevant outcomes, settled decisions, exclusions, and completion checks without repeating all global/repository instructions. Follow-up messages need the same boundary as initial dispatch. This is not a new required assignment schema. No edit has been approved or made.

## Research coverage and limitations

### Initial targeted review

Three Sol reviewers investigated feedback-log leads:

1. Successful plans versus gateway churn, initially seeded by AIF-013/014.
2. Proportionality and safeguards, seeded by AIF-024/031/041/045/050/054.
3. Intent, environment, and handoffs, seeded by AIF-083/085/092 and APR-072.

The first positive-design worker exceeded context before returning findings. A fresh worker completed a narrower recovery and located the original discussion in `01a07e8e-72fd-708c-b38f-2b05bff28bbc`.

Mike's original statement said most recent plans worked as expected and identified `web-fetch-gateway` as the churn exception. It did not individually endorse Bedrock, model-catalog, browser/image, analytics, Onclave, or loader-repair designs. Those names came from later assistant analysis. Do not label those projects as Mike-approved successes without stronger source evidence.

### Expanded three-day review

Frozen event-time interval:

`[2026-09-22T19:16:41.417221+00:00, 2026-09-25T19:16:41.417221+00:00)`

This was a rolling 72-hour window, not three midnight-to-midnight dates. Older sessions with activity inside it were included.

- Both default and legacy histories were inventoried.
- Native SQL inventory output was truncated; a streaming, read-only JSONL pass completed the metadata inventory rather than repeatedly staging the full corpus.
- Streaming pass examined 4,112 files, about 5.02 GB.
- 478 files had events in the window, all in default.
- 365 had explicit child lineage. Their assignments/results were not treated as independent Mike-authored preferences; they were available for targeted follow-up, not exhaustively semantically reviewed.
- 113 remaining files were orchestrator or unclassified sessions. Eleven had no unread visible text after selection.
- Deduplication used message ID, timestamp, role, and visible-text hash. Inherited copies were not counted as independent corroboration.
- Messages already represented in the current conversation were removed. Previously cited UserSearch and sandbox records were also excluded while retaining unread portions of partly sampled sessions.
- Six disjoint batches covered 102 files and 2,788 visible user/assistant messages. Every reviewer reported reading every assigned page.

| Batch | Sessions | Messages | Rendered pages |
| --- | ---: | ---: | --- |
| 1 | 17 | 424 | 0–12 |
| 2 | 17 | 436 | 0–12 |
| 3 | 17 | 483 | 0–13 |
| 4 | 17 | 600 | 0–13 |
| 5 | 17 | 407 | 0–12 |
| 6 | 17 | 438 | 0–12 |
| Total | 102 | 2,788 | 80 pages |

Limits:

- This is coverage of selected visible conversation text, not semantic review of every tool result, child transcript, attachment, or private helper call.
- Automated reminders, generated handoffs, Onclave messages, assistant summaries, and child reports were distinguished from direct operator testimony.
- Passing tests, merges, silence, and assistant declarations of success were not treated as satisfaction.
- One legacy historical backfill had an invalid native session header and was excluded. No malformed body records or missing timestamps were found in the streaming pass.
- Source files were live, not an immutable snapshot. Selection used the fixed event-time window and per-file byte horizons.
- Several reviewer citations were imprecise or attributed adjacent assistant wording to the operator. Parent checks corrected selected evidence used in the synthesis. Recheck exact sources before turning other report details into durable guidance.
- Workers encountered Windows output encoding failures and reran affected pages with UTF-8. They reported no unread ranges afterward.

Temporary metadata manifests and the read-only renderer are at `C:/Users/mglenn/AppData/Local/Temp/advocate-review-72h-kt7a6p4q/`. They contain offsets and coverage metadata, not a copied transcript corpus, and are optional recovery aids. Do not make durable knowledge depend on their survival. Full worker reports are in the source session above.

### Historical week: September 15–22

Frozen interval: `[2026-09-15T19:16:41.417221Z, 2026-09-22T19:16:41.417221Z)`.

- Both profiles and 4,142 files were inventoried. Qualifying visible text was in default only; one legacy historical-backfill header was invalid.
- After message deduplication and explicit-child exclusion, eight disjoint review batches semantically reviewed 158 sessions and 2,964 visible messages across all 93 rendered pages.
- No malformed bodies, oversized records, missing timestamps, read failures, source changes, or unread rendered ranges were reported.
- Review was complete for selected visible orchestrator/operator conversation text, not tools, thinking, attachments, private helper calls, or every child transcript.
- Parent spot-checks confirmed the promoted findings about proportionate experiments, production research, complete disclosure, real prerequisites, convention alignment, staffing boundaries, knowledge discovery, and mechanism tests.
- Temporary metadata and renderer: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-week-gr9f7h2d/`.

Strong additions:

- A short, representative disposable experiment can be the proportionate answer when it resolves a concrete uncertainty before an expensive operation. Do not turn its assistant-proposed staging into a general preference for gates.
- Opposition to speculative safeguards does not imply tolerance for repeated production retries without checking current authoritative guidance.
- A recommendation may be bounded, but the explanation should not hide other material known concerns. Disclosure does not authorize implementing all of them.
- A conservative or preferred sequence is not automatically a technical prerequisite.
- Equivalent cross-repository structures can improve developer discoverability without requiring structural identity.
- Plans should expose complexity and useful split points. Strategist, not the plan, chooses model, effort, or Team Lead staffing.
- Knowledge discovery should use small entry points, authoritative owners, and meaningful links rather than enlarging `AGENTS.md` into a knowledge store.
- A mechanism probe proves the mechanism, not actual workflow occurrence, cause, or improvement.

### Historical week: September 8–15

Frozen interval: `[2026-09-08T19:16:41.417221Z, 2026-09-15T19:16:41.417221Z)`.

- Both profiles and 4,142 files were inventoried. Qualifying records were in default only; one legacy historical-backfill header was invalid.
- Event-time selection found 667 active sessions. Deduplication and visible-text filtering produced 4,767 messages; explicit-child and prior-note exclusions left 4,739 previously unreviewed messages for evidence review.
- Six batches semantically reviewed all 228 rendered pages. A final metadata audit confirmed 228 successful, untruncated outputs with no gaps.
- Historical lineage markers were absent for many records, so unresolved sessions were retained conservatively and generated content was not treated automatically as operator testimony.
- No malformed bodies, oversized records, or missing non-header timestamps were found. Initial citation errors were corrected before promotion. Parent spot-checks confirmed the eight promoted source claims.
- Temporary metadata and renderer: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-7d-2026-09-08/`.

Strong additions:

- Completeness and proportional scope are simultaneous requirements. Preserve the functional outcome without turning validation into a larger certification program.
- Low ceremony does not mean the fewest possible options. Independent behavior dimensions may justify explicit choices without justifying process machinery.
- Evidence that something is feasible or available is not authorization to use that source as an implementation dependency or owner.
- Positive acceptance is specific to what was tested. It does not endorse adjacent UI or an entire design.
- Validation order should reflect runtime availability and the actual environment. Neither live acceptance nor experiments are universal prerequisites.
- Environment-specific controls can be appropriate without becoming unsolicited blockers.
- Planning should resolve consequential intent and then leave routine implementation flexibility to the executor.

### Historical week: September 1–8

Frozen interval: `[2026-09-01T19:16:41.417221Z, 2026-09-08T19:16:41.417221Z)`.

- Both profiles were inventoried: 4,182 files, approximately 5.06 GB, and 525 event-active sessions. Deduplication reduced 6,549 visible-message occurrences to 5,763 canonical messages: 1,397 default and 4,366 legacy.
- Six disjoint reviewers covered 519 sessions and all 363 rendered pages. Five older legacy sessions resumed within the interval were included.
- An inventory mistake initially treated native `parentSession` as explicit child lineage. It was corrected before semantic review, restoring 1,553 canonical messages from ambiguous fork/branch sessions. Generated traffic was distinguished semantically from operator testimony.
- Coverage audit verified batch union, timestamp bounds, frozen hashes, deduplication, and page rendering. Clipped outputs were recovered; reviewers reported no unread ranges. The auditor verified recovery receipts but did not byte-match old presentation output against the LF-corrected renderer.
- One invalid legacy historical-backfill header was excluded. No malformed bodies, oversized records, timestamp gaps, or source changes were reported in readable input. Semantic coverage remains visible conversation, not every tool result, attachment, thinking block, or child transcript. Previously sampled anchors were retained as context rather than counted as independent new evidence.
- Team Lead report: default `01a0db37-090e-7249-b42c-025433366b3d`; coverage audit: `01a0db3a-b29b-7401-858e-0d86874a5ebe`; synthesis check: `01a0db5c-0089-7276-b838-81a827141609`.
- Temporary metadata/helpers: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-week-2026-09-01-gr9f7h2d/`. No copied transcript corpus or rendered-page files were created by reviewers.

Parent-checked precedents:

| Subject | Profile, session / record | Evidence and limit |
| --- | --- | --- |
| Positive batched-workflow feedback | legacy `01a06f6c-10de-77ff-999c-35d33d08b556` / `7c0021a7`, `fe30af4f`, `2441a0be` | Mike clarified that deferred validation must still allow fixes, approved a workflow with bounded repair and reassessment, and praised its execution. The praised run needed no repair, so it does not demonstrate effectiveness of the numerical repair allowance. The historical instruction-change approval does not make that allowance current policy. |
| Quiet end-to-end delegation | default `01a0744a-e4df-74f1-bb62-07bade758415` / `e79d3fa3`, `14f08728`; proposal `04268f12` | Approved delegating the full commit operation, keeping routine Git output outside the main thread while surfacing questions, failures, commits, remaining changes, and push status. Supports complete delegated ownership with concise reporting, not a standing model choice. |
| Exhaustive work without an imposed budget | legacy `01a06e4d-ba24-7fa9-a3b8-cbb2290f9541` / `e6b8c229` | Rejected an arbitrary execution budget for a requested full baseline review. Anti-churn advice must not manufacture partial completion. Authority was specific to that review. |
| Workload-specific stability exception | default `01a07781-f779-73a5-80b5-a4d166fe4691` / `81fcbae8`; proposal `83b0108c` | Authorized a SearXNG-only 24-hour exception to a seven-day image hold after discussion of scraper freshness. Supports understanding why a control exists and when its cost defeats its purpose, not general unpinning. |
| Preference without an observed defect | legacy `01a06cf6-a913-7ee6-b262-bcc5a6f948fc` / `0ad235c3`, `58b3167a`; follow-up `63b843ce` | Rejected prose-asserting tests after the assistant hypothesized them. The assistant's subsequent bounded search reported none. Preserve the expressed preference without recording a confirmed implemented defect. |

Marginal value: useful positive workflow precedents and contextual exceptions, mostly refining existing understanding rather than adding a broad new preference. Quiet delegation directly supports the proposed background feedback worker. Bounded repair versus exhaustive review and stability versus freshness sharpen when to follow or depart from heuristics. The Team Lead recommends pausing broad weekly review in favor of targeted retrieval for unresolved contrasts. This is a recommendation for discussion, not a finding that all domains are saturated or a user decision to stop. Mike subsequently authorized August 18–September 1 as two more weekly batches to test this assessment.

### Historical week: August 25–September 1

Frozen interval: `[2026-08-25T19:16:41.417221Z, 2026-09-01T19:16:41.417221Z)`.

- Both profiles inventoried: 4,210 files, approximately 5.10 GB; 4,209 valid headers. No default in-window events; 377 legacy event-active sessions, including three older resumed sessions.
- 372 files contained visible conversation before deduplication. Removing 442 inherited duplicates left 371 canonical selected sessions and 3,824 messages. Thirteen ambiguous-parent sessions remained selected.
- All 158 pages across three batches were semantically reviewed. Grouped tool outputs initially clipped; completed ranges were preserved and uncertain ranges recovered individually. Batch 2 required complete recovery. No selected unread ranges remained in the final report.
- One invalid legacy historical-backfill header excluded. No malformed bodies, missing timestamps, or source changes reported. Scope was visible conversation, not exhaustive tools, attachments, thinking, or private calls. Generated user-role assignments were distinguished from operator testimony.
- Team Lead report: default `01a0db8f-df87-73aa-acfc-86de99369c88`, final follow-up `3eb074db-25bf-4fdd-9d0a-88da3844ee28`. Metadata/helpers: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-week-2026-08-25-hwi2o_2s/`.
- Operational issue: the Team Lead settled with an unfinished result rather than delivering final synthesis when readers completed. Parent resumed it after Mike reported inactivity. All recovery workers had finished; no semantic reread was needed to produce the final report. This is a current coordination failure, not evidence that historical research itself remained active.

Parent-checked additions (all source sessions legacy):

| Subject | Session / record | Evidence and limit |
| --- | --- | --- |
| Contextual judgment versus policy machinery | `01a03bca-94e8-70c1-860b-da0fe3c9619a` / `2a98d380`, proposal `899a8f70`, acceptance `b79dde65` | Mike challenged determinism as a general design stipulation because it could encourage ceremony at the expense of flexibility and simplicity. Accepted distinguishing stable mechanisms/consequential invariants from contextual judgment. This does not reject predictable semantics or appropriate enforcement. |
| Value before maintenance or relocation | `01a03a70-855e-7d9c-a80e-1824c3933add` / `d633473b`, explanation `692845a6`, approval `7fd40c05` | Corrected documents were still considered essentially meaningless. Approved deleting redundant prose and retaining the useful ownership rule locally, not globally. Accuracy and correct location alone do not establish usefulness. |
| Explicit retention exception | Same session / `0e699495` | Retained prompt-routing logs for possible future research. Inactivity, reproducibility, or generation alone does not justify deleting material with named historical/research value. |
| Revision of an approved approach | `01a039c0-f507-72e1-a70b-f947f623415f` / `03f6272f`, `1aa36675`, `c75cf9a9`; later `01a040bd-d375-77df-b823-8f6c284e50bb` / explanation `e780d6cd`, request `571b225f` | Earlier approvals included closed diagnostic dismissal categories and a three-candidate limit. Later requested an effective failure-family investigation described in the adjacent response, rather than the restrictive workflow. Preserve chronology and purpose; do not accumulate both as timeless requirements or infer that every earlier boundary was revoked. |
| Bounded extra work can simplify a workflow | `01a039c0-f507-72e1-a70b-f947f623415f` / proposal `ccffb080`, correction `f63babe3` | Chose all-platform builds over selective host compilation because detection problems had already cost more. Less computation is not necessarily less total complexity. |

Team Lead-verified supporting examples, not independently reread by parent:

- DDD should improve demonstrated domain structure rather than decorate low-level mechanics: `01a03be0-c3e4-75bc-a838-2a0a8e563e67` / `2a4aca66`, `de51f56e`. A predictable no-flags release workflow remained desirable where intent was settled: `01a03e74-e6a1-70a8-a932-6e39f4c88806` / `d08fcf0b`.
- A sufficient tracker/checker did not justify an expanded protocol and evaluation harness: `01a05d3c-8326-7320-9d35-6908825b4da7` / `fa6ebb90`, `d7659722`, `419be094`, `29fb7dda`.
- Simplification must preserve the approved prototype: `01a0441c-c962-7f30-8b13-340780123bfd` / `6b5b5ca2`, `d6756fb4`. Final satisfaction was not established.
- Rejected a damage-control taxonomy but accepted structural command analysis while declining OS enforcement for now: `01a045a9-23c9-7289-ae51-61428dd03b94` / `33726816`, `071a6f6e`.

Feedback-worker implications: preserve chronological revisions instead of treating every approval as permanent; distinguish submitted requirements from personally authored preferences; interpret a short approval with its adjacent proposal; and retain the contrast that explains an exception. This supports learning through judgment, not a new classification workflow.

### Assessment after the two additional August weeks

Both weeks added meaningful, concentrated insights. They do not confirm that older history has become valueless or that every successive week yields less. They strengthen the reasons behind existing heuristics and provide useful examples of changing an approach rather than merely adding exceptions.

A more defensible diminishing-returns assessment is that broad scans increasingly spend effort on repeated themes and generated traffic, while the useful additions cluster around specific exchanges. Recommendation: move toward applying the accumulated knowledge and use targeted historical retrieval when a real uncertainty arises. This was a proposal for Mike, not authorization to stop requested work or begin implementation. Mike subsequently authorized the June 1–August 18 overnight extension recorded above.

### Historical week: August 18–25

Frozen interval: `[2026-08-18T19:16:41.417221Z, 2026-08-25T19:16:41.417221Z)`.

- Both profiles inventoried: 1,738 default files with no qualifying events, and 2,464 legacy files with 557 event-active sessions. Corrected captured size: 5,091,532,492 bytes, not the initial helper handoff's 6,919,532,492.
- 9,467 visible occurrences became 8,357 canonical reviewed messages after removing 1,110 duplicates. There were 552 distinct canonical-review sessions, six created before the interval, and 553 batch entries due to one continuation.
- All 516 pages across six batches were semantically reviewed. Dedicated recovery covered clipped batch-1 pages 15–29. Metadata-only partial returns were not counted as semantic coverage. Eleven ambiguous-parent sessions were retained; generated traffic was not treated as direct operator evidence.
- One invalid legacy historical-backfill header excluded. No reported malformed bodies, oversized records, timestamp gaps, unstable-source exclusions, renderer verification failures, or remaining unread selected ranges. Coverage remains visible conversation rather than exhaustive tool results or attachments.
- Corrected native citations and manifest bounds supersede erroneous first-pass reviewer IDs and interval descriptions. Team Lead report: default `01a0db8f-e4c5-77db-93d5-ef1e5fe3789a`, final follow-up `c49112db-10a0-452b-9af6-34519c6d054e`.
- Metadata/helpers: `C:/Users/mglenn/AppData/Local/Temp/advocate-review-week-2026-08-18-28940ddd28834b38916c7be4e4562ea2/`.

Parent-checked additions (all source sessions legacy):

| Subject | Session / record | Evidence and limit |
| --- | --- | --- |
| Model-led exceptional recovery | `01a039d8-7e5a-795d-8679-4689251b9c8d` / `96bb9f56`, proposal `2e6e9663`, approval `e4e2f446` | Explicitly endorsed model attempts at safe recovery from unusual local failures instead of a second workflow state machine. The proposal retained hard boundaries for sensitive/destructive/production/ambiguous-ownership actions and deterministic verification before cleanup. Not permission to remove normal-operation correctness or current safeguards. |
| Authorized provisional implementation | `01a02210-a5f6-7162-8c32-45ae3c7544c4` / `61ec0395`, response `f0962362` | Required a full best-guess dev/staging deployment so knowledgeable owners could evaluate behavior. Distinguish inventing authoritative requirements from building an explicitly authorized candidate to elicit the missing feedback. Assumptions remained disclosed, not historical facts or owner acceptance. |
| Review substance versus bookkeeping | `01a03161-05e4-79cf-966c-3414842706f5` / `55f5aa2d`, assistant `0d2cd2e5`, corrections `aa56983f`, `152065e8` | Rejected exposed lifecycle ceremony, then rejected the assistant's reduction to one reread. Wanted substantive expert/adversarial review preserved. Historical sequence is evidence about purpose, not a new mandatory review pipeline. |
| Positive acceptance of a reduced design | `01a02c8e-f6db-7f48-9a54-48ceeaf2c41f` / `cb56e0a2`, proposal `fca2ce66`, `472b247a`, `b69812b1` | Liked and authorized a reduced goal/task/Team Lead proposal that retained useful structure while deferring extra machinery. This is acceptance of the adjacent proposal, not proof of whole-system effectiveness or endorsement of every old implementation detail as current policy. |

Additional Team Lead-verified contrasts, not independently reread by the parent:

- Small safeguards can be worthwhile even for a low-likelihood race: `01a01770-5f1e-7053-9996-dc90f1e34605` / `dc300015`, `b73f6816`, `42e49975`. The agent presented leaving it alone as reasonable before Mike approved a focused fix. Do not require an actual past incident as the only possible justification for prospective protection.
- A two-phase rollout can preserve alert continuity without requiring another operator approval pause: `01a036d9-1807-7e5c-aaff-d6298e38437e` / `830bec8b`, `ef5d0663`, `55f1cf83`, `c9da8cbe`, `f1c28097`.
- A short serial ingestion workflow was approved while timeout/resume machinery was deferred: `01a02f8a-de02-7f64-a5cb-7e5383054e46` / `f911f422`, `047b79fb`, `38221a0c`. This limits a universal-background interpretation, not current scheduling or blocking instructions.
- Controls should match the actual mutation: `01a024d4-d49c-7842-8f78-03c6d833f00f` / `7726f12f`, `693bbe29`, `09844d70`. An immutable-image code rollout was distinguished from a durable-data migration requiring whole-stack backup.

Feedback-worker implications: follow the full correction chain, including later rejection of an assistant's attempted remedy. In this week, generated child instructions added CI database machinery that the direct parent conversation rejected; generated assignments cannot establish user preference. Keep local repairs distinct from knowledge changes, preserve the environmental reason for exceptions, and do not treat missing historical observations as proof that a prospective need cannot exist.

Marginal value: moderate overall, concentrated in several genuinely useful contrasts. This weakens a simple claim that each older week necessarily adds less value. It does not change the holistic advisory remit. The Team Lead recommended pausing broad expansion after the concurrent August 25–September 1 review; the combined assessment is recorded above.

## Operator clarification: interruption cost and cosmetic gates

Mike clarified that the main frustration is not merely speculative preventive work. A command can introduce an unexpected safety/quality gate that blocks the requested operation over something he does not consider consequential, such as extra whitespace during a Git commit. Checking cosmetic whitespace has no value to him when it does not affect code behavior; blocking a commit then forces him to abandon his current train of thought to resolve an irrelevant issue.

This is direct evidence that operator attention and continuity are part of the cost of a safeguard. A mechanically cheap check can impose a substantial workflow cost when it interrupts the user. Do not translate this into a proposal for more approval prompts, or assume automatic cosmetic cleanup is the desired substitute: Mike objected to the value of the check itself. The example concerns cosmetic whitespace, not whitespace with syntactic or functional significance. It does not authorize bypassing applicable repository requirements or establish the treatment of genuine functional failures; those boundaries remain to be clarified.

### Operator clarification: regression failures and test authority

Mike clarified that pre-existing versus newly introduced failures are less central in the current worktree workflow. Tests should establish functionality and catch regressions across components: if they worked at the start, they should work at completion.

The recurring failure is the agent's response to a failing test: insufficient investigation followed by broad refactoring or invented features, instead of understanding why the current change broke the tested behavior and making an appropriate correction. Ask Mike when consequential intent remains unclear rather than inventing a design to reconcile it.

A second failure is treating a poor test as authority over the requested change. Tests asserting particular prompt words or phrases can preserve obsolete wording after the underlying idea is deliberately refined. The agent then tries to satisfy both the new intent and the stale assertion, producing contradictory instructions. Test existence alone does not establish that its expectation remains valid. Distinguish a real behavioral regression from a brittle or superseded assertion; preserve intended functionality rather than automatically restoring whatever text makes the test pass. This is not permission to discard inconvenient regression tests or to leave genuinely broken behavior unresolved.

Mike confirmed that when the requested change clearly supersedes a test's old expectation, the agent should update or remove that assertion directly and explain afterward, without seeking separate permission. Preserve still-relevant behavioral coverage.

Qualification: execution may uncover a conflict or dependency that planning missed because the investigation was incomplete. This can change the implications of removing an assertion or the approach needed to implement the plan. The original assignment does not settle this newly discovered conflict. Mike objects to agents independently resolving such consequential issues, especially when an undersized implementation model obeys a broad instruction to "fix it" and produces a fragile workaround. Bring the evidence and changed implications back to the parent rather than leaving the implementation worker to invent a solution. Mike clarified that this should not automatically become a question for him: Advocate should use the accumulated understanding of "Mike's way" to help resolve the issue when genuinely comparable prior situations and their resolutions make the preferred approach clear. The parent can then give the worker a resolved correction. If Advocate lacks relevant context, finds conflicting precedents, or remains unsure about the consequential choice, bring a focused question to Mike. A larger model alone is not a substitute for this grounding. Historical precedent does not override an explicit current request or authorize otherwise prohibited actions. Routine implementation details remain agent-owned.

## Candidate design principles

These are synthesis proposals, not new active rules. Their value is in the contrasts and boundaries, not slogans.

### Preserve the requested capability while removing unnecessary machinery

Mike rejected speculative gates and added subsystems, but also premature stopping, incomplete compatibility fixes, and broad workarounds that disabled useful behavior. Simplicity is not reduced functionality. Restoring a failed experiment is an intermediate state if the original issue remains unresolved.

### A useful check does not automatically deserve authority to block delivery

A live integration probe may provide valuable evidence while remaining report-only. Whether to run a check and whether it becomes acceptance gating are separate decisions. Passing adjacent checks also does not prove the actual credentialed, write, deployment, or consumer contract. Validation order must fit runtime availability and the actual environment; a preferred conservative sequence is not automatically a technical prerequisite.

### Complexity should earn its practical cost

Optimization should improve the real critical path while preserving meaningful behavior. Marginal experiments can be discarded, while a short representative experiment can be valuable when it cheaply resolves a concrete uncertainty before expensive work. A localized workaround can be appropriate when it preserves desired behavior and its reason is documented. Low ceremony does not mean the fewest possible useful options. This is not an absolute preference against complexity, hacks, abstraction, tests, or explicit behavior dimensions.

### Calibrate controls to consequences and the actual environment

Examples distinguish deployed artifacts and state-changing jobs from small utility jobs that fail visibly; production-compatible behavior from disposable dev data; model-context rendering limits from operational ceilings. Do not extrapolate a local decision into a universal rule that authenticated endpoints, development systems, or moving dependencies never need controls.

### Use established mechanisms, but do not defend them merely because they exist

New work should normally fit existing image, configuration, database, deployment, and ownership patterns. Equivalent structures across related repositories can improve discoverability for developers without requiring structural identity. A faithful environment copy should differ only where its purpose or isolation requires. Conversely, an old safety mechanism still needs a valid purpose before being described as necessary.

### Put specificity where it prevents wrong decisions

Mike wants concise always-loaded guidance and sufficiently concrete plans for smaller executors. Interfaces, ownership, runtime facts, exceptions, and agreed completion boundaries belong in the relevant plan/assignment when omission invites guessing. Do not respond by adding boilerplate or rigid fields to every handoff.

### Preserve architectural understanding in the correct home

Future agents should understand responsibilities, customizations, retained behavior, dependencies, relevant file relationships, and established reasons. Command catalogs alone are insufficient. Current developer documentation, accepted contracts, changelogs, investigations, proposed future state, and run evidence have different owners. Keep `AGENTS.md` as a concise entry point rather than a knowledge store; use authoritative ownership and meaningful cross-references. Skills may need to be self-contained when distributed without global instructions.

### Investigate deeply and explain concretely

Use the direct authoritative check when it can settle a fact. Trace exact versions, consumers, runtime-loaded artifacts, credential flows, and configuration before making causal claims. Reporting should name what happens, why it matters, and the remaining real choice. Depth of investigation does not require a verbose answer.

### Ask only what remains consequential after applying established intent

One-at-a-time discussion can be useful for genuinely independent decisions. It does not justify asking every checklist question once a governing requirement resolves the details. Provide recommendations for unresolved choices rather than asking Mike to perform the intermediate inventory or research.

### Keep authority and outcome states distinct

A recommendation is not a requirement; a command template is not necessarily Mike-authored intent; a child report is not proof of acceptance. Evidence that a capability or data source exists is not authorization to make it an implementation dependency or owner. Positive acceptance applies to the behavior actually tested, not adjacent UI or an entire design. Implementation, integration, publication, deployment, observation, and cleanup are separate states. Do not describe a successful merge as failed because monitoring remains. Inherited branch monitoring remains the parent's responsibility unless explicitly reassigned; do not generalize that into a ban on child scheduling or all continuation of authorized work.

### Delegate with a sensible middle ground

Avoid both overloaded workers and automatic role proliferation. Parents correlate evidence and resolve scope judgments. Planning exposes task complexity, dependencies, and useful split points; Strategist selects staffing rather than plans hard-coding model and effort. Workers receive coherent implementation outcomes and retain ordinary engineering judgment. Keep live children only for a concrete follow-up, not hypothetical future use. Model-specific choices in historical incidents are contextual evidence, not a new standing routing policy.

## Selected evidence anchors

These are short references for later source retrieval, not exhaustive citations for every candidate principle. IDs identify native Pi sessions and message records. Avoid treating copied fork occurrences as additional evidence.

### Parent spot-checked from September 15–22

| Subject | Session / record | Evidence |
| --- | --- | --- |
| Proportionate disposable experiment | `01a0c96b-6713-716f-8ae6-6ec6e36e26a1` / `688b0a47`, `ef49d5ec`, `a5db0370` | Requested a shorter failure window, a roughly 30-second Dockerfile, and a pushed branch before repeated expensive KMIS builds. |
| Production research before retries | `01a0bb05-43a7-7507-8a4d-01ff1ad9367b` / `0c3ea967` | Challenged repeated upgrade action that had not checked current authoritative guidance. |
| Full disclosure versus bounded action | `01a0b04d-79de-75fd-a659-865017db9ab3` / `114fa20d` | Objected when a bounded recommendation omitted the wider known problem. |
| Preferred sequence versus prerequisite | `01a0acad-f5d2-738a-942f-f5858de7a2c4` / `87b0c597` | Challenged an assertion that Terraform apply could not proceed; the assistant acknowledged the sequence was conservative rather than technically mandatory. |
| Cross-repository convention alignment | `01a0ab78-882f-75e0-86b8-c2795f778c5f` / `8a8a5d07` | Wanted EISA and MPS deployment structures aligned where reasonable so developers know where to look. |
| Plan complexity versus staffing | `01a0ac48-105e-70e2-92a0-eebad64ae1b5` / `fcb17b77`, `9a7795c4` | Wanted manageable tasks but model/effort choices inferred by Strategist rather than embedded in plans. |
| Discoverable knowledge, not larger AGENTS | `01a0ca55-3135-716f-8ae6-6ecb6eef9e1a` / `d5e3ea2f`, `2d10aed2` | Wanted existing knowledge findable and explicitly rejected putting everything into `AGENTS.md`. |
| Mechanism test versus real review | `01a0b4a3-cc8f-7602-b5d1-4154d7d3f485` / `641c7e16`, `176f87c1` | Wanted observed blocking reasons reviewed across sessions, not only proof that logging worked. |

### Parent spot-checked from September 8–15

| Subject | Session / record | Evidence |
| --- | --- | --- |
| Completeness with proportional validation | `01a08e05-18de-704f-b829-dff25db0e562` / `5ad277de`, `ce7df208`, `d40b8859` | Required working authentication and operations, rejected a scope-expanded matrix, and selected CAC deployment plus manual testing with telemetry. |
| Useful option axes without ceremony | `01a087b2-0efe-7714-81ec-d42a0666460a` / `663f4c11`, `0d5b9d15` | Proposed independent delivery and response-expectation choices, then approved the plan update. |
| Evidence is not implementation authority | `01a082be-bccf-71b7-8df4-06532f20fabe` / `e33b6a7a` | Clarified that proving user-level information existed did not authorize using that repository for implementation. |
| Acceptance is specific | `01a08398-f458-720a-95cf-9d0b3e9e21f9` / `8e532f57`, `5a11122b` | Confirmed tested behavior worked while rejecting an adjacent output widget. |
| Runtime-aware validation order | `01a086c1-d843-73a1-97ce-023e673ac32e` / `c60ef5e0`, `11fd3c08` | Identified the chicken-and-egg problem in testing isolated-worktree code before merge and set the completion boundary. |
| Environment-specific controls | `01a086ce-2c1a-70a4-a47f-d99225d223fc` / `838fc0a3`, `fa908426` | Distinguished external ingress from internal development use and rejected a 36-rule design. |
| Unsolicited blocker versus justified alternative | `01a08e21-a487-7315-b6d7-a4749c6feb74` / `a4b92a4c`, `3af33128` | Objected to unapproved security requirements, then accepted the alternative after concrete explanation. |
| Intent in planning, flexibility in execution | `01a086d2-7845-7714-81ec-d3c9637d2c6d` / `6c99b279`, `b21f6223`, `446b556a`, `f30363d9` | Required plans to capture consequential intent while remaining low ceremony and leaving implementation intelligence to the agent. |

### Parent spot-checked during the initial investigation

| Subject | Session / record | Evidence |
| --- | --- | --- |
| Reject low-value optimization | `01a0ce70-d698-71f2-96c0-e97290bc9362` / `96db492f`, `d0022f64` | Asked whether changes meaningfully improved code/deployment, then directed cleanup because they were not worth it. The question is record ordinal 6029, not 6033 as first reported. |
| Useful probes can be report-only | `01a0ced1-8627-716f-8ae6-6ed2c36d3b37` / `dd04c57d` | Explicitly said the failure should be reported, not block acceptance "for now." |
| Consequence-based pinning | `01a0d1d8-ef9d-766e-9c89-5c547e7c8731` / `50f6eba3` | Distinguished appropriate image pinning from small tooling jobs allowed to use latest tags and fail fast. |
| Faithful environment defaults | `01a0ceda-4002-7365-b0ab-8f24b4776196` / `d4bf6633`, `ecef23a3` | Required equivalence except AWS-environment necessities; later rejected asking again whether it should persist. |
| Architectural understanding | `01a0cf3b-844a-777e-aa8f-a48c77fdd176` / `706892f4`, `e112a3d6` | Wanted understanding that informs future changes; separately required assuming standalone skills may lack global instructions. |
| Plans for smaller executors | `01a0d5e4-47e6-744b-b453-63177e894338` / `392ea31a` | Asked whether the plan was detailed enough to prevent a smaller model making bad assumptions. |
| Natural validation boundary | `01a0ce2e-a84d-71f2-96c0-e97185173a01` / `7d3d1893` | Authorized image work validated as building valid images, not separate validation of every minor change. |
| Accept a local workaround | `01a0cfe3-f95c-72b7-bcc4-e1b8cebb4c19` / `9280cf4b` | Accepted the notification alternative and requested a comment to preserve why it existed. Retrieve the adjacent proposal before generalizing its mechanism. |
| Explicit API semantics | `01a0d3b2-3825-7393-ba63-7619fb814ded` / `1ae308e5`, `14137689` | Objected to identical syntax implying different ANY/ALL behavior, then requested a plan. |
| Parent-owned synthesis | `01a0d531-1f1a-749a-bda2-1ff7d6222c41` / `90a14439` | Said the orchestrator should correlate/consolidate other agents' findings and use a writer if needed. |
| Avoid delegation overreaction | `01a0d4e4-c99a-7500-aada-813b6db55846` / `9485fea8` | Rejected going from an inadequate solution to an excessive one, asking for a middle ground. |
| Trivial commit interruption | `01a0d00d-4421-72b7-bcc4-e1d9b5e6bb1a` / `d3b3aa32` | Wanted `/commit` to fix or ignore trivial whitespace rather than stop for operator intervention. Not general permission to ignore repository checks. |
| Reuse deployment conventions | `01a0d8df-9ae0-730f-8758-1ab0aaabdde7` / `924a02eb` | Said ICP should use existing convention/configuration-as-code workflows unless a concrete exception is discussed. |

### Additional source leads verified by the initial reviewers

- `01a07e8e-72fd-708c-b38f-2b05bff28bbc`: `2ba563b1` is the collective successful-plan comparison; `f2395795` requests questions/recommendations for planning uncertainty; `2685b36a` asks to avoid ceremony; `9d66745c` requests worktree execution, merge-back, and archival; `8dcc8907` approves the adjacent combined changes. None is standing push authorization.
- `01a09b46-74f9-70bb-989d-7bed421a1784`: records 280–305 cover unsupported transcript-download controls and the parent treating reviewer safeguards as proposals. Some assignment provenance was reported through historical log text; inspect original dispatches if that causal sequence matters.
- `01a09221-27b5-7739-bbb8-dff21f3ff2a9`: records 225–233 cover rejection of fixed conversation caps and approval of actual-context-boundary trimming. Established harm protections were deliberately retained.
- Planning `01a0b598-8155-700a-9da8-10cae221bf5b`, record `60715761`, and execution `01a0b6d3-a81b-7507-8a4d-01e67f21a751`, records `a86499d0` and `6c215f29`: settled not-yet-live dev intent was lost when execution introduced a disposable-cluster prerequisite; Mike directed plan correction and completion.
- `01a0d5e4-47e6-744b-b453-63177e894338`, records `2e85e731` and `106ee172`: demands for concrete UserSearch explanations and provenance before changing production-derived behavior to satisfy a new synthetic test.

Do not directly reuse vague reviewer coordinates such as truncated record IDs or "user 807." Recover the exact native message and adjacent context first.

## Recommended Advocate shape, still for discussion

Purpose:

> Given the problem, context, and available approaches, help the orchestrator identify which approach is most consistent with how Mike would likely reason about and solve it.

The Advocate is a preference-aware design and workflow advisor, not an abstract compliance mechanism, checklist runner, or additional review gate. It reasons holistically about the proposed procedure or sequence of steps. Validation, safeguards, sequencing, complexity, workflow effects, and architecture are evidence it may weigh when comparing approaches; they are not separate Advocate programs.

It should explain the relevant demonstrated preferences, important contextual limits, and where evidence is weak or conflicting. This should catch underengineering and premature stopping as well as overengineering. It should not caricature Mike as disliking tests, safeguards, structure, recovery, detailed plans, or technical depth.

Proposed knowledge organization:

1. A concise role prompt containing responsibility, authority limits, and how to handle uncertainty.
2. On-demand references grouped by actual decision areas, not a giant always-loaded biography or failure log.
3. Each useful precedent explains the situation, selected approach, rejected alternative, reason, context, and exception. Clearly distinguish explicit decisions from tentative inference.
4. Current decisions supersede older examples. A merge or absent complaint is not evidence of satisfaction.
5. Preserve source pointers without copying private transcripts or incidental operational data. Respect explicit requests not to preserve a rejected rationale; do not revive it as a future constraint.

Potential consultation moments:

- The orchestrator has a proposed procedure or set of steps and wants to know whether Mike would likely approach the problem that way.
- Several technically valid designs differ materially in workflow, complexity, validation, safeguards, architecture, or operating burden.
- A parent is about to turn review recommendations into implementation assignments.
- Existing conventions and a proposed exception need contextual comparison.

Possible response shape, not a required schema: recommend the fit, explain the relevant precedent and its limit, identify conflict with the current request, and ask a focused question only if needed. No scores, approval authority, or mandatory additional review cycle proposed.

## Agreed learning loop with agent-process

Mike agreed to the following design. It is not implemented yet; this records the intended workflow rather than changing active skill instructions.

- Preserve the current agent-process timing and feedback triggers. The orchestrator handles the immediate correction; deeper investigation and knowledge maintenance run in a writable background worker to avoid filling the active task context with historical analysis.
- That worker makes the learning judgment during the triggered investigation, before reporting back. No separate reviewer, periodic review, or fixed incident-count threshold is required.
- The decision is whether feedback provides a supported reason to change Advocate's advice on a future comparable problem. One explicit general correction can suffice; repeated comparable decisions can support an inferred heuristic. Repeated failure to follow adequate guidance does not by itself warrant rewriting it.
- If existing knowledge already covers the feedback, report the corrective action without manufacturing a knowledge change.
- Under the agreed standing write boundary, maintain feedback records and Advocate learning references directly: precedents, inferred preferences, heuristic purposes, applicability, exceptions, and uncertainty. Compare proposed revisions with earlier evidence so new feedback does not erase relevant contrasts.
- Changes to Advocate's core instructions, authority, responsibilities, permissions, or consultation triggers remain specific proposals for Mike's approval. Material ambiguity returns as a focused question, not an invented preference.
- Return only the corrective action relevant to the current task, a brief account of knowledge changes, and any consequential question or core-instruction proposal. Raw history and exploratory analysis stay in the child context. Subsequent Advocate consultations use the updated references.

The guiding distinction is understanding why a rule of thumb helps and when departing from it better preserves Mike's intent. Learning should improve that judgment, not accumulate mechanical classifications or exceptionless rules.

### Lessons from historical review for feedback interpretation

The same reviews should inform how the worker learns, not just what Advocate knows. The September 1–8 review supplies concrete examples:

- Read enough of the proposed approach, correction, environmental constraints, and resolution to understand the feedback. A short approval depends on its adjacent proposal; a later qualification can change its meaning.
- Separate a stated preference from evidence that a defect actually existed. The prose-test example above establishes the former without establishing the latter.
- Separate approval of a mechanism from evidence that it worked. The praised batched run did not exercise its repair allowance.
- Preserve the reason for an exception, such as SearXNG freshness or an explicitly exhaustive review. Otherwise the exception becomes a misleading general prohibition or permission.
- Keep routine analysis outside the main context without hiding consequential outcomes. The approved quiet commit workflow is a positive precedent for a worker owning both investigation and permitted updates, rather than returning bookkeeping to the orchestrator.
- Live feedback may arrive before the resolution is known. Record uncertainty honestly rather than manufacture a finished lesson. These observations inform interpretation, not new timing rules, labels, or trigger requirements.

### Initial uncertainty handling

Mike chose an initially conservative consultation posture: when Advocate is unsure which consequential approach fits his intent, ask rather than choose on his behalf. Clear, genuinely comparable precedents can still support resolving an issue without asking. The purpose is to learn from the answers and refine the judgment over time so future questions concentrate on real uncertainty rather than repeatedly asking what is already clear.

Mike compared this to refining Damage Control's initially broad caution into higher-signal decisions. This is an analogy for calibration, not authorization to block all work, introduce another safety mechanism, use a numerical confidence threshold, or require approval for routine implementation details. Answers feed the agreed agent-process learning loop; improved grounding, not elapsed time or question count alone, supports fewer interruptions.

### Challenging established preferences

Mike explicitly approved Advocate challenging his usual approach when new evidence suggests another approach would better serve the current goal. Explain the established preference, what differs in this situation, and why the alternative may be better, then ask Mike. Understanding his reasoning must not become automatic agreement or an echo chamber.

## Open decisions and cautions

- Exact role prompt, reference layout, model/effort, tools, and consultation routing are not selected.
- Decide whether Advocate should assess the premise of added machinery while leaving technical defect verification to Reviewer and staffing to Strategist. Recommended: yes.
- Working definition, more objective than "identify the full material problem": Advocate checks whether a recommendation discloses known, evidenced concerns that could change Mike's decision. A concern is material when evidence shows it could affect outcome achievement, scope or acceptance, operating risk or burden, sequencing or prerequisites, or the choice being requested. Classify known concerns as included, deferred, not material with a brief reason, or unresolved. Advocate is not expected to discover every possible issue, and disclosure does not authorize implementing every concern.
- Do not split completion conditions, validation, workflow, UX, safeguards, or architecture into independent Advocate review functions. Treat them as contextual evidence when judging whether a proposed procedure or sequence resembles how Mike would likely solve the problem.
- Derive useful rules of thumb from repeated decisions and apply them to new problems. Ground them in demonstrated evidence, explain relevant contextual limits or exceptions, and revise them when later evidence conflicts. Distinguish an established heuristic from a context-specific precedent or uncertain inference when that distinction affects the recommendation. Do not require fixed labels, scores, or an evidence schema. Current intent and applicable repository policy take precedence.
- When tactical restoration conflicts with an established architecture, Advocate should expose the tradeoff rather than assume speed or conformity always wins; confirm whether this is part of its remit.
- Reconfirm current consultation routing rather than importing historical approval boundaries for larger-model or Steward calls.
- Do not adopt every candidate principle verbatim. Many already exist in active guidance; examples and discrimination may add more value than more imperatives.
- Positive whole-design satisfaction remains less established than explicit acceptance of particular choices. The broad review adds useful positive tradeoffs, not a verified list of favorite complete systems.
- Findings are concentrated in Pi tooling and MPS/EISA/platform work. Do not claim they establish preferences for every domain.
- The Advocate must not promote old task-specific approval into standing permission to mutate, deploy, publish, or change another repository.
- Plans and source instructions may have changed concurrently during this discussion. Re-read current owners before proposing edits.
- At note creation, dotfiles status already included unrelated `.specs/smarter-log-analytics-execution/` and the instruction-composition reference directory. Earlier global instruction edits were no longer listed as dirty; this task did not determine who integrated them. Preserve all existing work and do not claim commit ownership.
- MPS documentation cleanup and ICP restoration remain separate paused work. This handoff does not authorize resuming implementation or deployment there.
