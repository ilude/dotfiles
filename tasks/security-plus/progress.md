# Security+ SY0-701 — Progress Tracker

## Overall Readiness

**Status**: Day 2 drilling — 11 sessions complete, untested areas being swept
**Estimated score**: ~80% (weighted) — near passing threshold (750/900 = ~83%)
**Last updated**: 2026-02-27
**Resolved from S9**: ALE ✓, Pyramid of Pain ✓, OCSP stapling ✓, CWPP ✓, zero trust vs NAC ✓
**Persistent gaps (missed 2x+ in S10)**: CASB (2x), NIST CSF (2x), DPIA/RoPA (2x), MSA (3x total)
**Other gaps**: ABAC, adaptive auth, PCI scope, SCA, replay vs session hijacking, port numbers (LDAPS 636)
**Newly confirmed strong**: Race condition, buffer overflow, fileless malware, RAID 10, IR phases, data states, WAF vs IPS, risk transference, governance docs, tabletop exercise, physical destruction, EOL/compensating controls
**Trajectory**: 85% → 54% → 70% → 67% → 60% → 75% → 83% → 73% → 55% → 71% (sweep + gap drill)
**Session 11**: 71% (12/17) — swept untested areas then drilled persistent gaps. Shared responsibility cold across IaaS/SaaS/FaaS. MSA recovering (correct first time after 3x wrong). DPIA/RoPA pair both correct (educated). CASB still missing (3x wrong total — picked SWG this time). NIST 800-53 vs 800-171 confused.

---

## Domain 1: General Security Concepts (12%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 1.1 Compare security controls | Moderate | 2026-02-27 | MAC vs DAC missed S10 (picked DAC, answer MAC). Labels+no override=MAC, owner shares=DAC. |
| 1.2 Summarize fundamental security concepts | Strong | 2026-02-26 | CIA triad — availability ✓ |
| 1.3 Explain change management importance | Strong | 2026-02-26 | Impact analysis / peer review ✓ |
| 1.4 Explain cryptographic solutions | Moderate-Strong | 2026-02-27 | OCSP stapling ✓ (S10, educated). CRL/OCSP/stapling/pinning group now understood. |

**Domain score**: Moderate — access control models and PKI revocation are gaps

---

## Domain 2: Threats, Vulnerabilities, and Mitigations (22%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 2.1 Compare threat actors and motivations | Moderate | 2026-02-26 | Assessment ✓ (APT) but drill missed MITRE ATT&CK vs Kill Chain vs Diamond vs NIST CSF (lucky guess) |
| 2.2 Explain common threat vectors | Strong | 2026-02-26 | Drilled: attack type vs technique rule. Re-tested ✓ |
| 2.3 Explain types of vulnerabilities | Moderate | 2026-02-26 | Assessment ✓ (SQLi) but drill missed stored XSS vs CSRF (educated guess) |
| 2.4 Analyze indicators of malicious activity | Strong | 2026-02-27 | Pyramid of Pain ✓ (S10, knew cold — recovered from S9 miss). Password spraying ✓ (S10). SSL stripping ✓ (S10). All attack types strong. |
| 2.5 Explain mitigation techniques | Moderate | 2026-02-26 | Assessment ✓ (segmentation) but drill missed kill chain phase for sandboxing (educated guess) |

**Domain score**: Moderate-Strong — Diamond Model ✓, ATT&CK ✓, attack types strong (S9). Pyramid of Pain wrong (S9). Stored XSS vs CSRF and kill chain untested.

---

