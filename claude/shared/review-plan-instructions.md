# Review Plan — Adversarial Expert Review Command

Launch parallel expert reviewers against a plan file to identify risks, ambiguities, and missing validation gates. The expert panel is dynamically composed based on the plan's content — 3 mandatory reviewers plus domain-specific experts selected to match the technologies and workflows involved.

## Parameters

```
/review-plan <path-to-plan-file>
```

- `<path-to-plan-file>` (required): Path to the plan file (markdown, YAML, or any text format)

If no path is provided, use AskUserQuestion to ask: "Which plan file should I review?"

## Architecture — Delegated Coordinator

```
User runs /review-plan .specs/my-plan/plan.md
         │
         ▼
    Primary (you) reads plan, composes expert panel
         │
         ▼
    Primary launches ONE coordinator agent (general-purpose, sonnet)
    with: plan text, panel composition, all reviewer prompts, full instructions
         │
         ▼
    Coordinator launches ALL reviewers in parallel (Task tool)
    Reviewers return findings as response text into coordinator's context
         │
         ▼
    Coordinator holds all findings in its context (no files needed)
    Coordinator runs rebuttals internally or via sub-agents
         │
         ▼
    Coordinator verifies CRITICAL/HIGH findings against codebase
    Coordinator deduplicates, classifies bugs vs hardening
         │
         ▼
    Coordinator writes ONLY synthesis.md to review-{N}/ directory
    Coordinator returns clean summary to primary context
         │
         ▼
    Primary presents summary to user + offers to apply fixes
```

### Why Delegated Coordinator?

The coordinator agent absorbs all raw reviewer output in its own context, keeping the
primary context clean. This solves two problems:

- **No context pollution** — primary context never sees 4-8 verbose reviewer reports
- **No intermediate files** — findings live in coordinator's context, not on disk
- **One synthesis file** — only `synthesis.md` is written, as the audit trail
- **Rebuttals are internal** — coordinator has all findings in context, can cross-pollinate
  without launching additional agents or writing/reading files

---

## Review Output Directory

**Directory structure** (minimal — only synthesis is persisted):
```
.specs/{plan-name}/
  plan.md                          # the plan being reviewed
  review-1/                        # first review round
    synthesis.md                   # final synthesized review (only output file)
  review-2/                        # second review round (if re-reviewed)
    synthesis.md
```

**Deriving `plan-name`**:
- If the plan path is under `.specs/`, use the directory name immediately under `.specs/`
  (e.g., `.specs/update-cve-checker/plan.md` → `update-cve-checker`)
- Otherwise, use the stem of the plan file name or the parent directory name

**Deriving `review-{N}`**:
- Count existing `review-*` directories inside `.specs/{plan-name}/` and use the next number
- First review → `review-1`, second → `review-2`, etc.

---

## Step 1: Read, Analyze, and Compose Expert Panel

**You (the primary) do this directly.**

1. Read the plan file at the provided path
2. Verify it contains actionable content (not empty, not a stub)
3. **Analyze the plan** to determine which domains it touches
4. **Compose the expert panel**:
   - Always include the 3 mandatory reviewers (Completeness, Adversarial, Outside-the-Box)
   - Select additional dynamic reviewers. Use the **Suggested Expert Pool** (below) as a
     starting point, but invent reviewers if the plan needs coverage the pool doesn't provide.
   - Target 4-6 total reviewers for most plans; up to 8 for complex cross-cutting plans
5. **Determine the review output directory**: Derive `plan-name` and `review-{N}`.
   Create the directory with `mkdir -p`.
6. **Present the panel to the user** with one-line justifications. Include the output
   directory path. Then launch the coordinator immediately — do not wait for approval.

---

## Step 2: Launch Coordinator Agent

Launch a **single** coordinator agent that will manage the entire review process:

```
subagent_type: general-purpose
model: sonnet
max_turns: 25
```

