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
- **Reflected** — script in a URL param, victim clicks link. **Server processes and returns the payload** in response. Visible in server logs. WAF can catch it. Fix: server-side output encoding.
- **DOM-based** — **server NEVER sees the payload.** Client-side JS reads URL (often `#` fragment) and unsafely writes to DOM (`innerHTML`, `eval()`). NOT in server logs. WAF often misses it. Fix: avoid dangerous JS sinks, use `textContent` not `innerHTML`.

**Reflected vs DOM-based decision test**: "Does the server process and return the malicious input?"
- YES (server includes it in HTTP response) → **Reflected**
- NO (client-side JS handles it, server never sees it) → **DOM-based**

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

**Diamond Model — indirect description triggers (missed when not named directly):**
- "Relationship between four core elements" → Diamond
- "Pivot: knowing three elements, predict the fourth" → Diamond
- "Maps attacker's infrastructure, tools, motivations, and targets" → Diamond
- "Socio-political relationship between threat actor and target" → Diamond (unique to Diamond)
- "Links intrusion events by shared infrastructure or capabilities" → Diamond (activity threading)
- "Analyst traces C2 servers → threat group → toolset → predicted targets" → Diamond (vertex pivoting)
- **Mnemonic: AVIC** — **A**dversary, **V**ictim, **I**nfrastructure, **C**apability

### Access control models
- **MAC (Mandatory Access Control)** — system/policy enforced, users can't override. SELinux (Security-Enhanced Linux), AppArmor. "Even root can't bypass" → MAC.
- **DAC (Discretionary Access Control)** — owner controls access. chmod, chown, ACLs (Access Control Lists). Standard Linux/Windows file permissions.
- **RBAC (Role-Based Access Control)** — access by role (Admin, Editor, Viewer). AD (Active Directory) groups, application roles.
- **ABAC (Attribute-Based Access Control)** — access by attributes (time, location, department, clearance). Most flexible/complex. Policy rules with conditions.

### SIEM vs XDR vs SOAR vs UEBA — Decision Tree
- **SIEM (Security Information and Event Management)** — log aggregation + correlation. **Passive.** Alerts a human. "Shows you what happened."
- **XDR (Extended Detection and Response)** — unified detection + **active response** across endpoint/network/cloud/email. "Connects the dots and acts."
- **SOAR (Security Orchestration, Automation, and Response)** — automates IR playbooks/workflows. Often sits on top of SIEM.
- **UEBA (User and Entity Behavior Analytics)** — ML baselines of normal behavior, flags anomalies. Insider threat detection.

**THE key XDR vs SOAR distinction (missed as "knew it cold"):**
- XDR = unified detection + response **within one platform** (cross-layer correlation)
- SOAR = automated workflows that **orchestrate multiple separate tools** (playbooks: isolate host + block IP + create ticket)
- "Automate response to SIEM alerts" → SOAR. "Unified detection across layers" → XDR.

**THE key SIEM vs XDR distinction (missed twice):**
- Both "correlate." The difference: SIEM correlates **logs** and **alerts** (passive). XDR correlates **telemetry across layers** and **responds** (active, cross-layer).
- "Correlates data and generates alerts for the SOC team to investigate" → **SIEM**
- "Correlates data from endpoints, network, and cloud and automatically isolates compromised systems" → **XDR**

**Keyword decision tree:**
| Keyword | Answer |
|---------|--------|
| Log collection, compliance reporting, retention | SIEM |
| Cross-layer, unified detection + response, extends EDR | XDR |
| Playbook, orchestration, automate IR, runbook | SOAR |
| Behavioral baseline, anomalous user activity, insider threat | UEBA |

