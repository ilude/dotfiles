---
created: 2026-11-14
status: ready
completed: null
---

# Incremental native web search and retrieval consolidation

## Goal and scope

Reach the full web-tools consolidation goal through usable increments, not a
smaller endpoint. Keep `web_search` for discovery and `web_fetch` for one-shot
known-URL retrieval/extraction. Bring the suitable capabilities of the existing
HTTP, Trawl, Jina, Firecrawl and Browserbase mechanisms behind those native tools.

### User requirements and settled constraints

- Smaller delivery steps are welcome; incremental delivery must not silently
  remove later capabilities from the goal.
- Try suitable direct/local and existing self-hosted/public-reader retrieval
  mechanisms before consuming Firecrawl or Browserbase allowances. Keep SearXNG
  and the existing configured search fallbacks ahead of new cloud search routes.
- Both Browserbase and Firecrawl accounts are free-tier. Keep alternatives usable
  when those providers are exhausted or unavailable. No automatic upgrade,
  premium features or paid overage. Do not invent quota amounts or reset times.
- Preserve explicit provider/engine requests, requested filters, private/local
  acquisition boundaries, local authenticated browser state and role permissions.
- Normal setup/usage documentation is legitimate technical guidance when its
  actual contents are not suspicious. Imperatives alone are not prompt injection;
  do not add blanket domain trust or execute retrieved instructions incidentally.
- Reuse credentials, provider clients, deadlines, failure handling, screening and
  result metadata where they have real consumers. Do not create another daemon,
  database, cache, credential store or general orchestration framework by default.
- Retain the working optional gateway initially. Consolidation does not establish
  that its routing, browser isolation or running deployment can be removed.

### Intended final capabilities

These describe the complete proposed path, not requirements for the first slice:

- Native Firecrawl and Browserbase search and one-shot retrieval where supported
  by their APIs and the free accounts; static and rendered reads remain distinct.
- Capability-aware, direct-first automatic fallback with bounded acquisition and
  quota-aware provider availability, plus strict explicit selection.
- Web/image/news search where supported, with typed source/provenance fields.
- One-page structured extraction when explicitly requested and supported, without
  making ordinary reads invoke LLM extraction or ordinary searches scrape hits.
- Consistent operator presentation and skills that use the native entry points
  while keeping interactive/local-authenticated browsing and broader collection
  operations explicit.

Unsupported free-plan capabilities must produce an accurate limitation and leave
other work usable, not prompt an upgrade or quietly drop the overall goal.
Interactive browser actions, login/profile migration, map/crawl jobs, submissions
and recurring collection are not automatic search/fetch fallbacks.

### Authorization

This request authorizes collaborative planning with Opus high, not implementation,
account changes, deployments or Git mutations. Earlier authorization to publish
appropriate completed repository/submodule changes remains separate and is not
revoked. Execution of this new plan requires implementation authorization.
Invoking `/do-it` authorizes its implementation, local task worktrees, commits and
integration unless restricted by the user. No Firecrawl/Browserbase credits or
new browser sessions have been used for this planning work.

## Fresh-context handoff

Paths are relative to the dotfiles repository unless explicitly qualified.
Task code shortnames such as `index.ts`, `fetch.js`, `credentials.ts`, `screen.ts`
and proposed provider modules are under `pi/profiles/default/extensions/web-tools/`.
Runtime `lib/...` and `tests/...` references are relative to
`pi/profiles/default/`, not the repository root.

- Root/target: `C:/Users/mglenn/.dotfiles`, branch `main`, observed `54f67341` on
  2026-11-14. Recheck current state; preserve concurrent and retirement changes.
- Runtime owner: `pi/profiles/default/extensions/web-tools/` and associated profile
  tests/skills. Planning profile verified as `default`; intended execution profile
  is also `default`. Do not inspect, edit or test Pi legacy.
- Read root, `pi/AGENTS.md`, default-profile instructions, the `pi-extension` skill
  and applicable upstream extension docs before implementation. Use pnpm only.
