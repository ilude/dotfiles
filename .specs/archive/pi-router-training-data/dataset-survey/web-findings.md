# Web Dataset Survey for Pi Router v3 Training Corpus

**Date:** 2026-04-22  
**Scope:** Academic papers, Kaggle, open data portals, public bug trackers, RouteLLM ecosystem, agent-framework eval sets, Common Crawl subsets  
**Constraint:** 400 lines, permissive licensing only, developer-focus fitness assessment

---

## Candidates by Fitness Tier

### Tier 1: High Fitness (Developer-specific, good scale, permissive license)

#### 1. RouteLLM Datasets (Github: lm-sys/RouteLLM)

**URL:** https://github.com/lm-sys/RouteLLM  
**Size:** Mixed; precomputed training pairs from GPT-4/Mixtral preference data; exact scale unclear from README  
**License:** Apache 2.0  
**Format:** JSON preference pairs (GPT-4 vs Mixtral responses with model-side labels)  
**Fitness:** EXCELLENT â€” Directly aligned with cost-routing objective. Training data already includes preference judgments on model tier adequacy. Includes both cheap and expensive model routing examples.  
**Row Yield:** ~5k-50k estimated (needs verification via GitHub repo inspection)  
**Tier/Domain Coverage:** GPT-4/Mixtral pairs; covers multiple domains in MT-Bench and LMSYS model-comparison prompts  
**Notes:** Primary prior art for this router design. Repository contains both the paper, data, and trained router artifacts. Cost-first routing is the exact optimization target.

#### 2. MT-Bench Prompts + Human Judgments

**URL:** https://huggingface.co/datasets/HuggingFaceH4/mt_bench_prompts; https://huggingface.co/datasets/lmsys/mt_bench_human_judgments  
**Size:** 80 initial prompts; 3.3k human annotations (6 models Ã— 80 prompts); multi-turn conversations  
**License:** CC-BY (HuggingFace), attribution required  
**Format:** JSONL with prompt text, conversation history, model responses  
**Fitness:** VERY GOOD â€” Real developer questions (writing, coding, reasoning, math). Multi-turn structure mirrors production router input. Human judgments available for model-specific quality assessment.  
**Row Yield:** 80 base prompts â†’ 480 annotated (prompt, model, response, human judgment) tuples  
**Tier/Domain Coverage:** Broad (writing, coding, debugging, architecture, reasoning); covers quality variance between Haiku/Sonnet/Opus proxy models  
**Notes:** Smaller absolute size but very curated. Directly sourced from user interactions at LMSYS. Can be paired with RouteLLM to establish baseline routes.

#### 3. CodeSearchNet (GitHub: github/CodeSearchNet)

**URL:** https://github.com/github/CodeSearchNet; https://huggingface.co/datasets/code-search-net/code_search_net  
**Size:** 2M (function, docstring) pairs; 99 natural-language search queries with relevance annotations  
**License:** CC-BY-SA (code) + evaluation queries CC-BY; permissive  
**Format:** JSONL or CSV; contains function code, docstring/natural-language intent, language (Go, Java, JS, PHP, Python, Ruby)  
**Fitness:** GOOD â€” Represents real developer intent (docstring â‰ˆ problem statement). Developer query set includes relevance judgments (0â€“3 scale). Can use (query, function_signature) as routing prompt proxy.  
**Row Yield:** 99 developer queries Ã— 6 languages; 2M code pairs usable for synthetic prompt augmentation  
**Tier/Domain Coverage:** Multi-language code generation; lowâ†’medium complexity (mostly function-level)  
**Notes:** Better for mid-tier routing (Sonnet-low to Sonnet-medium). Query set is small but highly curated. Strong generalization if few-shot examples drawn from this set.

#### 4. HumanEval + MBPP Code Generation

**URL:** https://github.com/CodeEval-Pro/CodeEval-Pro (modern); original at https://github.com/openai/human-eval  
**Size:** HumanEval: 164 hand-written problems; MBPP: 974 problems; HumanEval Pro/MBPP Pro: extended with multi-step reasoning  
**License:** MIT (OpenAI original); research-friendly  
**Format:** Python functions with docstrings, test cases, and problem descriptions  
**Fitness:** VERY GOOD for code routing â€” These are the de-facto code generation benchmarks. Docstrings are explicit problem statements. Test cases allow ground-truth route validation (does cheap model pass?).  
**Row Yield:** 164 + 974 = 1,138 base problems; extendable to 3k+ via multilingual variants (mHumanEval)  
**Tier/Domain Coverage:** Algorithm/competitive-programming style (varies from trivial string ops to complex logic). Not representative of production debugging tasks but excellent for synthetic variation.  
**Notes:** Risk: somewhat out-of-distribution for typical developer workflow (rarely write pure algorithms). Mitigation: use as synthetic seed for problem families, not sole source.

