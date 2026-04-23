---
created: 2026-04-22
source_files:
  - pi/prompt-routing/data/training_corpus.json
  - pi/prompt-routing/labeled_history.csv
output_files:
  - pi/prompt-routing/data/migration_candidates.csv
  - pi/prompt-routing/data/migration_exclusions.csv
---

# Corpus Audit: Migration Buckets for v3 Cost-First Router

## Purpose

This audit maps the two existing prompt sources -- `training_corpus.json` (v2.2,
1582 handcrafted examples) and `labeled_history.csv` (782 labeling-run outputs) --
into migration buckets that drive the v3 corpus design. The v3 corpus targets the
cheapest acceptable `(model_tier, effort_tier)` route per prompt, not legacy
complexity classification alone.

---

## Source Summary

| Source | Total rows | Usable | Excluded before audit |
|--------|-----------|--------|----------------------|
| `training_corpus.json` | 1582 | 1582 | 0 |
| `labeled_history.csv` | 782 | 594 | 188 (skip-labeled) |
| **Combined** | **2364** | **2176** | **188** |

The 188 excluded `labeled_history.csv` rows carry `usable=False` and `label=skip`
set during the original `label_history.py` run. They are primarily conversational
fragments, URL-sharing turns, and single-word answers that require prior context to
interpret. They are recorded in `migration_exclusions.csv` but were not reviewed
further.

---

## Migration Buckets

Four buckets determine how each prompt row is handled in subsequent tasks (T5, T6).

### 1. safe low-cost seed

**Definition:** Prompt has a clear, unambiguous label and can be migrated to v3 with
only route-level annotation added. No re-adjudication of the tier label is needed.
These are strong starting points for the seed dataset.

**Count: 1099 rows (50.9% of candidates)**

Breakdown:
- `training_corpus.json` low tier: 508 rows -- handcrafted, vocabulary-distinct,
  short single-step prompts. Cheapest route is clearly `(Haiku, low)` for most.
- `training_corpus.json` high tier (architectural subset): 450 rows -- prompts
  explicitly involving system design, security audits, distributed systems, or
  algorithm implementation. Cheapest route is clearly `(Opus, medium+)`.
- `labeled_history.csv` high confidence low/high: 141 rows -- real-world prompts
  where the label is unambiguous and the prompt is standalone (not context-dependent).

Example prompts in this bucket:

```
# training_corpus.json low -- safe Haiku seed
"Write a Python function that reverses a string."
"How do I declare a constant in Go?"
"Create a basic HTML5 boilerplate page."

# training_corpus.json high -- safe Opus seed
"Design a distributed task scheduling system that handles failover, deduplication..."
"Audit this authentication system for security vulnerabilities and provide a hardened..."
"Implement a CRDT-based collaborative text editor that handles concurrent edits..."

# labeled_history.csv high-conf low -- safe Haiku seed
"can you create a tar.gz file of ~/.dotfiles/.claude/"
"give me a description of what each of the files are for in this directory..."
"does only the bash hook log or do the edit and write hooks log as well?"

# labeled_history.csv high-conf high -- safe Opus seed
"I want to create some validation tests that check to make sure important settings..."
"suggest 3 or 4 experts to do an adverserial review this plan..."
"draft the Cilium removal plan"
```

**Migration action:** Add `cheapest_acceptable_route` annotation via T5 curation
(straightforward cases) or T6 adjudication. Do NOT re-examine tier label.

---

### 2. needs relabel

**Definition:** The legacy `low/mid/high` label exists but is insufficient or
uncertain at the route level. The prompt may be correctly labeled for the old
objective but cannot be directly mapped to a `(model_tier, effort_tier)` cheapest
route without re-adjudication. This is the largest bucket.

**Count: 1016 rows (47.1% of candidates)**

Breakdown:
- `training_corpus.json` mid tier: 462 rows -- handcrafted mid prompts with clear
  task descriptions. Under v3 the cheapest route could be `(Haiku, high)` for some
  (a complex-sounding but mechanically solvable debugging task) or `(Sonnet, low)`
  for others. Route-level adjudication is required.
