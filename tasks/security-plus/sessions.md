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

## 2026-02-26: Research Area Sampling (Day 2, Session 9)

**Duration**: ~20m
**Phase**: Triage sampling — testing research areas to find real gaps vs already-known
**Questions asked**: 15 (11 solid correct + 2 lucky + 2 wrong = 73% solid, 87% total)

### Correct — Confirmed Strong (11 solid):
- UEBA behavioral anomaly (educated) — unusual time + never-used system + foreign IP
- Pass the ticket (knew cold) — stolen Kerberos TGT from memory
- Downgrade attack (knew cold) — force SSLv3 over TLS 1.3
- DNS tunneling (educated) — encoded strings in subdomains, periodic queries
- Compensating control for ICS (knew cold) — can't patch, use alternative protection
- SDN (educated) — control plane decoupled from data plane, central controller
- Credential stuffing (reasoned) — breached pairs from Site A tried on Site B
- PDP (reasoned) — evaluates policies, returns allow/deny decision. **Recovered from S8 miss.**
- Fault tolerance (knew cold) — zero interruption after component failure. **Recovered from S3 miss.**
- Password spraying (reasoned) — one password across many accounts, spaced to avoid lockout
- NIDS for ICS/SCADA (educated) — can't install agents on proprietary RTOS, monitor network

### Correct but Lucky (2):
- **MSA** — general terms without specific deliverables. Lucky guess — needs drilling.
- **CRL** — downloads list of revoked serial numbers. Lucky guess — needs drilling with OCSP/stapling/pinning.

### Wrong (2):
- **ALE formula** — chose $40,000, answer was $16,000. Forgot the ARO step: ALE = AV × EF × ARO = $200k × 0.4 × 0.2 = $16k. Ignored the revenue distractor correctly but miscalculated.
- **Pyramid of Pain** — chose hash values (bottom), answer was TTPs (top). "Hardest to change" = top of pyramid = TTPs. Hashes are trivial to change.

### Key findings:
1. **Most research areas are already known** — 11/15 solid from experience. Only 4 items need real work.
2. **Previously missed items recovering**: PDP vs PEP ✓ (missed S8, correct S9), fault tolerance ✓ (missed S3, correct S9).
3. **4 real gaps found**: ALE formula, Pyramid of Pain, agreement types, CRL/OCSP group.
4. **Attack terminology is strong**: downgrade, credential stuffing, password spraying, DNS tunneling all correct.
5. **Architecture/infrastructure strong**: SDN, ICS/SCADA protection both educated-correct.

### Trajectory: 85% → 54% → 70% → 67% → 60% → 75% → 83% → 73%
The 73% reflects sampling brand-new areas. Core is solidifying — the remaining gap is narrow: 4 drillable items + a few untested medium-priority topics.

**Next session**: Drill the 4 gaps (ALE formula, Pyramid of Pain, agreement types, CRL/OCSP), then CWPP/CNAPP lock-in, then sweep remaining medium-priority untested items.

---

## 2026-02-27: Full Sweep Drilling (Day 2, Session 10)

**Duration**: ~30m
**Phase**: Gap drilling + medium-priority sweep
**Questions asked**: 29 (14 solid + 2 lucky correct + 11 wrong + 2 voided = ~54% solid)

### S9 Gaps — Resolved (5/6):
- ALE formula ✓ (reasoned) — recovered from S9 miss
- Pyramid of Pain ✓ (knew cold) — recovered from S9 miss
- OCSP stapling ✓ (educated) — recovered from S9 lucky
- CWPP ✓ (reasoned) — no longer lucky, confirmed with re-test
- Zero trust vs NAC ✓ (reasoned) — recovered from S6 miss
- MSA vs MOU — still struggling (wrong twice this session, picked MOU then BPA)

### Newly Confirmed Strong:
- Stored XSS, CSRF, password spraying, SSL stripping, pentest scope, MOU, data owner, CSPM, DAST, MAC (on re-test)

### New Gaps Surfaced (wrong or lucky):
- **MSA** — wrong TWICE (picked MOU, then BPA). "Legally binding + general terms + no deliverables" = MSA.
- **ABAC** — wrong (picked DAC). "Multiple conditions must all be true" = ABAC.
- **CASB** — wrong (picked DLP). "Shadow IT / unauthorized apps" = CASB.
- **Adaptive auth** — wrong (picked zero trust). "Same user, different context → different experience" = adaptive auth.
- **NIST CSF** — wrong (picked 800-53). "Five functions" = CSF, "control catalog" = 800-53.
- **PCI scope** — wrong (picked eliminated). PCI is NEVER eliminated, only reduced (SAQ A).
- **SCA** — wrong (picked IAST). "Dependencies + CVEs" = SCA.
- **MAC/DAC** — wrong first, correct on re-test. Recovering.
- **RoPA vs DPIA** — wrong. "Ongoing record" = RoPA.
- **Kill chain** — correct but lucky. Needs re-test.

