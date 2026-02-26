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

## 2026-02-26: Second Assessment — Realistic Baseline (Day 1, Session 3)

**Duration**: ~30m
**Phase**: Re-assessment without descriptions, mixed topics, confidence tracked
**Questions asked**: 20 (14 correct / 6 wrong = 70%)

### Correct (14):
- Incident triage (reasoned), session hijacking (educated), DNS filtering (knew), NIST SP 800-53 (educated)
- EDR (reasoned — previously missed NAC/EDR, now distinguishing correctly), insider threat (knew)
- Emergency change (knew), stateful firewall (knew), known vuln exploitation (knew)
- EAP-TLS (reasoned), forensic hashing (knew), directory traversal (knew)
- FIDO2/WebAuthn (reasoned), hardware TOTP offline (knew)

### Wrong (6):
- **XDR vs SIEM** (reasoned wrong) — "unified detection across layers" = XDR, not SIEM
- **Fault tolerance vs HA** (reasoned wrong) — "no user impact" = fault tolerance, "minimal downtime" = HA
- **ASV vs QSA vs ISA** (lucky) — PCI quarterly scans = ASV, on-site audit = QSA, internal = ISA
- **SCIM vs SAML** (reasoned wrong) — SAML stops login, SCIM removes the account. "Orphaned accounts" = SCIM
- **CloudFront OAI** (educated wrong) — AWS-specific, lower exam priority
- **Data owner vs custodian** (educated wrong) — owner decides policy, custodian implements

### Key Takeaways:
1. **Improvement is real** — 54% → 70% between drill rounds
2. **"Reasoned wrong" is the biggest risk** — 3 of 6 misses were confident but wrong. Exam killers.
3. **New gaps found**: SIEM vs XDR, fault tolerance vs HA, SCIM, data governance roles, ASV/QSA/ISA
4. **Confirmed strong**: networking, forensics, IR, change mgmt, web vulns, MFA types
5. **Pattern holds**: newer terminology and subtle exam distinctions are the gaps

**Next session**: Day 2 drilling. Focus on 17-item priority queue. Target: 80%+ on hard questions.

---

## 2026-02-26: Priority Queue Drilling (Day 1, Session 4)

**Duration**: ~20m
**Phase**: Priority queue drilling, no descriptions
**Questions asked**: 12 (8 correct / 4 wrong = 67%)

### Locked In (confirmed strong):
- NAC (posture check + remediation VLAN), ATT&CK (T-numbers + matrix), CSRF (hidden form + auto cookie)
- Kill Chain (sequential phases: delivery/exploitation/installation/C2), Stored XSS (persists in DB, hits all viewers)
- ASV (PCI quarterly external scans), ZTNA (replaces VPN, per-app access)

### Still Struggling:
- **SIEM vs XDR** — missed TWICE. "SIEM collects, XDR connects." Must burn in.
- **SCAP vs STIX** — keeps picking STIX for vuln scanning. "STIX = threat sharing, SCAP = vuln scanning."
- **Diamond Model** — gets it when vertices are named, misses when described indirectly. Look for 4 relationship elements.
- **Reflected vs DOM-based XSS** — server returns payload = reflected, client JS processes = DOM-based.

### Trajectory: 85% → 54% → 70% → 67%
The 67% reflects drilling the hardest items from the priority queue. Core knowledge solidifying, but 4 persistent gaps remain.

**Next session**: Day 2. Hammer SIEM vs XDR, SCAP vs STIX, Diamond Model (indirect descriptions), reflected vs DOM XSS. Then broader drilling to build margin above 83%.

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
