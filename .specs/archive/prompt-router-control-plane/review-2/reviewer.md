---
reviewer: reviewer
status: complete
---

# Findings

1. severity: high
   evidence: Proposed architecture depends on a "synchronous/awaited pre-generation seam" and "provider/model resolution layer" but does not identify the concrete Pi extension API, file, hook, or dispatch function to change.
   required_fix: Name the exact runtime seam and target files/functions, or state this spike must first discover and document them before implementation.

2. severity: high
   evidence: Same-turn pass condition says dispatch observer sees provider/model/thinking before generation, but no verification mechanism proves the generated turn used those values rather than only receiving them.
   required_fix: Define an end-to-end assertion tying the observed dispatch parameters to the actual provider invocation for the synthetic prompt.

3. severity: medium
   evidence: "canonical route", "route profile resolver", "requested classifier mode", "raw route", and "applied route" are undefined and may be interpreted differently by implementers.
   required_fix: Add a minimal schema or glossary for route decision fields and resolver input/output.

4. severity: medium
   evidence: The plan omits timeout, classifier failure, invalid route, denied provider, and cancellation behavior in an awaited pre-generation path.
   required_fix: Specify fallback behavior, error propagation, and logging for each failure mode before /do-it automation.

5. severity: medium
   evidence: Review artifact points to evidence file but the plan does not include executable validation commands, expected artifact paths, or acceptance criteria for CI/local reproduction.
   required_fix: Add exact commands or harness entrypoints, output locations, and machine-checkable pass/fail criteria.
