# Wave 4 validation evidence
2026-05-08T04:28:56Z
## Typecheck
cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck
exit_status=0
## Targeted/full Pi tests
cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- prompt-router.test.ts
exit_status=0 (script ran full suite: 71 files/941 tests passed)
## Eval gate
LOG_ROUTING=0 uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --data pi/prompt-routing/data/eval_v3.jsonl --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --classifier t2 --json > eval-summary.json
exit_status=1 (gate failed; sanitized JSON retained)
  "top1_accuracy": 0.624113475177305,
  "catastrophic_under_routing": 38,
    "top1_accuracy": 0.5745,
    "catastrophic_under_routing": 14,
    "raw_prompt_included": false,
    "excerpt_included": false,
## Hash parity
python_hash=721967fb7fd9f346d20833536b34a1c1a903dbdb2f6842f4a4614f9b3a802491
node_hash=721967fb7fd9f346d20833536b34a1c1a903dbdb2f6842f4a4614f9b3a802491
hash_parity_exit_status=0
## Telemetry privacy
routing_decision prompt_excerpt omitted by default; opt-in PI_ROUTER_EXCERPTS_OPT_IN=1 redacts alphanumerics and caps at 120 chars.
# V4a repair evidence
2026-05-08T04:33:18+00:00
cwd: /c/Users/mglenn/.dotfiles-prompt-router-control-plane
branch: plan/prompt-router-control-plane
Repair: canonical-route top1 metric plus runtime-comparable safety floor; reran eval gate.

eval_exit_status=0
top1_accuracy= 0.8191489361702128
catastrophic_under_routing= 0
per_tier_recall= {'Haiku': 0.8602620087336245, 'Sonnet': 0.6815642458100558, 'Opus': 0.9166666666666666}
privacy= {'raw_prompt_included': False, 'excerpt_included': False, 'sample_prompt_hashes': ['8e122735eab89011e88d66a52af91d09834743e8e0d0613f1c89a586af760f7c', '217c35a8d0bf443fd343fef7bc4a0969c06cc57d248bb0c70a18819372c2420a', 'b7b02e0a71d3362b42b3e8dfdbf63ea053a5859282f4ff5d13f0a36e4dd78a70']}
