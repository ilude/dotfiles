# Code Review Research Notes

## Purpose
Research findings for building a custom Claude Code review skill that avoids false positives.

## Problem Statement
During a code review on branch `375-create-new-dpsuserregistrationemailservice`, multiple false positives were generated:
- Flagging pre-existing technical debt as new issues
- Flagging "bugs" that callers already guard against
- Assuming patterns are "standards" without verification
- Not understanding ticket scope (extract vs refactor)

---

## Key Lessons Learned

### What Went Wrong

| Issue Flagged | Why It Was Wrong |
|---------------|------------------|
| Unused params (`scac`, `isTSPAgent`, `gbloc`) | Pre-existing in original code - author just moved it |
| `Substring` crash on empty collection | Caller guards with `if (agents.Any())` before calling |
| Missing `LogEmail()` calls | Not a project standard - only 1 of 50+ methods uses it |
| Code duplication | Pre-existing - ticket scope was extract, not refactor |

### Root Causes
1. **Reviewed entire code, not just diff** - Should compare to original
2. **Didn't check call sites** - Assumed bugs without verifying usage
3. **Assumed standards without evidence** - Should verify against codebase
4. **Ignored ticket scope** - Extract means copy, not improve

---

## Research Findings

### Git Scoping Technique
```bash
# CRITICAL: Use merge-base to isolate THIS branch's changes only
MERGE_BASE=$(git merge-base origin/dev HEAD)
git diff $MERGE_BASE..HEAD
```

### Classification System
```
BLOCKER  - New bugs/security issues introduced in THIS changeset (must fix)
FOLLOW-UP - Pre-existing debt, out of scope (create separate ticket)
NIT      - Educational/stylistic (not mandatory)
QUESTION - Needs clarification (not a suggestion)
```

### Confidence Threshold
- Only report issues with confidence >80%
- Suppress speculative issues

### Pre-Flag Checklist
Before flagging ANY issue, verify:
1. **Is it in the diff?** - Only review lines changed in this PR
2. **Is it new?** - Don't flag pre-existing code/patterns
3. **Can it happen?** - Check call sites, type constraints
4. **Is it documented?** - Only enforce written project standards
5. **Confidence >80?** - Suppress speculative issues

---

## Key Resources Found

