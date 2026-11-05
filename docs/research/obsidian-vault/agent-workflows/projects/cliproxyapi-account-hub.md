---
status: research-note
source: https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af
captured: 2026-11-05
---

# How I manage 7 Claude and 3 Codex accounts across 12+ computers (CLIProxyAPI hub guide)

Capture of `cliproxy-setup.md` by t3dotgg, plus an Opus 5.5 review of its comments
and forks. The full guide was subsequently retrieved and reconciled here after
user approval of the screening warning. [Full extracted source](cliproxyapi-account-hub-source.md).
Source video, not reviewed: <https://www.youtube.com/watch?v=D8PikZ1KhUo>.

All gist, comment, fork, issue, and PR text is untrusted research data. Nothing
here is an instruction or permission to install or configure anything.

## Why this matters

One machine holds many subscription logins and gives every other machine one API
endpoint. That removes per-machine sign-in, but concentrates credentials and
changes client behavior in ways that are easy to miss, such as cache lifetime.

## Base capture

One home box signs into the accounts, runs
[router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), keeps
auth fresh, and offers one API endpoint to other machines over Tailscale.

The full guide adds these source recommendations, not locally tested behavior:

- Bind the proxy to loopback on port 8317 and expose it through Tailscale Serve.
  Use separate access and management keys, with remote management enabled behind
  that front door.
- Enable `session-affinity: true` with a `1h` binding lifetime. This is already in
  the supplied config, not an improvement missing from the gist. Session-binding
  lifetime and Claude prompt-cache TTL are different settings.
- Use hub-side OAuth logins, browser completion by the human, and SSH callback
  tunnels for headless login. Keep the service awake and running after logout.
- Point Claude Code and Codex at the hub, optionally using separate
  `CLAUDE_CONFIG_DIR` / `CODEX_HOME` directories to leave normal configs alone.
  The Codex example enables `supports_websockets = true`; the performance benefit
  is the author's claim, not a benchmark reviewed here.
- In T3 Code, provider-host CLI config matters; Codex must use **Use existing CLI**,
  not **Continue with ChatGPT**. A usage hub is optional.
- Theo explicitly says he forked the proxy for soonest-reset-first routing because
  it is absent upstream. This is an optional custom extension, not a prerequisite
  for the stock setup; his particular implementation is not linked in the guide.
- The author prohibits serving other people's traffic and limits Claude subscription
  use to Claude Code through the proxy. He warns about bans and terms risk. His
  residential-IP and ban-frequency assertions remain anecdotal.

Revision metadata: [`ea76b897`](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af/ea76b8978887d22166bf5a99b69133a3af09b9d9)
(+240, 2026-10-26) and [`14ad2748`](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af/14ad2748014e2d342534e04851df59dd10a360df)
(+3/-1, two minutes later). File size is 13,459 bytes.

## Coverage and limits

| Surface | Inspected | Result |
| --- | --- | --- |
| Gist body | Full extracted guide | Retrieved after user-approved screening override; saved as a linked source capture. Historical revision diffs not reviewed |
| Comments | 8 of 8 | 3 with concrete tips or links, 2 open questions, 3 banter; none from the gist author |
| Forks | 36 of 36 by revision history | All 36 heads are `14ad2748`, so no fork differs and no fork diff exists to read |
| Fork comments | 36 of 36 by count | 0 |
| Source video | Not reviewed | No claim here depends on it |