### HIDS vs EDR vs XDR
- **HIDS (Host-based Intrusion Detection System)** — monitors + alerts only. Passive. Old school.
- **EDR (Endpoint Detection and Response)** — monitors + detects + auto-responds (isolate, kill). Active. Endpoint-only.
- **XDR (Extended Detection and Response)** — EDR across multiple layers (endpoint + network + cloud + email). Correlates whole stack.
- "Agent + auto-response on endpoint" → EDR. Add "correlates network + cloud + email" → XDR.

### Session hijacking vs fixation vs IDOR
- **Session hijacking** — attacker *obtains* a valid session ID (via URL exposure, sniffing, XSS) and reuses it.
- **Session fixation** — attacker *sets* the session ID before victim logs in, then uses it after victim authenticates.
- **IDOR (Insecure Direct Object Reference)** — changing an object ID in the URL to access another user's *data*, not their session.

### High availability vs. Fault tolerance vs. Disaster recovery
- **Fault tolerance** — NO impact when failure occurs. Zero downtime, zero data loss. Synchronous replication. "No user impact" / "seamless" = fault tolerance.
- **High availability** — MINIMAL downtime. Redundant, automatic failover, but brief blip possible. "99.99% uptime" / "automatic failover" = HA.
- **Disaster recovery** — getting back up AFTER a failure. Has RTO (Recovery Time Objective)/RPO (Recovery Point Objective). Acknowledged downtime.
- Exam tell: "no impact" → fault tolerance. "Minimal downtime" → HA. "Recover after" → DR.

### Data governance roles
- **Data owner** — decides classification, access policies, retention. Business leader. Makes the rules.
- **Data custodian** — IT implements owner's decisions. Backups, patching, access provisioning, encryption.
- **Data steward** — ensures data quality, consistency, metadata. "Data librarian."
- **Data controller** (GDPR) — the *organization* that decides why/how data is processed.
- **Data processor** (GDPR) — the *organization* that processes data on behalf of the controller.
- Owner/custodian = individual roles. Controller/processor = organizational/GDPR roles.

### SCAP vs STIX — two separate worlds (keeps confusing these)
**WORLD 1 — Vulnerability Management (scanning/compliance):**
- **SCAP (Security Content Automation Protocol)** — umbrella framework. Lets scanners and compliance tools speak the same language.
  - CVE (ID), CVSS (score), CPE (platform), CCE (config), OVAL (assessment), XCCDF (checklist)
- **NVD (National Vulnerability Database)** — NIST-maintained database of CVEs with CVSS scores. Where you look things up.

**WORLD 2 — Threat Intelligence Sharing:**
- **STIX (Structured Threat Information Expression)** — the language/format for describing threat intel
- **TAXII (Trusted Automated Exchange of Intelligence Information)** — the transport mechanism for STIX data
- **Analogy: STIX is the package, TAXII is the delivery truck.**

**Decision rule (the fix for your specific weakness):**
- "Is this about scanning/assessing/compliance?" → **SCAP** (always)
- "Is this about sharing threat intelligence between organizations?" → **STIX/TAXII**
- STIX/TAXII never scan anything. SCAP never shares threat intel.

### IDS vs IPS vs Firewall vs WAF — "which is BEST?"
- **Firewall** — blocking by port/protocol/IP at network boundary
- **IPS (Intrusion Prevention System)** — automatically block/prevent attacks based on signatures/anomalies (network layer)
- **IDS (Intrusion Detection System)** — detect and **alert only** (no blocking). "Monitor," "alert," "notify"
- **WAF (Web Application Firewall)** — **web application attacks** specifically (SQLi, XSS, OWASP Top 10). HTTP/HTTPS layer.
- SQL injection on a web app → WAF (not IPS). Suspicious lateral movement on internal network → IDS.

### Security control types (exam tests exact classification)
- **Preventive** — stops the incident (firewall, access controls, encryption, training, locks)
- **Detective** — identifies it occurred (IDS, SIEM, cameras, audit trails)
- **Corrective** — fixes the damage after (restore backup, patch, quarantine, IR)
- **Compensating** — alternative when primary control is infeasible (extra monitoring when can't patch, segmentation when can't update)
- **Deterrent** — discourages the attempt (warning banners, visible cameras, guards, AUP)
- **Trap:** A single mechanism can be multiple types depending on context. Camera = detective AND deterrent. Question context decides.
- **Trap:** Compensating controls must provide equivalent protection, not just "something else."