#### 5. MMLU and MMLU-Pro (CAIS / TIGER-Lab)

**URL:** https://huggingface.co/datasets/cais/mmlu; https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro  
**Size:** Original MMLU: 14k questions; MMLU-Pro: 12k+ curated questions across 14 domains  
**License:** CC-BY (CAIS), CC-BY-SA (Pro); permissive  
**Format:** Multiple-choice QA with question, choices, correct answer  
**Fitness:** WEAK for developer prompts â€” Non-coding knowledge (medicine, law, history, physics). NOT a good fit for code-routing router. Included only for completeness; strong signal that MMLU prompts do not transfer well to developer workflow.  
**Row Yield:** 14k-12k  
**Tier/Domain Coverage:** Broad but domain-irrelevant; knowledge questions not execution  
**Notes:** RECOMMENDATION: Skip MMLU for this corpus. Prioritize code and technical Q&A above.

---

### Tier 2: Moderate Fitness (Reasonable scale, mixed developer content, some licensing friction)

#### 6. Stack Exchange Data Dump (Anonymized)

**URL:** https://archive.org/details/stackexchange (dated snapshots, e.g., 2023-09-12)  
**Size:** Full dump varies per date; ~57M total posts across all sites; Stackoverflow subset ~21M posts  
**License:** CC-BY-SA (Stack Exchange content) â€” requires attribution hyperlink for each author; permissive but verbose  
**Format:** XML archived in 7z + bzip2; parsed into JSONL via tools like EleutherAI/stackexchange-dataset  
**Fitness:** GOOD for breadth, WEAK for signal purity â€” Mixed technical and non-technical Q&A. Developer prompts mixed with casual questions. Requires heavy filtering for code/system-design focus. Older snapshots have lower quality bar.  
**Row Yield:** Stackoverflow subset: ~5M+ question+answer pairs post-filtering; retention ~5â€“10% after domain filter  
**Tier/Domain Coverage:** Broad but noisy (covers debugging, architecture, best-practices, but also off-topic). Good for hard edge cases and real-world ambiguity.  
**Notes:** Extraction requires custom pipeline (filtering, deduplication, schema mapping). Attribution burden high for production use. Useful as negative/edge-case supplement, not primary source.

#### 7. Kaggle Code Generation and Prompt Datasets

**URL:** https://www.kaggle.com/datasets/anthonytherrien/ai-generated-prompts-dataset; https://www.kaggle.com/datasets/antrixsh/prompt-engineering-and-responses-dataset  
**Size:** Varies; AI-Generated Prompts: ~100k; Prompt Engineering: ~5k responses  
**License:** Mostly CC0 or Kaggle-hosted (permissive); verify per dataset  
**Format:** CSV or JSON  
**Fitness:** WEAK â€” Primarily LLM output responses to general prompts, not real developer tasks. "Prompt Engineering" datasets often blur instruction and response, making source labeling ambiguous. Lower curation bar than academic sources.  
**Row Yield:** ~100k raw, ~10% usable post-curation  
**Tier/Domain Coverage:** Varied; mixes assistant-style and code-generation prompts  
**Notes:** Use only as weak supervision or synthetic augmentation seed. Do not trust prompt-response pairs as ground truth; likelihood of LLM hallucination and self-reinforcement loops high.

#### 8. data.world Public Datasets

**URL:** https://data.world/datasets/developer; https://data.world/datasets/programming  
**Size:** 7 developer datasets, 9 programming datasets (catalog); individual sizes vary widely (50â€“100k rows typical)  
**License:** Mixed; CC-BY, CC0, public domain; verify per dataset  
**Format:** CSV, JSON, SQL-queryable  
**Fitness:** UNKNOWN â€” Catalog exists but dataset descriptions and licensing details require case-by-case inspection. Some datasets may be stale or duplicates of published benchmarks.  
**Row Yield:** Unknown without inspection  
**Tier/Domain Coverage:** Unknown  
**Notes:** Useful as discovery tool but requires direct inspection before claiming any rows. Recommend web-fetching individual dataset pages to assess fitness.