- Research: `docs/research/obsidian-vault/agent-workflows/patterns/unified-web-fetch-2026-11.md`
  is in an independent vault repository. It is evidence, not implementation policy.
- Gateway application currently lives in
  `modules/homelab-infra/services/web-fetch-gateway/`. Its source-home decision and
  the authorized submodule removal/Forgejo archival are separate retirement work.
  Do not make an unchanged gateway-source transfer require this entire refactor,
  or make independent native-tool changes wait for a deployment.
- BWS remains authoritative; workstation locator ownership is `config/bws/`.
  Preserve current ignored locator/private artifacts and unrelated source edits.
  Keep caller-local bootstrap/locator data out of task commits; do not copy secrets
  into the execution worktree or override Git exclusions.
- No task branch/worktree has been created. Record actual execution coordinates
  before implementation; do not infer them from this planning checkout.

## Verified starting behavior and evidence limits

- `index.ts` registers both native tools. Search uses SearXNG → Serper → Brave;
  only selected SearXNG rate-limit cases fall through. Transport/timeout/5xx errors
  throw. A shared ten-second signal covers requests and lazy credential lookups.
- Fetch uses optional gateway direct/Trawl/Jina retrieval, with local recovery on
  gateway availability failures. Gateway acquisition/configuration errors do not
  trigger local recovery. Explicit backends stay strict.
- `fetch.js` can use public Jina while the native structured result reports `local`.
  The local helper's text comment is not adequate machine-readable provenance.
- Search describes screening as nonblocking, but its finish path can throw
  `FlaggedContentError`, and an existing test deliberately asserts blocking.
  This is a description/runtime mismatch, not permission to discard the current
  policy. Fetch already has a response-specific UI approval path. Screening
  decisions must not become acquisition failures or trigger provider switching.
- Existing `credentials.ts` uses environment overrides and BWS secret IDs; the
  Firecrawl/Browserbase skills use the workstation locator and exact secret names.
  Reuse ownership and preserve existing working consumers when consolidating.
- Provider support in upstream documentation is not evidence that arbitrary sites
  or every feature work on these accounts. Browserbase static Fetch does not run
  JavaScript; its documented Free plan separates search/fetch/browser allowances
  and lists no free overage. Actual account usage/entitlements were not queried.
- Existing checks are Vitest/typecheck in `pi/profiles/default/package.json`.
  `tests/web-tools-live.test.ts` is opt-in with `PI_WEB_LIVE`; it is not a mandatory
  live-provider/paid acceptance gate.
- `lib/browser-cdp-transport.ts` already exports a low-level `CdpConnection` using
  Node WebSocket with cancellation and bounded commands. Its higher-level
  `BrowserCdpTransport` is deliberately local/ownership-specific. The `browse` CLI
  was not found on this planning process's PATH. A new CDP package is not a proven
  prerequisite; investigate reuse without weakening the local Brave boundary.
- Official Browserbase pricing Markdown was checked on 2026-11-14: Free lists
  separate search/fetch/browser allowances and overage as N/A, while premium
  search modes/proxies have different terms. These are documented plan terms,
  not a query of this account's remaining allowance. Do not infer that every
  provider default or extraction mode is included.

## Agreed screening contract

On 2026-11-14 the operator approved using the same system for search and fetch:
when screening flags returned content, offer the existing response-specific
one-shot reading approval rather than make search fail without that option.
Approval permits reading that response, not executing its instructions or trusting
future responses. Without approval or an available approval UI, retain the current
fetch blocking behavior. Preserve existing unavailable-review handling.

Apply this after acquisition, consistently to model-visible content. A screening
flag never causes another provider attempt. Normal setup/usage documentation is
not an attack merely because it contains instructions. Correct search's current
description/runtime mismatch under this agreed policy; no domain allowlist.
This is an accepted implementation requirement, not a claim that code changed.

## Result sufficiency and acquisition fallback