## Domain 3: Security Architecture (18%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 3.1 Compare security architecture models | Moderate-Strong | 2026-02-27 | CWPP ✓ (S10, reasoned). Zero trust vs NAC ✓ (S10). CSPM ✓, PDP ✓, SDN ✓, ICS/SCADA ✓. SASE vs SSE wrong S11 (didn't know either). CASB ✓ S11 (reasoned). ZTNA ✓ S11 (reasoned, but primed). SWG not yet tested individually. |
| 3.2 Apply security principles to infrastructure | Moderate | 2026-02-27 | SAST ✓. SCA missed S10. IaC static analysis vs CSPM wrong S11 (picked CSPM, answer static analysis — "before deployment" = static). Container hardening ✓ S11 (reasoned). Admission controller ✓ S11 (educated). |
| 3.3 Compare data protection concepts | Strong | 2026-02-26 | Drilled: "Pseudo = sharing out, Token = keeping in." Re-tested ✓. But missed hosted payment fields vs tokenization for PCI scope. |
| 3.4 Explain resilience and recovery | Strong | 2026-02-26 | RPO vs RTO ✓, differential vs incremental backup ✓ (knew it cold) |

**Domain score**: Moderate — SASE/SSE cluster new (SASE missed, CASB/ZTNA recovering). IaC static analysis vs CSPM timing rule needed. Container/serverless concepts solid.

---

## Domain 4: Security Operations (28%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 4.1 Apply common security techniques to computing resources | Moderate | 2026-02-26 | Assessment ✓ (immutable containers) but drill missed NAC vs EDR vs MDM |
| 4.2 Security implications of proper hardware, software, and data asset management | Not assessed | — | **[Corrected from 4.4]** Digital forensics moved to 4.9. This objective covers asset lifecycle, disposal, and management implications. |
| 4.3 Various activities associated with vulnerability management | Strong | 2026-02-26 | **[Corrected from 4.5]** SCAP ✓ (S6, reasoned). Compensating controls ✓ (S8, knew cold). ASV ✓ (S4). |
| 4.4 Security alerting and monitoring concepts and tools | Strong | 2026-02-26 | **[Corrected from 4.2]** Deception tech vs honeypot ✓ (S8, after 2 misses). UEBA vs SIEM ✓ (S8, after S7 miss). SIEM/XDR/SOAR trio ✓ (S7). |
| 4.5 Modify enterprise capabilities to enhance security | Strong | 2026-02-26 | **[Corrected from 4.3]** Network isolation ✓, API key revocation ✓. Title clarified: "enhance security" (not just "incident response"). |
| 4.6 Implement and maintain identity and access management | Strong | 2026-02-26 | **[Corrected from 4.7]** Drilled: session vs token lifetime. Re-tested ✓. SAML vs OAuth vs OIDC: reasoned out. PAM with JIT access locked in (S6). |
| 4.7 Importance of automation and orchestration related to secure operations | Strong | 2026-02-26 | **[Corrected from 4.8]** SOAR ✓ (S7, multi-tool playbook). XDR vs SOAR distinction locked in (S7). Title clarified: "secure operations" scope. |
| 4.8 Appropriate incident response activities | Strong | 2026-02-26 | **[Corrected from 4.9]** Lessons learned as final IR phase ✓. Scope clarified: IR activities (not data sources). |
| 4.9 Use data sources to support an investigation | Not assessed | — | **[Corrected from 4.4]** Digital forensics moved here: order of volatility ✓. Also covers forensic evidence types and chain of custody. |

**Domain score**: Strong — SIEM/XDR/SOAR, deception tech, UEBA, SCAP all locked in. 4.2 (asset mgmt) and 4.9 (forensic data sources) not yet assessed.

---

## Domain 5: Security Program Management and Oversight (20%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 5.1 Summarize governance, risk, and compliance | Strong | 2026-02-26 | Drilled: "Matrix for the menu, ALE for the bill." Re-tested ✓ |
| 5.2 Explain risk management processes | Strong | 2026-02-27 | ALE formula ✓ (S10, reasoned — recovered from S9 miss). Pentest scope ✓ (S10, knew cold). BIA ✓ (S8). |
| 5.3 Summarize third-party risk assessment | Moderate | 2026-02-27 | MSA ✓ S11 (educated — first correct after 3x wrong). SOW ✓ (S10). MOU ✓ (S10). Recovering but not cold yet. |
| 5.4 Summarize compliance and auditing | Strong | 2026-02-26 | Least privilege ✓, dual control vs separation of duties ✓ (educated guess), legal hold ✓ |
| 5.5 Explain privacy and data protection | Moderate-Strong | 2026-02-27 | DPIA ✓ S11 (educated). RoPA ✓ S11 (educated). Both correct after S10 misses — recovering. Data owner ✓ (S10). Decision rule: "new project risk" = DPIA, "ongoing record" = RoPA. |