### Official Tools
| Resource | Description |
|----------|-------------|
| [Anthropic Official Plugin](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md) | 4 parallel agents, confidence scoring, false positive filtering |
| [Claude Code Security Review](https://github.com/anthropics/claude-code-security-review) | GitHub Action for security-focused review |

### Community Skills/Agents
| Resource | Key Feature |
|----------|-------------|
| [obra/superpowers receiving-code-review](https://github.com/obra/superpowers/blob/main/skills/receiving-code-review/SKILL.md) | YAGNI principle, verify context before accepting feedback |
| [TuringMind Code Review](https://github.com/turingmindai/turingmind-code-review) | Explicit diff-only focus, smart filtering |
| [ChrisWiles code-reviewer](https://github.com/ChrisWiles/claude-code-showcase/blob/main/.claude/agents/code-reviewer.md) | Severity levels, git diff approach |
| [WomenDefiningAI code-reviewer](https://github.com/WomenDefiningAI/claude-code-skills) | SAST integration, OWASP checks |

### Best Practices Sources
| Source | Key Insight |
|--------|-------------|
| [Google Engineering Practices](https://google.github.io/eng-practices/review/reviewer/looking-for.html) | "Technical facts and data overrule opinions" |
| [Anthropic Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) | Multi-agent verification, fresh context |
| [cubic blog](https://www.cubic.dev/blog/the-false-positive-problem-why-most-ai-code-reviewers-fail-and-how-cubic-solved-it) | Up to 40% of AI alerts ignored due to false positives |

---

## Anthropic Official Plugin Architecture

The built-in `/code-review` command uses **4 parallel agents**:
1. **Agent #1 & #2**: CLAUDE.md Compliance Auditors (redundancy)
2. **Agent #3**: Bug Detector - scans for obvious bugs in changes only
3. **Agent #4**: History Analyzer - uses git blame for context

### False Positive Filtering
Automatically excludes:
- Pre-existing issues not introduced in PR
- Code that looks like a bug but isn't (intentional patterns)
- Pedantic nitpicks
- Issues linters will catch
- Issues with lint ignore comments

### Confidence Scoring
- Scale: 0-100
- Default threshold: 80
- Issues below 80 automatically filtered

---

## Patterns to Implement

### Inner Loop vs Outer Loop
- **Inner Loop** (manual): Developer runs `/review` while shaping PR
- **Outer Loop** (CI): GitHub Actions runs automated review on every PR

### Multi-Agent Verification
- One agent writes code
- Another agent reviews (fresh context)
- Prevents blind spots from accumulated context

### Evidence-Based Flagging
Before flagging, require:
- Concrete evidence from git diff
- Call site verification
- Type system constraint check
- Production failure evidence (if available)

---

## Installation Commands

```bash
# obra/superpowers receiving-code-review skill
mkdir -p ~/.claude/skills/receiving-code-review
curl -o ~/.claude/skills/receiving-code-review/SKILL.md \
  https://raw.githubusercontent.com/obra/superpowers/main/skills/receiving-code-review/SKILL.md

# ChrisWiles code-reviewer agent
mkdir -p ~/.claude/agents
curl -o ~/.claude/agents/code-reviewer.md \
  https://raw.githubusercontent.com/ChrisWiles/claude-code-showcase/main/.claude/agents/code-reviewer.md
```

---

## Commercial Tools Research (Completed)

### CodeRabbit

**Company**: Founded 2023 by Harjot Gill (CEO), Guritfaq Singh (COO), Vishu Kaur
- $88M funding, $550M valuation (Sep 2025)
- 8,000+ paying customers, 100,000+ daily users
- NOT a Y Combinator company
- Sources: [TechCrunch](https://techcrunch.com/2025/09/16/coderabbit-raises-60m-valuing-the-2-year-old-ai-code-review-startup-at-550m/), [Crunchbase](https://www.crunchbase.com/organization/coderabbit)

**Technical Architecture** (Hybrid Pipeline AI):
- **NOT pure agentic** - uses structured pipelines with learned behavior
- Runs **30+ static analyzers BEFORE prompting the LLM**
- Uses AST and symbol lookups to identify relevant context
- **1:1 code-to-context ratio** in prompts

Key Quote: *"This hybrid AI pipeline gives the model exactly what it needs — and nothing more. No random guesses, no runtime surprises."* - [Source](https://www.coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews-let-the-model-reason-within-reason)

**Infrastructure**:
- Google Cloud Run (2nd Gen) for execution - [Architecture Blog](https://cloud.google.com/blog/products/ai-machine-learning/how-coderabbit-built-its-ai-code-review-agent-with-google-cloud-run)
- **Two-layer sandboxing**: microVMs + Jailkit for untrusted code
- LanceDB for vector storage (RAG) - [Case Study](https://lancedb.com/blog/case-study-coderabbit/)
- Multi-model strategy: GPT-4o, Claude Opus 4, Claude Sonnet 4.5 - [Claude Customer Story](https://claude.com/customers/coderabbit)

**False Positive Reduction**:
- 40+ integrated linters pre-filter before LLM - [Boosting Static Analysis](https://www.coderabbit.ai/blog/boosting-static-analysis-accuracy-with-ai)
- AST-grep for deterministic code facts - [AI Native Linter](https://www.coderabbit.ai/blog/ai-native-universal-linter-ast-grep-llm)
- Verification layer validates every suggestion post-generation - [Agentic Validation](https://foojay.io/today/how-coderabbits-agentic-code-validation-helps-with-code-reviews/)
- Code graph analysis maps dependencies - [Code Graph Docs](https://docs.coderabbit.ai/changelog/code-graph-analysis)

**Key Insight**: *"Agent autonomy without structure doesn't scale."*

**Key Resources**:
- [Pipeline AI vs Agentic AI](https://www.coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews-let-the-model-reason-within-reason)
- [Context Engineering](https://www.coderabbit.ai/blog/the-art-and-science-of-context-engineering)
- [ast-grep-essentials repo](https://github.com/coderabbitai/ast-grep-essentials)
- [Software Engineering Daily Podcast](https://softwareengineeringdaily.com/2025/06/24/coderabbit-and-rag-for-codereview-with-harjot-gill/)

---

### Greptile

**Company**: YC W24, founded by Daksh Gupta (CEO), Soohoon Choi (CTO), Vaishant Kameswaran (CTO)
- All Georgia Tech CS 2023 grads
- $30M funding, $180M valuation
- 2,000+ customers (Brex, Substack, PostHog)
- Sources: [YC Profile](https://www.ycombinator.com/companies/greptile), [Georgia Tech News](https://news.gatech.edu/news/2026/01/05/y-combinator-backing-and-30m-investment-take-startup-greptile-next-level)

**Technical Architecture** (Graph-Based Understanding):
- **AST → Docstrings → Embeddings** (core innovation) - [Hatchet Case Study](https://hatchet.run/customers/greptile)
- Parses AST, recursively generates docstrings for each node, then embeds
- Function-level chunking beats file-level by significant margins - [Semantic Search Blog](https://www.greptile.com/blog/semantic-codebase-search)
- Builds dependency graph of functions, classes, variables - [Graph Docs](https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context)

Key Quote: *"Noise negatively impacts retrieval quality in a huge way."* - [Source](https://www.greptile.com/blog/semantic-codebase-search)

**Hallucination Reduction** (What Actually Worked):
- **Prompt engineering FAILED** - couldn't reduce nits without losing critical comments
- **Few-shot learning FAILED** - LLM inferred superficial characteristics
- **LLM-as-a-judge FAILED** - was "nearly random"

**What Worked**: Vector embedding clustering of past comments - [How to Make LLMs Shut Up](https://www.greptile.com/blog/make-llms-shut-up)
- Embed comments, tag with developer reactions (upvoted/downvoted)
- Block comments similar to 3+ downvoted comments
- Pass comments similar to 3+ upvoted comments
- **Result**: Address rate improved from **19% to 55+%** in two weeks
- Also covered in [ZenML LLMOps Database](https://www.zenml.io/llmops-database/improving-ai-code-review-bot-comment-quality-through-vector-embeddings)

Key Insight: *"The definition of a 'nit' is subjective and varies from team to team."*

**Key Resources**:
- [Semantic Codebase Search](https://www.greptile.com/blog/semantic-codebase-search)
- [Founder Interview - Initialized Capital](https://blog.initialized.com/2024/10/founder-spotlight-greptiles-daksh-gupta/)
- [Scaling DevTools Podcast](https://scalingdevtools.com/podcast/episodes/daksh-gupta)

---

## Academic Research Findings (Completed)

### Key Performance Metrics

| Finding | Source |
|---------|--------|
| LLM accuracy: 63-68% for code correctness | [arXiv:2505.20206](https://arxiv.org/abs/2505.20206) |
| ML reduces false positives by ~50% | [ACM ICSE 2022](https://dl.acm.org/doi/10.1145/3510003.3510153) |
| GPT reduces review time by 33% | [arXiv:2508.11034](https://arxiv.org/abs/2508.11034) |
| Multi-review aggregation +43.67% F1 | [arXiv:2509.01494](https://arxiv.org/abs/2509.01494) |
| Fine-tuned GPT-3.5: +73% Exact Match | [arXiv:2402.00905](https://arxiv.org/abs/2402.00905) |

### What Academic Research Recommends

1. **Human-in-the-Loop** - LLMs not reliable enough for full automation - [arXiv:2505.20206](https://arxiv.org/abs/2505.20206)
2. **Context Beyond Diffs** - Need dependency graph - [Beyond the Diff Blog](https://jetxu-llm.github.io/posts/beyond-the-diff-llamapreview-catches-critical-bug/)
3. **RAG for Large Codebases** - Required to transcend context limits - [RAG Survey](https://arxiv.org/abs/2510.04905)
4. **Fine-tuning > Prompting** - When sufficient data available - [arXiv:2402.00905](https://arxiv.org/abs/2402.00905)
5. **Few-shot Without Persona** - For cold-start scenarios - [arXiv:2402.00905](https://arxiv.org/abs/2402.00905)
6. **Multi-Metric Evaluation** - BLEU correlates poorly with human judgment - [MDPI Analysis](https://www.mdpi.com/2674-113X/3/4/25)

### Key Papers

| Paper | Key Finding |
|-------|-------------|
| [Evaluating LLMs for Code Review](https://arxiv.org/abs/2505.20206) | 68% accuracy with context, declines without |
| [LAURA (RAG for Code Review)](https://arxiv.org/abs/2512.01356) | 42% of reviews completely correct |
| [SWR-Bench](https://arxiv.org/abs/2509.01494) | Multi-review aggregation best approach |
| [CodeReviewer](https://arxiv.org/abs/2203.09095) | Pre-trained model outperforms baselines |
| [Support, Not Automation](https://dl.acm.org/doi/abs/10.1145/3696630.3728505) | AI risks losing knowledge transfer benefits |
| [False Positive Reduction](https://dl.acm.org/doi/10.1145/3510003.3510153) | ML improves precision by 17.5% |
| [Prompt Engineering for CR](https://arxiv.org/abs/2411.10129) | Function call graphs + summaries improve quality |

### Datasets for Fine-Tuning

| Dataset | Size | Source |
|---------|------|--------|
| CodeReviewer | 9 languages | [Hugging Face](https://huggingface.co/microsoft/codereviewer) |
| Source{d} Comments | 25.3M comments | [GitHub](https://github.com/src-d/datasets/tree/master/ReviewComments) |
| LAURA | 301K samples | [arXiv:2512.01356](https://arxiv.org/abs/2512.01356) |
| SWR-Bench | 1,000 verified PRs | [arXiv:2509.01494](https://arxiv.org/abs/2509.01494) |
| GitHub PR Comments | 13M+ comments | [Kaggle](https://www.kaggle.com/datasets/pelmers/github-public-pull-request-comments) |

---

## Actionable Insights for Our Skill

### From CodeRabbit

1. **Pre-filter with static analysis** - Don't send everything to LLM
2. **Use AST for deterministic facts** - Anchors reduce hallucinations
3. **Curate context, don't dump** - 1:1 code-to-context ratio
4. **Verify post-generation** - LLM suggestions need validation
5. **Hybrid > Pure Agentic** - Structure prevents agent wandering

### From Greptile

1. **Function-level chunking** - Don't embed entire files
2. **Team-specific learning** - Nits are subjective per team
3. **Vector clustering for quality** - Prompting alone can't solve quality
4. **Dependency graph for blast radius** - Trace callers, imports, similar code

### From Academia

1. **Confidence threshold 80%** - Suppress speculative issues
2. **Multi-agent review** - Aggregation improves F1 significantly
3. **Context is everything** - Performance drops without sufficient context
4. **Human-in-the-loop** - Don't fully automate critical decisions

---

## References

### Skills Repositories
- https://github.com/travisvn/awesome-claude-skills
- https://github.com/VoltAgent/awesome-claude-skills
- https://github.com/levnikolaevich/claude-code-skills
- https://github.com/alirezarezvani/claude-skills
- https://github.com/wshobson/agents

### Blog Posts
- https://fasterthanlight.me/blog/post/claude-code-best-practices-for-local-code-review
- https://medium.com/nick-tune-tech-strategy-blog/auto-reviewing-claudes-code-cb3a58d0a3d0
- https://alirezarezvani.medium.com/5-tipps-to-automate-your-code-reviews-with-claude-code-5becd60bce5c

### Documentation
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/github-actions

### Podcasts/Interviews
- [CodeRabbit on Software Engineering Daily](https://softwareengineeringdaily.com/2025/06/24/coderabbit-and-rag-for-codereview-with-harjot-gill/)
- [Greptile on Scaling DevTools](https://scalingdevtools.com/podcast/episodes/daksh-gupta)
- [Greptile Founder Interview](https://blog.initialized.com/2024/10/founder-spotlight-greptiles-daksh-gupta/)
