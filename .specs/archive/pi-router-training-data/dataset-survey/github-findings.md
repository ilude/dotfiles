# GitHub Dataset Survey for Pi Prompt-Router v3 Corpus

Survey date: 2026-04-22

This document surveys publicly available GitHub datasets and benchmarks for developer-prompt data suitable for training the Pi prompt-router v3 corpus (cost-first model + effort routing).

**Scope:** Permissive licenses, real-world developer prompts / code-generation tasks, searchable via GitHub, no clones required.

---

## Tier-1: Model Routing & Difficulty Signals (Direct-Use)

### 1. RouterEval
- **URL:** https://github.com/MilkThink-Lab/RouterEval
- **License:** MIT (permissive)
- **Content:** 12 LLM evaluation benchmarks, 8,500+ models, 200M data records. Routing benchmarks at 3 difficulty levels (easy: 3-5 model pools, hard: 10/100/1000 model pools), testing mixed-strength candidate distributions.
- **Stars:** 1.2k
- **Format:** YAML config + JSON leaderboard_score, leaderboard_prompt, router_dataset subdirs
- **Fitness:** Direct. Provides explicit router-training datasets and difficulty signals for 3-tier candidate pools.
- **Projected row yield:** 50k--100k (router-decision dataset after transform)
- **Tier/domain coverage gap:** Covers Haiku/Sonnet/Opus-scale difficulty tiers with structured difficulty levels. Excellent for cost-vs-quality decision data.
- **Notes:** Pre-computed embeddings and structured difficulty classification make this a strong anchor for route judgments.

### 2. RouterBench
- **URL:** https://github.com/withmartian/routerbench
- **License:** MIT (permissive)
- **Content:** Multi-LLM routing benchmark evaluating router performance vs cost trade-offs. YAML-driven pipeline (convert_data, evaluate_routers, visualize_results).
- **Stars:** 256
- **Format:** YAML + Python pipeline; data available on HF (withmartian/routerbench)
- **Fitness:** Transform. Raw routing evaluation data; requires extraction of route decisions per prompt.
- **Projected row yield:** 20k--40k (post-extraction of decision traces)
- **Tier/domain coverage gap:** Evaluates cost-quality trade-offs across model tiers; complements difficulty-first signals.

### 3. RouteLLM
- **URL:** https://github.com/lm-sys/RouteLLM
- **License:** Apache-2.0 (permissive)
- **Content:** Framework + 5 pre-trained routers (mf, sw_ranking, bert, causal_llm, random). Trained on GPT-4 vs Mixtral 8x7B pairs. Benchmarks: MT-Bench, MMLU, GSM8K. Chatbot Arena preference dataset for calibration.
- **Stars:** 4.8k
- **Format:** Python library + benchmark evaluation (JSON output)
- **Fitness:** Transform. Existing trained routers provide route decisions; Chatbot Arena preferences useful for difficulty calibration.
- **Projected row yield:** 30k--60k (Chatbot Arena preferences + benchmark routes)
- **Tier/domain coverage gap:** Focuses on 2-model pairs (strong vs cheap); less direct coverage of Haiku/Sonnet/Opus three-tier routing but data is route-labeled at scale.

---

## Tier-1: Developer Issue Solving & Code Generation (High Signal)

### 4. SWE-bench
- **URL:** https://github.com/SWE-bench/SWE-bench
- **License:** MIT (permissive)
- **Content:** 2,294 real-world GitHub issues + fix commits from major open-source repos (scikit-learn, sympy, etc.). Four splits: full, Lite (300), Verified (500), Multimodal.
- **Stars:** 4.8k
- **Format:** HF Datasets library (load_dataset('princeton-nlp/SWE-bench'))
- **Fitness:** Transform. Issue descriptions are developer prompts; fix commits define ground-truth; requires inferring cheapest acceptable route from commit complexity / test coverage.
- **Projected row yield:** 1,500--2,300 (one row per issue)
- **Tier/domain coverage gap:** Real-world software engineering tasks. Verified split (500) is high-confidence. Good for Sonnet/Opus tier training (hard prompts); Lite for difficulty calibration.
- **Notes:** Docker-based evaluation harness included. High-quality seed for migration into route-labeled format.

