# Product Manager Scope/Simplicity Review

## Findings

1. **Severity: High**  
   **Evidence:** Plan expands a V1 cleanup into 8 implementation tasks, 5 validation gates, final gates, manual validation, archive workflow, telemetry rotation, eval unification, and docs.  
   **Required fix:** Cut V1 to PRD-critical runtime behavior: canonical status/explain, truthful classifier mode, continuation hold, override/provider trace, and focused tests. Move eval unification, telemetry purge/rotation, and archive ceremony to follow-up tasks unless directly blocking acceptance.

2. **Severity: High**  
   **Evidence:** T3 proposes a new `RouteProfileResolution` abstraction with domain, effort, profile, trust, fallback source, and route state before proving existing resolver fields cannot satisfy V1.  
   **Required fix:** First extend the existing `RouteDecision`/profile mapping minimally. Add a new resolver module only if duplication appears during implementation or tests require it.

3. **Severity: Medium**  
   **Evidence:** T7 is marked large and requires canonicalizing eval, retiring `shadow_eval.py`, adding sequence fixtures, and producing a mode matrix for all classifier modes. This is orthogonal to same-turn runtime correctness.  
   **Required fix:** For V1, add a small deterministic sequence fixture and one eval command that confirms runtime policy parity. Defer shadow-eval retirement and full metric expansion to an eval-hardening plan.

4. **Severity: Medium**  
   **Evidence:** Telemetry requires schema version, candidates, margins, latency, provider profile, purge/rotation documentation, and privacy behavior. Some fields may not exist yet or may duplicate transcript ownership.  
   **Required fix:** Define the smallest telemetry contract: prompt hash, raw/applied route, rule fired, mode, provider/model, and no raw prompt. Document existing purge path; do not implement rotation unless tests show no current owner.

5. **Severity: Medium**  
   **Evidence:** Manual validation is required unless automated command-surface tests prove `/router-status` and `/router-explain`, but the plan does not include a script/harness to capture those commands.  
   **Required fix:** Add an automated command-surface test or small fixture runner for status/explain output. If unavailable, make manual validation a clearly bounded final smoke check, not a blocker for implementation archive.