The operator settled partial-result handling on 2026-11-14: return retrieved data
with honest quality, truncation and provenance information. The requesting agent
decides whether it is enough or another request is needed. Do not automatically
consume more cloud allowance just because returned data is partial, shortened or
might be improved. A legitimate empty search result is also distinct from failure.

Automatic fallback addresses acquisition failures, not inferred task sufficiency:
transport failures, request timeouts, provider outages, challenges or empty/
unreadable extraction can proceed to another eligible mechanism. Skip unavailable,
unsupported or quota-exhausted capabilities and retain concrete failure metadata.
Never use this to retry cancellation or screening, override explicit selection,
export private/local targets or acquire authentication. Definitive target 404/410
from the existing acquisition path does not justify speculative cloud spending.

Retain fetch's existing 60-second acquisition limit. Allocate smaller attempt and
credential windows inside that bound without prematurely cutting off the existing
gateway chain just to reserve cloud time. Search's planned 20-second overall bound
replaces the current ten-second bottleneck; per-attempt caps leave time for
fallbacks. These are acquisition bounds, not screening/approval timeouts or a
promise every provider will fit into every call. No unbounded credential window.

Ordinary reads request only the necessary Markdown/text output. Use Firecrawl's
basic proxy mode rather than incidental enhanced retries and no Browserbase paid
proxy/Verified/deep modes. LLM formats remain explicit requests within supported
free-plan entitlements. This follows the settled no-premium/no-overage constraint.

## Agreed provider caching

On 2026-11-14 the operator accepted cached pages rather than requiring fresh pages
by default. Allow provider caching, including Firecrawl's documented default
accepted cache age of two days. Do not force a fresh scrape or introduce a local
page cache. Report cache/freshness metadata when the provider supplies it; do not
invent cache-hit status or present acquisition time as proof of content freshness.

Routine module names, helper signatures and equivalent implementation details
remain executor-owned. Keep acquisition bounded overall, including lazy credential
resolution, with smaller request windows. Do not start fallback credential lookups
on every successful primary search merely to hide cold-start time.

Do not add new role approval gates, speculative quota registries, a fixed
one-cloud-attempt limit or lockouts that require process reload. Honor reported
retry/reset information; otherwise use bounded in-memory backoff without claiming
an invented quota-reset time. Keep explicit provider selection strict. A hard
one-attempt limit would prevent trying another working cloud mechanism after a
charged failure; conserving free allowance does not require that restriction.

No consequential user decisions remain open. Ask only if implementation evidence
requires changing the settled contract; routine equivalent details remain local.

## Incremental tasks

The path incorporates two Opus high consultations and the operator's subsequent
decisions. These are full-goal delivery boundaries, not implementation authorization
or a shortened scope.

- [ ] **W01: Truthful fetch provenance**
  - Depends on: none. Files: `fetch.js`, `index.ts`, relevant web-tools tests.
  - Return machine-readable acquisition source/final URL from local retrieval,
    including Jina recovery, while preserving human-readable helper compatibility
    where existing callers need it. Carry useful existing gateway attempt/truncation
    fields without imposing one result type on search and fetch.
  - Establish operation-local modules as needed for later disjoint ownership;
    `index.ts` retains registration/integration ownership. Share only the small
    error/deadline/metadata helpers consumed by real paths, not a provider framework.
  - Done when: native output distinguishes actual local retrieval from Jina and
    retains existing private/local routing, bounds and cancellation behavior.

- [ ] **W02: Reliable existing search fallback**
  - Depends on: the search failure/deadline contract above, not a new provider.
  - Files: search paths in `index.ts` or proposed operation-local module; current
    credentials helper and search tests only as needed.
  - Give automatic fallbacks usable time and classify transport/rate/quota errors
    explicitly. Add strict selection of the existing search providers here, not
    as a later competing interface. Validate SearXNG-only `engines` combinations.
    Preserve legitimate empty/partial results and filters. Keep key lookup lazy
    and bounded separately from network attempts within the overall deadline.
    Do not change screening incidentally.
  - Done when: finite offline cases exercise the agreed failure/timeout transitions
    and describe the selected backend/fallback reason accurately.

