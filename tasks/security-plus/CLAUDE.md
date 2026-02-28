# Security+ SY0-701 Study System

## Quick Start

When starting a study session, read these files in order:
1. This file (context + instructions)
2. `progress.md` (current knowledge map)
3. `sessions.md` (last session recap)
4. `notes.md` (accumulated knowledge)

Then pick up where we left off based on current phase.

## Exam Reference

- **Exam**: CompTIA Security+ SY0-701
- **Target date**: ~March 1, 2026
- **Format**: 90 questions, 90 minutes, 750/900 to pass (~83%)
- **Question types**: Multiple-choice + Performance-Based Questions (PBQs)

### Domain Weights

| Domain | Weight | Description |
|--------|--------|-------------|
| 4 | 28% | Security Operations |
| 2 | 22% | Threats, Vulnerabilities, and Mitigations |
| 5 | 20% | Security Program Management and Oversight |
| 3 | 18% | Security Architecture |
| 1 | 12% | General Security Concepts |

## Study Timeline (3 Days)

### Day 1: Assessment + Triage
- Rapid assessment: ~3-5 questions per domain (heaviest domains first)
- Record scores to `progress.md` immediately after each domain
- After full assessment, drill weakest areas in heaviest domains

### Day 2: Targeted Drilling
- Hammer weak/moderate areas from Day 1
- Scenario-based questions (exam style)
- Quick-fire acronym and concept drills
- Re-assess improved areas to confirm "strong"

### Day 3: Practice Exam + Final Review
- Full 90-question simulated practice exam (timed)
- Review all missed questions
- Final cram on remaining weak spots
- Exam strategy tips (PBQ pacing, elimination, time management)

## User Knowledge Profile

The user has 30+ years in IT (since 1995). Core security concepts are strong — the gaps are primarily in **newer acronyms and frameworks from the last ~10 years** where the user knows the underlying concept but not the exam terminology. Examples: knows what a cloud access broker does but not "CASB"; understands vulnerability automation but not "SCAP"; knows deception tactics but not how the exam distinguishes "deception technology" from "honeynet."

**Exam-critical implication**: On the real test, recognizing the acronym IS the question. Drill acronym-to-concept mapping hard.

**Acronym cluster rule**: Getting one acronym right in a group does NOT verify the others. Each acronym is an independent recall target. For example, correctly identifying "OCSP" does not mean "CRL", "stapling", or "pinning" are known. Test and score each acronym individually. Never mark a topic cluster "strong" based on a single member — verify every member separately.

Additional pattern: real-world experience can conflict with exam answers. The exam takes a strict, legalistic view (e.g., pentest scope is exactly what the contract says — no following attack paths out of scope even if discoverable). Flag these "exam vs. real world" distinctions when they arise.

## Current Phase

**Phase**: Day 2 — Final Gap Drilling
**Status**: Eleven sessions complete (32 questions in S11). Trajectory: 85% → 54% → 70% → 67% → 60% → 75% → 83% → 73% → 55% → 69%. Recovered 4 S10 misses (PCI, SCA, LDAPS, order of volatility). MAC/ABAC locked. New misses surfaced in Kerberos attacks, exfiltration techniques, and adaptive auth.
**Next action**: Drill persistent gaps below, then final sweep of untested items.

**Persistent gaps (wrong 2x+ — highest priority):**
1. **Adaptive auth** — wrong 2x (S10: zero trust, S11: conditional access). "Real-time risk adjustment" = adaptive. "Admin IF/THEN rules" = conditional access.
2. **CASB** — wrong 3x + 1 voided (primed). Not yet cold-verified. "Named unauthorized cloud apps" = CASB.
3. **NIST 800-53 vs 800-171** — wrong S11. "Federal + catalog" = 800-53. "Contractor + CUI" = 800-171.

**New gaps from S11 Part 3:**
4. **DNS tunneling vs domain fronting** — wrong S11. "Encoded subdomains" = tunneling. "Legit domain as cover" = fronting.
5. **Pass the ticket vs pass the hash** — wrong S11. "Kerberos ticket" vs "NTLM hash."
6. **SaaS session persistence** — wrong S11. Disabling IdP ≠ killing app session. Same concept as S1 SAML miss.