### Trajectory: 85% → 54% → 70% → 67% → 60% → 75% → 83% → 73% → 54%
The 54% reflects deliberately targeting every untested/weak area. Core knowledge (attacks, forensics, networking, IR) remains strong. The gap is now well-mapped: ~10 specific terminology/concept clusters need lock-in.

### Continuation — Untested Area Sweep (18 more questions, 12/18 = 67%):

**Correct (12)**:
- Physical destruction (educated), EOL compensating controls (reasoned), race condition (knew cold)
- Buffer overflow (knew cold), fileless malware (educated), risk transference (educated)
- WAF vs IPS (knew cold), data states (reasoned), RAID 10 (knew cold)
- IR phases - eradication (reasoned), governance docs - standard (reasoned), tabletop exercise (educated)

**Wrong (6)**:
- Order of volatility (picked swap, answer CPU registers) — swap is on disk, less volatile than CPU/RAM
- Replay vs session hijacking (picked hijacking, answer replay) — "captures + resends later" = replay
- LDAPS port (picked 3389/RDP, answer 636) — port numbers need drilling
- CASB re-test (picked CSPM) — CASB = user-to-app, CSPM = infra config. Still not clicking.
- NIST CSF re-test (picked ISO 27001) — "five functions + strategic + board" = CSF. 2x wrong today.
- DPIA re-test (picked privacy policy) — "new project + risk assessment + before launch" = DPIA. 2x wrong today.

### Full Session 10 Totals: 26/47 solid = ~55%

### Persistent gaps (2x+ wrong in S10 — highest priority for S11):
1. **CASB** — 2x wrong (picked DLP, then CSPM). "Shadow IT / unauthorized apps" = CASB.
2. **NIST CSF** — 2x wrong (picked 800-53, then ISO 27001). "Five functions + board + strategic" = CSF.
3. **DPIA** — 2x wrong (picked DPIA when RoPA, picked privacy policy when DPIA). Whole RoPA/DPIA cluster confused.
4. **MSA** — 3x wrong total (S9 lucky + S10 twice). "Binding + general terms + no deliverables" = MSA.

### Other gaps from S10:
- ABAC, adaptive auth, PCI scope, SCA, replay vs session hijacking, order of volatility, port numbers (636/LDAPS)

### Newly confirmed strong from sweep:
- Race condition, buffer overflow, fileless malware, RAID 10, IR phases, data states at rest/transit/use
- WAF vs IPS vs IDS, risk transference, governance doc hierarchy, tabletop exercise, physical destruction, EOL compensating controls

**Next session**: Hammer the 4 persistent gaps (CASB, NIST CSF, DPIA/RoPA, MSA) from fresh angles — these keep missing. Then re-test replay, ports, ABAC, adaptive auth. Finally hit remaining untested: container/serverless, SASE/SSE, IaaS/PaaS/SaaS distinction.

---

## 2026-02-27: Untested Area Sweep (Day 2, Session 11)

**Duration**: ~25m
**Phase**: Untested area sweep + persistent gap drilling
**Questions asked**: 17 (12 correct / 5 wrong = 71%)

### Part 1 — Untested Area Sweep (7/10):

**Correct (7):**
- Container hardening (reasoned) — hardened base images + non-root users solves both CVEs and root-running
- IaaS shared responsibility (knew cold) — EC2 guest OS patching = customer
- SaaS shared responsibility (knew cold) — platform vulnerability = provider's problem
- Serverless least privilege (knew cold) — over-permissioned Lambda function
- Serverless shared responsibility (knew cold) — no guest OS in FaaS, provider handles it
- CASB (reasoned) — shadow IT + DLP + cloud app visibility = CASB
- Admission controller (educated) — only approved images in K8s = admission controller
- RDP port 3389 (knew cold)
- DNS over TLS port 853 (educated)

**Wrong (3):**
- **SASE vs SSE** — didn't know either. SASE = networking + security converged. SSE = security half only. SD-WAN = networking half.
- **Email ports** — picked 993 + 587 (sending), answer 993 + 995 (retrieval). "Retrieval" = IMAP/POP3 = 993/995. 587 is SMTP sending.
- **CSPM vs IaC static analysis** — picked CSPM, answer static analysis. "Before deployment" = static analysis (shift-left). CSPM monitors already-deployed environments.

