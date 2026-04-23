Generate 1000 unique training examples. Each row is one line of JSON.

Format:
{"prompt":"<developer question>","model_tier":"low|medium|high","effort":"none|low|medium|high"}

Rules:
- Developer-facing questions only, 30-500 chars.
- ASCII, no model names, no real credentials.
- Self-contained, include short code snippets inline.
- Max 3 rows share the same 30-char prefix.
- 15+ distinct domains.
- Opus/high max 10% of batch.

Emit JSONL only. 1000 lines, no preamble.