**Recovering (correct but educated guesses):**
7. MSA ✓ (first correct after 3x wrong), DPIA/RoPA ✓ (both educated), SASE/SSE components recovering.

**Lucky — needs lock-in:**
8. SLSA — "build provenance" = SLSA, "ingredient list" = SBOM.

**Still untested:**
9. SWG (never quizzed cold), kill chain phases (lucky S10), PBQ topics (log analysis, cert tasks).

Then build margin above 83% passing threshold.

## Global Rule: Always Expand Acronyms

**Every acronym must be fully expanded on first use in EVERY response** — quizzes, coaching, explanations, casual discussion, all of it. Write "CSPM (Cloud Security Posture Management)", never bare "CSPM". This applies to ALL acronyms, not just unfamiliar ones. The user may encounter any acronym for the first time. Bare acronyms without expansions are useless if you don't know what the letters stand for.

## Quiz Instructions

When quizzing the user:

1. **ALWAYS EXPAND EVERY ACRONYM ON EVERY USE IN EXPLANATIONS AND COACHING** — This is the #1 rule. The user has 30+ years in IT but does NOT know many acronyms from the last 10 years. EVERY time you mention an acronym in an explanation, answer reveal, or coaching text, write it as "ACRONYM (Full Name)" — e.g., "CSPM (Cloud Security Posture Management)." No exceptions. No shorthand. If you've already expanded it once in the same message, expand it again anyway — repetition builds recognition. On wrong answers involving acronym groups, expand ALL acronyms in the group with one-line definitions. This rule has been violated repeatedly despite being stated — treat it as the highest priority instruction in this file. **HOWEVER: do NOT expand acronyms in questions or answer options** — the real exam uses bare acronyms and the user needs to practice recognizing them cold. Expand ONLY in the post-answer explanation/coaching.
2. **Use AskUserQuestion** with 4 options per question (matches exam format). **Put the ENTIRE question scenario inside the `question` field** — text outside the tool call (in the assistant message) is not visible to the user in the UI. The question field must be self-contained.
3. **One question at a time** — present question, evaluate answer, explain if wrong, then next
4. **Exam-realistic questions** — scenario-based, not textbook definitions. Include distractor options that sound plausible
5. **After each wrong answer** — brief explanation of correct answer + add to `notes.md`
6. **After each domain** — update `progress.md` with score and assessment date
7. **Track per-objective** — map each question to its specific objective number
8. **Keep it engaging** — vary question difficulty, use real-world scenarios, acknowledge good answers
9. **No option descriptions** — answer options should be short labels only, no explanatory text. The real exam doesn't hand-hold with descriptions. Descriptions make educated guessing too easy.
10. **Ask confidence BEFORE revealing the answer** — "Knew it cold / Reasoned it out / Educated guess / Lucky guess". Ask confidence immediately after the user answers, BEFORE saying whether they're right or wrong. Don't count lucky guesses as strong knowledge.
11. **No priming** — do not explain rules of thumb or give hints before asking a question. Mix up topics so the user can't predict what's coming next.
12. **Teach decision rules on wrong answers** — after a miss, explain the distinguishing pattern that reliably points to the correct answer on exam day. Save these to `notes.md`.

### Domain assessment order (heaviest weight first):
1. Domain 4: Security Operations (28%)
2. Domain 2: Threats, Vulnerabilities, and Mitigations (22%)
3. Domain 5: Security Program Management and Oversight (20%)
4. Domain 3: Security Architecture (18%)
5. Domain 1: General Security Concepts (12%)

### Scoring per objective:
- **Strong** (80%+): Consistently correct, understands nuance
- **Moderate** (50-79%): Gets basics, misses details
- **Weak** (<50%): Needs focused study
- **Not assessed**: No questions asked yet

## Branch Rule

All Security+ study materials live on the `secplus` branch ONLY. Never merge to main. When studying is complete and the exam is passed, delete the branch and all evidence:
```bash
git push origin --delete secplus
git branch -D secplus
```

## File Purposes

| File | Purpose | Updated when |
|------|---------|-------------|
| `CLAUDE.md` | This file — session bootstrap, phase tracking | Phase changes |
| `progress.md` | Knowledge map, per-objective scores | After each domain assessment |
| `notes.md` | Running study notes, mnemonics, corrections | After each wrong answer |
| `sessions.md` | Session log with dates and outcomes | End of each session |
