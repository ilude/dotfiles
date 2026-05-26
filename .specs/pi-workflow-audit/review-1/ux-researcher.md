# UX Researcher Review: Pi Workflow Audit Plan

## Findings

### 1. Severity: High — Operator friction taxonomy under-specifies subjective breakdowns

**Evidence:** The plan includes strong mechanical categories such as "context loss between phases," "handoff ambiguity," "repeated clarification loops," and "evidence of user rescue," but the coding taxonomy does not define subjective operator-experience states: frustration, loss of trust, uncertainty, surprise, perceived wasted effort, or moments where the user has to restate intent because the agent's mental model diverged.

**required_fix:** Add a dedicated operator-experience taxonomy with observable codes for user rescue, trust repair, intent restatement, frustration markers, perceived progress stalls, surprise/confusion, and manual coordination burden. Define evidence rules for each code so reviewers can classify them from transcripts without inventing sentiment.

### 2. Severity: High — "User rescue" is measured but not operationally defined

**Evidence:** "user intervention required" appears under Execution Quality and "evidence of user rescue" appears under Measurable Signals, but the plan does not specify what qualifies as rescue versus ordinary collaboration or clarification.

**required_fix:** Define user rescue as a coded event with subtypes, such as correcting wrong direction, providing missing context already available in artifacts, rejecting invalid work, manually resolving agent confusion, forcing scope reduction, or re-running/redirecting validation. Require each rescue event to include the triggering agent behavior, user action, downstream impact, and confidence level.

### 3. Severity: Medium — Excluding incomplete logs can bias against high-friction workflows

**Evidence:** Exclusion criteria remove "sessions where logs are too incomplete to reconstruct sequence." The adversarial premise is that command logs omit important context; high-friction workflows are also more likely to span tools, restarts, manual interventions, or missing artifacts.

**required_fix:** Do not simply exclude incomplete sessions. Add an "incomplete-context" stratum with partial coding rules, such as coding only observable friction, marking missing phases explicitly, and reporting how many candidate episodes were incomplete. Use exclusion only when no workflow episode can be identified at all.

### 4. Severity: Medium — Case-study method risks cherry-picking representative narratives

**Evidence:** Qualitative case studies are selected as "representative cases" for smooth, painful, expensive, review-heavy, and planning-failure workflows, but the plan does not define selection criteria, negative-case handling, or how to prevent dramatic cases from dominating conclusions.

**required_fix:** Add case-study sampling rules: select cases from coded strata using explicit criteria, include at least one negative/disconfirming case for major claims, document why each case was selected, and distinguish illustrative anecdotes from evidence supporting a recurring pattern.

### 5. Severity: Medium — Human workflow cost is not separated from token/tool cost

**Evidence:** Performance signals track agents, tool calls, files, tokens, cost, and time metrics, while workflow friction tracks clarification turns and fix cycles. The plan does not separately measure operator burden such as decision interruptions, re-explaining requirements, reviewing low-signal output, or supervising agents.

**required_fix:** Add human-burden metrics alongside performance metrics: user turns spent correcting/rescuing, number of repeated intent statements, review burden from duplicate/low-value findings, manual validation burden, and elapsed time between user request and usable handoff when available.