- [ ] **W03: Apply the shared reading-approval system to search**
  - Depends on: no unresolved policy; the screening contract above is approved.
    Files: `screen.ts`, operation finish/UI paths and their existing tests.
  - Add fetch's response-specific reading approval to search and correct its
    description. Preserve fetch's behavior and legitimate documentation distinction.
  - Done when: flagged/unavailable/ordinary-documentation/cancellation outcomes
    match the selected contract, with screening outside acquisition fallback.

- [ ] **W04: Native Firecrawl one-page retrieval**
  - Depends on: W01's provenance result; use the agreed cost/caching semantics.
  - Files: proposed Firecrawl provider module, `credentials.ts`, `index.ts`, focused
    provider/tool tests. Generalize only credential/request helpers this needs.
  - Add a strict explicit native backend with bounded requests, target/result
    validation, existing screening and real backend metadata. Keep auto unchanged
    in this increment; no gateway API or running-service change is needed.
  - Done when: explicit retrieval and quota/unavailable/cancel paths work through
    the native tool using fixtures, without extra formats or paid options.

- [ ] **W05: Native Firecrawl search**
  - Depends on: W04's Firecrawl credential/client and W02's search contract.
  - Reuse that client for explicit native search, retaining query/filter semantics
    and discovery-only behavior. Do not implicitly scrape each result.
  - Done when: native search returns normalized source results and handles the
    actual shared Firecrawl allowance without a second credential mechanism.

- [ ] **W06: Native Browserbase search**
  - Depends on: W02's search contract. Can proceed independently of W04/W05 after
    common credential/error interfaces are established; avoid overlapping edits.
  - Add a bounded explicit search adapter using the account's included modes;
    do not silently enable premium/deep search modes. Keep the client/credential
    interface usable by static Fetch and rendered-session creation.
  - Done when: native search provides truthful results, capability errors and
    scoped quota/rate handling without browser-session creation.

- [ ] **W07: Native Browserbase static retrieval**
  - Depends on: W01's provenance and W06's Browserbase credential/client.
  - Add bounded explicit Fetch support, distinguish raw/static extraction from
    rendering, and honor supported free-plan output modes.
  - Done when: the native tool can select this backend accurately without
    pretending it executes JavaScript or borrowing authenticated contexts.

- [ ] **W08: Native Browserbase read-only rendered retrieval**
  - Depends on: W01 and W06's client/credential interface. May run alongside W07
    with distinct provider modules/tests and one integration owner.
  - Use a fresh owned public-page session for bounded navigation/rendered content
    acquisition, not an autonomous interactive task. Preserve session cleanup,
    role boundaries and the account's available browser allowance. No contexts,
    login, clicks, typing, proxies, downloads or user-profile imports incidentally.
  - Inspect reuse of low-level `CdpConnection` and the existing Readability process
    before proposing a CDP dependency. Do not widen the local-only Brave transport
    or build another browser harness. Ask before installing a necessary new package.
  - Done when: rendered retrieval reports its capability/provenance and releases
    only its owned session on success, failure and cancellation, with useful
    fallback on unavailable allowance.

Automatic routing is delivered in independent small increments, not one final
switch after every provider is implemented. Each uses the agreed escalation
contract, eligible capabilities and actual allowance meters. Introduce shared
quota state with W05's second Firecrawl operation, not an unused registry in W01.
Keep existing mechanisms first, avoid repeated attempts, preserve useful output,
and never retry a screening decision as an acquisition failure.

- [ ] **W09a: Automatic Firecrawl retrieval fallback**
  - Depends on: W04 and the agreed escalation/deadline contract.
  - Append suitable Firecrawl retrieval after the existing eligible mechanisms.
  - Done when: unavailable/exhausted Firecrawl does not make ordinary fetch fail,
    and eligible acquisition failures can reach it within the overall budget.