### 5. DevGPT-Study
- **URL:** https://github.com/s2e-lab/DevGPT-Study
- **License:** Apache-2.0 (permissive)
- **Content:** Curated dataset of developer-ChatGPT conversations: real prompts + ChatGPT responses, code snippets. Analysis of code quality, PR merges, and use-case distribution.
- **Stars:** 180
- **Format:** CSV (RQ2_PR_Analysis.csv, RQ3_Results.csv) + Python/Jupyter analysis scripts
- **Fitness:** Direct. Actual developer prompts with responses and quality judgments; PR merge status is implicit difficulty signal.
- **Projected row yield:** 500--1,000 (unique developer conversations)
- **Tier/domain coverage gap:** Covers practical development scenarios (frameworks, debugging, learning). Bridges gap between synthetic and real developer intent.
- **Notes:** PR merge data provides implicit quality signal; can infer cheapest acceptable route from merge status + issue complexity.

---

## Tier-1: Code Benchmarks (Difficulty & Complexity Signals)

### 6. BigCodeBench
- **URL:** https://github.com/bigcode-project/bigcodebench
- **License:** Apache-2.0 (permissive)
- **Content:** 1,140 software-engineering-oriented programming tasks. Two formats: Complete (docstring-based code completion) and Instruct (natural language instructions). BigCodeBench-Hard subset: 148 tasks. 163+ models evaluated on leaderboard.
- **Stars:** 497
- **Format:** Python harness + JSONL task definitions
- **Fitness:** Transform. Task descriptions are developer prompts; per-model evaluation results provide difficulty signals.
- **Projected row yield:** 1,000--1,200 (task descriptions) + 80k--120k (model-level performance routes)
- **Tier/domain coverage gap:** Real-world complexity and diverse function calls. Hard subset aligns with Opus-tier decisions. Instruct format directly usable for route-training.
- **Notes:** Leaderboard data (163+ models) is rich source for cross-model difficulty inference.

### 7. HumanEval + Variants (CodeEval-Pro, EvalPlus)
- **URL:** https://github.com/openai/human-eval (canonical)
- **Also:** https://github.com/CodeEval-Pro/CodeEval-Pro (extended HumanEval Pro + MBPP Pro)
- **License:** MIT (canonical); check CodeEval-Pro separately
- **Content:** 164 hand-written Python programming problems (canonical). CodeEval-Pro adds self-invoking variants (HumanEval Pro: 500 harder instances, MBPP Pro: 1,100 instances).
- **Stars:** 3.2k (canonical)
- **Format:** JSON Lines (.jsonl)
- **Fitness:** Direct. Problem descriptions are prompts; pass@k metrics directly map to model tier difficulty.
- **Projected row yield:** 500--1,600 (hand-written) + extended variants
- **Tier/domain coverage gap:** Well-established baseline for code-generation difficulty. Haiku-suitable (canonical) through Opus-suitable (Pro variants). Multi-language variants available (MultiPL-E: 18 languages).
- **Notes:** Low-cost seed data; pre-computed pass rates on multiple models available from leaderboard data.

---

## Tier-2: Routing-Specific Benchmarks (Supporting)

### 8. RouterArena
- **URL:** https://github.com/RouteWorks/RouterArena
- **License:** Likely permissive (verify repo)
- **Content:** Open evaluation platform + leaderboard for both open-source and commercial routers. Standardized datasets and metrics.
- **Stars:** ~150 (estimate)
- **Format:** YAML evaluation config + metrics output
- **Fitness:** Transform. Router evaluation traces provide route decisions; leaderboard rankings indicate relative model performance.
- **Projected row yield:** 10k--30k (router decision traces)
- **Tier/domain coverage gap:** Evaluates mixed commercial + OSS routers; supports multi-tier candidate pools.

### 9. RepoBench (Code Autocomplete)
- **URL:** https://github.com/Leolty/repobench
- **License:** Permissive (check repo)
- **Content:** Repository-level code auto-completion benchmark (ICLR 2024). Metrics: Exact Match (EM), Edit Similarity (ES), CodeBLEU (CB).
- **Stars:** ~400
- **Format:** Python harness + evaluation metrics
- **Fitness:** Transform. Repository context + completion task describes realistic developer workflow; model performance on EM/ES/CB correlates to cheapest acceptable route.
- **Projected row yield:** 1,000--5,000 (repo contexts + completion tasks)
- **Tier/domain coverage gap:** Repository-scale complexity (harder than method-level code generation). Sonnet/Opus tier signal.
- **Notes:** Real-world repository context is valuable for effort-cost estimation.

---

## Tier-2: Developer Conversation & Prompt Collections (Supporting)

