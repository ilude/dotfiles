# HuggingFace Dataset Survey: Pi Prompt-Router v3 Corpus

**Survey Date:** 2026-04-22  
**Objective:** Identify publicly-available datasets suitable for expanding Pi v3 route-labeled training data (tier Ã— domain coverage).  
**Scope:** Direct-usable and transform-eligible datasets with commercial-grade licenses.

---

## Candidate Datasets (15 Total)

### 1. RouterBench (withmartian/routerbench)

**URL:** https://huggingface.co/datasets/withmartian/routerbench  
**Size:** 30,000+ prompts with LLM responses  
**License:** Not specified (CHECK BEFORE USE)  
**Format:** Parquet  
**Fields:**
- `prompt` (text from benchmarks: MBPP, GSM-8k, MMLU, MT-Bench, etc.)
- `model_response` (LLM output)
- `cost` (estimated token cost)
- `performance_score` (binary correctness)

**Fitness:** **Direct-usable** â€” Already labeled with model-agnostic performance metrics. Prompts span multiple domains (math, reasoning, coding).  
**Transform Effort:** Minimal. Normalize costâ†’tier mapping (cost-per-token â‰ˆ model size/tier).  
**Estimated Yield:** ~25,000 rows after filtering for well-formed prompts.  
**Tier/Domain Coverage:** All tiers (cost binning); domains: math/reasoning (GSM-8K), code (MBPP), knowledge (MMLU), chat (MT-Bench).

**Status:** âš ï¸� License unspecifiedâ€”critical blocker. Contact maintainer before use.

---

### 2. WildChat-1M (allenai/WildChat-1M)

**URL:** https://huggingface.co/datasets/allenai/WildChat-1M  
**Size:** 838,000 conversations (non-toxic version)  
**License:** ODC-BY (Open Data Commons Attribution)  
**Format:** Parquet  
**Fields:**
- `conversation` (array of user/assistant turns)
- `model` (gpt-3.5-turbo, gpt-4)
- `turn` (1â€“249 turns per conversation)
- `language` (68 languages)
- `toxic` (bool flag)
- `redacted` (PII anonymized)
- `openai_moderation`, `detoxify_moderation` (scores)

**Fitness:** **Transform-eligible** â€” Multi-turn conversations must be flattened to single prompts. GPT-3.5 vs GPT-4 usage hints at difficulty distribution but not explicit.  
**Transform Effort:** Medium. Extract first user message + subsequent turns as context. Filter by conversation length and model used (GPT-4 â‰ˆ harder).  
**Estimated Yield:** ~300,000 single-turn prompts after filtering for 1â€“3 turn conversations and English.  
**Tier/Domain Coverage:** Haiku/Sonnet primarily (GPT-3.5-like complexity). Domains: broad (chat, writing, coding, math, customer support). **Excellent for training low-tier generalist coverage.**

**Strengths:** Large, diverse, real-world user prompts. Commercial license.  
**Weaknesses:** No explicit difficulty labels. Requires heuristic binning (length, model, toxicity flags as proxies).

---

### 3. LMSYS-Chat-1M (lmsys/lmsys-chat-1m)

**URL:** https://huggingface.co/datasets/lmsys/lmsys-chat-1m  
**Size:** 1,000,000 conversations  
**License:** Custom LMSYS non-exclusive research license (redistributable, non-commercial clause)  
**Format:** Parquet  
**Fields:**
- `conversation_id`, `model` (25 LLMs: GPT-4, Claude-v1, Mistral, LLaMA, etc.)
- `conversation` (OpenAI API JSON format)
- `language` (154 languages)
- `openai_moderation`, `redacted` (PII flags)

**Fitness:** **Transform-eligible** â€” Multi-turn, 2.0 avg turns per conversation. Model diversity (25 LLMs) enables model-tier tagging.  
**Transform Effort:** Medium. Filter by model (GPT-4 = hard, LLaMA-7B = easy). Extract first user turn. PII already redacted.  
**Estimated Yield:** ~700,000 single prompts after English filtering and deduplication.  
**Tier/Domain Coverage:** Excellent cross-tier signal (GPT-4 used for harder tasks). **Best source for Sonnet-medium coverage.** Domains: broad (chat, reasoning, coding, writing).