### Part 2 — Persistent Gap Drilling (5/7):

**Correct (5):**
- MSA (educated) — "general legal terms, no specific deliverables" = MSA. Recovering from 3x wrong.
- NIST CSF (reasoned) — "five functions + board communication" = CSF. Question named the functions explicitly.
- DPIA (educated) — "new patient portal, evaluate risks before launch" = DPIA.
- RoPA (educated) — "comprehensive document listing every processing activity" = RoPA.
- ABAC (reasoned) — "time + role + training completion all required" = ABAC. Multiple attribute conditions.

**Wrong (2):**
- **NIST 800-53 vs 800-171** — picked 800-171, answer 800-53. "Federal system + control catalog + impact levels" = 800-53. 800-171 = contractors + CUI only.
- **CASB** — picked SWG, answer CASB. 3x wrong total. "Personal Dropbox + unauthorized SaaS tools" = CASB. SWG = web browsing/URL filtering only.

### Key findings:
1. **Shared responsibility model is cold** across all three service models (IaaS/SaaS/FaaS) — no further drilling needed.
2. **SASE/SSE is a new cluster** — SASE itself was unknown, but sub-components (CASB, ZTNA) are recognizable.
3. **MSA recovering** — correct for first time after 3 prior misses, but only educated guess.
4. **DPIA/RoPA pair both correct** — educated guesses, but the decision rule is clicking: "new project risk" = DPIA, "ongoing record" = RoPA.
5. **CASB still not sticking** — 3x wrong now (DLP, CSPM, SWG). Decision rule written to notes: "employees using named unauthorized cloud apps" = always CASB.
6. **NIST framework cluster needs individual drilling** — CSF correct when functions named, but 800-53 vs 800-171 confused.

### Part 3 — Mixed Cold Drilling (10/15 solid, 1 lucky, 1 voided):

**Correct (10):**
- Replay attack (reasoned) — "captures token, uses later" = replay. Distinct from session hijacking (real-time takeover).
- PCI scope / SAQ A (knew cold) — hosted payment page reduces scope, never eliminates PCI. **Recovered from S10 miss.**
- SCA (educated) — "open-source libraries + known vulnerabilities" = SCA. **Recovered from S10 miss.**
- LDAPS port 636 (reasoned) — outbound 636 to external IP = suspicious. **Recovered from S10 miss.**
- Evil twin (reasoned) — rogue AP with same SSID, intercepts traffic.
- Order of volatility (knew cold) — CPU registers → RAM → network → disk. **Recovered from S10 miss.**
- MAC (knew cold) — classification labels, clearance levels, compartments, no override = MAC.
- Reflected XSS (knew cold) — payload in URL, server reflects, victim clicks crafted link.
- EAP-TLS (educated) — "certificate on device" for Wi-Fi = EAP-TLS. Only EAP method requiring client certs.

**Wrong (4):**
- **Adaptive auth** — picked conditional access (2x wrong now). "System automatically adjusts requirements based on real-time risk" = adaptive auth. "Admin-configured IF/THEN rules" = conditional access.
- **Pass the ticket** — picked pass the hash. "Kerberos ticket" = pass the ticket. "NTLM hash" = pass the hash. Look for credential TYPE.
- **DNS tunneling** — picked domain fronting. "Encoded subdomains" = DNS tunneling. "Legit domain as cover" = domain fronting.
- **SaaS session vs SSO token** — picked SSO token. Disabling IdP stops NEW logins, but existing SaaS app sessions persist independently. Must revoke app sessions too.

**Lucky (1):**
- SLSA — correct but lucky. "Build pipeline integrity / provenance" = SLSA. "Ingredient list" = SBOM.

**Voided (1):**
- CASB — correct but question was primed (announced "let me test CASB" before asking). Does not count.

### Full Session 11 Totals: 22/32 solid = 69% (+ 1 lucky, 1 voided)

### Trajectory: 85% → 54% → 70% → 67% → 60% → 75% → 83% → 73% → 55% → 69%

### Key improvements S11:
- **PCI scope** — recovered (cold). "Reduce, never eliminate."
- **SCA** — recovered (educated). "Dependencies + known CVEs."
- **LDAPS 636** — recovered (reasoned).
- **Order of volatility** — recovered (cold). CPU > RAM > network > disk.
- **MAC** — locked in (cold). Labels + no override.
- **DPIA/RoPA** — both correct (educated). Decision rule working.
- **MSA** — first correct after 3x wrong (educated). Needs cold confirmation.
- **CASB** — untestable this session (primed). Still needs cold verification.