- [ ] **W09b: Automatic Firecrawl search fallback**
  - Depends on: W02, W05 and the agreed search escalation/deadline contract.
  - Keep SearXNG and existing configured fallbacks first. Share the real Firecrawl
    allowance with scrape; preserve empty results and strict explicit selection.
  - Done when: search can use Firecrawl when earlier providers cannot satisfy the
    request, without adding scraping, premium options or new credential lookup.

- [ ] **W09c: Automatic Browserbase search fallback**
  - Depends on: W06, W09b and the search routing contract.
  - Add eligible included search capabilities after earlier suitable providers.
  - Done when: this adapter's unavailable quota does not disable Browserbase
    static Fetch or browser minutes, or force search to stop unnecessarily.

- [ ] **W09d: Automatic Browserbase static retrieval fallback**
  - Depends on: W07 and the agreed retrieval capability/deadline contract.
  - Make static Fetch eligible for appropriate static requests without pretending
    it renders JavaScript. Choose its ordered position deliberately, not from an
    unsupported assertion that all free services have equal cost or coverage.
  - Done when: static requests can use the adapter where suitable, while requests
    requiring rendering skip it rather than consume an irrelevant call.

- [ ] **W09e: Automatic Browserbase rendered retrieval fallback**
  - Depends on: W08 and the agreed retrieval capability/deadline contract.
  - Add bounded public rendered acquisition after suitable earlier mechanisms.
  - Done when: an eligible request can reach rendering without borrowing login
    state, leaking sessions, or making either cloud account mandatory.

- [ ] **W10a: Native SearXNG image/news discovery and result shapes**
  - Depends on: W02's search contract, not a cloud provider implementation.
  - Establish explicit query-kind and typed source/provenance fields with the
    existing SearXNG image/news categories. Publish these shapes for other clients.
  - Done when: image/news discovery can use the existing primary without spending
    new cloud allowance, preserving filters and distinguishing source/image URLs.

- [ ] **W10b: Serper image/news discovery**
  - Depends on: W10a's result/capability contract.
  - Adapt Serper's appropriate endpoints under existing credentials/allowance.
    Add Brave vertical support only where the current account actually includes it.
  - Done when: existing eligible search fallbacks retain the requested result kind;
    unsupported capabilities do not silently downgrade to web results.

- [ ] **W10c: Cloud image/news discovery**
  - Depends on: W05/W06 clients and W10a's result/capability contract.
  - Map supported Firecrawl/Browserbase source kinds into the same native contract,
    retaining cheaper eligible existing providers first and no implicit scraping.
  - Done when: supported cloud verticals work through native search and unsupported
    ones are skipped/reported accurately rather than simulated by browser search.

- [ ] **W11a: Explicit Firecrawl single-page structured extraction**
  - Depends on: W04's fetch client and agreed extraction request semantics.
  - Establish explicit schema-based extraction and valid bounded structured output;
    screen untrusted field content without rewriting the requested data.
  - Done when: requested included extraction produces schema-shaped results and
    truthful provenance, while ordinary reads remain plain Markdown/text.

- [ ] **W11b: Browserbase single-page structured extraction**
  - Depends on: W07 and W11a's structured-result contract.
  - Reuse the supported native JSON/schema capability within actual free-plan
    entitlements and its correct allowance meter, not a session/agent substitute.
  - Done when: supported requests work and unsupported/over-limit requests leave
    ordinary retrieval usable without adding LLM work to plain reads.

- [ ] **W12: Native-tool guidance, finite checks and closeout**
  - Depends on: W01–W08, W09a–e, W10a–c and W11a–b.
  - Consolidate relevant web-tools/provider skills and presentation to reflect
    actual final capabilities and preserved browser boundaries. Each earlier
    increment must update its own tool description and material CHANGELOG entry
    when it lands; do not leave known incorrect descriptions until this task.
    Keep dated live observations distinct from fixture checks and routing policy.
  - Run the finite agreed checks below and resolve demonstrated task defects.
  - Done when: the planned native code capabilities and agreed checks are complete,
    account/live-test limitations are reported honestly, the spec is archived and
    authorized local integration/cleanup is actually complete. If an external
    prerequisite prevents an implementation task, leave that task blocked and
    unchecked rather than claim the full goal complete by documenting its omission.