### Risk responses
- **Mitigation** — implement controls to reduce. "Apply patches," "add security measures"
- **Transference** — shift financial impact to third party. "Insurance," "outsource," "SLA"
- **Avoidance** — stop doing the risky thing entirely. "Discontinue," "do not deploy"
- **Acceptance** — acknowledge and do nothing. REQUIRES formal documented management approval. Security team recommends, **management decides**.
- **Trap:** "Team decides not to fix it" is NOT acceptance without management sign-off.

### Certificate pinning vs stapling vs transparency
- **Pinning** — client (mobile app) stores expected cert/key, rejects anything else. "Mobile app + prevent MITM even with compromised CA"
- **Stapling** — server attaches OCSP response to TLS handshake. "Performance + revocation check efficiency"
- **Transparency** — public append-only logs of issued certs. "Detect rogue certificates + CA accountability"

### MDM vs MAM vs UEM
- **MDM (Mobile Device Management)** — full device control (wipe, lock, policies). Company-owned devices.
- **MAM (Mobile Application Management)** — controls only managed apps/data, not whole device. **BYOD** when employees won't accept full device control.
- **UEM (Unified Endpoint Management)** — manages ALL endpoint types (mobile + laptop + desktop + IoT) from single platform.
- Personal phone + corporate email + protect data without controlling personal apps → **MAM**

### Device ownership models
- **BYOD (Bring Your Own Device)** — employee-owned, personal device
- **COPE (Corporate-Owned, Personally Enabled)** — company owns, personal use allowed
- **CYOD (Choose Your Own Device)** — employee picks from approved list, company manages

### Incident response order (exam is strict about sequence)
1. Preparation → 2. Detection/Identification → 3. **Containment** → 4. **Eradication** → 5. Recovery → 6. Lessons Learned
- **Trap:** Containment BEFORE eradication. Always. On the exam, you don't skip ahead.
- **Trap:** "Pulling the plug" is almost always wrong. Isolate from network, preserve RAM evidence.

### Tabletop vs Simulation vs Full-scale exercise
- **Tabletop** — discussion only, no systems, conference room walkthrough. "Low cost," "identify gaps in plans"
- **Simulation** — simulated attack in controlled environment, tests response without affecting production
- **Full-scale** — real-world execution with all personnel and systems. "Full activation"

### Backup types — the exam distinction
- **Full** — everything, every time. Slowest backup, fastest restore.
- **Incremental** — changed since LAST BACKUP (any type). Fastest backup, slowest restore (need full + all incrementals).
- **Differential** — changed since LAST FULL BACKUP. Middle ground (need full + last differential only).
- **Key:** "Since last backup" = incremental. "Since last full" = differential.

### Quantitative risk formulas (must memorize)
- **SLE (Single Loss Expectancy)** = Asset Value × Exposure Factor
- **ALE (Annual Loss Expectancy)** = SLE × ARO (Annual Rate of Occurrence)
- **EF (Exposure Factor)** = percentage of asset lost (0-100%)
- **AV (Asset Value)** = dollar value of the asset

### Data classification vs categorization
- **Classification** — sensitivity/confidentiality level (public, internal, confidential, top secret). Drives access controls.
- **Categorization** — groups by type/purpose (PII, PHI, financial, IP). Drives which regulations apply.

### Account lockout vs disablement
- **Lockout** — temporary, automated, triggered by failed logins. Protects against brute force.
- **Disablement** — deliberate admin action for terminated employees. Preserves account for audit. NOT deletion.
- **Terminated employee → disable** (not delete, not lock). Preserves audit trail.

