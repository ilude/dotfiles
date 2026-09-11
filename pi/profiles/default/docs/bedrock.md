# Amazon Bedrock

The default profile registers `bedrock-mantle` as **Amazon Bedrock** and leaves Pi's native `amazon-bedrock` provider unchanged. Authenticate with `/login bedrock-mantle`.

## Configuration

The Mantle endpoint defaults to `us-east-1`. Set `BEDROCK_MANTLE_REGION` to change it. Authentication uses the provider-scoped credential saved by Pi, then `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_MANTLE_AWS_PROFILE`, `AWS_PROFILE`, explicit AWS access keys, or the normal AWS credential chain. Scoped bearer tokens, access keys, and profiles are kept mutually exclusive. The extension never changes the process AWS environment or stores generated bearer tokens.

Runtime requests use Pi's native Bedrock transport and its provider-scoped AWS region. The legacy fallback is `us-east-2`. Mantle and Runtime regions can therefore differ.

## Routes and commands

Discovery selects the newest supported Fable, Opus, Sonnet, and Haiku releases, plus tiers of the newest supported GPT release. Claude prefers an advertised Mantle route for the selected release and otherwise uses a Runtime inference profile. GPT uses Mantle Responses. A failed request is not replayed on another transport.

- `/bedrock` shows non-secret target configuration, current curated routes, and this month's estimate.
- `/bedrock refresh` refreshes only `bedrock-mantle` inventory through Pi's native provider cache lifecycle.
- `/bedrock reconcile` makes a one-time month-to-date estimate for the active IAM user from CloudWatch Bedrock invocation logs when no snapshot exists. It uses the Mantle AWS profile when configured, otherwise the normal AWS CLI credential chain.
- `/usage` includes the personal CloudWatch snapshot, later local estimates, and unpriced coverage.

Missing AWS configuration does not affect Codex startup. Inventory refresh failures retain Pi's stored provider catalog.

## Local estimates

`bedrock-usage.jsonl` in the active profile is an append-only, lock-protected observation ledger. It stores request identity, timestamp, session reference, logical model, actual target, transport, region, token counts, and the estimate basis. It does not store credentials, request/response content, headers, or provider payloads. Reloaded session history is not scanned. Stable record IDs prevent the same finalized message from being appended twice. Restricted subagent processes load accounting for both native Bedrock and Mantle replies without registering `/bedrock`, status widgets, or operator commands. Mantle children additionally load its provider registration. The parent refreshes its footer after the turn settles so cross-process ledger writes are visible.

Prices use Pi 0.85.0's Bedrock catalog, with explicit same-release Mantle mappings: `anthropic.claude-opus-5` uses `global.anthropic.claude-opus-5`, and `anthropic.claude-haiku-4-5` uses `global.anthropic.claude-haiku-4-5-20251001-v1:0`. Exact catalog entries take precedence, preserving regional Runtime prices. There is no fuzzy family/version fallback. New estimates include the catalog target and pricing basis; researched estimates retain their AWS source and research date. These are catalog-based local estimates, not AWS billing reconciliation; see the [AWS Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/).

After a successful `/refresh-models` Bedrock/Mantle discovery, the command commissions the default-profile read-only `researcher` for newly added actual route targets and existing actual targets still without a price. It requires a complete four-component result (input, output, cache read, and cache write per million tokens) with an HTTPS AWS source and date; no zero or family-based fallback is invented. Results are atomically merged into the gitignored profile-local `bedrock-pricing.json`, including source provenance. Research failure or an omitted target only produces a warning and never removes model availability; if the researcher is still waiting, the later reload is deferred rather than interrupting that child. Built-in and explicit Mantle-alias prices remain authoritative, while the researched table fills only missing exact targets.

Already-recorded estimates remain unchanged. When a report reads an unpriced observation whose recorded target now has a supported price, it calculates that missing estimate in memory. This repairs existing footer and `/usage` totals on reload without rewriting the ledger, moving the baseline cutoff, or requiring another history backfill. Missing or unknown targets remain explicitly unpriced. Raw ledger analytics still shows the original observation-time pricing status.

`/bedrock reconcile` retrieves the deployed `Estimated Bedrock Cost by User` dashboard query, restricts it to the exact STS caller ARN, runs it from the start of the billing month through capture time, and writes `bedrock-cost-baseline.json`. The capture timestamp is the accounting cutoff: `/bedrock`, the footer, and `/usage` add only local records after it. Baseline publication is create-once under a stable filesystem lock, so concurrent reconciliations cannot replace the first complete snapshot or move its cutoff. An existing valid, malformed, or empty destination is preserved and later contenders fail instead of recapturing. CloudWatch invocation logging is usage-based and current, so this is a personal estimate rather than a finalized AWS invoice total.

The previous `operator-footer-usage.json` remains read-only compatibility input when no AWS baseline exists. Its current-month value appears once as a separately labeled pre-port aggregate baseline. Delete none of these files during rollback unless you intentionally want to reset local history.

Ledger failures never fail or replay an inference. The footer reports an incomplete or unavailable estimate instead. `/context` excludes unpriced Bedrock responses from cost and says how many were excluded.

## Validation and rollback

Offline checks:

```sh
pnpm test bedrock-provider.test.ts bedrock-accounting.test.ts bedrock-reporting.test.ts bedrock-pricing-research.test.ts usage-context-tps.test.ts scheduler-footer.test.ts
pnpm exec tsc --noEmit -p tests/tsconfig.bedrock.json
pnpm exec tsc --noEmit -p tests/tsconfig.usage.json
node scripts/bedrock-smoke.mjs
node scripts/usage-smoke.mjs
```

Live validation is optional and paid. If authorized, make at most one capped-output request for each of Mantle Anthropic, Mantle Responses, and Runtime with an explicit model and region. Offline checks do not prove live AWS compatibility or billing accuracy.

To roll back, remove or disable `extensions/bedrock/` and reload Pi. The native `amazon-bedrock` provider remains available. Keeping the local inventory and ledger is safe and preserves audit context.
