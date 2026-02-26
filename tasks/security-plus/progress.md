# Security+ SY0-701 — Progress Tracker

## Overall Readiness

**Status**: Two assessment rounds + drilling complete
**Estimated score**: ~70-75% (weighted) — improving but still below passing threshold (750/900 = ~83%)
**Last updated**: 2026-02-26
**Key gap**: Newer acronyms/frameworks (last ~10 years) — user knows the concepts but not the exam terminology. Recognizing the acronym IS the question on the real test.
**Secondary gap**: Exam takes strict legalistic views that conflict with real-world experience (pentest scope, kill chain phase mapping)
**Initial assessment**: 85% (23/27) with answer descriptions — inflated by context clues
**First drill round**: ~54% (13/24) without descriptions, harder questions — exposed real gaps
**Second assessment**: 70% (14/20) without descriptions, mixed topics — real improvement, still below passing

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
| 3.1 Compare security architecture models | Moderate | 2026-02-26 | Assessment ✓ (zero trust) but drill: CASB was lucky guess, ZTNA educated guess |
| 3.2 Apply security principles to infrastructure | Moderate | 2026-02-26 | Assessment ✓ (immutable infra) but drill: SCA/image signing lucky guess |
| 3.3 Compare data protection concepts | Strong | 2026-02-26 | Drilled: "Pseudo = sharing out, Token = keeping in." Re-tested ✓. But missed hosted payment fields vs tokenization for PCI scope. |
| 3.4 Explain resilience and recovery | Strong | 2026-02-26 | RPO vs RTO ✓, differential vs incremental backup ✓ (knew it cold) |

**Domain score**: Moderate — newer cloud/DevSecOps acronyms (CASB, ZTNA, SCA) are gaps

---

## Domain 4: Security Operations (28%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 4.1 Apply security techniques to computing resources | Moderate | 2026-02-26 | Assessment ✓ (immutable containers) but drill missed NAC vs EDR vs MDM |
| 4.2 Explain security alerting and monitoring | Moderate | 2026-02-26 | Assessment ✓ (brute force) but drill missed deception technology vs honeynet (thought knew it) |
| 4.3 Modify enterprise capabilities for incident response | Strong | 2026-02-26 | Network isolation ✓, API key revocation ✓ |
| 4.4 Use appropriate tools for digital forensics | Strong | 2026-02-26 | Order of volatility ✓ |
| 4.5 Explain vulnerability management | Moderate | 2026-02-26 | Assessment ✓ (compensating controls) but drill: SCAP was lucky guess |
| 4.6 Explain security awareness practices | Strong | 2026-02-26 | Training refinement vs. failure ✓ |
| 4.7 Explain identity and access management | Strong | 2026-02-26 | Drilled: session vs token lifetime. Re-tested ✓. SAML vs OAuth vs OIDC: reasoned out. |
| 4.8 Explain automation and orchestration | Strong | 2026-02-26 | SOAR (Security Orchestration, Automation, and Response) with human approval gates ✓ |
| 4.9 Explain appropriate incident response activities | Strong | 2026-02-26 | Lessons learned as final IR phase ✓ |

**Domain score**: Moderate-Strong — NAC, deception tech, SCAP terminology are gaps

---

## Domain 5: Security Program Management and Oversight (20%)

| Objective | Score | Last Assessed | Notes |
|-----------|-------|---------------|-------|
| 5.1 Summarize governance, risk, and compliance | Strong | 2026-02-26 | Drilled: "Matrix for the menu, ALE for the bill." Re-tested ✓ |
| 5.2 Explain risk management processes | Moderate | 2026-02-26 | Assessment ✓ (risk mitigation) but drill missed pentest scope rules (thought knew it — exam is strict legalistic) |
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

### High Priority — Still Needs Work
1. **4.2** (28%) — SIEM vs XDR vs SOAR — wrong (chose SIEM over XDR). "Unified detection across layers" = XDR.
2. **4.1** (28%) — NAC vs EDR vs MDM — previously wrong. EDR confirmed ✓ in re-test, but NAC not re-tested.
3. **4.5** (28%) — SCAP and sub-components — still only lucky guess. ASV vs QSA vs ISA — new miss (lucky guess).
4. **2.1** (22%) — Threat frameworks (ATT&CK/Kill Chain/Diamond/NIST CSF) — previously wrong, not re-tested.
5. **2.3** (22%) — XSS vs CSRF — previously wrong, not re-tested. Session hijacking vs fixation ✓ (educated).
6. **2.5** (22%) — Kill chain phase mapping — previously wrong, not re-tested.

### Medium Priority — Terminology Gaps
7. **5.5** (20%) — Data governance roles: data owner vs custodian vs steward vs controller/processor — new miss.
8. **5.2** (20%) — Pentest scope legalism — previously wrong, not re-tested.
9. **5.5** (20%) — RoPA vs PIA/DPIA — previously wrong, not re-tested.
10. **3.1** (18%) — CASB/ZTNA/SWG/SASE — previously lucky, ZTNA confirmed ✓ (educated). CASB not re-tested.
11. **3.2** (18%) — SCA/SAST/DAST/IAST/SBOM — previously lucky, not re-tested.
12. **3.3** (18%) — PCI scope methods — previously wrong, not re-tested. CloudFront OAI missed (AWS-specific, lower priority).
13. **3.4** (18%) — Fault tolerance vs HA vs DR — new miss. "No user impact" = FT, not HA.

### Lower Priority
14. **1.1** (12%) — MAC/DAC/RBAC/ABAC — previously lucky, not re-tested.
15. **1.4** (12%) — CRL/OCSP — previously no idea, not re-tested.
16. **4.7** (28%) — SCIM (identity lifecycle automation) — new miss (acronym). SAML vs OAuth vs OIDC ✓.
17. **5.1** (20%) — NIST SP 800-53 vs NIST CSF vs ISO 27001 vs CIS Controls — educated guess, needs lock-in.