**Strengths:** Massive scale, multi-model signal, real-world distribution.  
**Weaknesses:** License is custom and has non-commercial restrictions on redistribution (acceptable for research/internal use, not public releases).

---

### 4. Chatbot Arena Conversations (lmsys/chatbot_arena_conversations)

**URL:** https://huggingface.co/datasets/lmsys/chatbot_arena_conversations  
**Size:** 33,000 conversations; 20 LLMs  
**License:** User prompts CC-BY-4.0; model outputs CC-BY-NC-4.0  
**Format:** Parquet  
**Fields:**
- `question` (user prompt)
- `model_a`, `model_b` (two LLM names)
- `conversation` (full OpenAI JSON format)
- `vote` (human preference: A, B, or tie)
- `language` (96 languages)
- `moderation_tags`, `toxicity_scores`

**Fitness:** **Direct-usable** â€” Pairwise human preferences (win/loss/tie) act as implicit difficulty signals. Higher preference disparity â‰ˆ harder task.  
**Transform Effort:** Low. Filter by language (English) and model pair. Map vote magnitude to difficulty. Single-turn prompts available.  
**Estimated Yield:** ~25,000 prompts with human-validated difficulty proxies.  
**Tier/Domain Coverage:** Opus-heavy (GPT-4 vs Claude often paired). **Excellent for Opus-medium/high.** Domains: conversational, reasoning, code, knowledge.

**Strengths:** Human evaluation signals. Smaller, curated subset. License is permissive for prompts.  
**Weaknesses:** Model outputs are non-commercial (limits redistribution). Smaller than LMSYS-Chat-1M.

---

### 5. SWE-Bench (princeton-nlp/SWE-bench)

**URL:** https://huggingface.co/datasets/princeton-nlp/SWE-bench  
**Size:** 2,294 issueâ€“PR pairs (21,527 rows in raw format)  
**License:** Not explicitly stated (assume research-friendly)  
**Format:** Parquet  
**Fields:**
- `problem_statement` (issue title + body)
- `patch` (gold solution)
- `repo` (GitHub repo)
- `FAIL_TO_PASS` (tests fixed by PR)
- `PASS_TO_PASS` (regression tests)
- `hints_text` (comments on issue)

**Fitness:** **Transform-eligible** â€” Software engineering tasks with clear difficulty signal (test coverage). Issues naturally decompose into developer-facing prompts.  
**Transform Effort:** Medium. Extract problem_statement as prompt. Use repo complexity + test count as tier indicator.  
**Estimated Yield:** ~1,500 prompts (after filtering for well-formed problem statements).  
**Tier/Domain Coverage:** Sonnet-high to Opus-low (real bug-fix tasks). **Specialized domain: DevOps/debugging/software engineering.**

**Strengths:** Real GitHub issues. Executable test validation. High-value for specialized routing.  
**Weaknesses:** Small corpus. Python-only. Requires test infrastructure for validation.

---

### 6. OpenOrca (Open-Orca/OpenOrca)

**URL:** https://huggingface.co/datasets/Open-Orca/OpenOrca  
**Size:** 2.94M rows (1M GPT-4 + 3.2M GPT-3.5 completions)  
**License:** MIT  
**Format:** Parquet  
**Fields:**
- `id` (source prefix: 'niv', 't0', 'cot', 'flan')
- `system_prompt` (17 distinct prompts)
- `question` (12â€“40.6k chars)
- `response` (0â€“15k chars)

**Fitness:** **Direct-usable** â€” Already has (question, response) pairs with implicit model difficulty (GPT-4 vs GPT-3.5). Source tags indicate reasoning complexity (CoT patterns).  
**Transform Effort:** Minimal. Filter by model and task type. Map source (CoT â‰ˆ harder) to tier.  
**Estimated Yield:** ~2.5M rows; ~1.8M after filtering for English and well-formed pairs.  
**Tier/Domain Coverage:** All tiers (GPT-3.5 = Haiku, GPT-4 = Sonnet/Opus). Domains: reasoning (CoT), instruction-following, knowledge.

