# Redaction scan classification

Matches are implementation/test fixtures or diff evidence, not leaked secrets:

- `pi/extensions/skill-stats.ts` parser literals are source code patterns.
- `pi/tests/skill-stats.test.ts` contains synthetic fixture paths and JSON fields to validate redaction behavior.
- `implementation.diff` repeats the same source/test fixture content.

No private keys, tokens, credentials, raw session prompts, raw tool outputs, or real private absolute paths were added.
