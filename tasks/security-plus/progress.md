# Security+ SY0-701 — Progress Tracker

## Overall Readiness

**Status**: Day 2 drilling — 8 sessions complete, trajectory rising
**Estimated score**: ~80% (weighted) — approaching passing threshold (750/900 = ~83%)
**Last updated**: 2026-02-26
**Key gap**: Cloud security tools (CSPM/CWPP/CNAPP/CASB) — correct but mostly lucky guesses. Need concept lock-in.
**Secondary gap**: Zero trust components (PDP vs PEP), Kerberos attack types — new misses
**Trajectory**: 85% (soft) → 54% (hard) → 70% → 67% → 60% → 75% → 83%
**Initial assessment**: 85% (23/27) with answer descriptions — inflated by context clues
**First drill round**: ~54% (13/24) without descriptions, harder questions — exposed real gaps
**Second assessment**: 70% (14/20) without descriptions, mixed topics — real improvement
**Session 7**: 75% (9/13 solid) — SIEM/XDR/SOAR finally clicking, cloud tools still lucky
**Session 8**: 83% (10/12 solid) — deception tech ✓ (2x miss → correct), UEBA ✓, BIA ✓, SAST ✓

---

## Domain 1: General Security Concepts (12%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 1.1 Compare security controls | Moderate | 2026-02-26 | Assessment ✓ but drill missed MAC vs DAC vs RBAC vs ABAC (lucky guess) |
| 1.2 Summarize fundamental security concepts | Strong | 2026-02-26 | CIA triad — availability ✓ |
| 1.3 Explain change management importance | Strong | 2026-02-26 | Impact analysis / peer review ✓ |
| 1.4 Explain cryptographic solutions | Moderate | 2026-02-26 | Assessment ✓ (bcrypt) but drill: CRL/OCSP — no idea |

**Domain score**: Moderate — access control models and PKI revocation are gaps

---

## Domain 2: Threats, Vulnerabilities, and Mitigations (22%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 2.1 Compare threat actors and motivations | Moderate | 2026-02-26 | Assessment ✓ (APT) but drill missed MITRE ATT&CK vs Kill Chain vs Diamond vs NIST CSF (lucky guess) |
| 2.2 Explain common threat vectors | Strong | 2026-02-26 | Drilled: attack type vs technique rule. Re-tested ✓ |
| 2.3 Explain types of vulnerabilities | Moderate | 2026-02-26 | Assessment ✓ (SQLi) but drill missed stored XSS vs CSRF (educated guess) |
| 2.4 Analyze indicators of malicious activity | Strong | 2026-02-26 | C2 beaconing ✓, SYN scan ✓ |
| 2.5 Explain mitigation techniques | Moderate | 2026-02-26 | Assessment ✓ (segmentation) but drill missed kill chain phase for sandboxing (educated guess) |

**Domain score**: Moderate — threat frameworks, XSS/CSRF, and kill chain mapping need work

---

## Domain 3: Security Architecture (18%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 3.1 Compare security architecture models | Moderate | 2026-02-26 | CSPM ✓ (S7, educated). CWPP/CNAPP correct but lucky (S7). CASB not re-tested. PDP vs PEP missed (S8). Zero trust vs NAC missed (S6). |
| 3.2 Apply security principles to infrastructure | Moderate-Strong | 2026-02-26 | SAST ✓ (S8, knew cold). Shared responsibility ✓ (S8, knew cold). Secret scanning ✓ (S7). SCA/SBOM not re-tested. |
| 3.3 Compare data protection concepts | Strong | 2026-02-26 | Drilled: "Pseudo = sharing out, Token = keeping in." Re-tested ✓. But missed hosted payment fields vs tokenization for PCI scope. |
| 3.4 Explain resilience and recovery | Strong | 2026-02-26 | RPO vs RTO ✓, differential vs incremental backup ✓ (knew it cold) |

**Domain score**: Moderate — cloud tools improving (CSPM ✓) but CWPP/CNAPP still lucky, PDP/PEP missed, zero trust vs NAC gap

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
| 5.2 Explain risk management processes | Strong | 2026-02-26 | Pentest scope ✓ (S7, knew cold). BIA ✓ (S8, knew cold). Quantitative risk formulas not re-tested. |
| 5.3 Summarize third-party risk assessment | Strong | 2026-02-26 | SOC 2 Type I vs II ✓ (educated guess). Data retention addendum ✓ (reasoned). |
| 5.4 Summarize compliance and auditing | Strong | 2026-02-26 | Least privilege ✓, dual control vs separation of duties ✓ (educated guess), legal hold ✓ |
| 5.5 Explain privacy and data protection | Moderate | 2026-02-26 | Assessment ✓ (GDPR erasure ✓) but drill missed RoPA vs PIA (educated guess) |

**Domain score**: Moderate-Strong — pentest scope legalism, RoPA vs PIA need work

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

### High Priority — Still Needs Work
1. **3.1** (18%) — CWPP/CNAPP — correct but **lucky** both times (S7). Need concept lock-in, not just guessing.
2. **3.1** (18%) — PDP vs PEP — missed S8 (lucky guess wrong). "PDP = brain, PEP = bouncer."
3. **3.1** (18%) — Zero trust vs NAC — missed S6. NAC = gate at the door, ZT = every resource request.
4. **2.4** (22%) — Kerberos attack types — pass the ticket correct but **lucky** (S8). Need to distinguish pass-the-hash/ticket/kerberoasting/credential stuffing.
5. **4.1** (28%) — NAC vs EDR vs MDM — EDR ✓, but NAC not re-tested since S4.

### Medium Priority — Terminology Gaps (not re-tested)
6. **5.5** (20%) — Data governance roles: data owner vs custodian vs steward vs controller/processor.
7. **5.5** (20%) — RoPA vs PIA/DPIA.
8. **3.1** (18%) — CASB — not re-tested since lucky guess in S2. ZTNA ✓.
9. **3.2** (18%) — SCA/DAST/IAST/SBOM — SAST ✓ but others not re-tested.
10. **3.3** (18%) — PCI scope methods — not re-tested.
11. **3.4** (18%) — Fault tolerance vs HA vs DR — missed S3. "No user impact" = FT.
12. **2.3** (22%) — Stored XSS vs CSRF — not re-tested. Reflected/DOM XSS ✓.
13. **2.5** (22%) — Kill chain phase mapping — not re-tested.

### Lower Priority (not re-tested)
14. **1.1** (12%) — MAC/DAC/RBAC/ABAC.
15. **1.4** (12%) — CRL/OCSP.
16. **5.1** (20%) — NIST SP 800-53 vs NIST CSF vs ISO 27001 vs CIS Controls.

### Research Areas (not yet tested)
17. **3.1** (18%) — Container/serverless security, IaC scanning, supply chain (SBOM/SLSA).
18. **4.3** (28%) — IoC vs IoA, TTP, Pyramid of Pain.
19. **5.3** (20%) — MOU vs MSA vs SOW vs BPA — agreement types.
20. **5.2** (20%) — Quantitative formulas (SLE, ALE, EF, AV). BIA ✓.
21. **2.4** (22%) — On-path attacks, password spraying, credential stuffing, downgrade attacks.
22. **3.1** (18%) — SDN, NFV, ICS/SCADA/RTOS, HSM vs TPM, screened subnet.
23. **4.6** (28%) — Conditional access, adaptive/continuous auth. PAM/JIT ✓.
24. PBQ topics — log analysis, wireless config, cert tasks, port numbers. Firewall rules ✓.