- `training_corpus.json` high tier (non-architectural subset): 162 rows -- high
  prompts that lack explicit architectural/security language. They are probably
  correctly labeled high, but need a v3 `cheapest_acceptable_route` field.
- `labeled_history.csv` high-conf mid: 275 rows -- real-world multi-step tasks
  where mid complexity is clear but the cheapest-route dimension is not.
- `labeled_history.csv` medium-confidence all labels: 117 rows -- confidence was
  already flagged as uncertain during the original labeling run.

Example prompts:

```
# training_corpus.json mid -- cheapest route unclear
"Debug this React component that re-renders infinitely when using useEffect."
"Implement a rate limiter middleware in Express.js using a token bucket algorithm."
"Write a SQL query to find the second-highest salary in each department."

# labeled_history.csv high-conf mid -- needs route adjudication
"move that file into a backups/ directory and gitignore that directory"
"the damage-control hooks tests need reorganized putting the test files into the test dir"
"we need to rework the logs to log to one file per day instead of a unique log"

# labeled_history.csv medium-confidence -- uncertain label
"is there anything we can do about when running the /commit command and it breaks
 things up into separate commits the hooks/pre-commit hook runs tests multiple times?"
```

**Migration action:** T5 should select the least-ambiguous subset (those with
high-confidence labels and standalone prompts) for manual route annotation. The rest
feed into T6 synthetic adjudication or the annotation queue.

---

### 3. high ambiguity

**Definition:** Prompt is from a domain where the vocabulary blurs tier boundaries,
making the cheapest-route judgment unreliable without additional context. Per
AGENTS.md, this is the documented root cause of the 2026-03-31 training degradation:
DevOps/infrastructure prompts from `gitlab-helm` share so much vocabulary across
low/mid/high that a TF-IDF classifier cannot separate them.

**Count: 43 rows (2.0% of candidates)**

All 43 come from `labeled_history.csv`, predominantly from the `gitlab-helm` project
(33% of usable history rows are from this one project). The label is `mid` but the
true cheapest route depends on implicit operational context that is not encoded in
the prompt text.

Example prompts:

```
# DevOps mid from gitlab-helm -- mid/high boundary blurs
"can you look at the logs in cloudwatch going back a month and a half on us-east-..."
"WAF needs to restrict access to gitlab to USA addresses only"
"lets focus strictly on internal dns, with cilium and coredns, and nodelocal dns"
"yes fix the IMDS hop limit"
"these types of cilium/dns issues happen everytime we make pod changes"
```

Why these are problematic: In the DevOps domain, "fix the IMDS hop limit" is a
concrete single-step operation (LOW in general) but in a Kubernetes upgrade context
it implies understanding of EKS node metadata, security implications, and multi-step
remediation (potentially HIGH). Without the session context the routing signal is
unreliable.

**Migration action:** Do NOT bulk-import into the seed dataset. Route to the
annotation queue (`annotation_queue.csv`) for human review. If the annotator cannot
determine cheapest route from the prompt text alone, exclude.

---

### 4. exclude

**Definition:** Prompt is a context-dependent fragment, conversational filler, or
content that is not interpretable as a standalone routing target. These rows degrade
the classifier if included (proven by the 2026-03-31 regression).

**Count: 206 rows total**

- 188 pre-existing `skip`-labeled rows from `labeled_history.csv` -- already
  flagged as non-usable during the original labeling run.
- 18 additional rows in `labeled_history.csv` that carry `usable=True` but are
  context-dependent fragments identified during this audit:
  - Start with continuation words: "also ", "and ", "yes, ", "actually "
  - Response fragments: "yes add logging to edit and write hooks"
  - Single operational directives missing implicit context: "stop the app"

Example excluded prompts:

```
"it may have been fixed already... we are running the install.ps1 in another instance..."
"all of the above"
"you crashed"
"yes add logging to edit and write hooks"
"Multiple shell types, all shells on both linux and windows"
"stop the app"
```