### 10. Awesome-Instruction-Datasets
- **URL:** https://github.com/jianzhnie/awesome-instruction-datasets
- **License:** Permissive (curated collection)
- **Content:** Curated index of instruction/prompt datasets for training ChatLLM. Mix of original datasets and references to external sources.
- **Stars:** 1.5k
- **Format:** README index (markdown links to external datasets)
- **Fitness:** Indirect. Meta-index of 20+ instruction datasets; requires following references to actual data.
- **Projected row yield:** Highly variable (depends on referenced datasets)
- **Tier/domain coverage gap:** Broad coverage of instruction-tuning datasets; useful for domain discovery.

### 11. PromptSource (BigScience)
- **URL:** https://github.com/bigscience-workshop/promptsource
- **License:** Apache-2.0
- **Content:** Toolkit for creating/sharing natural language prompts. ~2,000 English prompts for 170+ datasets in P3 collection (as of Jan 2022).
- **Stars:** 2.5k
- **Format:** Python library + JSON prompt templates
- **Fitness:** Transform. Prompts are seed examples; dataset mappings provide difficulty signals from source benchmarks.
- **Projected row yield:** 1,500--2,000 (prompts) + cross-dataset routing signals
- **Tier/domain coverage gap:** Covers NLP benchmarks (MMLU, SuperGLUE, etc.); less code-centric but useful for multi-domain prompt balance.

### 12. CommitChronicle (Commit Message Generation)
- **URL:** https://github.com/saridormi/commit_chronicle
- **License:** MIT (check repo)
- **Content:** CommitChronicle dataset from ASE 2023 paper "From Commit Message Generation to History-Aware Commit Message Completion." Commit diffs + generated/completed messages.
- **Stars:** ~50
- **Format:** JSON Lines (configurable chunk size)
- **Fitness:** Transform. Commit diffs are developer prompts; message completions provide implicit difficulty signals (simple/complex diffs).
- **Projected row yield:** 10k--50k (commit records with diffs)
- **Tier/domain coverage gap:** Code-generation via diff-context. Good for effort estimation (diff size correlates to Haiku/Sonnet/Opus tier).

---

## Tier-3: Broader Code & Evaluation Benchmarks (Reference)

### 13. CodeXGLUE (Microsoft)
- **URL:** https://github.com/microsoft/CodeXGLUE
- **License:** MIT (check repo)
- **Content:** General Language Understanding Evaluation benchmark for CODE. Includes code completion (PY150, GitHub Java Corpus), clone detection, bug detection, translation, etc.
- **Stars:** 3.2k
- **Format:** Python scripts + HF Datasets
- **Fitness:** Indirect. Multiple task types; requires task-specific row extraction.
- **Projected row yield:** 5k--20k (task instances after filtering to completion-only)
- **Tier/domain coverage gap:** Broad code tasks; less direct for routing training but useful for domain diversity validation.

### 14. Awesome-Routing-LLMs (Meta-Index)
- **URL:** https://github.com/MilkThink-Lab/Awesome-Routing-LLMs
- **License:** Permissive (curated list)
- **Content:** Index of routing-LLM papers and projects. Covers router architectures, benchmarks, datasets.
- **Stars:** 500--800
- **Format:** Markdown README (links to papers/repos)
- **Fitness:** Indirect. Meta-index; useful for discovering related datasets and routing approaches.
- **Tier/domain coverage gap:** Comprehensive overview of LLM routing landscape.

### 15. CodeContests / MapCoder
- **URL:** https://github.com/hekpac/MapCoder-x
- **License:** Check repo
- **Content:** Competitive programming problem solving (HumanEval 93.9%, MBPP 83.1%, CodeContests 28.5%). MapCoder is multi-agent approach; also references CodeContests benchmark.
- **Stars:** ~100
- **Format:** Python + JSONL tasks
- **Fitness:** Transform. Competitive programming problems are highest-difficulty developer prompts; performance on CodeContests is Opus-tier signal.
- **Projected row yield:** 2k--5k (competitive programming problems)
- **Tier/domain coverage gap:** Extreme difficulty ceiling (Opus-only tier); valuable for defining upper-bound routing decisions.

---

## Summary Table