The coordinator prompt MUST include:
1. The **complete plan text** (verbatim)
2. The **expert panel** you composed (reviewer names, roles, and which are mandatory vs dynamic)
3. The **full reviewer prompt templates** for each reviewer (from the Mandatory/Dynamic sections below)
4. The **severity calibration block** (below)
5. The **coordinator instructions** (below)
6. The **review output directory path** for writing synthesis.md
7. The **output budget rule**: every reviewer prompt must include
   `"Keep your total response under 15,000 characters. Do not quote the plan text back — reference sections by heading name instead."`

### Coordinator Instructions

Include these instructions verbatim in the coordinator's prompt:

```
You are a review coordinator. Your job is to:

1. LAUNCH ALL REVIEWERS in a SINGLE message using the Task tool (parallel).
   Each reviewer gets: their persona prompt + the severity calibration block +
   the plan text + the output budget rule. Use subagent_type: general-purpose,
   model: sonnet, max_turns: 5 for each (except OtB which gets max_turns: 8).

2. COLLECT FINDINGS — all reviewer responses land in your context.

3. CROSS-POLLINATE (rebuttals) — you now have all findings in context.
   For each domain expert finding, assess proportionality (would OtB call it
   OVERKILL?). For each OtB recommendation, assess whether domain experts
   would AGREE, PARTIAL, or DISAGREE. You can do this yourself since you
   have all perspectives — only launch rebuttal sub-agents if the findings
   are complex enough to warrant it (8+ HIGH/CRITICAL findings across reviewers).

4. VERIFY CRITICAL/HIGH findings — before accepting any CRITICAL or HIGH finding,
   use tools (Read, Grep, Glob, Bash) to verify the claim against the actual
   codebase. Reviewers frequently make false positive claims. For each:
   - If confirmed → include as-is
   - If incorrect → mark as DISMISSED (false positive) with reason
   - If unverifiable → downgrade to HIGH with "needs human confirmation"

5. SYNTHESIZE — classify into Bugs vs Hardening:
   - Bugs: plan is wrong, will fail if executed as written
   - Hardening: plan works but could be more resilient
   Deduplicate across reviewers. Sort bugs by severity.

6. WRITE synthesis.md to {review_dir}/synthesis.md using the Write tool.
   Use this structure:

   ---
   date: YYYY-MM-DD
   status: synthesis-complete
   ---

   # Plan Review Synthesis: <plan name>

   ## Review Panel
   | Reviewer | Role | Findings | Verified Issues |
   [table of reviewers with finding counts and how many survived verification]

   ## Outside-the-Box Assessment
   [OtB overall verdict — is the approach sound?]

   ## Bugs (must fix before executing)
   [Verified bugs only, sorted by severity. Each with: who flagged it,
   verification result, and specific fix text]

   ## Hardening Suggestions (optional improvements)
   [Sorted by priority. Each with proportionality assessment]

   ## Dismissed Findings
   [False positives with reasons — shows verification rigor]

   ## Positive Notes
   [What the plan gets right]

7. RETURN a concise summary to the primary context. Format:

   ### Review Panel
   [table: reviewer, finding count, verified issues]

   ### Bugs (N confirmed)
   [numbered list: one line per bug with severity]

   ### Hardening (N suggestions)
   [numbered list: one line per suggestion]

   ### Dismissed (N false positives)
   [numbered list: one line per dismissal]

   Keep the returned summary under 3000 characters. The full details are
   in synthesis.md — the summary just needs enough for the user to decide
   whether to apply fixes.
```

---

## Severity Calibration Block

Include this verbatim in the coordinator prompt (it passes it to each reviewer):

