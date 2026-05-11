---
reviewer: qa-engineer
persona: Verification realism and regression coverage reviewer
focus: false-positive acceptance criteria, fixture matrix, validation gates, evidence paths, do-it pass/fail determinability
---

# Findings

1. **Severity:** High
   **Evidence:** T5 accepts either “actual generation route equals applied route” or “a failing/blocked test documents required architecture migration,” while Success Criteria also allows “blocked with architecture spike evidence.” That lets `/do-it` mark the plan successful without the core behavior working.
   **required_fix:** Split T5 into a blocking decision gate: either prove same-turn routing and continue, or stop/archive nothing and create a separate spike plan. Do not count blocked evidence as V1 completion.

2. **Severity:** High
   **Evidence:** Most acceptance checks reuse `cd pi/tests && pnpm run test -- prompt-router.test.ts`; pass/fail depends on unspecified test names. Snapshots of `/router-status` or `/router-explain` could satisfy output assertions while actual provider/model routing remains unverified.
   **required_fix:** Require named tests or fixture assertions per criterion, including actual selected provider/model/thinking from an instrumented generation path, not just intended/applied route strings.

3. **Severity:** Medium
   **Evidence:** Continuation coverage lists only five positive phrases and vague cheap/brief negatives. No fixture matrix crosses previous route, raw lower route, pinned model, route pin, provider fallback, max policy-only, and context-window safety.
   **required_fix:** Add a compact sequence fixture matrix with expected raw route, applied route, rule, override source, provider boundary, and status/log evidence for each high-risk interaction.

4. **Severity:** Medium
   **Evidence:** T8 verification allows `evaluate.py --help` plus a “project-specific eval command added by this task.” Help output can pass while runtime settings, invalid modes, sequence fixtures, and metric calculations are wrong or unexercised.
   **required_fix:** Define the exact eval command now, with required fixture inputs and golden assertions for mode, policy fingerprint, catastrophic under-routing, thrash, invalid-mode failure, and sequence effects.

5. **Severity:** Medium
   **Evidence:** Manual validation requires pasted transcripts or screenshots, but the checklist has no concrete artifact path and F3 can be marked “not required” despite the Validation Contract saying manual validation is required.
   **required_fix:** Add a required manual evidence file under the spec directory and make F3 wording “manual validation passed,” with explicit prompts, expected fields, and failure handling if an interactive Pi session cannot be run.
