# Amazon Bedrock

The default profile registers `bedrock-mantle` as **Amazon Bedrock** and leaves Pi's native `amazon-bedrock` provider unchanged. Authenticate with `/login bedrock-mantle`.

## Configuration

The Mantle endpoint defaults to `us-east-1`. Set `BEDROCK_MANTLE_REGION` to change it. Authentication uses the provider-scoped credential saved by Pi, then `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_MANTLE_AWS_PROFILE`, `AWS_PROFILE`, explicit AWS access keys, or the normal AWS credential chain. Scoped bearer tokens, access keys, and profiles are kept mutually exclusive. The extension never changes the process AWS environment or stores generated bearer tokens.

Runtime requests use Pi's native Bedrock transport and its provider-scoped AWS region. The legacy fallback is `us-east-2`. Mantle and Runtime regions can therefore differ.

## Routes and commands

Discovery selects the newest supported Fable, Opus, Sonnet, and Haiku releases, plus tiers of the newest supported GPT release. Claude prefers an advertised Mantle route for the selected release and otherwise uses a Runtime inference profile. GPT uses Mantle Responses. A failed request is not replayed on another transport.

- `/bedrock` shows non-secret target configuration, current curated routes, and this month's estimate.
- `/bedrock refresh` refreshes only `bedrock-mantle` inventory through Pi's native provider cache lifecycle.
- `/bedrock reconcile` makes a one-time personal month-to-date snapshot through the payer CUR reader Lambda when no baseline exists. It uses the Mantle AWS profile when configured, otherwise the normal AWS CLI credential chain, and rejects a snapshot that does not match the STS caller ARN.
- `/usage` includes the AWS baseline, later local estimates, and unpriced coverage.

Missing AWS configuration does not affect Codex startup. Inventory refresh failures retain Pi's stored provider catalog.

## Local estimates

`bedrock-usage.jsonl` in the active profile is an append-only, lock-protected observation ledger. It stores request identity, timestamp, session reference, logical model, actual target, transport, region, token counts, and the estimate basis. It does not store credentials, request/response content, headers, or provider payloads. Reloaded session history is not scanned. Stable record IDs prevent the same finalized message from being appended twice.

Prices are accepted only for an exact actual target in Pi 0.85.0's Bedrock catalog, checked against the [AWS Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) on 2026-09-07. Unknown targets remain explicitly unpriced. Recorded estimates are immutable and are not repriced when read. This is a local estimate, not AWS billing reconciliation.

`/bedrock reconcile` resolves the active IAM user with STS, invokes `ccb-per-user-cost-alert` with its side-effect-free `personal-snapshot` action, and writes `bedrock-cost-baseline.json`. The local capture timestamp is the accounting cutoff: `/bedrock`, the footer, and `/usage` add only local records after it. The command refuses to replace an existing baseline because moving the cutoff could silently double-count or omit delayed CUR charges. The report labels the principal, generation time, and latest CUR usage timestamp. CUR delivery is delayed, so the result remains an estimate rather than a request-level audit. Account-wide Cost Explorer values are intentionally prohibited.

The previous `operator-footer-usage.json` remains read-only compatibility input when no AWS baseline exists. Its current-month value appears once as a separately labeled pre-port aggregate baseline. Delete none of these files during rollback unless you intentionally want to reset local history.

Ledger failures never fail or replay an inference. The footer reports an incomplete or unavailable estimate instead. `/context` excludes unpriced Bedrock responses from cost and says how many were excluded.

## Validation and rollback

Offline checks:

```sh
pnpm test bedrock-provider.test.ts bedrock-accounting.test.ts bedrock-reporting.test.ts usage-context-tps.test.ts scheduler-footer.test.ts
pnpm exec tsc --noEmit -p tests/tsconfig.bedrock.json
pnpm exec tsc --noEmit -p tests/tsconfig.usage.json
node scripts/bedrock-smoke.mjs
node scripts/usage-smoke.mjs
```

Live validation is optional and paid. If authorized, make at most one capped-output request for each of Mantle Anthropic, Mantle Responses, and Runtime with an explicit model and region. Offline checks do not prove live AWS compatibility or billing accuracy.

To roll back, remove or disable `extensions/bedrock/` and reload Pi. The native `amazon-bedrock` provider remains available. Keeping the local inventory and ledger is safe and preserves audit context.