```
## Severity Calibration

Rate findings by LIKELIHOOD × IMPACT, not worst-case impact alone:

- **CRITICAL**: Will cause failure, data loss, or outage if the plan is executed as written.
  Not theoretical — you can point to the specific line/command that is wrong.
  **Verification required**: Before reporting any CRITICAL finding, you MUST verify
  your claim using tools (Read, Grep, Glob, Bash) against the actual codebase or the
  plan's own code blocks. If you cannot verify the claim directly, downgrade it to
  HIGH and add a note: "Unverified — needs human confirmation."
- **HIGH**: Likely to cause the migration to fail or leave the system in a bad state
  under realistic conditions.
- **MEDIUM**: Could cause issues under specific but plausible conditions.
- **LOW**: Theoretical edge case requiring 2+ simultaneous unlikely conditions.

Do NOT flag:
- Edge cases requiring 3+ simultaneous failures
- Issues the operator would immediately notice and correct
- "Nice to have" hardening for one-time scripts
- Mitigations for scenarios the plan's stated constraints already accept
- Claims about what a codebase does or doesn't do that you have not verified with tools
```

---

## Mandatory Reviewers (always included)

### Completeness & Explicitness

**Prompt template:**

```
You are a staff engineer reviewing a plan that will be executed by someone with a
COMPLETELY CLEAR context window — they have never seen this codebase, this cluster,
or this conversation. The plan is ALL they have.

Your job is to find every place where the plan assumes knowledge it doesn't provide.
You may use tools (Read, Grep, Glob, Bash) to verify specific claims the plan makes —
check that referenced files exist, resource names are correct, commands will work, and
config values match reality. Do not modify any existing files.

Before evaluating, read every code block, YAML snippet, and command example in the
plan. Filing a finding the plan already addresses is a false positive.

Keep your total response under 15,000 characters. Do not quote the plan text back —
reference sections by heading name instead.

## Evaluation Criteria

1. **Implicit assumptions**: References to files, services, or tools without explanation?
2. **Ambiguous instructions**: Steps that could be interpreted multiple ways?
3. **Missing prerequisites**: What must be true before step 1?
4. **Missing success criteria**: How does the operator KNOW each phase worked?
5. **Missing error handling**: What if a step fails?
6. **Terminology consistency**: Are names and references consistent throughout?
7. **Execution environment**: Is it clear WHERE each command runs?

## Output Format

Return your **top 8 findings**, ordered by severity. For each:
- **Gap**: What is missing or ambiguous (1-2 sentences)
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW
- **Phase**: Which step(s) are affected
- **Suggestion**: Specific fix text (brief — exact addition to the plan)

{SEVERITY_CALIBRATION}

---

## Plan to Review

{PLAN_TEXT}
```

### Adversarial / Red Team

**Prompt template:**

```
You are a red team operator reviewing an infrastructure migration plan. Find the
failure modes the authors didn't consider because they were too close to the problem.

You may use tools (Read, Grep, Glob, Bash) to verify claims and find hidden
assumptions. Do not modify any existing files.

Before evaluating, read every code block and command example in the plan. Filing a
finding the plan already addresses is a false positive.

Keep your total response under 15,000 characters. Do not quote the plan text back —
reference sections by heading name instead.

## Evaluation Approach

1. **Inversion**: What if X appears to work but is broken? False positives?
2. **Cascading failure**: If step N fails silently, what happens at N+1?
3. **Race conditions**: Simultaneous operations, pod restarts, auto-scaler?
4. **Partial failure**: Step half-succeeds?
5. **Human factors**: Copy-paste errors, skipped steps, misread output?
6. **Zombie state**: After rollback, are artifacts left behind?

## Output Format

Return your **top 8 findings**, ordered by severity. For each:
- **Scenario**: What if narrative (1-2 sentences)
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW
- **Phase**: Which step(s) are affected
- **Mitigation**: Specific addition to the plan (brief)

{SEVERITY_CALIBRATION}

---

## Plan to Review

{PLAN_TEXT}
```

### Outside-the-Box / Simplicity

**Prompt template:**

