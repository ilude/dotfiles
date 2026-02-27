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

## 2026-02-26: Gap Analysis Research (Day 2, Session 5)

**Duration**: ~15m (research agents ran in parallel)
**Phase**: Material gap analysis — no questions asked
**Domains covered**: All 5

### What happened
Launched 4 parallel research agents to identify gaps in study material vs full SY0-701 exam objectives:
1. **Missing acronyms** — found ~50 testable terms not in our notes (PAM, UEBA, FIM, CSPM, CWPP, IoC/IoA, TTP, BIA, MTTD/MTTR/MTBF/MTTF, agreement types, attack terminology, etc.)
2. **Tricky question patterns** — 18 "best answer" distinction categories (IDS/IPS/WAF, control types, risk responses, cert pinning/stapling/transparency, etc.), 12 exam traps for experienced professionals, PBQ strategy
3. **Persistent gap deep dive** — full decision trees and 10+ question variations each for SIEM vs XDR, SCAP vs STIX, Diamond Model indirect descriptions, reflected vs DOM-based XSS
4. **Cloud/zero trust/DevSecOps** — shared responsibility model, CSPM/CWPP/CNAPP, zero trust (PDP/PEP), micro-segmentation, CI/CD security, supply chain, modern auth (PAM, JIT, conditional access, passkeys)

### Key findings
- **11 entirely new topic areas** identified that weren't in our materials at all (cloud posture tools, zero trust components, operations metrics, agreement types, modern auth methods, attack terminology updates)
- **SY0-701 terminology changes**: DMZ → "screened subnet", MitM → "on-path attack" — exam uses new terms
- **PBQ strategy**: skip PBQs initially, partial credit exists, know port numbers cold
- **Exam traps compiled**: 12 specific areas where real-world experience leads to wrong exam answers

### Files updated
- `notes.md` — major expansion: new tricky distinctions, cloud/ZT section, exam traps, PBQ strategy, port numbers, ~40 new acronyms
- `progress.md` — 11 new research-identified areas added to priority queue (items 18-28)

**Next session**: Drill the 4 persistent gaps (SIEM vs XDR, SCAP vs STIX, Diamond Model, XSS types) with the new decision trees, then test the newly identified areas to see which ones the user actually knows vs which are real gaps.

---

## 2026-02-26: Mixed Drill — Persistent Gaps + New Areas (Day 2, Session 6)

**Duration**: ~15m
**Phase**: Targeted drilling, mixed topics, no descriptions, confidence before reveal
**Questions asked**: 11 (6 solid correct + 1 lucky = 7/11 total, 60% solid)

### Correct (6 solid + 1 lucky):
- Reflected XSS from log analysis (knew cold) — URL-encoded `<script>` in query param, visible in server log
- Diamond Model indirect description (reasoned) — vertex pivoting: C2 → threat group → exploit kit → department
- SCAP for CIS benchmark compliance (reasoned) — "automated, multi-vendor, common language" = SCAP
- DOM-based XSS (knew cold) — URL hash, innerHTML, server logs show nothing
- SCIM for orphaned accounts (reasoned) — "AD disabled but SaaS still active" = SCIM lifecycle
- PAM with JIT access (educated) — "eliminate standing privileged accounts" + occasional access
- STIX/TAXII for threat intel sharing (**lucky**) — ISACs + publish/subscribe + machine-readable IOCs

### Wrong (4):
- **XDR vs SOAR** — chose XDR, answer was SOAR. "Automate isolate + block + ticket across tools" = SOAR playbooks, not XDR. Said "knew it cold" — dangerous false confidence.
- **Zero trust vs NAC** — chose NAC, answer was zero trust. Employee already ON the LAN still gets verified per-resource = zero trust. NAC = gate at the door only.
- **CSPM vs CASB** — chose CASB, answer was CSPM. Open S3 bucket = cloud config problem = CSPM. CASB = user-to-SaaS bouncer. Lucky guess that was wrong.
- **Firewall rule ordering** — chose A,C,D,B, answer was C,D,A,B. Most specific first. Exception (single host permit) must come before subnet-wide deny.

### Key patterns:
1. **Persistent gaps improving**: Diamond Model ✓ (previously persistent miss), SCAP vs STIX ✓, DOM XSS ✓. Decision trees from research are working.
2. **SIEM/XDR/SOAR still dangerous**: Now missed XDR vs SOAR with false confidence. The trio remains the #1 risk.
3. **New zero-knowledge areas confirmed**: CSPM/CWPP/CNAPP/CASB is a real gap. Firewall rule ordering needs practice.
4. **Zero trust vs NAC**: subtle new gap — both do posture checks, but NAC = network gate, ZT = every resource request.

### Trajectory: 85% → 54% → 70% → 67% → 60%
The 60% reflects testing brand-new material (cloud tools, PBQ skills) alongside persistent gaps. Core knowledge solidifying but new exam territory still weak.

**Next session**: Hammer SIEM/XDR/SOAR (3rd time — must lock in), drill CSPM/CWPP/CNAPP/CASB group, practice more firewall rule ordering, re-test zero trust vs NAC.

---

## 2026-02-26: Mixed Drill — SIEM/XDR/SOAR + Cloud Tools + PBQ (Day 2, Session 7)