### Persistent gaps after S11:
- **Adaptive auth** — 2x wrong (S10 + S11). Keeps picking conditional access or zero trust.
- **CASB** — 3x wrong + 1 voided. Decision rule written but not cold-verified.
- **DNS tunneling vs domain fronting** — wrong S11. New confusion.
- **Pass the ticket vs pass the hash** — wrong S11. Credential type distinction not sticking.
- **SaaS session persistence** — wrong S11 (same concept as S1 SAML miss). IdP ≠ app session.
- **NIST 800-53 vs 800-171** — wrong S11. Federal = 800-53, contractor/CUI = 800-171.
- **SLSA** — lucky. Build provenance = SLSA, ingredient list = SBOM.

**Next session**: CASB cold test (no announcement), adaptive auth re-test, DNS tunneling vs domain fronting, pass the ticket vs pass the hash. Then final sweep of remaining untested items.

### Part 4 — Untested Objective Sweep (8/9 solid, 2 voided):

**Correct (8):**
- EOL software risk register (reasoned) — document + compensating controls FIRST, migrate later. (4.2)
- Kill chain: delivery phase (reasoned) — sending phishing email = delivery, not weaponization. (2.5)
- Chain of custody (knew cold) — who handled evidence, when, documented at every step. (4.9)
- Data exfiltration from proxy logs (knew cold) — sensitive files to personal cloud, no business need. (4.9)
- Unpatched MDM devices (reasoned) — 90-day stale devices with corporate data = biggest risk. (4.2)
- Artifact evidence (reasoned) — file system metadata, timestamps, journaling = digital artifacts. (4.9)
- NAC posture checks (knew cold) — OS version + encryption + endpoint agent at connection time. (4.1)
- Memory dump first (reasoned) — running processes and network connections live in RAM, volatile. (4.9)

**Wrong (1):**
- **Data sanitization** — picked crypto erasure, answer overwriting. "Reuse/donate" = overwrite. Crypto erasure only works if drive was already encrypted (not stated). (4.2)

**Voided (2):**
- Firewall logs as data source — answer was in the question stem ("reviewed the firewall logs").
- Kill chain lateral movement — "lateral movement" used in stem and as answer option.

### Updated S11 Totals: 30/41 solid = 73% (+ 1 lucky, 3 voided)

### Trajectory: 85% → 54% → 70% → 67% → 60% → 75% → 83% → 73% → 55% → 73%

### Objectives newly assessed from Part 4:
- **4.2** (asset management) — Moderate-Strong. EOL risk register ✓, MDM stale devices ✓, data sanitization wrong.
- **4.9** (forensic data sources) — Strong. Chain of custody cold, exfiltration from logs cold, artifact evidence reasoned, memory dump reasoned.
- **2.5** (kill chain) — Moderate. Delivery phase correct (reasoned), but only 1 clean question tested.

### CRITICAL PROCESS NOTE:
No-priming rule elevated to CRITICAL. Four violations this session: announced CASB test, used answer in question stem (replay, firewall logs), explained concept then immediately quizzed on it (ZTNA after SASE teaching). All future questions must be cold with no telegraphing.

### Research Agents (end of S11):
Launched 6 parallel research agents to find varied exam question angles for persistent gap areas and fragile-correct topics:
1. **CASB** — 8 alternate angles beyond shadow IT (tokenization, BYOD reverse proxy, API scanning, OAuth abuse)
2. **Adaptive auth** — decision tree; SY0-701 says "policy-driven access control" not "conditional access"
3. **Kerberos + exfiltration** — artifact-based decision trees, added golden/silver ticket, AS-REP roasting
4. **NIST + data sanitization** — added RMF, NIST SP 800-88 levels, SSD degaussing gotcha
5. **Fragile-correct topics** — DPIA/RoPA 6 angles, IAST/RASP, EAP mutual auth, SLSA/SBOM EO 14028
6. **Locked-in edge cases** — SIEM compliance, MDR as service, deception granularity, SCAP components, kill chain vs ATT&CK linearity

All compiled into `notes.md` under "Exam Question Angle Variations (Research — S11)."

**Next session**: CASB cold (no announcement), adaptive auth, DNS tunneling vs domain fronting, pass the ticket vs pass the hash. Practice exam readiness check.

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