```
You are a principal engineer challenging whether this plan is the RIGHT approach —
not just whether it's executed correctly.

Start by reading the "Problem Statement", "Constraints", and "Alternatives Considered"
sections. These are your calibration baseline.

You MUST search the web to verify best practices for the technologies involved.
You may use tools (Read, Grep, Glob, Bash) to understand the codebase context.
Do not modify any existing files.

**Citation discipline**: Only cite sources that apply to THIS plan's specific
configuration. State why it applies.

Keep your total response under 15,000 characters. Do not quote the plan text back —
reference sections by heading name instead.

## Evaluation Approach

1. **Constraint alignment**: Does complexity match stated constraints?
2. **Proportionality**: Is complexity proportional to the problem?
3. **Industry patterns**: Is this how the technology is meant to be used?
4. **Over-engineering**: Steps that exist "just in case"?
5. **Under-engineering**: Cutting corners on something that matters?

## Output Format

Return your **top 8 findings**, ordered by impact. For each:
- **Observation**: What you noticed (1-2 sentences)
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW
- **Alternative**: A simpler/better approach with evidence
- **Recommendation**: Keep current / Consider alternative / Must change

End with a brief **Overall Assessment** (3-5 sentences).

{SEVERITY_CALIBRATION}

---

## Plan to Review

{PLAN_TEXT}
```

---

## Suggested Expert Pool (starting points, not exhaustive)

These are common reviewer archetypes. Use as-is, adapt, or invent new ones.

### Operational Risk / SRE
**Select when**: Infrastructure migrations, deployments, scaling changes, uptime risk.
**Focus**: Rollback strategy, blast radius, health checks, state transitions.

### Security & Access Control
**Select when**: Auth, networking, secrets, IAM/RBAC, certificates, public endpoints.
**Focus**: Credential handling, privilege scope, network exposure, audit trail.

### Database & Data Integrity
**Select when**: Schema migrations, data moves, backup/restore, replication changes.
**Focus**: Data loss risk, reversibility, connection pools, backup verification.

### Networking & Traffic
**Select when**: Load balancers, DNS, ingress/egress, TLS/certificates, service mesh.
**Focus**: Traffic routing during transition, DNS propagation, connection draining.

### Cost & Efficiency
**Select when**: Cloud resource changes, scaling policies, new provisioning, decommissioning.
**Focus**: Cost impact, reserved instances, spot interruption, billing surprises.

### Compliance & Audit
**Select when**: Logging, monitoring, data retention, access controls in regulated environments.
**Focus**: Audit trail completeness, compliance gaps, data residency, change management.

Dynamic reviewer prompts should follow the same pattern as mandatory reviewers:
persona + evaluation focus + output format + severity calibration + plan text +
15,000 character output budget.

---

## Step 3: Present to User

After the coordinator returns its summary:

1. Present the summary to the user with the review panel table, bugs, hardening, and
   dismissed findings.
2. Note where the full synthesis is: `{review_dir}/synthesis.md`
3. Ask the user:
   - "Apply bug fixes to the plan?" (Recommended — bugs only)
   - "Apply bug fixes + selected hardening — I'll choose which"
   - "Apply everything (bugs + all hardening)"
   - "No changes — review only"

If the user chooses to apply edits, **read synthesis.md** for the full fix text
(the coordinator's returned summary is intentionally brief), then use Edit tool
to update the plan file.

---

## Edge Cases

1. **Plan file doesn't exist**: Report error, ask for correct path
2. **Plan is very short (<20 lines)**: Still review — Completeness will flag gaps
3. **Plan is very long (>500 lines)**: Still send full text — reviewers need full context
4. **No issues found**: Report clean review. A clean review from all experts is meaningful
5. **Reviewers disagree**: Coordinator presents both perspectives in synthesis
6. **Coordinator hits token limit**: If the plan is extremely long (>800 lines), split
   reviewer launches into 2 batches (mandatory first, dynamic second) to stay within limits