### Directory traversal vs LFI vs RFI vs SSRF
- **Directory traversal** — `../` to READ files outside intended directory. Not execution.
- **LFI (Local File Inclusion)** — path manipulation to EXECUTE a local file (e.g., PHP include()).
- **RFI (Remote File Inclusion)** — like LFI but includes file from attacker's external URL.
- **SSRF (Server-Side Request Forgery)** — tricks server into making requests to OTHER SYSTEMS (internal APIs, cloud metadata).
- Reading = traversal. Executing local = LFI. Executing remote = RFI. Calling another system = SSRF.

---

## Cloud, Zero Trust, and DevSecOps

### Shared responsibility model (most tested cloud concept)
- Customer is ALWAYS responsible for: data, access management, identity — regardless of service model
- Provider is ALWAYS responsible for: physical security, hypervisor
- IaaS: customer manages everything from OS up. PaaS: customer manages app + data. SaaS: customer manages only data + access.
- "Migrated to SaaS, what's still your responsibility?" → data classification, user access. Never "patching the OS."

### CSPM vs CWPP vs CNAPP vs CASB (missed — chose CASB over CSPM)
- **CSPM (Cloud Security Posture Management)** — monitors cloud **configurations** for misconfigurations and compliance drift. "Open S3 bucket" = CSPM.
- **CWPP (Cloud Workload Protection Platform)** — protects **running workloads** (VMs, containers, serverless). Runtime threat detection. "Container running vulnerable image" = CWPP.
- **CNAPP (Cloud-Native Application Protection Platform)** — unified: CSPM + CWPP + more. "Single platform for all cloud security" = CNAPP.
- **CASB** = sits between **users and SaaS apps**. Shadow IT, cloud DLP, user access. "Cloud bouncer" for users.
- CSPM = "cloud auditor" for configs. CASB = "cloud bouncer" for users. Don't confuse them.
- CSPM = "Is cloud configured correctly?" CWPP = "Are workloads protected?" CNAPP = "Both in one."

### NAC vs Zero trust (missed — chose NAC over zero trust)
- **NAC** = posture check **to get on the network**. Gate at the door. Remediation VLAN if fail.
- **Zero trust** = verification **for every resource request regardless of network location**. Already on LAN? Still verified.
- "Already on corporate network but still checked per-resource" → **zero trust**, not NAC.

### Zero trust architecture (NIST SP 800-207)
- "Never trust, always verify." No implicit trust based on network location.
- **PDP (Policy Decision Point)** — the brain. Evaluates access requests, makes allow/deny decision.
- **PEP (Policy Enforcement Point)** — the bouncer. Executes the PDP's decision.
- Flow: User → PEP → forwards to PDP → PDP decides → PEP enforces.
- "Which component determines whether access is allowed?" → PDP. "Which enforces?" → PEP.
- **Implicit trust zone** — area where devices trusted by network location alone. Zero trust eliminates these.

### Micro-segmentation vs network segmentation
- **Network segmentation** — VLANs/subnets with firewalls. Broad. Between subnets.
- **Micro-segmentation** — isolates individual workloads/apps. Granular. Within subnets. Software-defined.
- "Prevent lateral movement between servers on the same subnet" → **micro-segmentation** (not VLANs).

### SDP (Software-Defined Perimeter)
- Dynamically creates 1-to-1 connections. Resources invisible to unauthorized users ("black cloud").
- Authenticate first, connect second (reverse of traditional). An implementation of ZTNA.

### CI/CD pipeline security (shift-left)
- **Shift-left** = integrate security earlier in SDLC (coding/build, not post-deploy).
- Pipeline stages: commit (secret scanning) → build (SAST, SCA) → test (DAST, IAST) → package (image signing, SBOM) → deploy (admission control) → runtime (WAF, monitoring)
- "At which stage should static analysis be performed?" → Build stage / before deployment.

