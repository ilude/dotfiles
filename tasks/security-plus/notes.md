# Security+ SY0-701 — Study Notes

Running notes from study sessions. Grows over time. Review before exam.

---

## Missed Questions & Corrections

### 4.7 — SAML (Security Assertion Markup Language) session vs. assertion lifetime
**Missed**: Chose "SAML assertions have a validity period" over "saved session cookie"
**Key distinction**: SAML assertions are short-lived (2-5 min) and only used during the authentication *handshake*. After auth, the SaaS (Software as a Service) app issues its own **session cookie** that persists independently. Disabling the IdP (Identity Provider) account does NOT kill existing app sessions.
**Takeaway**: On SSO (Single Sign-On) questions, distinguish between the *authentication token* (short-lived, IdP-controlled) and the *application session* (long-lived, app-controlled). Offboarding must revoke both.

### 2.2 — BEC (Business Email Compromise) vs. typosquatting vs. whaling
**Missed**: Chose "typosquatting" over "BEC" for a CEO impersonation wire fraud scenario
**Key distinction**: Typosquatting is the *technique* (lookalike domain). BEC is the *attack type* (executive impersonation → financial fraud via business processes). On the exam, classify by attack type, not underlying technique.
**Also remember**: Whaling = executive is the *target/victim*. BEC = executive is being *impersonated*, someone else is the victim.

### 5.1 — Risk prioritization: matrix vs. quantitative
**Missed**: Chose "quantitative risk assessment" over "risk matrix (likelihood × impact)"
**Key distinction**: Risk matrix is the *triage/prioritization* tool — used to quickly rank many risks visually. Quantitative analysis uses ALE (Annual Loss Expectancy) = SLE (Single Loss Expectancy) × ARO (Annual Rate of Occurrence) for *deep analysis* on specific high-priority risks afterward. Board asks "which first?" → risk matrix. Board asks "how much will this cost us?" → quantitative.
**Mnemonic**: Matrix = Many risks, quick sort. Quantitative = One risk, precise dollar value.

### 3.3 — Tokenization vs. pseudonymization
**Missed**: Chose "tokenization" over "pseudonymization" for healthcare research data sharing
**Key distinction**:
- **Tokenization** → payment/PCI DSS (Payment Card Industry Data Security Standard) context. Token vault stays within the system. No mathematical relationship to original.
- **Pseudonymization** → GDPR (General Data Protection Regulation)/healthcare/research context. Mapping table kept *separately*. Designed for data sharing where authorized re-identification is needed.
- **Anonymization** → permanent, irreversible. No re-linking possible.
- **Data masking** → fictional values, typically for non-production environments.
**Exam trigger**: Hospital + research + must be able to re-link = pseudonymization every time.

---

## Key Concepts & Mnemonics

### Rules of Thumb (Decision Shortcuts)

**#1 — Attack Type vs. Technique**: Classify by the attacker's *goal*, not the *tool*. "Is this answer describing a single step (technique) or the whole attack (type)?" Pick the whole attack. Executive impersonation + financial action = BEC, always.

**#2 — Session vs. Token ("IdP opens the door, app gives a wristband")**: Two clocks run after SSO login. IdP controls the auth token (short). App controls the session cookie (long). "Account disabled but still has access?" → app session hasn't expired. Revoking the key doesn't remove the wristband.

**#3 — Risk Tools ("Matrix for the menu, ALE for the bill")**: Many risks, which first? → risk matrix. One risk, what's the dollar cost? → quantitative/ALE. Count the risks in the question.

**#4 — Data De-identification ("Pseudo = sharing out, Token = keeping in")**: Both are reversible, context decides. Research/GDPR/healthcare + sharing externally = pseudonymization. PCI/payments + protecting internally = tokenization. "Can never re-link" = anonymization.

---

## Tricky Distinctions

### PCI (Payment Card Industry) scope reduction methods
- **Hosted payment fields / direct post** — card data never touches merchant (iframe from processor). Maximum scope reduction.
- **Tokenization** — processor stores real card, merchant stores token. Data *did* touch merchant initially (or processor handles it and returns token).
- **Segmentation** — card data still on merchant systems, but isolated in a CDE (Cardholder Data Environment). Reduces scope but doesn't eliminate it.
- **E2EE (End-to-End Encryption)** — encrypted in transit, may still pass through merchant infrastructure.