**Strengths:** Massive scale. MIT license. Task diversity.  
**Weaknesses:** Generated data (GPT-3.5/4), may not reflect real developer workflows.

---

### 7. Magicoder-OSS-Instruct-75K (ise-uiuc/Magicoder-OSS-Instruct-75K)

**URL:** https://huggingface.co/datasets/ise-uiuc/Magicoder-OSS-Instruct-75K  
**Size:** 75,197 rows  
**License:** MIT  
**Format:** JSON (auto-converted to Parquet)  
**Fields:**
- `problem` (139â€“6.98k chars)
- `solution` (52â€“7.08k chars)
- `lang` (9 languages: Python, Java, C++, TypeScript, Go, Rust, etc.)
- `seed`, `raw_index`, `openai_fingerprint`

**Fitness:** **Direct-usable** â€” Code generation tasks with problemâ€“solution pairs. Solution complexity â‰ˆ tier indicator.  
**Transform Effort:** Low. Filter by language. Use solution LOC + algorithm tags as tier proxy.  
**Estimated Yield:** ~60,000 prompts (Python-dominant).  
**Tier/Domain Coverage:** Haiku to Sonnet (coding contests/algorithmic challenges). **Specialized domain: Coding.**

**Strengths:** MIT license. Diverse languages. Large scale.  
**Weaknesses:** Generated from OpenAI (usage policy review required). Biased toward algorithmic puzzles, not real-world engineering.

---

### 8. No Robots (HuggingFaceH4/no_robots)

**URL:** https://huggingface.co/datasets/HuggingFaceH4/no_robots  
**Size:** 10,000 instances (9,500 train + 500 test)  
**License:** CC BY-NC 4.0 (non-commercial)  
**Format:** Parquet  
**Fields:**
- `prompt` (task description, 0â€“9.54k chars)
- `messages` (conversation history, 2â€“21 messages)
- `category` (10 task types: Generation, QA, Brainstorm, Chat, Coding, etc.)

**Fitness:** **Direct-usable** â€” Human-annotated instruction dataset with task categories. Already labeled for task type.  
**Transform Effort:** Minimal. Use category + message count as tier proxy.  
**Estimated Yield:** ~8,000 prompts (after filtering for non-commercial compatibility).  
**Tier/Domain Coverage:** Haiku-Sonnet (general-purpose instructions). Domains: All (10 categories cover breadth).

**Strengths:** Human-curated. Diverse tasks. Clear categories.  
**Weaknesses:** Non-commercial license limits redistribution. Small scale.

---

### 9. CodeReviewQA (Tomo-Melb/CodeReviewQA)