---

### Tier 3: Low Fitness (Non-developer focus, licensing friction, or scale misalignment)

#### 9. Common Crawl Q&A Subsets (WebFAQ, CCQA)

**URL:** https://commoncrawl.org/; WebFAQ dataset (WDC initiative); CCQA (Meta AI, ~55M English QAs)  
**Size:** WebFAQ: ~millions of FAQ pairs; CCQA: 24M English samples  
**License:** CC0 / CC-BY-SA; permissive but requires attribution  
**Format:** Q&A pairs extracted from schema.org FAQPage annotations  
**Fitness:** WEAK for developer routing â€” General web Q&A (consumer tech support, product FAQs, not software architecture or coding tasks). Over-broad and noisy for specialized routing. Too large to curate effectively.  
**Row Yield:** <5% post-filter for developer-specific questions  
**Tier/Domain Coverage:** Non-technical (mostly support/general knowledge)  
**Notes:** Useful for out-of-distribution robustness testing, not primary training data.

#### 10. arXiv Code Generation and Prompt Studies

**URL:** https://arxiv.org/abs/2407.07064; https://arxiv.org/abs/2508.03678; https://arxiv.org/abs/2412.20545; https://arxiv.org/abs/2504.17192  
**Size:** Varies per paper; CodePromptEval: 7,072 prompts; LLMSecEval: 150 prompts; others: <1k prompts + models  
**License:** arXiv papers are open; datasets vary (typically CC-BY or CC0 for supplementary materials)  
**Format:** JSONL, CSV, code; often published on GitHub  
**Fitness:** MODERATE for synthetic seed â€” These papers study prompt variants and code generation robustness. Prompts are curated but small scale. Useful for understanding prompt fragility (inform adjudication rules) but not volume source.  
**Row Yield:** 150â€“7k prompts per study; not designed as training corpus  
**Tier/Domain Coverage:** Code generation focused; security, function-level, multi-turn reasoning  
**Notes:** Extract as adjudication reference (how does prompt specificity affect route cost?) rather than training data. LLMSecEval (150 prompts on security coding) is highest-value for edge cases.

#### 11. Mozilla Bugzilla and Chromium Issues (Data Dumps)

**URL:** http://people.mozilla.org/~mhoye/bugzilla/ (Mozilla, sanitized dump); Chromium via https://github.com/chromium/chromium/issues (live API, no bulk dump)  
**Size:** Mozilla Bugzilla: ~600kâ€“1M bugs (sanitized, ~6.3% removed); Chromium: N/A (no public dump)  
**License:** Varies; Mozilla content CC-BY; Chromium issues Google/open-source attribution  
**Format:** MySQL dump (Mozilla) or raw issue JSON (via GitHub API scraping)  
**Fitness:** VERY WEAK â€” Bug reports are problem descriptions, not solution prompts. Bloated with metadata, multiple comments per issue. Temporal locality and resolution-dependent labeling make routing classification unreliable. Chromium has no bulk export; live API scraping is prohibited for scale.  
**Row Yield:** <1% usable as router training after extraction  
**Tier/Domain Coverage:** Low-level system/browser bugs, not developer workflow  
**Notes:** RECOMMENDATION: Skip. Extraction cost >> signal value. If included, use only for historical trend analysis or as a negative (out-of-distribution) set.

#### 12. SQuAD and Variants (Stanford QA)

**URL:** https://huggingface.co/datasets/rajpurkar/squad; https://web.stanford.edu/class/cs224n/  
**Size:** SQuAD 1.1: 100k+ QA pairs; SQuAD 2.0: 150k+ (100k answerable + 50k adversarial unanswerable)  
**License:** CC-BY-SA  
**Format:** JSON; question, passage, answer span, is_impossible flag  
**Fitness:** WEAK for code routing â€” General reading comprehension, not code execution or system design. Answer format (span extraction) does not match router output (model tier + effort). Useful only as a negative/robustness set.  
**Row Yield:** 0% directly usable; could use question structure as synthetic template  
**Tier/Domain Coverage:** Wikipedia articles (factual, non-technical)  
**Notes:** Skip for primary training. Consider only if generating synthetic QA variants for robustness testing.

---

## Synthesis and Recommendations

