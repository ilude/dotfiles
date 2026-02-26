# Security+ SY0-701 — Session Log

## Session History

## 2026-02-26: Initial Assessment (Day 1)

**Duration**: ~30m
**Phase**: Assessment
**Domains covered**: All 5 (4, 2, 5, 3, 1 — in weight order)
**Questions asked**: 27 (23 correct / 4 wrong = 85%)
**Results by domain**:
- Domain 4 (28%): 89% — Strong (missed 4.7 SAML vs session)
- Domain 2 (22%): 80% — Strong (missed 2.2 BEC vs typosquatting)
- Domain 5 (20%): 80% — Strong (missed 5.1 risk matrix vs quantitative)
- Domain 3 (18%): 75% — Moderate-Strong (missed 3.3 tokenization vs pseudonymization)
- Domain 1 (12%): 100% — Strong (clean sweep)
**Key pattern**: All misses involve distinguishing similar concepts — "which is BEST" when two options are close
**Note**: Answer descriptions inflated scores — user was able to reason from context clues

---

## 2026-02-26: Rule-of-Thumb Drilling + Mixed Drill (Day 1, Session 2)

**Duration**: ~45m
**Phase**: Targeted drilling (4 weak spots) + mixed cold drilling (no descriptions)

### Rule-of-Thumb Re-tests (4/4 correct):
- 2.2 BEC re-test ✓
- 4.7 OAuth token lifetime ✓
- 5.1 Quantitative/ALE for CFO question ✓
- 3.3 Tokenization for PCI ✓

### Mixed Drill Without Descriptions (13 correct / 9 wrong / 1 no-answer = ~54%):
**Correct**: STIX/TAXII, token replay, SYN scan, data retention addendum (reasoned), SCAP (**lucky**), SCA+image signing (**lucky**), SOC 2 Type II (educated), legal hold (knew), SAML (reasoned), dual control (educated), CASB (**lucky**), GDPR erasure (reasoned), differential backup (knew)

**Wrong**: PCI hosted payment fields, RoPA vs PIA, deception tech vs honeynet (**thought knew**), NAC vs EDR, stored XSS vs CSRF, kill chain sandbox phase, pentest scope (**thought knew**), MITRE ATT&CK (**lucky guess wrong**), MAC vs RBAC (**lucky guess wrong**)

**No idea**: CRL/OCSP

### Key Discoveries:
1. **Acronym gap is the #1 risk** — user knows concepts but not newer exam terminology (SCAP, SCA, CASB, ZTNA, MITRE ATT&CK, RoPA, OCSP, deception technology)
2. **Answer descriptions were a crutch** — removing them dropped accuracy from 85% to 54%
3. **Real-world experience conflicts** — pentest scope, deception tech classification
4. **True readiness estimate**: ~65-70%, below 83% passing threshold
5. **Confidence tracking revealed** — several "correct" answers were lucky guesses that shouldn't count as known

### Quiz Format Changes Applied:
- Removed answer descriptions (exam doesn't have them)
- Added confidence check after each question
- Always expand acronyms in explanations
- No priming before questions, mixed topic order

**Next session**: Continue priority queue drilling (14 items). Focus on acronym→concept mapping. Target getting to 80%+ on hard questions without descriptions.

---

<!--
Template for new entries:

## YYYY-MM-DD: Session Title

**Duration**: ~Xm
**Phase**: Assessment / Drilling / Practice Exam
**Domains covered**: X, Y
**Questions asked**: N (correct/total)
**Key improvements**: Objective X.Y moved from weak → moderate
**Next session**: Pick up with...
-->