### Supply chain security
- **SBOM** — inventory of components. The list, not the scanner. Required by Executive Order 14028 for US gov software.
- **SLSA ("Salsa")** — Supply-chain Levels for Software Artifacts. Framework for supply chain integrity levels.
- SolarWinds, Codecov = supply chain attack examples. Target the build process, not the software directly.

### Modern authentication
- **PAM (Privileged Access Management)** — credential vaulting, session recording, JIT access. "Admin access without knowing the password" = PAM.
- **JIT (Just-in-Time) access** — no standing privileges. Request elevated access → approval → time-limited → auto-revoke. "Reduce standing privileges" = JIT.
- **Conditional access** — dynamic policy: who + what + where + device state → allow/block/require MFA. "Require MFA only from untrusted locations."
- **Adaptive/continuous authentication** — adjusts requirements based on real-time risk. Behavioral biometrics, impossible travel detection.
- **Step-up authentication** — additional auth for high-risk actions within an existing session. Already logged in, but wire transfer requires biometric.
- **Passkeys** — FIDO2 credentials synced across devices. Phishing-resistant (bound to specific domain).

### Firewall rule ordering (PBQ — missed)
- Rules process **top-down, first match wins**.
- **Most specific first, most general last.** Deny-all always at bottom.
- **Exceptions before denials** — if you want to allow one host through a subnet-wide deny, the allow must come FIRST.
- Single host rule > subnet rule > any rule. Specific port > all ports.
- Exam will try to trick you into putting the broad permit before the specific deny/allow.

### Cloud metadata attack
- **169.254.169.254** — instance metadata endpoint (AWS/Azure/GCP). SSRF to this IP = credential theft.
- Capital One breach (2019) = this exact attack. No on-prem equivalent.

---

## Exam Traps for Experienced Professionals