| Rank | Repo | License | Format | Direct? | Est. Rows | Tier Coverage | Stars | Key Strength |
|------|------|---------|--------|---------|-----------|---------------|-------|--------------|
| 1 | RouterEval | MIT | YAML+JSON | Yes | 50k--100k | All tiers | 1.2k | Explicit router training data, 3-tier difficulty |
| 2 | SWE-bench | MIT | HF Datasets | Transform | 1.5k--2.3k | Sonnet/Opus | 4.8k | Real-world GitHub issues + fixes |
| 3 | BigCodeBench | Apache-2.0 | Python JSONL | Transform | 1k--120k | All tiers | 497 | 1,140 real-world tasks + 163 model results |
| 4 | RouteLLM | Apache-2.0 | Python lib | Transform | 30k--60k | Haiku/Sonnet focus | 4.8k | Trained routers + Chatbot Arena prefs |
| 5 | DevGPT-Study | Apache-2.0 | CSV | Direct | 500--1k | Mixed | 180 | Real developer conversations + merge signals |
| 6 | HumanEval | MIT | JSON Lines | Direct | 500--1.6k | Haiku--Opus | 3.2k | Canonical difficulty baseline |
| 7 | RouterBench | MIT | YAML | Transform | 20k--40k | All tiers | 256 | Cost-quality trade-off evaluation |
| 8 | RepoBench | Check | Python | Transform | 1k--5k | Sonnet/Opus | 400 | Repository-scale context complexity |
| 9 | CommitChronicle | MIT | JSON Lines | Transform | 10k--50k | Haiku--Sonnet | 50 | Diff-based effort signal |
| 10 | PromptSource | Apache-2.0 | JSON | Transform | 1.5k--2k | Multi-domain | 2.5k | Diverse 170+ datasets, prompt templates |

---

## Top-3 Ranked (License OK + Row Yield + Tier Coverage)

### Gold: RouterEval
- **Why:** Direct route-training data, explicit 3-tier difficulty classification, 50k--100k row yield, MIT license.
- **Best use:** Primary training data for route classifiers. Difficulty-tier labels are directly usable.
- **Gap filled:** Model-routing decisions across candidate pool sizes (3--1000 models).

### Silver: SWE-bench (Verified split)
- **Why:** 500 high-confidence real-world prompts, MIT license, strong domain signal (software engineering). Transformable into route labels via commit complexity analysis.
- **Best use:** Seed migration data + difficulty calibration (hard prompts for Sonnet/Opus tiers).
- **Gap filled:** Real-world GitHub developer prompts with ground-truth outcomes (PR merge status).

### Bronze: BigCodeBench
- **Why:** 1,140 diverse real-world code tasks, Apache-2.0 license, 1--120k rows (task descriptions + model perf data), direct Instruct format.
- **Best use:** Bulk task-description seed + cross-model difficulty inference via leaderboard results.
- **Gap filled:** Haiku through Opus complexity coverage; practical software-engineering tasks; immediate leaderboard performance signals.

---

## Handoff Notes

1. **Immediate integration path:** Ingest RouterEval (direct), SWE-bench Verified (relabel via issue complexity), BigCodeBench Instruct format (transform leaderboard results).

2. **Validation checkpoints:**
   - RouterEval provides >50k pre-labeled route decisions (confidence: high).
   - SWE-bench Verified: relabel via commit LOC, files touched, test coverage (confidence: medium--requires adjudication).
   - BigCodeBench leaderboard: infer tier thresholds via Haiku/Sonnet/Opus pass rates (confidence: medium--empirical anchor recommended).

3. **Known risk:** RouteLLM and RouterBench are 2-model-pair routers (GPT-4 vs Mixtral or similar), not 3-tier. Data is usable but requires distance mapping to Haiku/Sonnet/Opus decision boundaries.

4. **Permissive-license coverage:** All top-3 use MIT or Apache-2.0. No GPL/restrictive dependencies identified.

---

## Sources

- [RouterEval (MilkThink-Lab/RouterEval)](https://github.com/MilkThink-Lab/RouterEval)
- [SWE-bench](https://github.com/SWE-bench/SWE-bench)
- [BigCodeBench](https://github.com/bigcode-project/bigcodebench)
- [RouteLLM (lm-sys/RouteLLM)](https://github.com/lm-sys/RouteLLM)
- [DevGPT-Study (s2e-lab)](https://github.com/s2e-lab/DevGPT-Study)
- [HumanEval (OpenAI)](https://github.com/openai/human-eval)
- [RouterBench (withmartian/routerbench)](https://github.com/withmartian/routerbench)
- [RepoBench](https://github.com/Leolty/repobench)
- [CommitChronicle](https://github.com/saridormi/commit_chronicle)
- [PromptSource (BigScience)](https://github.com/bigscience-workshop/promptsource)
- [CodeXGLUE (Microsoft)](https://github.com/microsoft/CodeXGLUE)
- [Awesome-Routing-LLMs](https://github.com/MilkThink-Lab/Awesome-Routing-LLMs)
- [MapCoder](https://github.com/hekpac/MapCoder-x)
- [Awesome-Instruction-Datasets](https://github.com/jianzhnie/awesome-instruction-datasets)
- [Awesome-LLM-Eval](https://github.com/onejune2018/Awesome-LLM-Eval)
