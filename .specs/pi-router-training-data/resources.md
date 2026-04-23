# Training Data Resources

## Status

Existing corpus: ~3,812 rows (train/dev/eval splits) + 1,982 synthetic (unmerged).
Target: improve classifier accuracy across all 12 (tier, effort) cells, especially thin ones.

---

## Public Datasets

### Real developer questions

| Dataset | Size | Difficulty range | Download | Notes |
|---------|------|-----------------|----------|-------|
| Omarrran/StackPulse_778K | 778K | wide | HuggingFace | Filter: `has_code=True`, `score>=1`, `answer_count>=1`. Implicit difficulty proxy via votes. Heavy on hard end. |
| lmsys/lmsys-chat-1m | 1M | general | HuggingFace | Real user/AI conversations. Good for real intent distribution. |
| allenai/WildChat-4.8M | 3.2M | general | HuggingFace | Real ChatGPT conversations, safety-filtered. Closest to live traffic distribution. |

### Coding tasks

| Dataset | Size | Download | Notes |
|---------|------|----------|-------|
| nvidia/OpenCodeInstruct | 5M | HuggingFace | Diverse coding prompts. `domain: generic\|algorithmic` gives difficulty signal. 6.4GB. |
| inclusionAI/Ling-Coder-SFT | 4.48M | HuggingFace | 20 languages, English + Chinese. License TBD -- check before use. |
| microsoft/rStar-Coder | 1M | HuggingFace | LiveCodeBench + HumanEval + MBPP targeted. Good difficulty proxy. |
| OpenCoder/opc-sft-stage2 | 436K | HuggingFace | Clean ablation dataset from OpenCoder paper. |
| m-a-p/CodeFeedback-Filtered-Instruction | 157K | HuggingFace | Filtered Magicoder + ShareGPT + Evol-Instruct. Small but high quality. |

### Function calling / tool use

| Dataset | Size | Download | Notes |
|---------|------|----------|-------|
| Salesforce/xlam-function-calling-60k | 60K | HuggingFace | Verifiable function-calling data. If prompt mentions tools/APIs, route up. |
| THUDM/ComplexFuncBench | 1K | GitHub | Complex multi-step function calling. Good for Sonnet+ detection signals. |
| gorilla-llm/Berkeley-Function-Calling-Leaderboard | ~2K | HuggingFace | AST-based evaluation. Diverse languages. |

### Benchmarks (anchors for specific signals)

| Dataset | Size | What it signals | Download |
|---------|------|---------------|----------|
| SWE-bench / SWE-bench Verified | ~3K GitHub issues | Needs repo-level agentic workflow = Opus/high | HuggingFace / GitHub |
| HumanEval | 164 | Clean code synthesis (can this be solved directly?) | OpenAI |
| APPS | 5K | Broader difficulty than HumanEval | GitHub |
| LiveCodeBench | 713-1055 problems | Contamination-free coding over time | GitHub |
| nvidia/OpenCodeReasoning | 735K | Competitive programming reasoning | HuggingFace |

### Preference / code quality

| Dataset | Size | Download | Notes |
|---------|------|----------|-------|
| HelpSteer3 | 40.5K | HuggingFace | Multi-attribute helpfulness. Code, STEM, General. |
| Code-Preference-Pairs | 53K | HuggingFace | Correct vs buggy code. Good for "does this need debugging?" signal. |

### Survey reference

- [mlabonne/llm-datasets](https://github.com/mlabonne/llm-datasets) (4.4K stars) -- curated list of post-training datasets
- [arXiv:2503.14023](https://arxiv.org/abs/2503.14023) -- survey on synthetic data generation for text and code

---

## Solution Approaches

### Approach 1: Label real data (recommended first step)

**What**: Download StackOverflow 778K subset, filter for quality signals, label with heuristic rules.

**Why**: Real distribution from the start. Avoids synthetic quality gap entirely.

**How**:
1. Download `stackoverflow_with_code.csv` (595K rows)
2. Filter: `score >= 1`, `answer_count >= 1`, `body_length < 2000` (drop verbose debugging dumps)
3. Label with:
   - Short (`< 30 tokens`) + single code snippet -> `Haiku/low`
   - Mentions tools, APIs, webhooks -> `Sonnet/low+`
   - Architecture keywords (see `adjudicate_borderline.py:ARCH_KEYWORDS`) -> `Sonnet/Opus`
   - Cross-repository or multi-file context -> `Opus/high`
4. Run adjudication queue (see `tools/adjudicate_borderline.py`) to catch catastrophic under-routing

**Effort**: medium. Download + filter script ~100 lines.

**Expected output**: 10K-50K rows covering real developer distribution.

---

### Approach 2: Synthetic batch for gap-filling

**What**: Use `prompts/synthetic_batch.md` to generate 1000 rows for thin cells.

**Why**: Fills cells that real data under-represents (Haiku/none, Sonnet/high, etc.).

**How**:
1. Copy prompt into current model session
2. Pipe output to JSONL
3. Merge into `synthetic_route_labels.jsonl`
4. Run adjudication queue + apply decisions

**Effort**: low. One prompt, one merge.

**Limitation**: Still synthetic quality gap for text. Only use for cells where real data is scarce.

---

### Approach 3: Code execution as oracle

**What**: Execute generated code solutions at multiple tiers to confirm cheapest acceptable.

**Why**: Eliminates self-assessment bias. Code has ground truth (execution) unlike text. From arXiv:2503.14023.

**How**:
1. For each code-related prompt, generate a solution at Haiku/low
2. Run the solution -- if it passes unit tests or matches reference, Haiku is cheapest acceptable
3. If it fails, try Sonnet/low, then Sonnet/medium, etc.
4. Record the first passing tier as the label

**Effort**: high. Requires sandboxed execution environment.

**Expected output**: High-confidence labels for coding prompts. Reduces label noise significantly.

---

### Approach 4: Heuristic adjudicator (no LLM)

**What**: Fast rule-based labeling using keyword/signal matching.

**Why**: Auditable, reproducible, no API cost.

**How** (extends existing `adjudicate_borderline.py`):
1. Architecture keywords -> route up
2. Tool/API mentions -> route up one effort tier
3. Single snippet, short -> Haiku
4. Has unit tests in prompt -> can verify, route accordingly
5. Multi-file context -> Sonnet/Opus

**Effort**: low. Extend existing rubric heuristics.

**Limitation**: Surface-level. No deep reasoning about task complexity.

---

## Recommendation

Run in order:

1. **Approach 1 first** -- download StackOverflow, filter, label with simple heuristics. Real distribution from day one.
2. **Approach 4 parallel** -- extend `adjudicate_borderline.py` rubric to cover more cells.
3. **Approach 2 for gaps** -- use the batch prompt to fill cells that Approach 1 under-represents.
4. **Approach 3 if you have time** -- add execution oracle for the coding subset.

Do not start with Approach 2 alone. Synthetic-only corpus has a documented quality gap vs real data (arXiv:2503.14023, Table 1: GPT-3 synthetic = 76% accuracy vs 88% with human data on SST-2).

---

## Open Questions

- [ ] What license do the StackOverflow and mlabonne datasets use? Is CC-BY-4.0 acceptable?
- [ ] How to handle prompts that mention no code but still need Sonnet+ (e.g., architecture diagrams, system design)?
- [ ] Should the classifier learn from model prices instead of tiers? (Haiku < Sonnet < Opus maps to cost, but capability also matters)
- [ ] What eval set? Keep `eval_v3.jsonl` as held-out, or merge and re-split?