1. **IR order is sacred** — containment before eradication before recovery. No skipping.
2. **Pentest scope is absolute** — contract is law. Out-of-scope discovery → document and report, never exploit.
3. **Chain of custody is extremely formal** — any break = evidence inadmissible. No exceptions.
4. **Risk acceptance requires management sign-off** — security team recommends, management decides.
5. **Legal hold overrides retention policy** — normal deletion stops immediately. Destroying data under legal hold = spoliation.
6. **Change management always required** — even emergency changes are documented and reviewed (retroactively).
7. **Data owner is a business role** — VP/director, NOT IT. IT = custodian. Exam will try to trick you.
8. **Training before access** — new employees get security awareness training before system access, not after.
9. **Vulnerability disclosure is formal** — report privately, give vendor 90 days, then public. Never exploit.
10. **"Most secure" isn't always "best"** — exam balances security with business needs/cost/usability. But when no constraints mentioned, pick most secure.
11. **BCP/DRP testing annually** — and after significant changes. Untested plans are worthless on the exam.
12. **Terminated employee → disable account** — not delete (preserves audit trail), not lock (that's for brute force).

---

## PBQ (Performance-Based Question) Strategy

**Common PBQ topics:**
1. Firewall rule configuration (drag-and-drop rule tables, rule ORDER matters)
2. Network diagram attack identification (where to place IDS/IPS/WAF)
3. Log analysis (recognize SQLi: `' OR 1=1--`, XSS: `<script>`, traversal: `../`)
4. Wireless security configuration (WPA3-Enterprise > WPA2-Personal, AES > TKIP)
5. Certificate/PKI tasks (DV/OV/EV, wildcard covers ONE subdomain level only)
6. Drag-and-drop attack matching, control classification
7. Command-line tool output (nmap: filtered=firewall, closed=no service)
8. Incident response ordering
9. Cryptography matching (symmetric/asymmetric/hashing to use cases)

**Strategy:**
- Skip PBQs initially — flag and return after multiple choice
- Partial credit exists — fill in what you can
- Read ENTIRE scenario before starting
- Budget ~10-15 min for PBQs at the end
- Firewall PBQs: always end with implicit deny rule

---

## Commonly Tested Port Numbers

| Port | Service | | Port | Service |
|------|---------|---|------|---------|
| 20/21 | FTP | | 443 | HTTPS |
| 22 | SSH/SCP/SFTP | | 445 | SMB/CIFS |
| 23 | Telnet (insecure) | | 636 | LDAPS |
| 25 | SMTP | | 993 | IMAPS |
| 53 | DNS (TCP/UDP) | | 995 | POP3S |
| 67/68 | DHCP (UDP) | | 1433 | MSSQL |
| 69 | TFTP (UDP) | | 1812/1813 | RADIUS (UDP) |
| 80 | HTTP | | 3306 | MySQL |
| 88 | Kerberos | | 3389 | RDP |
| 110 | POP3 | | 5060/5061 | SIP/SIPS |
| 143 | IMAP | | 6514 | Syslog TLS |
| 161/162 | SNMP (UDP) | | 8080 | HTTP alt/proxy |
| 389 | LDAP | | | |

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
**SCIM** — System for Cross-domain Identity Management. Automated user provisioning/deprovisioning across SaaS apps. "Disable in AD → auto-removed everywhere." Solves orphaned accounts.
**SAML stops login. SCIM removes the account.** SAML = authentication. SCIM = lifecycle management.
**ASV** — Approved Scanning Vendor. PCI-approved vendor for quarterly external vulnerability scans.
**QSA** — Qualified Security Assessor. Performs on-site PCI DSS compliance audits.
**ISA** — Internal Security Assessor. Employee trained by PCI SSC for internal assessments.
**EAP-TLS** — Extensible Authentication Protocol - Transport Layer Security. Client cert + server cert for Wi-Fi. Most secure. "Each device gets a certificate" = EAP-TLS.
**PEAP** — Protected EAP. Server cert only, client uses username/password in TLS tunnel. No client certs needed.
**XDR** — Extended Detection and Response. EDR across multiple layers (endpoint + network + cloud + email). Correlates and responds across whole stack.
**CNAPP** — Cloud-Native Application Protection Platform. Secures cloud workloads (container scanning, IaC scanning, posture).
**SOC 1** — Financial controls (Sarbanes-Oxley context). **SOC 2** — Security/trust controls (vendor risk).
**Type I** — Point-in-time snapshot. **Type II** — Over a period (6-12 months). "Worked consistently" > "exists today."

### New acronyms added from research (Day 2)

**PAM** — Privileged Access Management. Controls/audits elevated admin access. Credential vaulting, session recording, JIT.
**UEBA** — User and Entity Behavior Analytics. ML baselines of normal behavior, flags anomalies. Insider threats.
**FIM** — File Integrity Monitoring. Detects unauthorized changes to critical files against known-good baseline.
**CSPM** — Cloud Security Posture Management. Monitors cloud configs for misconfigurations. "Open S3 bucket."
**CWPP** — Cloud Workload Protection Platform. Protects running workloads (VMs, containers, serverless). Runtime.
**IoC** — Indicator of Compromise. Evidence breach HAS occurred (IPs, hashes, domains). Reactive.
**IoA** — Indicator of Attack. Evidence attack is in progress. Focused on behavior/TTPs. Proactive.
**TTP** — Tactics, Techniques, and Procedures. Behavioral patterns of threat actors. Top of Pyramid of Pain.
**BIA** — Business Impact Analysis. Identifies critical business functions and disruption impact. Prerequisite for BCP/DRP.
**MTTD** — Mean Time to Detect. How quickly SOC identifies an intrusion.
**MTTR** — Mean Time to Repair/Recover. Time to restore operations after failure.
**MTBF** — Mean Time Between Failures. Average time between repairable failures. Reliability metric.
**MTTF** — Mean Time to Failure. Expected lifespan of non-repairable component. MTTF = non-repairable, MTBF = repairable.
**BCP** — Business Continuity Plan. Keep business running (broad). BCP > DRP.
**DRP** — Disaster Recovery Plan. Restore IT systems (narrow, subset of BCP).
**MOU** — Memorandum of Understanding. Informal agreement of mutual intent. Not legally binding like a contract.
**MSA** — Master Service Agreement. Legal framework for all future work with a vendor.
**SOW** — Statement of Work. Specific project deliverables, timelines, milestones. References MSA.
**NDA** — Non-Disclosure Agreement. Prevents sharing confidential info. Sign before sharing proprietary data.
**BPA** — Business Partners Agreement. Defines relationship/responsibilities between business partners.
**AUP** — Acceptable Use Policy. What users can/cannot do on org systems. Signed during onboarding.
**TOCTOU** — Time of Check to Time of Use. Race condition between validation and use. Application vulnerability.
**PFS** — Perfect Forward Secrecy. Compromise of long-term keys doesn't compromise past sessions. Ephemeral keys (DHE/ECDHE).
**HSM** — Hardware Security Module. Dedicated tamper-resistant device for crypto key management. Standalone appliance.
**TPM** — Trusted Platform Module. Embedded motherboard chip for secure boot, key storage, attestation. TPM = embedded, HSM = standalone.
**SDN** — Software-Defined Networking. Separates control plane from data plane. Centralized programmable management.
**NFV** — Network Function Virtualization. Virtual firewalls/load balancers on commodity hardware. Complements SDN.
**IaC** — Infrastructure as Code. Managing infra through config files (Terraform, CloudFormation). Version-controlled.
**FaaS** — Function as a Service. Serverless. Code runs on events, no server management. No OS patching responsibility.
**ICS** — Industrial Control Systems. Umbrella for SCADA/DCS/PLCs. Availability > confidentiality.
**SCADA** — Supervisory Control and Data Acquisition. Monitors/controls industrial processes. Often air-gapped.
**RTOS** — Real-Time Operating System. Guaranteed time constraints. Medical devices, avionics.
**SDP** — Software-Defined Perimeter. Dynamic 1-to-1 connections, resources invisible to unauthorized users. "Black cloud."
**PDP** — Policy Decision Point. Evaluates access requests, makes allow/deny decision. The brain.
**PEP** — Policy Enforcement Point. Executes PDP's decision, allows/blocks traffic. The bouncer.
**CVSS** — Common Vulnerability Scoring System. Severity rating 0-10. "Score of 9.8" = CVSS.
**CVE** — Common Vulnerabilities and Exposures. Unique vulnerability identifier (CVE-2024-12345). Maintained by MITRE.
**NVD** — National Vulnerability Database. NIST-maintained searchable database of CVEs with CVSS scores.
**AAA** — Authentication, Authorization, and Accounting. Three-part framework for network access.
**CIRT/CSIRT** — Computer (Security) Incident Response Team. The team that handles IR.
**MSSP** — Managed Security Service Provider. Outsourced 24/7 security monitoring. "Small company lacks budget for SOC."
**Screened subnet** — SY0-701's official term for DMZ. Network segment between internal and internet for public-facing services.
**On-path attack** — SY0-701's official term for man-in-the-middle (MitM). Intercepts communication between two parties.
**Password spraying** — few passwords against many accounts, stays under lockout. "Tries 'Password1' against 10,000 accounts."
**Credential stuffing** — stolen creds from one breach tried on other services. Exploits password reuse.
**Kerberoasting** — extract Kerberos service tickets from AD, crack offline. Targets weak service account passwords.
**Downgrade attack** — forces weaker protocol/cipher. SSL stripping forces HTTP instead of HTTPS.
**JIT** — Just-in-Time access. No standing privileges. Time-limited, auto-revoked. "Reduce standing admin accounts."
**SLSA** — Supply-chain Levels for Software Artifacts ("Salsa"). Framework for supply chain integrity levels.
