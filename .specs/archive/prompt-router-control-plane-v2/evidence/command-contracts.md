# Command contracts and privacy/log-disable preflight

- Timestamp: 2026-05-08T04:00:00Z
- CWD: WORKTREE_ROOT
- Branch: plan/prompt-router-control-plane
- Environment: LOG_ROUTING=0
- Sanitization: paths redacted; no raw private prompts/endpoints/tokens recorded.

## classify.py --help

Command: `LOG_ROUTING=0 uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --help`

Exit: 0

```text
usage: classify.py [-h] [--classifier {t2,ensemble,lgbm,confgate}]
                   [--prompt-file PROMPT_FILE]
                   [prompt ...]

Classify a prompt for Pi prompt routing

positional arguments:
  prompt                Prompt text; omitted to read stdin

options:
  -h, --help            show this help message and exit
  --classifier {t2,ensemble,lgbm,confgate}
                        Classifier mode to use (default: confgate)
  --prompt-file PROMPT_FILE
                        Read the prompt from a UTF-8 text file instead of
                        argv/stdin
```

## evaluate.py --help

Command: `LOG_ROUTING=0 uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --help`

Exit: 0

```text
usage: evaluate.py [-h] [--classifier {t2,ensemble}] [--config CONFIG]
                   [--data DATA] [--sequences SEQUENCES] [--json]

Evaluate v3 prompt router classifier

options:
  -h, --help            show this help message and exit
  --classifier {t2,ensemble}
                        Which classifier to evaluate (default: t2)
  --config CONFIG       Runtime settings JSON path (accepted for V2 parity)
  --data DATA           Evaluation JSONL path
  --sequences SEQUENCES
                        Context sequence JSONL path (accepted for V2 parity)
  --json                Emit metrics JSON to stdout
```

## Required option grep

- `--prompt-file`: present
- `--config`: present
- `--data`: present
- `--sequences`: present
- `--json`: present

## Smoke checks

- `uv run --project pi/prompt-routing python -m py_compile pi/prompt-routing/classify.py pi/prompt-routing/evaluate.py`: exit 0
- `LOG_ROUTING=0 uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --prompt-file .specs/prompt-router-control-plane-v2/evidence/synthetic_simple.txt`: exit 0; JSON route output only, no prompt text echoed
- `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests/test_evaluate.py`: exit 0; 16 passed
- `uv run --project pi/prompt-routing ruff check pi/prompt-routing/classify.py pi/prompt-routing/evaluate.py`: exit 0; all checks passed