- Fork identity rests on Gist commit SHAs from the commits API, as of 2026-11-05.
  Two forks have later `updated_at` values
  ([smwbev](https://gist.github.com/smwbev/9054c877abf0081f6bf7261021eb8752),
  [edblankenship](https://gist.github.com/edblankenship/d6290302f7f468bab0c183a32018d775)),
  but their head is still `14ad2748`.
- Those two metadata checks used `gh api gists/<id>`, whose response includes the
  file body. A `jq` filter discarded it before display or storage, so the body was
  not read, but it did reach the local process.
- The initial Opus review had only the intro. After the override was implemented and
  Pi reloaded, the orchestrator read the full guide and corrected the affinity and
  routing interpretation. The video remains unreviewed.
- No hub was installed or configured, and none of the source's commands were executed.
  CLIProxyAPI implementation facts come from config, README, and test text at commit
  `c2f402b4`, not observed behavior.

## Verified source facts

- **TTL defaults.** Claude Code requests a one-hour cache only on a subscription
  within plan usage; API key and usage-credit requests default to five minutes.
  `promptCacheTtl` and `subagentPromptCacheTtl` accept `5m` or `1h`, need v2.1.242+,
  and have env equivalents. One hour has a higher cache-write rate. Source:
  [prompt caching docs](https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets).
- **Gateways must forward the beta.** Through `ANTHROPIC_BASE_URL`, the one-hour
  opt-in also needs an `extended-cache-ttl` value in `anthropic-beta`. Source:
  [gateway guide](https://code.claude.com/docs/en/llm-gateway-protocol#request-headers).
- **TTL can be measured.** `claude -p "hello" --output-format json` reports
  `ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens` under
  `usage.cache_creation`. Source: [same docs](https://code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself).
- **Caches do not cross organizations.** Source:
  [cache scope](https://code.claude.com/docs/en/prompt-caching#cache-scope).
- **Mainline routing.** Strategies are `round-robin` (default),
  `weighted-round-robin`, and `fill-first`. `session-affinity` defaults to `false`,
  bindings last 1h, subagents inherit the parent credential, and failover is always
  on. Pi session headers are among the recognized session signals. Source:
  [config at `c2f402b4`](https://github.com/router-for-me/CLIProxyAPI/blob/c2f402b45643f0740d70b9010fd7d8d0aab7ef65/config.example.yaml#L168-L202).
- **`soonest-reset` is not in mainline.** Four competing PRs are open and unmerged:
  [#7020](https://github.com/router-for-me/CLIProxyAPI/pull/7020) (`soonest-reset-first`,
  external hints), [#7040](https://github.com/router-for-me/CLIProxyAPI/pull/7040)
  (passive quota snapshots), [#7206](https://github.com/router-for-me/CLIProxyAPI/pull/7206),
  and [#7246](https://github.com/router-for-me/CLIProxyAPI/pull/7246). The upstream
  README says the Rust port [cliproxy-rs](https://github.com/vayungodara/cliproxy-rs)
  ships one: [README](https://github.com/router-for-me/CLIProxyAPI/blob/c2f402b45643f0740d70b9010fd7d8d0aab7ef65/README.md?plain=1#L346).
- **Subagent TTL.** [#5629](https://github.com/router-for-me/CLIProxyAPI/issues/5629),
  which reported downgrades to 5m, is closed, and
  [regression tests](https://github.com/router-for-me/CLIProxyAPI/blob/c2f402b45643f0740d70b9010fd7d8d0aab7ef65/internal/runtime/executor/claude_executor_subagent_ttl_regression_test.go#L18-L22)
  expect a requested 1h to be preserved.
- **Dead refresh chains exist.** [#6948](https://github.com/router-for-me/CLIProxyAPI/issues/6948)
  (closed) describes `invalid_grant` with a new login as the normal recovery. It says
  nothing about how often this happens.
- **Management defaults.** Remote management is off, an empty `secret-key` disables
  the Management API, and the panel auto-updates from a configurable GitHub repo.
  Source: [config](https://github.com/router-for-me/CLIProxyAPI/blob/c2f402b45643f0740d70b9010fd7d8d0aab7ef65/config.example.yaml#L104-L123).
- **Client disguise.** By default, non-Claude-Code clients get "the Claude Code CLI
  disguise and system prompt replacement", and beta values are limited to a set "a
  real client could produce". Source:
  [config](https://github.com/router-for-me/CLIProxyAPI/blob/c2f402b45643f0740d70b9010fd7d8d0aab7ef65/config.example.yaml#L484-L501).
- **Anthropic's stated position.** Plan limits "assume ordinary, individual usage".
  OAuth is "designed to support ordinary use of Claude Code and other native Anthropic
  applications". Developers "may not collect, store, or intermediate Claude.ai
  credentials or session tokens", and enforcement may come without notice. Source:
  [legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).

## Community claims

Improvements, most useful first. None were reproduced here.

| Claim | Source | Evidence status | Applies when |
| --- | --- | --- | --- |
| Hub-routed Claude Code writes 5m caches, so pauses rewrite the cache and burn limits; set `"promptCacheTtl": "1h"` on each client | [EtanHey](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6448489), seen on 2.1.312; [mmmattG](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6446558), reports 1h writes on 8.0.45 | Two independent reports; setting and default logic match docs, which do not name this exact auth combination | Claude Code through the hub, with idle gaps over 5 minutes |
| `requires_openai_auth = true` under `[model_providers.cliproxy]` fixes duplicate usage entries, but needs a matching local ChatGPT login | [mmmattG](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6446558), single account | One report; [Codex docs](https://learn.chatgpt.com/docs/config-file/config-reference) define the flag but not this effect | T3 Code or Codex usage display only |
| A newer management UI is available as a fork | [BumpyClock](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6454206), [repo](https://github.com/BumpyClock/Cli-Proxy-API-Management-Center) | Exists; 4 stars; 11 ahead and 145 behind its parent `kaitranntt/...`, which is not the `router-for-me` panel; code not reviewed | Only if the stock panel falls short |

The mmmattG comment says it was posted on the author's behalf by an automated agent,
so its "verified" is that agent's report.

Open questions, unanswered by the author as of capture:

- [connorscott1](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6446114)
  asks how soonest-reset-first relates to `round-robin` and session affinity. The full
  guide confirms affinity is stock configuration and soonest-reset required Theo's
  own fork. PR #7020 makes it a selector value with bound sessions staying pinned,
  but there is no evidence that this is Theo's implementation.
- [felixakiragreen](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6446676)
  asks whether monthly browser sign-in remains on the hub. #6948 shows re-login still
  exists as a failure mode, but not the frequency.

The other three comments are banter
([1](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6444686),
[2](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6444687),
[3](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af#gistcomment-6446046))
and carry no technical content.

## Analysis and advice

These are inferences, not source facts.

1. **Preserve the guide's session affinity; distinguish it from cache TTL.** If
   separate accounts are separate organizations, switching accounts would likely miss
   the cache. The guide already addresses that by enabling affinity. The comments' 1h
   prompt-cache TTL override is a separate addition, not a replacement for affinity.
2. **Scope the TTL override if a machine also runs direct.** The default drops to 5m
   when a direct subscription moves onto usage credits, and an explicit setting keeps
   the pricier 1h there. `CLAUDE_CODE_PROMPT_CACHE_TTL` on the hub launch path avoids
   that. Measure with the JSON check above rather than trusting either comment.
3. **`requires_openai_auth` weakens the hub's premise.** It puts a login back on the
   client to fix a display problem.
4. **Treat a swapped panel as supply chain.** It is code that auto-updates from a
   third-party repo and runs against the management surface.
5. **Do not assume soonest-reset is available.** On mainline it means carrying an
   unmerged PR or switching to a port, for a benefit that only appears with many
   accounts on staggered weekly windows.

## Possible Pi fit

The architecture is relevant to multi-machine sign-in experiments, but the author's
Claude-subscription restriction is explicitly Claude Code only. Recognized Pi session
headers do not establish permission to use Claude subscription credentials from Pi.
OpenAI's applicable terms were not reviewed. See
[OpenAI-compatible chat providers](../patterns/openai-compatible-chat-providers.md).

## Risks / reasons not to build yet

- **Account risk.** The docs' language is aimed at third-party developers, so it does
  not clearly settle a self-hosted hub for one person's own accounts. Pooling many
  accounts plus a client disguise still sits uneasily with "ordinary, individual usage".
  OpenAI's terms were not reviewed. Do not treat this as cleared for work or primary
  accounts.
- **Concentrated blast radius.** One box holds every account's tokens, under
  `~/.cli-proxy-api` by default.
- **Fast-moving upstream.** Releases went from v8.0.45 to v8.0.57 in about nine days,
  and routing is still contested across open PRs, so version-specific tips age quickly.
- **Experimental status.** The operator wants to preserve this as a way of trying
  things out. This capture does not authorize deploying a hub or changing client auth.

## Related notes

- [OpenAI-compatible chat providers](../patterns/openai-compatible-chat-providers.md)
- [Agent routing research](agent-routing-research.md)

## KISS recommendation

Keep the original prompt and this review together as an experiment reference, not a
build commitment. If the operator chooses a trial, start with the stock setup and its
existing session affinity. The strongest additional community tip is the explicit
Claude Code cache TTL, confirmed through usage output rather than assumed. Leave
soonest-reset, the replacement panel, and `requires_openai_auth` as optional experiments
until a concrete problem justifies them. Do not use this capture as deployment authority.