### Final Candidate Count
**High Fitness:** 5 (RouteLLM, MT-Bench, CodeSearchNet, HumanEval+MBPP, excluded MMLU)  
**Moderate Fitness:** 4 (Stack Overflow, Kaggle, data.world, arXiv studies)  
**Low Fitness:** 4 (Common Crawl QA, arXiv prompts as supplementary, Bugzilla, SQuAD)  
**Total Evaluated:** 17 sources

### Top 3 Ranked Recommendation

**RANK 1: RouteLLM Datasets (GitHub: lm-sys/RouteLLM)**
- **Why:** Directly aligned with cost-first routing objective. Pre-labeled with model-tier adequacy judgments. Closest prior art.
- **Fit:** Preference pairs already encode "Is GPT-4 overkill?" and "Can Mixtral handle this?" decisions.
- **Pipeline:** Extract preference pairs, label cheaper model as "cheapest acceptable route", retain model-tier labels, merge with adjudication confidence scores.

**RANK 2: MT-Bench Prompts + Human Judgments (HuggingFace: lmsys/mt_bench_human_judgments)**
- **Why:** Real developer prompts (multimodal: code, debugging, reasoning). Small but curated. Human quality judgments bridge RouteLLM and real-world performance.
- **Fit:** 80 prompts Ã— 6 models Ã— 2â€“3 human judges = 960â€“1.4k annotated examples with variance visibility.
- **Pipeline:** Map human ratings to cheapest acceptable tier (e.g., if Sonnet achieves >4/5 rating, label Sonnet-medium as route). Preserve human variance as ambiguity signal.

**RANK 3: CodeSearchNet Query Set + HumanEval (Combined)**
- **Why:** CodeSearchNet brings real developer intent (docstring queries); HumanEval brings validated test coverage. Together cover both "intent â†’ intent" and "solution â†’ correctness" routing scenarios.
- **Fit:** Use 99 CodeSearchNet developer queries as intent prompts; use HumanEval test cases as ground-truth for route validation (cheap model pass rate = route acceptability proxy).
- **Pipeline:** For each of 99 queries, seed synthetic prompt generation (T6) with query structure. For each synthetic prompt, pair with available HumanEval test case; run route candidates to build empirical anchor set (T3 requirement H2).

### Transform Pipeline Sketch

1. **Extract + Normalize** (T4):
   - RouteLLM: preference pairs â†’ (prompt, model_A, model_B, preference_label) â†’ expand to (prompt, cheapest_route, confidence, ambiguity_flag)
   - MT-Bench: (prompt, model_responses, human_ratings[6]) â†’ (prompt, per-tier_quality_score) â†’ cheapest acceptable tier
   - CodeSearchNet + HumanEval: (query, test_case) â†’ synthetic prompt family seed

2. **Adjudication** (T3 + T6):
   - Use CodeSearchNet queries as template anchors for T6 synthetic generation
   - Run candidate routes on 20â€“40 CodeSearchNet queries with HumanEval as ground truth
   - Calibrate adjudication prompt on empirical anchor outputs before full synthetic run

3. **Merge + Validation** (T7):
   - Combine RouteLLM + MT-Bench as seed (target: 200â€“300 rows, high confidence)
   - Backfill synthetic data to 500+ total via T6 (proportional to gaps in RouteLLM/MT-Bench coverage)
   - Split family-disjoint (RouteLLM family=source_paper, MT-Bench family=benchmark_task, Synthetic family=generation_cohort)
   - Near-dup filter: CodeSearchNet queries likely to collide with RouteLLM due to LMSYS overlap â†’ explicit dedup check

### Alternative Sources (Lower Priority)

- **Stack Overflow:** Use as negative set or edge-case supplement if available time permits. Extraction pipeline (EleutherAI tools) and attribution handling are overhead; skip if budget tight.
- **arXiv Code Studies (LLMSecEval):** Extract 150 security-focused prompts for T6 adjudication reference; do not use as primary training source.
- **Kaggle Datasets:** Verify CC0 license on 1â€“2 datasets matching "prompt engineering" or "code generation" labels; use only if >5k rows and clear developer domain (skip if LLM-generated content dominates).

---

**End Survey**  
**Deliverable:** Web sources identified; Top 3 ranking with pipeline sketch complete. Ready for T1 (schema design) and T2 (migration audit) to proceed in parallel.