**Domain score**: Moderate-Strong — ALE ✓ (recovered). MSA vs MOU and RoPA vs DPIA are remaining gaps. Data governance roles improving.

---

## Priority Queue

Ranked by domain weight × weakness severity. Items marked (acronym) are terminology gaps, not concept gaps.

### Confirmed Strong (no further drilling needed)
- Incident triage, SYN scan, C2 beaconing, brute force classification (4.2, 2.4)
- DNS filtering (knew cold), stateful firewall behavior (knew cold) (3.2, 4.1 networking)
- Insider threat indicators (2.1 partial), forensic hashing (4.4)
- Known vuln exploitation vs zero-day vs supply chain (2.3 partial)
- Directory traversal vs LFI vs RFI vs SSRF (2.3)
- Emergency/standard/normal change types (1.3)
- FIDO2/WebAuthn, hardware TOTP for offline MFA (1.4, 4.7)
- EAP-TLS for cert-based Wi-Fi (reasoned) (3.2)
- Differential vs incremental backups, RPO vs RTO (3.4)
- Legal hold, least privilege, CIA triad (5.4, 1.2)
- **SIEM vs XDR vs SOAR** — locked in S7 (both XDR and SOAR correct). Decision rule: one platform = XDR, orchestrate tools = SOAR. (4.2, 4.8)
- **Deception tech vs honeypot** — locked in S8 after 2 misses. "Fake creds in production" = deception tech. (4.2)
- **UEBA vs SIEM** — locked in S8 after S7 miss. Behavioral baseline = UEBA, static rules = SIEM. (4.2)
- **SCAP vs STIX** — locked in S6. "Two separate worlds": SCAP = vuln scanning, STIX = threat sharing. (4.5)
- **Diamond Model** — locked in S6. Indirect descriptions: look for 4 relationship elements (AVIC). (2.1)
- **DOM-based vs Reflected XSS** — locked in S6. Server sees payload = reflected, client JS only = DOM. (2.3)
- **SCIM** — locked in S6. "Orphaned accounts" = SCIM lifecycle. (4.7)
- **Pentest scope** — locked in S7. Knew cold. Document + request expansion, never exploit OOS. (5.2)
- **CSPM** — locked in S7. Cloud misconfigs (open S3, permissive SGs) = CSPM. (3.1)
- **Firewall rule ordering** — locked in S7. Most specific first, deny-all last. (PBQ)
- **ASV** — locked in S4. PCI quarterly external scans. (4.5)
- **Compensating controls** — locked in S8. Knew cold. (4.5)
- **SAST** — locked in S8. Knew cold. White-box, code-level, early in pipeline. (3.2)
- **Shared responsibility model** — locked in S8. Knew cold. Customer always owns data + access. (3.1)
- **BIA** — locked in S8. Knew cold. Prerequisite for BCP/DRP. (5.2)
- **Data sovereignty** — locked in S8. Knew cold. (5.5)
- **PAM with JIT access** — locked in S6. Eliminate standing privileged accounts. (4.6)
- **MTTD** — locked in S7. "How quickly SOC identifies intrusions." (4.4)
- **NDA** — locked in S7. Sign before sharing proprietary docs. (5.3)
- **Secret scanning** — locked in S7. AKIA prefix = AWS key in code. (3.2)

### High Priority — Persistent misses
1. **3.1** (18%) — CASB — **wrong 3x total** (S10: DLP, CSPM; S11: SWG). "Named unauthorized cloud apps / shadow IT" = always CASB.
2. **5.1** (20%) — NIST frameworks — CSF ✓ S11 (reasoned), but 800-53 vs 800-171 wrong S11. "Federal + catalog + impact levels" = 800-53, "contractor + CUI" = 800-171.
3. **4.6** (28%) — Adaptive auth — wrong S10 (picked zero trust). Not re-tested S11.
4. **3.3** (18%) — PCI scope — wrong S10. Not re-tested S11.
5. **3.2** (18%) — SCA — wrong S10. IaC static analysis vs CSPM wrong S11. "Before deployment" = static analysis.
6. **3.1** (18%) — SASE vs SSE — wrong S11. SASE = networking + security. SSE = security only.

