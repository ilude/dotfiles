# Eval Determinism

Strategy: deterministic-only

The Wave 1 harness excludes LLM-judged scoring. Fixtures are scored only by deterministic predicates (`exit_code`, `contains`, `exact`) against generated or captured outputs. Bootstrap resampling uses a fixed local LCG seed, so repeated runs over the same fixtures produce byte-stable summaries except for wall-clock timing.