### Honeypot vs. Honeynet vs. Deception Technology
- **Honeypot** — single fake system, isolated, attracts attackers
- **Honeynet** — network of honeypots, still isolated/separate from production
- **Deception technology** — fake assets (servers, shares, creds/honey tokens) deployed *throughout real production*. Modern, automated, embedded. Key tell: fake credentials + mixed into real environment.
- If question mentions fake creds or tokens scattered across real infrastructure → deception technology, not honeynet.

### Separation of duties vs. Dual control
- **Separation of duties** — different people handle different *stages*. A requests, B approves, C executes.
- **Dual control** — same action requires *two people simultaneously*. Neither acts alone. Two keys, one missile.

### NAC (Network Access Control) vs. EDR (Endpoint Detection and Response) vs. MDM (Mobile Device Management)
- **NAC** — health check *at the door*. Posture assessment before granting network access. Remediation VLAN = NAC.
- **EDR** — threat monitoring *after* on the network. Detect + respond to malicious behavior on endpoints.
- **MDM** — mobile device policy management (wipe, app control, config). No VLAN quarantine.

### XSS (Cross-Site Scripting) vs. CSRF (Cross-Site Request Forgery)
**XSS** = attacker's script runs in victims' browsers. Three types:
- **Stored** — script saved to server (DB, comment, profile). Hits every viewer. `<script>` in a form field → stored XSS.
- **Reflected** — script in a URL param, victim must click the link. One-shot, not persisted.
- **DOM-based** — client-side only, script manipulates DOM without touching server.

**CSRF (Cross-Site Request Forgery)** = no script injection at all. Tricks logged-in browser into making an unintended request (transfer, password change). Exploits automatic cookie sending. Fix: anti-CSRF tokens.

Script tag visible? → XSS. User unknowingly submits a request? → CSRF.

### Kill Chain — where controls act
- **Delivery** — email filters, web gateways, DNS filtering. Stops the payload from *arriving*.
- **Exploitation** — sandboxing, application whitelisting, patching. Stops the payload from *executing*.
- Email filter = delivery. Sandbox = exploitation. Sandbox doesn't block the email — it detonates the attachment and watches it fail.

### Pentest scope — exam takes strict legalistic view
- Scope = exactly what the contract says. Nothing more, even if discoverable from in-scope systems.
- Found an out-of-scope system? Document it, report it, ask for scope expansion. Do NOT exploit.
- Real-world gray areas don't exist on the exam. Contract is law.

### Threat frameworks — which is which
- **MITRE ATT&CK (Adversarial Tactics, Techniques, and Common Knowledge)** — catalog of adversary TTPs (Tactics, Techniques, and Procedures) with T-numbers (T1566.001). "What did attacker DO." Threat hunting, detection.
- **Cyber Kill Chain** — Lockheed Martin, 7 linear phases. "At which STAGE." Sequential.
- **Diamond Model** — 4 vertices: adversary, capability, infrastructure, victim. Attribution, relationships.
- **NIST CSF (National Institute of Standards and Technology Cybersecurity Framework)** — Identify, Protect, Detect, Respond, Recover. "How should ORG handle it." Governance.
- See T-numbers → ATT&CK. See phases → Kill Chain. See vertices → Diamond. See org functions → NIST CSF.

### Access control models
- **MAC (Mandatory Access Control)** — system/policy enforced, users can't override. SELinux (Security-Enhanced Linux), AppArmor. "Even root can't bypass" → MAC.
- **DAC (Discretionary Access Control)** — owner controls access. chmod, chown, ACLs (Access Control Lists). Standard Linux/Windows file permissions.
- **RBAC (Role-Based Access Control)** — access by role (Admin, Editor, Viewer). AD (Active Directory) groups, application roles.
- **ABAC (Attribute-Based Access Control)** — access by attributes (time, location, department, clearance). Most flexible/complex. Policy rules with conditions.

---

## Acronym Quick Reference

