# Lost-Signal Labeling Protocol

## Purpose

The `lost_signal` label measures whether the tool-output reduction pipeline
discarded information the agent would have needed. A `lost_signal = true` record
is a false positive: the pipeline compacted output but the compaction removed
signal that could have changed agent behavior.

This labeled subset feeds the false-positive rate metric in `evaluate.py`.
Periodic labeling keeps that metric honest as new rules are added or existing
rules drift.

## Sampling Cadence

- **Frequency**: once per week.
- **Sample size**: 100 records drawn uniformly at random from the current
  week's corpus file(s) under `~/.cache/pi/tool-reduction/`.
- **Scope**: only records where `reduction_applied = true`. Passthrough records
  cannot have lost signal by definition -- skip them during sampling.

Suggested sampling command (adjust date as needed):

```bash
python - <<'EOF'
import json, random, pathlib, datetime

corpus = pathlib.Path.home() / ".cache/pi/tool-reduction" / \
    f"corpus-{datetime.date.today().isoformat()}.jsonl"

records = [json.loads(l) for l in corpus.read_text().splitlines() if l.strip()]
reduced = [r for r in records if r.get("reduction_applied")]
sample = random.sample(reduced, min(100, len(reduced)))

out = pathlib.Path("labeled-sample-draft.jsonl")
with out.open("w") as fh:
    for r in sample:
        r["lost_signal"] = None   # labeler fills this in
        r["labeler"] = ""
        r["label_notes"] = None
        fh.write(json.dumps(r) + "\n")
print(f"Wrote {len(sample)} records to {out}")
EOF
```

## Labeler Workflow

For each record in the draft sample file:

1. Open the record in a text editor or the labeling helper script.
2. Display the two fields side by side:
   - `stdout_sample` -- what the agent would have seen **without** reduction
     (the raw output, possibly truncated at 4 KB).
   - `inline_text` -- what the agent actually **received** after reduction.
3. Read both carefully. Ask: "Does the compact form omit anything the agent
   would have acted on?"
4. Set `lost_signal` per the decision rules below.
5. Fill in `labeler` (your name or identifier) and optionally `label_notes`
   to explain borderline calls.

### Decision Rules

Set `lost_signal = true` if and only if the compact form omits **at least one**
of the following categories of content that appears in the raw output:

| Category | Examples |
|----------|---------|
| Error lines | Lines containing `error`, `Error`, `ERROR`, `FAILED`, `FAIL`, exception tracebacks |
| Warning lines | Lines containing `warning`, `Warning`, `WARNING`, `WARN`, `deprecated` |
| Unique identifiers | UUIDs (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`), git commit SHAs (7-40 hex chars), content hashes, image digests |
| File paths in stack traces | Any `at /path/to/file.py:123` or `File "src/foo.py", line 42` style references |
| Failing test names | Specific test function names or test IDs that appear in a failure block |

Set `lost_signal = false` when:
- The compact form preserves all of the above categories even if it omits
  progress lines, boilerplate, or repetitive output.
- The raw output contains none of those categories (purely informational output).
- The record has `reduction_applied = false` -- do not label these.

### Borderline Cases

- **Partial omission**: if the compact form preserves the error message but
  omits the file path from the stack trace, that is `lost_signal = true`.
- **Counters vs. detail**: "3 errors found" is preserved but the individual
  error messages are not -- `lost_signal = true`.
- **Progress/percentage lines**: omitting `[42%]` progress indicators is
  `lost_signal = false` unless the final status line is also gone.
- **Repeated content**: if 20 identical warning lines are compacted to one,
  that is `lost_signal = false` -- the signal (that a warning fired) is
  preserved.

## Output File Schema

The labeled output file is a jsonl file where each line is a corpus record
extended with three additional fields:

```jsonc
{
  // All standard corpus fields:
  "ts": "2026-04-15T10:01:00Z",
  "argv": ["git", "status"],
  "exit_code": 0,
  "bytes_before": 420,
  "bytes_after": 180,
  "rule_id": "git/status",
  "reduction_applied": true,
  "stdout_sample": "...",
  "stderr_sample": "",

  // Labeling fields added by the labeler:
  "lost_signal": false,       // bool -- required; never null in a finished file
  "labeler": "mike",          // str -- labeler identifier
  "label_notes": null         // str | null -- optional explanation
}
```

Finished labeled files are saved to:
`pi/tool-reduction/tests/fixtures/corpus-labeled-sample.jsonl`
(for the standing test fixture) or to a dated file for session-specific runs:
`pi/tool-reduction/tests/fixtures/labeled-YYYY-MM-DD.jsonl`.

## Running the Evaluator

Once labeling is complete, run:

```bash
python pi/tool-reduction/evaluate.py \
    --corpus ~/.cache/pi/tool-reduction/corpus-YYYY-MM-DD.jsonl \
    --labeled pi/tool-reduction/tests/fixtures/labeled-YYYY-MM-DD.jsonl \
    --min-reduction 0.30 \
    --max-fp 0.02
```

Exit 0 means both gates passed. Exit 1 means at least one gate failed -- check
the `ACCEPTANCE GATE` section of the output to see which metric missed its
threshold.

## Reference

Test fixture for automated gate testing:
`pi/tool-reduction/tests/fixtures/corpus-labeled-sample.jsonl`
(20 pre-labeled records, 4 with `lost_signal = true`).

Evaluator source: `pi/tool-reduction/evaluate.py`.
