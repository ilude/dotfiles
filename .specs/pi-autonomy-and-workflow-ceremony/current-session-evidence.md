# Current-session evidence

The operator pointed out during this investigation that almost all currently running sessions contain churn. This is an important lead, not a measured prevalence claim. The second pass therefore prioritizes current activity rather than stopping at historical examples or the failed goal controller.

## Observation boundary

A read-only file-metadata snapshot at approximately 2026-09-05 21:49 UTC found recent writes in this investigation, the subagent/Herdr session, the benchmark execution session, and child logs. Exact parent transcripts were inspected through the relevant 21:44 user corrections and recovery requests. File modification time identifies recent activity, not process liveness. No Onclave discovery, messaging, Herdr control, peer prompting, process polling, live tests, or modification of another session's work occurred.

These files contain inherited history and, in the subagent case, multiple parent-ID branches. Related entries are evidence for bounded sequences, not independent sessions or a single flattened chronological conversation. No claim is made that active work remains in the same state after inspection. Child transcripts were not needed to establish the reported handoff outcomes.

## A1: The benchmark churned while complying with deferred testing

Session `01a0725f-c2b4-76c3-abf8-13bc4f81324f`:
`C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-09-05T16-21-13-524Z_01a0725f-c2b4-76c3-abf8-13bc4f81324f.jsonl`.

This is actual benchmark implementation after successful `/do-it` startup, not another observation of the failed goal controller.

### Direct evidence

- `7aa06659`: prepared workflow contains an execution plan and owned worktree, with the full instruction sequence: authored-work completion by inspection, deferred final validation, fixed repair budget, and subsequent live measurements and Git closeout.
- `aa63f54b`: initial Team Lead dispatch rejects an invented task ID; the current workspace has no valid task alternatives. The workflow itself explicitly permits a canonical plan without a duplicate task registry. This is a concrete unnecessary metadata failure, not a reason to remove workspace isolation.
- `c7b7cfe4`: Team Lead returns partial work after its 32-turn budget.
- `f0e933e1`: subsequent source review reports mismatched projected-record fields and unusable SQLite insertion.
- `4b930118`: modifying child stops after 64 turns with partial output.
- `9c638003`: another source review says the final validation stage should not begin, identifying guaranteed typecheck failures and other integration issues.
- `17bbb1f5`: another modifying child stops at 64 turns.
- `71cfc154`: final targeted rerun has 14 failed focused tests and benchmark TypeScript failures. Direct output includes SQLite's missing `json_extract_string`, integer-versus-boolean results, report metadata/type drift, and fixture expectations that fail before reaching the behavior they intend to test.
- `71c5aeeb` and `6c225487`: the plan is updated to record a consumed repair allowance and a block on further local repair pending operator direction. Live measurement attempts remain unused.
- `dd23d1fa`: final response reports framework implementation but incomplete validation.
- `c51bef69`, `9cf2289b`, `038c07f5`: operator asks what is wrong, asks for a route to an answer, and authorizes continuation.
- `7740713a`: proposed repair now centers on a common contract across engine values, result schema, runner, report, and test fixtures.
- `e2fd49a5`: the operator's continuation is recorded as one additional repair/validation cycle.

### What it establishes

1. A fixed late-validation schedule can coexist with repeated review/repair handoffs before testing. Counting test executions misses this churn.
2. Integration was not achieved merely by authoring the planned files, obtaining review findings, or dispatching bounded workers. The missing field/function/type agreements are concrete seam failures.
3. A general resource budget can terminate broad assignments before they compose. Retaining partial results is useful, but another broad handoff incurs rereading and integration costs. The budget is not itself evidence of an appropriate decomposition.
4. The local-repair policy demonstrably transferred continuation control back to the operator. The stop was compliant with current policy, not insubordination by the assistant.
5. Bad tests and real implementation defects coexist. Error-precedence and cleanup assertions cannot automatically be treated as product requirements; SQL incompatibility and type drift cannot be dismissed as mere ceremony.

### What it does not establish

- The required synthetic workloads, sizes, samples, deadlines, isolation, and resource measurements were not invented merely because they made the benchmark substantial. Preserve the actual objective.
- No claim that early testing alone would have prevented the outcome. Nor does the evidence justify unlimited test/fix loops.
- No inference that all review findings were unnecessary: several identified concrete defects.
- No claim that all remaining work still fails today, or that the latest recovery succeeded. This investigation did not run it.

## A2: The subagent work grew through partial implementations and repeated handoffs

Session `01a071ed-54b9-77e2-a881-7935addaaba0`:
`C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-09-05T14-16-14-265Z_01a071ed-54b9-77e2-a881-7935addaaba0.jsonl`.

The earlier wrong-process-order test is only one part of this session. Later work contains a distinct, larger pattern involving visible worker coordination and acknowledged background delivery.

### Direct evidence