**SCAP** — Security Content Automation Protocol. Umbrella for CVE + CVSS + CPE + CCE + OVAL + XCCDF. "Standardized, machine-readable, multi-vendor vuln automation."
**STIX** — Structured Threat Information Expression. Language for threat intel IOCs.
**TAXII** — Trusted Automated Exchange of Intelligence Information. Transport for STIX data.
**SOAR** — Security Orchestration, Automation, and Response. Automates IR playbooks.
**SIEM** — Security Information and Event Management. Log aggregation + correlation.
**CPE** — Common Platform Enumeration. IDs for platforms/products (part of SCAP).
**CCE** — Common Configuration Enumeration. IDs for configuration settings (part of SCAP).
**OVAL** — Open Vulnerability and Assessment Language. Machine-readable vuln test definitions.
**XCCDF** — Extensible Configuration Checklist Description Format. Security benchmark checklists (CIS benchmarks use this).
**DPA** — Data Processing Agreement. GDPR-required when a processor handles personal data.
**BAA** — Business Associate Agreement. HIPAA-required when a vendor handles PHI.
**SCA** — Software Composition Analysis. Scans *dependencies/packages* for known CVEs. Build-time.
**SAST** — Static Application Security Testing. Scans *your source code* for vulns. Build-time, no running app.
**DAST** — Dynamic Application Security Testing. Tests a *running app* from outside. Runtime.
**IAST** — Interactive Application Security Testing. Agent inside running app, combines SAST+DAST. Runtime.
**SBOM** — Software Bill of Materials. Inventory of all components/versions. The *list*, not the scanner.
**SCA scans the SBOM** — SCA checks dependencies against CVE databases. SBOM is what it reads.
**RoPA** — Records of Processing Activities. GDPR Art 30. Master register of ALL data processing org-wide (where, who, what, how long).
**PIA/DPIA** — Privacy/Data Protection Impact Assessment. Evaluates privacy risks of ONE specific project or change.
**RoPA = map of everything. PIA = assessment of one thing.**
**SAML** — XML assertions, enterprise SSO, IdP → SP. "Signed XML" = SAML.
**OAuth 2.0** — Authorization only (NOT authentication). Access tokens. "Let app access my stuff."
**OIDC** — OpenID Connect. Authentication ON TOP of OAuth 2.0. ID tokens. "Log in with Google."
**RADIUS** — Network access auth (Wi-Fi, VPN). UDP. Not web SSO.
**Exam trap: OAuth ≠ authentication. If question asks "prove identity" → OIDC, not OAuth.**
**CASB** — Cloud Access Security Broker. Between users and cloud/SaaS. Shadow IT, cloud app control, cloud DLP. "Cloud bouncer."
**SWG** — Secure Web Gateway. Filters all web traffic (URLs, malware). "Web proxy on steroids." Not cloud-specific.
**SASE** — Secure Access Service Edge. Umbrella: CASB + SWG + ZTNA + SD-WAN in one cloud platform. Multiple capabilities = SASE.
**ZTNA** — Zero Trust Network Access. Identity-verified access to specific apps, replaces VPN. No broad network access.
**DLP** — Data Loss Prevention. A capability, not a product. Many tools do DLP. If question ONLY mentions data leak prevention → DLP. If it adds shadow IT + cloud control → CASB.
**CRL** — Certificate Revocation List. CA publishes full list of revoked certs periodically. Old way, can be stale.
**OCSP** — Online Certificate Status Protocol. Real-time "is this cert revoked?" query. Modern, lighter.
**OCSP stapling** — server pre-fetches its own OCSP response, includes it in TLS handshake. Client doesn't query separately.
**CSR** — Certificate Signing Request. What you submit to a CA to get a cert issued.
**CT** — Certificate Transparency. Public logs of issued certs (audit, detect mis-issuance).
**CAA** — CA Authorization. DNS record specifying which CAs may issue certs for your domain.
**HSTS** — HTTP Strict Transport Security. Forces browsers to use HTTPS only.
**SOC 1** — Financial controls (Sarbanes-Oxley context). **SOC 2** — Security/trust controls (vendor risk).
**Type I** — Point-in-time snapshot. **Type II** — Over a period (6-12 months). "Worked consistently" > "exists today."
