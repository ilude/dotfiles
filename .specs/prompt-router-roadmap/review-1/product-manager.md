---
reviewer: product-manager
role: outside-the-box/simplicity reviewer
artifact_type: prd-readiness-review
source: .specs/prompt-router-roadmap/PRD.md
created: 2026-05-07
---

# PRD Readiness Review

## Findings

### 1. Scope combines two separable products into one v1

**severity:** high

**evidence:** The Problem lists both control-plane correctness and context-aware routing. Goals include vocabulary migration, provider mapping, classifier settings, explain/status, context capsule, anti-downgrade, telemetry, and unified eval. Phases 1–4 are all treated as part of the same PRD readiness target.

**required_fix:** Split v1 into “router truthfulness/control-plane normalization” only. Move context continuation, telemetry aggregates, and eval expansion to follow-on PRDs unless they are strictly required to verify the control-plane fix.

### 2. Provider/profile mapping is over-specified before runtime feasibility is proven

**severity:** high

**evidence:** FR2 defines multiple Codex ladders, coding-aware branches, optional specialized profiles, unavailable nano behavior, max semantics, and fallback output. Risks still say model switching may apply too late and provider architecture may be needed.

**required_fix:** Replace FR2 with the minimum mapping needed for current Pi: canonical route → existing supported model/profile. Add one acceptance criterion to prove the route affects the current turn. Defer coding-aware mapping and specialized Codex profile choices until after timing is verified.

### 3. Telemetry requirements exceed the stated user job

**severity:** medium

**evidence:** The user job is selecting and explaining an appropriate route. Telemetry requires cost estimates, baseline cost, latency percentiles, calibration buckets, manual conflict counts, thrash, aggregate stats, and JSONL schema. These imply analytics infrastructure beyond route correctness.

**required_fix:** Make v1 telemetry limited to fields needed for explain/debug: mode, raw route, applied route, rule, model, confidence, elapsed time, prompt hash. Move cost modeling, aggregates, calibration, and savings-vs-baseline to an analytics PRD.

### 4. Context continuation rule risks sticky over-routing without clear bounds

**severity:** medium

**evidence:** FR6 holds the previous route for continuation prompts, but Open Questions ask whether it needs a maximum number of turns. The capsule includes `unresolvedTask`, yet no requirement defines how that state is set or cleared.

**required_fix:** Either defer continuation handling or define a tight v1 bound: one-turn hold only, clear after non-continuation, explicit cheap/brief override wins, and no dependency on ambiguous unresolved-task state.

### 5. Unified eval is too broad for PRD readiness

**severity:** medium

**evidence:** FR9 requires runtime-comparable eval across classifier modes, policy settings, cost-weighted quality, route thrash, catastrophic under-routing, over-routing, and sequence fixtures. Non-goals say no classifier retraining, so full benchmark-style evaluation is not needed to ship control-plane correctness.

**required_fix:** Narrow v1 eval to regression fixtures proving status/explain/logs match runtime settings and policy mapping. Move cost-weighted quality, calibration, and multi-mode comparative metrics to a separate evaluation roadmap.