**Migration action:** Written to `migration_exclusions.csv`. Do not include in any
training split.

---

## Overall Bucket Fractions

| Bucket | Count | Fraction | Primary Source |
|--------|-------|----------|----------------|
| safe low-cost seed | 1099 | 50.9% | training_corpus.json low + high (arch) |
| needs relabel | 1016 | 47.1% | training_corpus.json mid + hist mid |
| high ambiguity | 43 | 2.0% | labeled_history.csv DevOps-domain mid |
| **candidates subtotal** | **2158** | | |
| exclude | 206 | (from 2364 total) | labeled_history.csv skip + fragments |

---

## Key Findings

### Finding 1: training_corpus.json is the most reliable seed

The 1582 handcrafted examples have deliberately distinct vocabulary per tier and
were authored specifically to train a TF-IDF classifier. They are the safest
starting point for v3. The 508 low-tier examples map cleanly to `(Haiku, low)`.
The high-tier architectural subset maps cleanly to `(Opus, medium)`. Only the 462
mid-tier examples need route-level annotation.

### Finding 2: labeled_history.csv has extreme domain skew

33% of usable rows (197/594) come from a single project (`gitlab-helm`). That
project is almost entirely Kubernetes/EKS infrastructure work. Per the documented
2026-03-31 degradation, this domain makes low/mid/high boundaries unreliable for
TF-IDF. The practical usable yield after curation is approximately 80-100 examples
(consistent with the AGENTS.md estimate), not 363 or 594.

### Finding 3: Mid-tier is the ambiguous core problem

The mid-tier bucket represents the hardest migration challenge. For v3, "mid" can
mean:
- `(Haiku, high_effort)` -- a mechanically solvable multi-step task
- `(Sonnet, low_effort)` -- a moderate task that genuinely needs a stronger model
- `(Sonnet, medium_effort)` -- standard Sonnet territory

This three-way split cannot be resolved by looking at the legacy label alone. Every
mid-tier row needs route-level adjudication.

### Finding 4: Synthetic data is not optional

After conservative curation, the seed set yields roughly:
- ~508 safe low seeds (clean Haiku path)
- ~450 safe high seeds (clean Opus path)
- ~80 safe history low/high seeds
- ~0 ready-to-use mid-tier route labels (all need annotation)

The mid-tier and cost-boundary prompts cannot be satisfied from historical data
alone. Synthetic generation (T6) is required to build the cheapest-route labeled
mid-tier dataset.

---

## Implications for Downstream Tasks

**T5 (Curate historical prompts):** Draw from the "safe low-cost seed" bucket of
`labeled_history.csv` (141 rows) plus selectively annotated "needs relabel" rows
with high confidence and standalone structure. Expect 80-100 usable after review.
Apply the SHORTFALL FALLBACK from the plan if the combined seed set falls below 200
route-labeled examples.

**T6 (Synthetic generation):** Mid-tier coverage is the priority gap. Generate
synthetic prompts specifically targeting the cheapest-route mid-tier boundary:
prompts that look complex but are solvable by Haiku at high effort, and prompts that
genuinely require Sonnet. Also generate DevOps-domain prompts with explicit context
clues to replace the ambiguous gitlab-helm rows.

**T4 (Schema migration):** The migration_candidates.csv provides the starting
inventory. The `prompt_id` format is `tc-low-NNNN`, `tc-mid-NNNN`, `tc-high-NNNN`
(training corpus) and `lh-NNNN` (labeled history). These IDs should be preserved
as `legacy_id` in the v3 schema for traceability.

---

## Output Files

- `pi/prompt-routing/data/migration_candidates.csv` -- 2158 rows, columns:
  `prompt_id, source, current_label, bucket, notes, prompt_preview`
- `pi/prompt-routing/data/migration_exclusions.csv` -- 206 rows, columns:
  `prompt_id, source, exclusion_reason, prompt_preview`
