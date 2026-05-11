# F5 archive preflight

Date: 2026-05-11

## Result

PASS

## Commands run

| Command | CWD | Exit | Notes |
|---|---:|---:|---|
| `git status --short -- .specs/archive/prompt-router-v1 pi/extensions/prompt-router.ts pi/lib/prompt-router pi/prompt-routing pi/tests` | repo root | 0 | Recorded prompt-router-relevant changed/untracked files. Unrelated pre-existing worktree changes outside this scope were not modified. |
| `grep -RInE '<secret/sentinel patterns>' .specs/archive/prompt-router-v1/evidence pi/tests/prompt-router.test.ts pi/tests/helpers/transcript-fixtures.ts pi/tests/transcript-fixtures.test.ts pi/tests/transcript-integration.test.ts pi/tests/transcript-log.test.ts pi/prompt-routing/data/context_sequences_v1.jsonl` | repo root | 0 | No real secrets found. Matches were limited to documented secret-scan terms in evidence and known synthetic redaction fixture literals in transcript tests. |
| `test -f .specs/archive/prompt-router-v1/plan.md && test -d .specs/archive/prompt-router-v1/evidence && test -d .specs/archive/prompt-router-v1/review-1` | repo root | 0 | Archive destination contains plan, evidence, and review artifacts. |
| `test ! -e .specs/prompt-router-v1` | repo root | 0 | Active plan directory absent after archive move; user approved proceeding with archive. |

## Git status summary

Prompt-router relevant status included modified router/runtime/test/docs files and untracked archive/evidence/new helper docs/tests, including:

- `.specs/archive/prompt-router-v1/`
- `pi/extensions/prompt-router.ts`
- `pi/lib/prompt-router/route-decision.ts`
- `pi/lib/prompt-router/route-profile.ts`
- `pi/prompt-routing/evaluate.py`
- `pi/prompt-routing/scripts/shadow_eval.py`
- `pi/prompt-routing/data/context_sequences_v1.jsonl`
- `pi/prompt-routing/docs/operator-handoff.md`
- `pi/prompt-routing/tests/test_evaluate.py`
- `pi/prompt-routing/tests/test_router_logging_privacy.py`
- `pi/tests/prompt-router.test.ts`
- transcript fixture/log integration tests updated for canonical route vocabulary

## Secret/sentinel scan notes

- Evidence matches were references to the secret-scan policy text itself, not credentials.
- Transcript test matches were intentionally fake redaction fixtures such as `AKIAABCDEFGHIJKLMNOP`, `sk-...`, and `ghp_...`; the tests assert those values are redacted from logs.
- No `.env` files were read or modified.

## Archive verification

- Archive path: `.specs/archive/prompt-router-v1/`
- Plan/evidence/review artifacts are present in the archive path.
- F5 is now complete.