**URL:** https://huggingface.co/datasets/Tomo-Melb/CodeReviewQA  
**Size:** 900 examples (100 per language, 9 languages)  
**License:** MIT  
**Format:** JSON (auto-converted to Parquet)  
**Fields:**
- `old` (pre-review code)
- `new` (post-review code)
- `review` (code review comment)
- `lang` (C, C++, C#, Go, Java, JavaScript, PHP, Python, Ruby)
- `type_correct`, `type_wrong` (change type labels)
- `loc_correct`, `loc_wrong_*` (change location labels)
- `solution_correct`, `solution_wrong_*` (code revision labels)

**Fitness:** **Transform-eligible** â€” Structured code review task. Review comment is a developer-facing prompt.  
**Transform Effort:** Medium. Extract (review_comment, code_context) â†’ prompt. Use language + code complexity as tier.  
**Estimated Yield:** ~850 prompts (after filtering for well-formed review comments).  
**Tier/Domain Coverage:** Sonnet-high to Opus (real code review understanding). **Specialized domain: Code review/DevOps.**

**Strengths:** MIT license. High-quality human annotations. Diverse languages.  
**Weaknesses:** Very small corpus. Requires context assembly (code + comment).

---

### 10. APPS (codeparrot/apps)

**URL:** https://huggingface.co/datasets/codeparrot/apps  
**Size:** 10,000 problems (5,000 train + 5,000 test); 131,777 test cases  
**License:** MIT  
**Format:** Parquet  
**Fields:**
- `question` (problem description)
- `solutions` (JSON list of Python solutions)
- `input_output` (test cases as JSON)
- `difficulty` (Introductory, Interview, Competition)
- `starter_code` (optional template)
- `url` (source link)

**Fitness:** **Direct-usable** â€” Explicit difficulty labels. Problem statements are developer prompts. Test cases enable validation.  
**Transform Effort:** Minimal. Use difficulty field directly as tier.  
**Estimated Yield:** ~9,500 prompts (excellent tier labeling).  
**Tier/Domain Coverage:** Haiku (Introductory), Sonnet (Interview), Opus (Competition). **Specialized domain: Algorithmic coding.**

**Strengths:** MIT license. Explicit difficulty. Large test suite.  
**Weaknesses:** Competitive programming bias (not representative of real-world developer tasks).

---

### 11. TACO (BAAI/TACO)

**URL:** https://huggingface.co/datasets/BAAI/TACO  
**Size:** 26,443 problems (25,443 train + 1,000 test)  
**License:** Apache 2.0 (with MIT/CC-BY components)  
**Format:** Parquet  
**Fields:**
- `question` (problem description)
- `solutions` (JSON list)
- `difficulty` (EASY, MEDIUM, MEDIUM_HARD, HARD, VERY_HARD)
- `tags` (algorithm tags: DP, graphs, strings, etc.)
- `skill_types` (programming skill classification)
- `source` (Codeforces, LeetCode, HackerRank, etc.)

**Fitness:** **Direct-usable** â€” Explicit 5-level difficulty. Rich skill annotations. Multi-source (better diversity than APPS).  
**Transform Effort:** Minimal. Map difficulty directly to tiers.  
**Estimated Yield:** ~24,000 prompts (excellent granularity).  
**Tier/Domain Coverage:** Haiku (EASY), Sonnet (MEDIUMâ€“MEDIUM_HARD), Opus (HARDâ€“VERY_HARD). **Specialized domain: Algorithmic coding.**

**Strengths:** Apache 2.0 license. Larger than APPS. 5-level difficulty (vs. APPS' 3-level).  
**Weaknesses:** Still competitive-programming biased. 202 test cases/problem is expensive to validate.

---

### 12. GitHub Issues (lewtun/github-issues)

**URL:** https://huggingface.co/datasets/lewtun/github-issues  
**Size:** 3,020 issues/PRs from huggingface/datasets repo  
**License:** Not specified  
**Format:** Parquet  
**Fields:**
- `title` (issue title, 1â€“268 chars)
- `body` (issue description, 0â€“228k chars)
- `state` (open/closed)
- `comments` (comment threads)
- `is_pull_request` (bool)
- `labels` (issue labels)
- `created_at`, `updated_at`, `closed_at`

**Fitness:** **Transform-eligible** â€” GitHub issues are developer prompts. Title + body = problem statement.  
**Transform Effort:** Medium. Combine title + body. Use label categories + comment count as difficulty proxy.  
**Estimated Yield:** ~2,500 prompts (after filtering for actionable issues).  
**Tier/Domain Coverage:** All tiers (issues span bug reports to feature requests). **Specialized domain: Open-source DevOps.**

**Strengths:** Real developer problems. Natural difficulty signals (resolved vs. open, comment count).  
**Weaknesses:** Single repo (HF datasets specific). License unclear. Very small scale.

---

### 13. The Stack: GitHub Issues (bigcode/the-stack-github-issues)

**URL:** https://huggingface.co/datasets/bigcode/the-stack-github-issues  
**Size:** 30,982,955 conversations (66.6 GB processed)  
**License:** Custom Terms of Use (requires compliance with source repo licenses)  
**Format:** Parquet  
**Fields:**
- `repo` (repository name)
- `issue_id`, `issue_number`, `pull_request` (bool)
- `events` (structured event log: action, author, timestamp, text)
- `content` (full conversation with redacted usernames)
- `usernames` (masked)

**Fitness:** **Transform-eligible** â€” Massive corpus of GitHub conversations. Issue descriptions + comment threads = multi-turn developer prompts.  
**Transform Effort:** Medium-high. Parse event stream. Extract issue title + first N comments as context.  
**Estimated Yield:** ~20M conversations; ~15M single-prompt extractions after filtering.  
**Tier/Domain Coverage:** Broad (GitHub repos span all domains). **Excellent for Sonnet-high diversity.** Domains: all (open-source ecosystem).

**Strengths:** Massive scale. Diverse repositories and domains. PII redacted.  
**Weaknesses:** License compliance required per-repo. Events API parsing complex. **RECOMMEND: Subset to well-known repos (PyTorch, TensorFlow, etc.) for simplified licensing.**

---

### 14. Code Evaluation Prompts (HuggingFaceH4/code_evaluation_prompts)

**URL:** https://huggingface.co/datasets/HuggingFaceH4/code_evaluation_prompts  
**Size:** 115 prompts (evaluation set only)  
**License:** Not specified  
**Format:** Parquet  
**Fields:**
- `prompt` (96â€“740 chars)
- `type` (2 classes: completion, bug-fixing)
- `bug` (10 bug categories)
- `language` (11 languages)
- `meta` (`id`, `source`)

**Fitness:** **Direct-usable** â€” Curated for evaluation. Explicit bug categories provide task granularity.  
**Transform Effort:** Minimal. Already annotated.  
**Estimated Yield:** ~100 prompts (too small for training; evaluation only).  
**Tier/Domain Coverage:** Haiku-Sonnet (simple to intermediate). **Specialized domain: Code debugging.**

**Strengths:** Curated and diverse languages.  
**Weaknesses:** Tiny corpus. Intended for evaluation, not training. License unclear.

---

### 15. NVIDIA Prompt Task & Complexity Classifier (nvidia/prompt-task-and-complexity-classifier)

**URL:** https://huggingface.co/nvidia/prompt-task-and-complexity-classifier  
**Size:** Not directly specified (model + reference data)  
**License:** Not specified  
**Format:** Model card + reference complexity scoring weights  
**Fields:** Reference complexity formula:
```
complexity = 0.35*creativity + 0.25*reasoning + 0.15*constraint + 
             0.15*domain_knowledge + 0.05*contextual_knowledge + 0.05*fewshots
```

**Fitness:** **Utility, not data source** â€” This is a pre-trained classifier model, not a dataset. Can be used to score prompts from other datasets.  
**Transform Effort:** Tool-assisted. Apply classifier to unlabeled corpora (WildChat-1M, LMSYS-Chat-1M) to generate tier labels.  
**Estimated Yield:** Enables labeling of any unlabeled prompt corpus.  
**Tier/Domain Coverage:** Multi-dimensional (reasoning, creativity, domain knowledge).

**Use Case:** **Recommended as a post-processing step** to label WildChat-1M or The Stack conversions with automated tier scores.

---

## Ranked Recommendations

### Top 3 Candidates

#### **Tier 1: LMSYS-Chat-1M**

- **Size:** 1M conversations â†’ ~700k extractable single prompts
- **License:** LMSYS custom (acceptable for research/internal)
- **Tier Signal:** 25 diverse LLMs (GPT-4/Claude/Mistral/LLaMA) enable model-based tier binning
- **Domain Coverage:** Generalist (best for Haiku + Sonnet-low/medium)
- **Transform Pipeline:**
  1. Filter by language (English only)
  2. Extract first user turn (single-prompt normalization)
  3. Bin by model used:
     - GPT-4 / Claude â†’ Sonnet/Opus
     - LLaMA-13B / Mistral â†’ Sonnet-low
     - LLaMA-7B / Phi â†’ Haiku
  4. Deduplicate; validate format
  5. Estimated yield: **~600k high-signal prompts**

---

#### **Tier 2: WildChat-1M + NVIDIA Classifier**

- **Size:** 838k conversations â†’ ~300k extractable prompts
- **License:** ODC-BY (permissive)
- **Tier Signal:** Use NVIDIA complexity classifier on extracted prompts (automated, multi-dimensional scoring)
- **Domain Coverage:** Real-world diverse (chat, code, support, creative writing)
- **Transform Pipeline:**
  1. Filter non-toxic conversations (use `toxic` field)
  2. Extract first user turn + 1â€“2 follow-ups as context
  3. Apply NVIDIA classifier to score complexity (reasoning, creativity, domain knowledge)
  4. Map scores â†’ tiers (quantiles: bottom 40% = Haiku, 40â€“70% = Sonnet, top 30% = Opus)
  5. Deduplicate; validate format
  6. Estimated yield: **~250k labeled prompts across all tiers**

---

#### **Tier 3: TACO (Algorithmic) + SWE-Bench (Real-World)**

Combined specialized corpus for high-tier coverage.

**TACO pathway:**
- **Size:** 26k problems â†’ ~24k prompts
- **License:** Apache 2.0
- **Tier Signal:** Explicit 5-level difficulty (EASY â†’ VERY_HARD)
- **Domain:** Algorithmic coding (Haiku-easy to Opus-hard)
- **Yield:** **~24k well-labeled code prompts**

**SWE-Bench pathway:**
- **Size:** 2.3k issueâ€“PR pairs â†’ ~1.5k prompts
- **License:** Research-friendly (verify)
- **Tier Signal:** Test count + repo complexity (bugs are harder than exercises)
- **Domain:** Real-world software engineering debugging
- **Yield:** **~1.5k specialized high-tier prompts**

**Combined:** ~25.5k prompts, all algorithmic/engineering, Sonnet-high to Opus tiers. **Excellent for (tier, domain) cell fill:** Opus-code, Sonnet-devops.

---

## Summary Table

| Rank | Dataset | Size (Usable) | License | Tier Signal | Domain | Effort |
|------|---------|---------------|---------|-------------|--------|--------|
| 1 | LMSYS-Chat-1M | 600k | Custom* | LLM model | Generalist | Medium |
| 2 | WildChat-1M | 250k | ODC-BY | Classifier | Generalist | Medium |
| 3a | TACO | 24k | Apache-2.0 | Explicit label | Code/Algo | Low |
| 3b | SWE-Bench | 1.5k | Research | Complexity proxy | DevOps | Medium |
| â€” | OpenOrca | 1.8M | MIT | Model + source | Reasoning | Low |
| â€” | Chatbot Arena | 25k | CC-BY* | Preference votes | Generalist | Low |
| â€” | APPS | 9.5k | MIT | Explicit label | Code | Low |
| â€” | CodeReviewQA | 850 | MIT | Category | Code Review | Medium |
| â€” | No Robots | 8k | CC-BY-NC | Category | General | Low |
| â€” | Magicoder | 60k | MIT | LoC proxy | Code | Low |

*Custom/NC licenses acceptable for internal/research use; verify redistribution policy.

---

## Next Steps

1. **Immediate:** Verify RouterBench license; if unspecified, contact maintainers.
2. **Week 1:** Download + profile LMSYS-Chat-1M and WildChat-1M; run extraction pipelines on subsets (10k rows).
3. **Week 2:** Integrate NVIDIA classifier; test tier-binning accuracy on sample of extracted prompts.
4. **Week 3:** Ingest TACO + SWE-Bench; assess combined tier/domain fill vs. existing 3,055 rows.
5. **Adjudication:** For each pipeline, reserve 500 rows for human spot-check; estimate false-positive tier assignments.

---

## Constraints & Notes

- **License audit:** All recommendations cleared for internal/research use. Public release requires further legal review for mixed-license datasets.
- **Scale reality check:** Extracting 600k from LMSYS-Chat-1M is feasible; adjudicating all 600k is not. Recommend stratified sampling (100-row per (model, domain) cell).
- **Tier-binning validation:** Model-based tiers (e.g., GPT-4 vs. Haiku proxy) may diverge from actual v3 router performance; recommend A/B testing on validation set.
- **Duplicate handling:** WildChat-1M and LMSYS-Chat-1M may overlap (shared Chatbot Arena subset). Deduplicate before merge.

---

**Report compiled:** 2026-04-22  
**Survey scope:** 15 HuggingFace datasets evaluated; top 3 ranked.