### Recovering — Correct S11 but educated guesses
7. **5.3** (20%) — MSA ✓ S11 (educated — first correct after 3x wrong). Needs cold confirmation.
8. **5.5** (20%) — DPIA ✓ + RoPA ✓ S11 (both educated). Decision rule working but not cold.
9. **1.1** (12%) — ABAC ✓ S11 (reasoned, recovering from S10 miss).

### Medium Priority — Lucky or not re-tested
10. **2.5** (22%) — Kill chain phases — correct but lucky S10. Needs solid re-test.
11. **PBQ** — Email ports wrong S11 (retrieval = 993+995, sending = 587). Port 853 DoT ✓ educated.

### Confirmed Strong from S11
- Container hardening (reasoned), serverless least privilege (cold), serverless shared responsibility (cold)
- IaaS shared responsibility (cold), SaaS shared responsibility (cold)
- Admission controller (educated), RDP port 3389 (cold), ABAC (reasoned)

### Still Untested
- SWG (never quizzed cold)
- Supply chain (SBOM/SLSA)
- Replay vs session hijacking, adaptive auth re-test, PCI scope re-test
- PBQ topics — log analysis, wireless config, cert tasks. Firewall rules ✓.

### Confirmed Strong from S9 Sampling (moved from research/untested)
- **Downgrade attacks** — knew cold (2.4)
- **Credential stuffing vs password spraying** — reasoned (2.4)
- **DNS tunneling/exfiltration** — educated (2.4)
- **SDN vs NFV** — educated (3.1)
- **ICS/SCADA/RTOS + NIDS protection** — educated (3.1)
- **PDP vs PEP** — reasoned, recovering from S8 miss (3.1)
- **Fault tolerance vs HA** — knew cold, recovered from S3 miss (3.4)
- **Compensating controls for ICS** — knew cold (1.1)
- **Pass the ticket** — knew cold (2.4)
- **UEBA** — educated (4.4)
- **ALE formula** — locked in S10. AV × EF = SLE, SLE × ARO = ALE. (5.2)
- **Pyramid of Pain** — locked in S10. Knew cold. TTPs at top, hashes at bottom. (2.4)
- **OCSP stapling** — locked in S10. Server pre-fetches OCSP response, eliminates client latency. (1.4)
- **CWPP** — locked in S10. Reasoned. Runtime container/workload protection. "Most specific answer" over CNAPP. (3.1)
- **Zero trust vs NAC** — locked in S10. Reasoned. "Already on network, no further checks" = ZT violation. (3.1)
- **Stored XSS** — knew cold S10. Persists in DB, hits all viewers. (2.3)
- **Password spraying** — knew cold S10. One password, many accounts, spaced out. (2.4)
- **SSL stripping** — locked in S10. Reasoned. Downgrade HTTPS→HTTP. (2.2)
- **Pentest scope** — re-confirmed S10. Knew cold. (5.2)
- **SOW under MSA** — locked in S10. Reasoned. Specific deliverables under umbrella. (5.3)
- **MOU** — locked in S10. Knew cold. Non-binding, government agencies, no payment. (5.3)
- **Data owner** — locked in S10. Educated. Decides classification + retention. (5.5)
- **CSRF** — locked in S10. Reasoned. "Rides victim's session from different site." (2.3)
- **SSL stripping** — locked in S10. Reasoned. Downgrade HTTPS→HTTP. (2.2)
- **DAST** — locked in S10. Reasoned. "Running app, from outside, no code." (3.2)
- **CSPM** — re-confirmed S10. Educated. Cloud misconfigs. (3.1)
- **MAC** — recovering S10. Wrong first, correct on re-test. Labels + no override. (1.1)