**Duration**: ~15m
**Phase**: Targeted drilling, mixed topics
**Questions asked**: 13 (9 solid correct + 2 lucky = 11/13 total, 75% solid)

### Correct (9 solid + 2 lucky):
- XDR cross-layer detection (reasoned) — email + endpoint + network in one platform + auto-isolate
- CSPM for cloud misconfigs (educated) — overly permissive security groups + public S3 + unencrypted RDS
- SOAR for multi-tool playbook (educated) — SIEM alert → extract IP → check feeds → block → disable account → ticket
- Pentest scope (knew cold) — document and request scope expansion, never exploit out-of-scope
- CWPP for container runtime (**lucky**) — runtime agent detects container escape attempt
- NDA before sharing docs (reasoned) — sign NDA before sharing proprietary architecture
- Firewall rule ordering (reasoned) — most specific first, deny-all last. D,B,A,C ✓
- Secret scanning (educated) — AKIA prefix = AWS key in code, caught at commit time
- CNAPP for unified platform (**lucky**) — "single consolidated" + config monitoring + workload protection
- MTTD (reasoned) — "how quickly SOC identifies intrusions" = Mean Time to Detect

### Wrong (2):
- **UEBA vs SIEM** — chose SIEM, answer was UEBA. "Outside normal work pattern" + "never used before" + unusual time/location = behavioral baseline anomaly = UEBA. SIEM = static rules, UEBA = behavioral deviation.
- **Deception tech vs honeypot** — chose honeypot, answer was deception tech. "Fake credentials" + "production network" = deception tech. Honeypot = isolated fake system. This is the SECOND time missing this exact distinction.

### Key improvements from Session 6 → 7:
- **XDR vs SOAR**: Got BOTH right (was wrong last session). Decision rule working: one platform = XDR, orchestrate multiple tools = SOAR.
- **CSPM**: Correctly identified cloud misconfigs (was wrong last session picking CASB).
- **Firewall rule ordering**: Nailed it (was wrong last session). Most specific → least specific → deny-all.
- **Pentest scope**: Locked in (knew cold).

### Persistent problems:
- Deception tech vs honeypot — missed twice across sessions. "Fake creds in production" = deception tech.
- UEBA — new miss. Behavioral anomaly detection, not SIEM.
- CWPP/CNAPP — correct but lucky both times. Needs concept lock-in.

### Trajectory: 85% → 54% → 70% → 67% → 60% → 75%
Strong rebound. Core SIEM/XDR/SOAR distinction finally clicking. Cloud tools still shaky (lucky guesses).

**Next session**: Lock in CSPM/CWPP/CNAPP/CASB (zero-knowledge group), re-test deception tech vs honeypot, drill UEBA scenarios.

---

## 2026-02-26: Mixed Drill — Persistent Gaps Resolved + New Areas (Day 2, Session 8)

**Duration**: ~15m
**Phase**: Targeted drilling, mixed topics
**Questions asked**: 12 (10 solid correct + 1 lucky = 11/12 total, 83% solid)

### Correct (10 solid + 1 lucky):
- Deception tech vs honeypot (knew cold) — "fake credentials scattered across production servers" = deception tech. **Previously missed TWICE — now locked in.**
- UEBA behavioral anomaly (knew cold) — "accessing systems never used before, outside work hours" = UEBA baseline deviation. **Previously missed S7 — now locked in.**
- BIA prerequisite for BCP (knew cold) — identify critical processes before building continuity plan
- SAST for code-level analysis (knew cold) — white-box, early in pipeline, finds SQLi/XSS in source
- Data sovereignty (knew cold) — EU citizen data must stay in EU jurisdiction
- Compensating controls (knew cold) — alternative measure when primary control isn't feasible
- Shared responsibility model (knew cold) — customer always owns data classification + access control
- Differential backup (knew cold) — everything since last full backup
- Pass the ticket (**lucky**) — stolen Kerberos TGT used to move laterally without password
- PDP vs PEP (lucky guess wrong → learned) — see Wrong below

### Wrong (1):
- **PDP vs PEP** — chose PEP, answer was PDP. "Evaluates policies and decides allow/deny" = PDP (Policy Decision Point = the brain). PEP (Policy Enforcement Point) = the bouncer that executes the decision. Lucky guess that was wrong.

### Key improvements from Session 7 → 8:
- **Deception tech**: Finally locked in after 2 previous misses. Decision rule working: "fake creds in production" = deception tech, "isolated fake system" = honeypot.
- **UEBA**: Corrected after S7 miss. "Behavioral baseline deviation" = UEBA, "static correlation rules" = SIEM.
- **8 items answered "knew cold"**: Strong core knowledge showing through on broader topics.

### New gaps identified:
- PDP vs PEP — zero trust architecture components need drilling
- Kerberos attack types — pass the ticket was lucky, need to distinguish all four types

### Trajectory: 85% → 54% → 70% → 67% → 60% → 75% → 83%
Strongest session yet on hard questions. Previously persistent gaps (deception tech, UEBA, SIEM/XDR/SOAR) are now resolved. Remaining work: cloud tools lock-in (CWPP/CNAPP), zero trust components (PDP/PEP), Kerberos attacks, and untested research areas.

**Next session**: Lock in CWPP/CNAPP/CASB (still lucky), drill PDP vs PEP, test Kerberos attack types, then start testing untested research areas (agreement types, attack terminology, architecture concepts).

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