Early W01–W03 deliver improvements to existing mechanisms. W04 onward adds usable
vertical capabilities, with each automatic adapter enabled once its own explicit
path and agreed routing contract exist. W10a can proceed after W02 independently
of cloud delivery; W10b can follow while cloud adapters are built. Browserbase
rendering and structured extraction do not block earlier useful increments.

Parallel candidates: W02/W03 and W04 after shared operation seams are established;
W06 beside Firecrawl work; W07/W08 with distinct adapter/test ownership; W10a/b
alongside provider delivery. A single integration owner handles shared registration
and schema edits. Dependencies above, not phase ordering alone, determine readiness.

## Execution and validation contract

- Before delegating execution, consult Strategist unless the user explicitly
  requests a single-agent handoff. Assign at most one named task per subagent and
  preserve disjoint write ownership. No mandatory extra reviewer sequence.
- Increments are usable delivery boundaries, not separate approval gates. Once
  implementation is authorized, continue through ready tasks without stopping at
  each phase or treating the first slice as completion of the full goal.
- Continue independent approved work around blockers. Adapt equivalent technical
  mechanisms, but ask before changing settled behavior, scope or acceptance.
- Use existing tests with fixtures/local HTTP/model boundaries for changed paths.
  No new benchmark framework, paid integration gate or production deployment is
  required. Live account/site behavior remains an honest verification limit.
- Finite baseline/final checks, cwd `pi/profiles/default`: `pnpm typecheck` and
  `pnpm exec vitest run tests/web-tools.test.ts tests/web-tools-credentials.test.ts tests/web-tools-curl.test.ts tests/web-tools-gateway.test.ts tests/web-tools-gateway-transport.test.ts`, plus new task-owned focused provider tests.
- Use the available Node 26.13.0/pnpm 11.23.0 toolchain where needed; verify current
  executable paths at execution time. Do not reinstall working dependencies or
  use Bun. Treat unrelated concurrent failures separately from task defects.
- Keep task state/evidence current. After implementation and agreed checks pass,
  archive this whole spec to `.specs/archive/web-tools-consolidation/`, repair links
  and commit it with implementation on the task branch. Do not archive unfinished
  implementation or claim intended live behavior was tested.
- For authorized `/do-it` execution, dispatch Integrator from the recorded target
  checkout for local integration/completion metadata/clean worktree cleanup. For
  direct/run-here execution, communication and closeout remain parent-owned.
  Preserve explicit no-merge restrictions. Published history is never rewritten.
- Completion reporting must distinguish 🟢 completed, 🔴 user input/merge blocked,
  🔵 merge intentionally skipped and 🟡 cleanup pending, with reason/action first
  when blocked. Planning readiness is not implementation completion.

## Current handoff

- Status: ready; no implementation started.
- Completed: current code/tests/provider-doc reconnaissance and two Opus high
  design consultations. The full path retains Browserbase, automatic fallback,
  image/news and structured extraction rather than making explicit Firecrawl the
  endpoint. Advice was integrated selectively, not treated as implementation authority.
- Settled since consultation: both tools will use fetch's existing one-shot
  reading-approval system for screened content; W03's policy is no longer blocked.
- Settled result handling: the requesting agent judges sufficiency and decides
  whether another request is needed; partial data does not itself trigger more
  cloud requests. Return honest quality/truncation/provenance information.
- Settled caching: provider-cached pages are allowed; do not require fresh reads
  by default. Report only known cache/freshness metadata.
- Next on implementation authorization: begin W01 and the ready early tasks;
  consult Strategist before delegation. Use runtime-prepared T3 worktree ownership
  where applicable rather than creating a child's checkout in the shell.
- Blocking readiness: none. Numerical attempt caps and equivalent module details
  remain executor-owned within the specified overall acquisition bounds.
- Separate retirement blocker: gateway application source-home decision. This does
  not prevent planning or independent native-tool implementation after authorization.