- `a18c71e5`: the user clarifies the desired capacity as up to eight visible workers across Team Leads. That is an explicit requirement, not an invented concurrency target.
- `163143bc`: earlier specialist research delegation was explicitly requested. It must not be reclassified as unsolicited ceremony.
- `74c1c994`: after failed research delegation, the user asks the root to do the research directly.
- `b5f9ee33`, `ad5e6b17`: parent notification of failures and investigation before building are explicit user requests. The delivery problem is not automatically extraneous scope.
- `bccf50a9`: modifying child aborts.
- `8ecaa957`: cross-repository child dispatch rejects a task ID bound to another workspace. The correct lesson is to avoid making unrelated task metadata necessary for an authorized bounded assignment, not to grant cross-workspace mutation by an arbitrary ID.
- `8f160e59`, `188a0746`, `dfe151c7`: later modifying children return partial results at 64-turn limits.
- `7e8f2454`: another continuation fails with a WebSocket error. Infrastructure failure is distinct from product or design churn.
- `ad4b0f26`, `1180a4de`, `bcf63548`, `86230a5f`: other children return authored implementation/test packages. Those outputs coexist with incomplete whole-path verification; returned files are not proof of an integrated outcome.
- `e302b4ad`, `58897366`: consolidated prevalidation assignments abort.
- `d815875c`: root reports a remaining SDK continuation defect plus fixture mistakes and an invalid SDK import, while distinguishing passing dotfiles tests from an unverified complete delivery path. These particular code diagnoses are the root's report, not independently revalidated by this investigation.
- `30a0b2a6`, `1c86f91a`, `1e99534a`, `1e460ecf`: user challenges repeated ownership discussion, difficulty, and explanations that merely restate the behavior.
- `f28460e4`, `577ecf55`, `b883bf0a`: root acknowledges broad delegation, accumulated partial fixes, insufficient integration, and repeated design expansion. The admissions agree with the observable aborted handoffs; they are not evidence of an internal psychological cause.
- `cf9ff7fe`: root reduces the relevant ownership requirement to matching worker and terminal IDs, counting/releasing once, and closing the correct terminal. The safety requirement survives without making ownership an open-ended architectural topic.
- `d70fc345`: proposed continuation returns to specific defects and a complete transition-level regression using existing managers.
- `d2bd09f3`, `83a98a4d`: user again directs completion; subsequent entries show concrete source inspection beginning. This is not evidence of eventual successful completion.

### Interpretation

The requested concurrency and delivery behavior have genuine lifecycle complexity. The excess is not that every such system should be tiny. It is the repeated production and handoff of incomplete pieces without establishing the integrated behavior, followed by increasingly broad explanation and repair work.

The current anti-churn instructions coexist with this behavior. They describe final validation timing and limit retries, but they do not make an assignment independently executable, make mocks faithful to the SDK, or make partial outputs compose. Strengthening those same procedural rules is not a supported solution.

It is especially important not to answer the user's causal question with another admission that the assistant expanded scope. The supported explanation must identify what allows expansion to persist: chosen methods become plan obligations, fragmented work has multiple completion proxies, integration is deferred, and counter-based policy interrupts recovery after those weaknesses surface. The exact influence of model reasoning and context load is not measured here.

## A3: Browser work distinguishes a necessary stop from speculative recovery

Current-day session `01a07236-a494-7d82-a3e6-97365c110296`:
`C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-09-05T15-36-18-836Z_01a07236-a494-7d82-a3e6-97365c110296.jsonl`.

- `ed245767`: request to install one profile's extensions into another profile.
- `69189d63`, `d197294a`: browser start fails to establish ownership; status has no owned session. Not controlling or broadly killing an unverified instance is a genuine protection.
- `6bf8c812`, `38c58d91`: user-requested retry returns the same error.
- `ed945ded`: assistant attributes this to another Brave process without direct diagnostic evidence in that sequence, and transfers another close/retry step to the user.
- `28164b01`, `0cc6935d`: user suggests file copying; assistant identifies registration and unrelated-profile-data risks. This is not permission to bypass the profile boundary.
- `f2ca0ecc`, `ddfa572e`: user confirms Brave is stopped; the next start succeeds.

This is not evidence that ownership checking should be removed. It shows why a failed safety-sensitive operation needs a specific diagnosis and actionable recovery rather than a generic ownership error plus a plausible guess. Success after stopping Brave is consistent with that guess, but does not retrospectively prove the unobserved cause. This bounded sequence was not labelled confirmed redundant verification or audited through final extension installation.

## A4: This investigation reproduced the outcome-selection problem

The first pass inspected real bugs, wrote substantial notes, and marked its task complete. The operator rejected the result as too centered on one failure. The task's completed state and amount of evidence did not establish the actual system-wide outcome.

The subsequent historical comparison was useful, but the operator then pointed to the currently running sessions. That corrected an overly historical sampling focus. Neither correction requires a new review gate. It requires choosing evidence against the user's actual question and not treating the proposed decomposition or completed paperwork as the goal.

## Consequence for the proposal

Prioritize integration and requirement authority, not just fewer test calls or a repaired controller. Remove mandatory method gates and duplicated completion representations. Keep concrete resource/identity protections. Treat partial output as unfinished work to integrate, not an automatic reason for another broad assignment. Preserve the user's actual complex requirements while deleting the machinery that does not help deliver them.
