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

**#5 — ALE Formula ("AV × EF × ARO")**: ALE (Annualized Loss Expectancy) = SLE (Single Loss Expectancy) × ARO (Annualized Rate of Occurrence). SLE = AV (Asset Value) × EF (Exposure Factor). So ALE = AV × EF × ARO. Ignore distractors like company revenue — ALE is calculated from the specific asset. "Once every 5 years" = ARO of 0.2.

**#6 — Pyramid of Pain (bottom = trivial, top = painful)**: Hash values → IP addresses → Domain names → Network/Host artifacts → Tools → TTPs (Tactics, Techniques, and Procedures). TTPs are at the TOP = hardest for attackers to change. Hash values at the BOTTOM = trivial to change (just recompile). "Hardest to modify" = TTPs. "Easiest to change" = hashes.

**#7k — Port numbers ("know cold for PBQs")**: 21=FTP, 22=SSH, 23=Telnet, 25=SMTP, 53=DNS, 80=HTTP, 88=Kerberos, 110=POP3, 143=IMAP, 389=LDAP, 443=HTTPS, 445=SMB, 587=SMTP submission, **636=LDAPS**, 993=IMAPS, 995=POP3S, 1433=MSSQL, 3306=MySQL, **3389=RDP**. Pattern: secure versions add to the base port (389→636, 143→993, 110→995).

**#7j — Replay vs session hijacking vs pass the hash**: Replay = captures auth token, resends it LATER. "Recorded and played back." Session hijacking = takes over a LIVE session in progress. "Steals active session cookie." Pass the hash = captured NTLM/Kerberos hash used to auth to Windows. Decision rule: "captures + resends later" = replay. "Takes over active session" = hijacking. "Windows auth hashes" = pass the hash.

**#7i — Order of Volatility ("CPU first, tape last")**: Most volatile → least: CPU registers/cache → RAM → network state → swap/page file → hard drive → remote logs → archival media. Decision rule: start at CPU, work outward to disk then offsite. Swap file is ON DISK — less volatile than RAM. "Collect most volatile first" = CPU registers.

**#7h — PCI scope ("reduced, never removed")**: If you accept card payments, PCI DSS compliance is NEVER eliminated — even with hosted payment fields (iframe from provider). Hosted fields = reduced scope (SAQ A, lightest level, ~22 questions). Tokenization = also reduces scope but differently. Liability is shared, never fully transferred. Decision rule: "Never touch card data" = reduced scope (SAQ A), NOT eliminated.

**#7g — Adaptive auth vs zero trust ("mechanism vs philosophy")**: Adaptive authentication (aka risk-based / conditional access) = dynamically adjusts auth requirements + access level based on context (device, location, behavior). "Same user, different context → different experience." Zero trust = the broad architecture philosophy ("never trust, always verify"). Adaptive auth is a MECHANISM inside zero trust. Decision rule: "different access levels based on context signals" = adaptive auth. "Every resource always verified" (general philosophy) = zero trust.

**#7f — CASB vs DLP ("apps vs data")**: CASB (Cloud Access Security Broker) = discovers + controls CLOUD APPS. Shadow IT, risk-score apps, block unauthorized SaaS. Sits between users and cloud. DLP (Data Loss Prevention) = prevents sensitive DATA from leaving. SSNs in email, PII uploads. Decision rule: "unauthorized apps / shadow IT" = CASB. "Sensitive data exfiltration" = DLP. CASB controls the apps, DLP controls the data.

**#7e — NIST CSF vs 800-53 vs ISO 27001 vs CIS ("what level?")**: NIST CSF (Cybersecurity Framework) = voluntary, 5 functions (Identify/Protect/Detect/Respond/Recover), strategic risk language. NIST SP 800-53 = prescriptive catalog of 1000+ specific controls, mandatory for US federal (FISMA). ISO 27001 = certifiable international ISMS standard, auditable. CIS Controls = prioritized list of ~18 practical security actions. Decision rule: "five functions" = CSF. "Specific controls catalog" = 800-53. "Certification/audit" = ISO 27001. "Prioritized practical list" = CIS.

**#7d — SCA/SAST/DAST/IAST ("what are you scanning?")**: SCA (Software Composition Analysis) = scans DEPENDENCIES for known CVEs. "Third-party libraries + NVD" = SCA. SAST (Static Application Security Testing) = scans YOUR source code, not running. White-box. DAST (Dynamic Application Security Testing) = attacks running app from outside. Black-box. IAST (Interactive Application Security Testing) = agent INSIDE running app during testing. Decision rule: dependencies = SCA, your code = SAST, running app from outside = DAST, agent inside running app = IAST.

**#7c — MAC/DAC/RBAC/ABAC ("who decides?")**: MAC (Mandatory Access Control) = system-enforced labels + clearances, NO user override. "Top Secret label" = MAC. DAC (Discretionary Access Control) = owner decides who gets access. Windows NTFS permissions = DAC. RBAC (Role-Based Access Control) = access by job role. "All HR staff get HR files." ABAC (Attribute-Based Access Control) = policy engine evaluates multiple attributes (time, location, device, department). Decision rule: "labels + no override" = MAC. "Owner shares" = DAC. "Job role" = RBAC. "Multiple conditions" = ABAC.

**#7b — RoPA vs PIA/DPIA ("ledger vs assessment") — wrong S10, S11, S12**: RoPA (Record of Processing Activities) = mandatory GDPR ongoing registry of ALL data processing (what, why, retention, sharing). Article 30. PIA/DPIA (Privacy/Data Protection Impact Assessment) = one-time risk assessment BEFORE launching a new high-risk project. Decision rule: "ongoing record of all activities" = RoPA. "New project risk assessment" = PIA/DPIA. **PERSISTENT TRAP**: "before launch" + "evaluation" + "new system" = ALWAYS DPIA. Do NOT pick RoPA just because data processing is involved. RoPA = what you ALREADY do. DPIA = risk of what you're ABOUT TO do. Biometric data explicitly triggers DPIA (GDPR Article 35).

**#7a — CWPP vs CNAPP ("bodyguard vs command center")**: CWPP (Cloud Workload Protection Platform) = protects what's RUNNING (containers, VMs, serverless). Runtime protection, image scanning, process monitoring. CNAPP (Cloud-Native Application Protection Platform) = unified platform that COMBINES CSPM+CWPP+CASB into one console. Exam rule: if the scenario describes only workload protection → CWPP. If it says "single consolidated platform" → CNAPP. The exam wants the MOST SPECIFIC answer, not the umbrella term.

**#7 — Agreement Types ("MSA is the umbrella, SOW is the rain")**: MSA (Master Service Agreement) = umbrella contract with general terms (pricing, duration, renewal, liability). SOW (Statement of Work) = specific project details, deliverables, SLAs under the MSA. MOU (Memorandum of Understanding) = non-binding intent. BPA (Blanket Purchase Agreement) = recurring purchases at pre-negotiated prices. "General terms, no deliverables" = MSA. "Specific deliverables and SLAs" = SOW.

**#8 — Certificate Revocation ("List = CRL, Live query = OCSP")**: CRL (Certificate Revocation List) = client downloads a complete signed list of revoked serial numbers. OCSP (Online Certificate Status Protocol) = client queries CA in real-time for one cert. OCSP stapling = server pre-fetches its own OCSP response and includes it in TLS handshake. Certificate pinning = client hard-codes expected cert/key. "Downloads a list" = CRL. "Real-time query" = OCSP. "Server includes in handshake" = stapling. "Hard-coded expected cert" = pinning.

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

**THE key SIEM vs UEBA distinction (missed — chose SIEM over UEBA):**
- SIEM = "match this specific rule/signature" (static correlation rules an analyst wrote)
- UEBA = "this deviates from what's normal for THIS user" (ML behavioral baseline)
- "Unusual time," "never used before," "outside normal pattern," "insider threat" → always **UEBA**

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

### Data sanitization methods — reuse vs destroy (wrong S11)
- **Overwriting / verified wipe** — writes over all sectors, verifies. Drive REUSABLE. "Donate/reuse" = overwrite.
- **Cryptographic erasure** — destroy encryption key. ONLY works if drive was already encrypted. "Encrypted + reuse" = crypto erasure.
- **Degaussing** — magnetic field. Destroys HDD AND data. Not for SSDs. Device is DEAD.
- **Physical destruction** — shred/incinerate. No reuse.
- Decision rule: don't assume encryption unless stated. "Reuse" without encryption mentioned = overwriting.

### SaaS session persistence — IdP disable ≠ app session kill (wrong S1 + S11)
- Disabling IdP (Active Directory) account prevents NEW logins only.
- SaaS apps issue their OWN session cookies during authentication — these persist independently.
- SSO/SAML tokens are short-lived (minutes) and expire quickly. The persistent access comes from the APP session.
- Offboarding must revoke BOTH: (1) IdP account AND (2) active sessions in each downstream SaaS app.
- Decision rule: "disabled account but still accessing SaaS days later" = app session wasn't killed, not SSO token.

### DNS tunneling vs domain fronting vs beaconing (wrong S11)
- **DNS tunneling** — data encoded in SUBDOMAIN labels. "Long encoded subdomains" + "periodic queries" = DNS tunneling.
- **Domain fronting** — legitimate domain in TLS SNI/Host header, actual traffic goes to hidden service on same CDN. Disguises DESTINATION.
- **Beaconing** — regular callbacks to C2 via normal HTTPS. Looks like regular web traffic, not weird subdomains.
- Decision rule: weird subdomains = DNS tunneling. Legit domain as cover = domain fronting. Regular HTTPS check-ins = beaconing.

### SBOM vs SLSA — supply chain security (lucky S11)
- **SBOM (Software Bill of Materials)** — inventory of all components in software. "What's in it?" = SBOM. Ingredient list.
- **SLSA (Supply-chain Levels for Software Artifacts)** — "salsa." Build pipeline integrity framework. Verifiable provenance. "How was it built?" = SLSA.
- Decision rule: "what's inside" = SBOM. "How it was built / build integrity" = SLSA.

### Kerberos attack cluster — pass the ticket vs pass the hash (wrong S11 + S12)
- **Pass the ticket** — steal Kerberos TICKET (TGT/TGS) from memory, inject into session. "Kerberos" + "ticket" = pass the ticket.
- **Pass the hash** — steal NTLM HASH, authenticate directly. No Kerberos. "NTLM" + "hash" = pass the hash.
- **Golden ticket** — FORGE a TGT using stolen krbtgt hash. Unlimited domain access. "Forged" + "krbtgt" = golden ticket.
- **Kerberoasting** — request service tickets, CRACK offline. "Offline cracking" + "service account" = Kerberoasting.
- Decision rule: look for "ticket" vs "hash" in the scenario. They use different credential types entirely.
- **TRAP: Mimikatz extracts BOTH hashes AND tickets.** Don't assume "Mimikatz = pass the hash." Read what artifact was extracted. "TGT" = ticket = pass the ticket. "NTLM hash" = pass the hash. The tool doesn't determine the attack — the ARTIFACT does.

### Adaptive auth vs conditional access vs zero trust (wrong 2x)
- **Adaptive authentication** — system dynamically changes requirements based on real-time risk signals (location, device, behavior). "Same user, different context, different response" = adaptive.
- **Conditional access** — admin-configured IF/THEN rules. "If unmanaged device, require MFA." More static, policy-based.
- **Zero trust** — philosophy/architecture, not a specific technology. "Never trust, always verify."
- Decision rule: "automatically adjusts to changing risk" = adaptive auth. "Admin sets rules" = conditional access. "Overall posture" = zero trust.

### CASB vs DLP vs SWG vs CSPM — persistent confusion (wrong 3x)
- **CASB (Cloud Access Security Broker)** — which CLOUD APPS users access. "Shadow IT," "unauthorized SaaS," "personal Dropbox," "unapproved tools."
- **DLP (Data Loss Prevention)** — the DATA itself leaving. "Sensitive data," "credit card numbers," "classified files on USB."
- **SWG (Secure Web Gateway)** — WEB BROWSING control. "Malicious websites," "URL filtering." Doesn't distinguish approved vs personal cloud apps.
- **CSPM (Cloud Security Posture Management)** — YOUR cloud infrastructure config. "Misconfigured S3," "open security groups."
- **CASB trigger**: employees using specific named cloud services not approved by IT = always CASB.

### NIST 800-53 vs 800-171 vs CSF — three different things
- **NIST 800-53** — master control catalog for federal systems. "Impact levels (low/mod/high)" + "control baselines" + "federal" = 800-53.
- **NIST 800-171** — subset of 800-53 for non-federal systems handling CUI. "Contractor" + "CUI" + "DFARS" + "CMMC" = 800-171.
- **NIST CSF** — strategic framework, five functions (Identify/Protect/Detect/Respond/Recover). "Board" + "maturity" + "strategic" = CSF.
- Decision rule: federal + catalog = 800-53. Contractor + CUI = 800-171. Board + five functions = CSF.

### CSPM vs IaC static analysis — timing matters
- **IaC static analysis** — scans templates BEFORE deployment (shift-left). Catches misconfigs in code.
- **CSPM (Cloud Security Posture Management)** — monitors AFTER deployment. Detects misconfigs in running cloud environments.
- Decision rule: "before deployment" / "in the pipeline" = static analysis. "cloud environment" / "detect drift" = CSPM.
- **CWPP (Cloud Workload Protection Platform)** — protects running workloads (VMs, containers). Not template analysis.

### Email ports — retrieval vs sending
- **Retrieval** (pulling mail to client): IMAP 143/993(TLS), POP3 110/995(TLS)
- **Sending** (submitting mail): SMTP 25/587(TLS)
- Decision rule: "retrieval" = 993 + 995. "sending" = 587. Don't mix them.

### SASE vs SSE vs SD-WAN — converged cloud security
- **SASE (Secure Access Service Edge)** = networking + security converged in the cloud. The whole package.
  - SASE = SSE + SD-WAN
- **SSE (Security Service Edge)** = just the security half of SASE (CASB + ZTNA + SWG). No networking.
- **SD-WAN (Software-Defined Wide Area Network)** = just the networking half. No security stack.
- **NGFW (Next-Generation Firewall)** = a single device/service, not a converged platform.
- **Decision rule**: If the question mentions BOTH networking AND security functions converged → SASE. If only security services (CASB, ZTNA, SWG) → SSE.

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

### PDP vs PEP (missed — chose PEP over PDP)
- **PDP (Policy Decision Point)** — the brain. Evaluates and **decides** allow/deny. P-**D**ecides-P.
- **PEP (Policy Enforcement Point)** — the bouncer. **Enforces** the decision, blocks/allows traffic. P-**E**nforces-P.
- Flow: User → PEP → forwards to PDP → PDP decides → PEP enforces.
- "Which component decides?" → PDP. "Which component blocks traffic?" → PEP.

### Kerberos/credential attack types (pass the ticket was lucky)
- **Pass the ticket (PtT)** — replay a captured **Kerberos ticket**. "Ticket + replay" = PtT.
- **Pass the hash (PtH)** — use a stolen **NTLM hash** to authenticate without cracking. "Hash + authenticate" = PtH.
- **Kerberoasting** — request Kerberos service tickets from AD, **crack them offline**. "Extract + crack" = Kerberoasting.
- **Credential stuffing** — stolen creds from one breach tried on **other services**. "Reuse across sites" = stuffing.

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

## Exam Day: False Confidence Trap

**Pattern from S12**: All 4 misses were marked "knew it cold" — the most dangerous error type. When you're SURE of a wrong answer, you won't second-guess yourself on the exam.

**Topics where this happens most:**
- **Pass the ticket vs pass the hash** — Mimikatz association triggers "pass the hash" automatically. STOP and read what ARTIFACT was stolen (ticket vs hash).
- **CVE vs CVSS** — seeing "CVE-2024-XXXX" in the question triggers "CVE" even when they're asking about the SCORE (CVSS). Read what's being ASKED.
- **ATT&CK vs Diamond** — both involve adversary analysis. "Compare groups' techniques" = ATT&CK. "Link incidents by shared elements" = Diamond.
- **DPIA vs RoPA** — both involve GDPR data processing. "Before launch" = DPIA. "Ongoing registry" = RoPA.

**Exam strategy**: On ANY question involving these pairs, pause and re-read the question TWICE. Your first instinct has been wrong repeatedly. Ask: "What EXACTLY is the question asking?" not "What topic do I recognize?"

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

---

## Physical Security (1.2)

### Perimeter Controls

**Bollards** — Short, sturdy vertical posts preventing vehicle access. Fixed, retractable, or decorative.
- Exam tell: "vehicle threat" or "preventing cars from approaching" = bollards.

**Fencing** — Perimeter boundary. Height: 3-4 ft = deterrent; 6-7 ft = difficult to climb; 8+ ft with barbed wire = high security.
- "Perimeter boundary" = fencing. "Prevent vehicle access" = bollards (not fencing).

**Lighting** — Deters intruders, enables CCTV (Closed-Circuit Television) to capture usable footage.

### Entry Controls

**Access Control Vestibule (formerly Mantrap)** — Double-door system, only one door opens at a time. Prevents tailgating/piggybacking.

**Badge/Proximity Card Systems** — RFID (Radio Frequency Identification) / NFC (Near-Field Communication) contactless cards. Creates access logs.

**Security Guards** — Human judgment and real-time response. Automated systems cannot make judgment calls.

**Two-Person Integrity** — Two authorized individuals required for critical actions. Anti-insider-threat control.

### Detection Controls

**Sensors:** Infrared (PIR — heat/motion in dark), Pressure (weight on surface), Microwave (large areas, penetrates walls), Ultrasonic (enclosed spaces).

### Data Protection Controls

**Faraday Cage** — Conductive mesh blocking EM signals. Prevents data emanation. Used in SCIFs.
**Air Gap** — Complete network isolation. USB can bridge (Stuxnet).
**Screen Filters** — Narrow viewing angle, prevent shoulder surfing.
**Cable Locks** — Tether laptops. Kensington slot.

### Secure Areas
- **Safe** — Small items, multiple locations. **Vault** — Entire room, centralized. **Cage** — Wire mesh in data center, specific racks.

| Threat | Control |
|--------|---------|
| Vehicle attack | Bollards |
| Tailgating | Access control vestibule |
| Shoulder surfing | Privacy screen |
| EM eavesdropping | Faraday cage |
| Network attack on critical infra | Air gap |
| Insider threat (single actor) | Two-person integrity |

---

## Disaster Recovery Site Types (3.4)

| Feature | Hot | Warm | Cold | Mobile |
|---------|-----|------|------|--------|
| Hardware ready | All | Partial | None | Yes, portable |
| Data current | Real-time | Hours old | Days+ | Varies |
| RTO | Minutes | Hours-days | Days-weeks | Hours-days |
| Cost | Highest | Moderate | Lowest | Moderate-high |

- "Immediate failover, no downtime" = **hot site**
- "Balance cost and recovery" = **warm site**
- "Cheapest, days of downtime OK" = **cold site**
- "Portable, deploy to temporary location" = **mobile site**
- "Cost-effective DR without owning facilities" = **DRaaS (Disaster Recovery as a Service)**

---

## RAID Levels (3.4)

**RAID (Redundant Array of Independent Disks)**

| Level | Technique | Min Drives | Drives Can Fail | Usable Capacity |
|-------|-----------|-----------|-----------------|-----------------|
| 0 | Striping | 2 | 0 (none) | 100% |
| 1 | Mirroring | 2 | 1 | 50% |
| 5 | Stripe + parity | 3 | 1 | (N-1)/N |
| 6 | Stripe + double parity | 4 | 2 | (N-2)/N |
| 10 | Stripe of mirrors | 4 | 1 per pair | 50% |

- No fault tolerance, max speed = **RAID 0**
- Simple redundancy, exact copy = **RAID 1**
- Balance performance/capacity/fault tolerance = **RAID 5**
- Survive two simultaneous failures = **RAID 6**
- Best performance WITH redundancy (databases) = **RAID 10**
- Large arrays, rebuild-time concern = **RAID 6** (second failure during rebuild)

---

## Redundancy and Power (3.4)

**UPS (Uninterruptible Power Supply)** — Short-term battery, bridges to generator (10-30s). Also conditions power.
**Generator** — Long-term backup. Diesel/gas. Days/weeks with fuel.
**PDU (Power Distribution Unit)** — Distributes power in rack. Dual PDUs = redundant paths.
**Dual Power Supply** — Two PSUs per server on separate circuits.

**NIC Teaming/Bonding** — Multiple NICs as one. Redundancy + bandwidth.
**Multipath I/O (MPIO)** — Multiple paths to storage (SAN). Auto-reroute on failure.
**Active/Active cluster** — All nodes handle traffic. **Active/Passive** — Standby takes over on failure.
**Load Balancer** — Distributes traffic, health checks remove failed backends.

---

## Email Security Protocols (3.2, 4.5)

**SPF (Sender Policy Framework)** — DNS TXT record listing authorized sending IPs. Checks envelope sender, NOT From: header. Breaks on forwarding.
**DKIM (DomainKeys Identified Mail)** — Cryptographic signature in email header. Public key in DNS. Proves integrity + domain authenticity.
**DMARC (Domain-based Message Authentication Reporting and Conformance)** — Ties SPF+DKIM with policy. Requires From: header alignment. Policies: none/quarantine/reject. Provides reporting.

**S/MIME (Secure/Multipurpose Internet Mail Extensions)** — End-to-end email encryption + signing via PKI certificates. Per-user.

| Question | Answer |
|----------|--------|
| Which IPs can send for this domain? | SPF |
| Was the email modified in transit? | DKIM |
| What happens when auth fails? | DMARC |
| All three use what DNS record type? | TXT |
| End-to-end email encryption? | S/MIME |
| Checks envelope sender? | SPF |
| Checks From: header alignment? | DMARC |

---

## DNS Security (3.2, 4.5)

**DNSSEC (DNS Security Extensions)** — Cryptographic auth of DNS responses. Prevents cache poisoning. Integrity, NOT confidentiality.
**DNS Filtering** — Blocks resolution for malicious domains.
**DNS Sinkholing** — Redirects malicious DNS to internal server for analysis. Identifies compromised hosts.
- Filtering = blocks. Sinkholing = redirects to capture intel.

**DoH (DNS over HTTPS)** — Port 443. Indistinguishable from web traffic. Can bypass corporate DNS.
**DoT (DNS over TLS)** — Port 853. Dedicated port, easier to firewall than DoH.

---

## Wireless Security (3.2)

| Protocol | Encryption | Key Exchange | Status |
|----------|-----------|-------------|--------|
| WEP | RC4, 24-bit IV | Static | BROKEN |
| WPA | RC4+TKIP | 4-way | Deprecated |
| WPA2-Personal | AES-CCMP | PSK, 4-way | Current |
| WPA2-Enterprise | AES-CCMP | 802.1X/EAP/RADIUS | Current |
| WPA3-Personal | AES-CCMP/GCMP | SAE (Dragonfly) | Recommended |
| WPA3-Enterprise | AES-GCMP-256 | 802.1X/EAP/RADIUS | Recommended |

- SAE = forward secrecy, resistant to offline dictionary attacks
- WPA3 = PMF (Protected Management Frames) mandatory, prevents deauth attacks
- OWE (Opportunistic Wireless Encryption) = encrypts open Wi-Fi without password
- EAP-TLS = client+server certs, most secure. PEAP = server cert only, username/password.

**Attacks:** Rogue AP (unauthorized), Evil Twin (mimics SSID), Deauth (forged frames, fix: PMF), WPS (11K combos, fix: disable).
**Site survey** = plan AP placement. **Heat map** = visual signal strength.

---

## Network Attacks (2.4)

**ARP (Address Resolution Protocol) Poisoning** — Fake ARP replies associate attacker MAC with gateway. MITM on local subnet. Fix: DAI (Dynamic ARP Inspection).
**DNS Poisoning** — False records in resolver cache. Redirects to malicious sites. Fix: DNSSEC.
- ARP = Layer 2, local, MACs. DNS = application layer, domains.

**MAC Flooding** — Overflow switch CAM table → switch acts like hub. Fix: port security.
**MAC Cloning** — Change MAC to bypass MAC filtering. MAC filtering alone is NOT strong security.
**Replay Attack** — Capture and retransmit valid traffic. Fix: timestamps, nonces.
**Pass-the-Hash** — Extract hashes from memory (Mimikatz), authenticate without cracking. NTLM vuln. Fix: Kerberos, Credential Guard.
- Replay = captured from network. Pass-the-hash = extracted from system memory.

**VLAN Hopping** — Switch spoofing (negotiate trunk via DTP) or double tagging (two 802.1Q tags). Fix: disable DTP, change native VLAN.

**DDoS types:** Volumetric (bandwidth, Gbps), Protocol (state tables, SYN flood), Application Layer 7 (legitimate-looking requests, Slowloris).
**Amplification** — Spoofed source IP + small request → large response to victim. DNS ~50x, NTP ~556x.
**SYN Flood** — Half-open TCP connections exhaust server. Fix: SYN cookies.

---

## Malware Types (2.4)

**Virus** — Attached to host file, requires user action. **Worm** — Self-replicating, no user action, no host file.
**Trojan** — Disguised as legitimate, no self-replication. **RAT (Remote Access Trojan)** — Trojan with remote control + C2.
**Ransomware** — Encrypts/locks, demands payment. **Wiper** — Destroys data, no ransom. Wiper=destruction, Ransomware=extortion.
**Spyware** — Covert data collection. **Adware** — Displays ads. **Scareware** — Fake security warnings.
**Rootkit** — Hides at kernel/OS level. May require reimaging. **Keylogger** — Records keystrokes (software or hardware).
**Logic Bomb** — Dormant until trigger (date, termination). Often insider.
**Botnet** — Network of zombies via C2. DDoS, spam, mining.
**Fileless** — Lives in RAM, no disk file. Evades traditional AV.
**LOTL/LOLBins (Living off the Land Binaries)** — Abuses legitimate OS tools (PowerShell, WMI, rundll32). No malware binary.
**Polymorphic** — Changes encryption/wrapper. **Metamorphic** — Rewrites actual code. Metamorphic > polymorphic in evasion.
**Cryptojacker** — Hijacks CPU/GPU for mining. High CPU, no visible cause.
**Backdoor** — Hidden auth bypass. **PUP/PUA** — Technically legal, user "agreed" via EULA.
**Dropper** — Installs malware from within itself (no internet). **Downloader** — Retrieves malware from internet.
**Bloatware** — Pre-installed by manufacturer. Increases attack surface.

### Malware Decision Tree
```
Self-replicates? YES + network + no user action → WORM
Self-replicates? YES + needs host file + user action → VIRUS
Disguised as legitimate? → TROJAN (→ RAT / DROPPER / DOWNLOADER)
Encrypts + ransom? → RANSOMWARE. Destroys, no ransom? → WIPER
Hides at kernel? → ROOTKIT. Records keys? → KEYLOGGER
Trigger condition? → LOGIC BOMB. Mines crypto? → CRYPTOJACKER
Memory only? → FILELESS. Uses legit OS tools? → LOTL
Changes encryption? → POLYMORPHIC. Rewrites code? → METAMORPHIC
```

### Malware IoC Patterns
**C2 Beaconing** — Regular interval connections, small packets, continues when idle. Evasion: jitter, domain fronting, DNS tunneling.
**Resource anomalies** — High CPU = cryptojacker. Memory spikes = fileless. Bandwidth = worm/exfiltration.
**Unexpected processes** — Unknown services, executables in temp dirs, misspelled names (svch0st), shells spawned by non-admin processes.

---

## Memory/Buffer Vulnerabilities (2.3)

**Buffer Overflow** — Writes beyond buffer boundary. Stack-based (overwrites return address) vs heap-based (corrupts dynamic memory).
**Integer Overflow** — Wraps to small value, bypasses length checks.
**Format String** — User input as printf() format string. %x reads, %n writes memory.
**Use-After-Free** — Pointer used after memory freed. Freed space reallocated for attacker data.
**Null Pointer Dereference** — Access address zero. Usually DoS (crash).

| Mitigation | Effect |
|-----------|--------|
| ASLR (Address Space Layout Randomization) | Randomizes memory addresses |
| DEP/NX (Data Execution Prevention) | Marks data regions non-executable |
| Stack Canaries | Sentinel value detects overflow before return |
| Bounds Checking | Validates input length before copying |

---

## Additional Vulnerability Types (2.3)

**Privilege Escalation:** Vertical = user→admin (UP). Horizontal = user→other user (SIDEWAYS).
**Improper Error Handling** — Crashes, info disclosure. **Verbose Errors** — Reveals DB/paths/queries. Fix: custom error pages.
**Hard-Coded Credentials** — Embedded in code/firmware. **Side-Loading** — Apps from unofficial sources.
**Jailbreaking** (iOS) / **Rooting** (Android) — Removes manufacturer restrictions.

**XXE (XML External Entity)** — External entity in XML reads local files. **Insecure Deserialization** — Crafted serialized object executes code.

| Clue | Injection Type |
|------|---------------|
| SQL query, tables | SQL injection |
| XML, DOCTYPE, entity | XXE |
| System/OS command, shell | Command injection |
| LDAP, directory | LDAP injection |
| MongoDB, JSON operators | NoSQL injection |

---

## Cryptographic Attacks (2.4)

**Birthday Attack** — Probability-based hash collision finding. **Collision** — Two inputs, same hash (result of birthday attack).
**Brute Force** — All combinations (slowest). **Dictionary** — Word list (medium). **Rainbow Table** — Precomputed hash lookup (fastest). Defense: salting.
**Known Plaintext** — Attacker HAS pairs (passive). **Chosen Plaintext** — Attacker SELECTS what to encrypt (active).
**Side-Channel** — Physical measurement (timing, power) leaks crypto info.

**Key Stretching:** PBKDF2 (NIST recommended), bcrypt (Blowfish, work factor), scrypt (memory-hard), Argon2 (most modern, PHC winner).

---

## Social Engineering (2.2)

| Channel/Method | Term |
|---------------|------|
| Email, mass | Phishing |
| Email, targeted/personalized | Spear phishing |
| Email, targeting executives | Whaling |
| Phone/voice | Vishing |
| SMS/text | Smishing |
| DNS redirect, correct URL → fake site | Pharming |
| Fabricated scenario/story | Pretexting |
| Physical lure (USB drives) | Baiting |
| Following through secured door | Tailgating (without knowledge) / Piggybacking (with consent) |
| Observing screen/keyboard | Shoulder surfing |
| Searching trash | Dumpster diving |
| Compromising frequently visited site | Watering hole |
| Large-scale disinformation | Influence campaign |

**Principles:** Authority, Urgency (time), Scarcity (quantity), Consensus/Social Proof, Familiarity/Liking, Trust.

---

## Compliance Frameworks (5.4)

| Regulation | Applies To | Protects | Key Requirement |
|-----------|------------|---------|----------------|
| GDPR | Any org, EU resident data | Personal data | 72-hr breach notification, DPO, right to erasure, opt-IN |
| HIPAA | Healthcare, BAs | PHI | BAA with vendors, minimum necessary rule |
| PCI DSS | Cardholder data handlers | Card data | 12 requirements, quarterly ASV scans |
| SOX | Publicly traded US | Financial reporting | CEO/CFO certify, internal control audits |
| CCPA | For-profit CA businesses | CA consumer info | Opt-OUT of data sale |
| FERPA | Schools with DoEd funding | Student records | Written consent before disclosure |
| FISMA | US federal + contractors | Federal systems | Must implement NIST (SP 800-53) |
| COBIT | IT governance (any org) | IT/business alignment | ISACA framework |
| ISO 27001 | International | ISMS | Only major framework with formal certification |
| NIST SP 800-53 | US federal | Federal systems | ~1,150 security controls |
| CSA STAR | Cloud providers | Cloud environments | CCM-based, multi-level certification |

**GDPR = opt-in. CCPA = opt-out.** FISMA mandates NIST. ISO 27001 = certifiable. COBIT = governance, not controls.

---

## Asset Management Lifecycle (4.2)

**Acquisition** → **Assignment** (tagging, inventory) → **Monitoring** (licensing, patching, EOL) → **Disposal** (sanitize, destroy, document)

### Media Sanitization (NIST SP 800-88)

| Method | Description | Reusable? |
|--------|------------|-----------|
| Clear | Overwrite with non-sensitive data | Yes |
| Purge | Degaussing, crypto erase (lab-resistant) | Sometimes |
| Destroy | Shredding, incineration | No |

- **Degaussing does NOT work on SSD/flash** — magnetic media only (HDD, tape)
- **Cryptographic erasure** — Destroy the key. Fast for SEDs (Self-Encrypting Drives).

---

## Hardening Techniques (2.5, 4.1)

**Secure Baselines** — CIS Benchmarks (industry standard), Group Policy (GPO), SCAP automates compliance checking.
- Disable unnecessary ports/protocols/services. Remove unnecessary software.
- Change ALL default passwords. Update firmware (verify integrity).
- Host-based firewall on ALL systems. Application allow list = "default deny" (stricter).
- **Patch Management:** Identify → Evaluate → Test → Approve → Deploy → Verify → Document

---

## Penetration Testing (5.5)

### SY0-701 Terms (exam uses NEW terminology)

| Old | New | Tester Knowledge |
|-----|-----|-----------------|
| White box | **Known environment** | Full disclosure |
| Gray box | **Partially known environment** | Partial info |
| Black box | **Unknown environment** | Nothing |

**Teams:** Red (offense), Blue (defense), Purple (integrated collaboration), White (referees/RoE enforcement).
- Red team = extended, simulates real threat actor. Pentest = short, find vulns.

**RoE (Rules of Engagement)** — Formal written doc BEFORE testing: scope, timing, authorization, contacts, techniques.
**Reconnaissance:** Passive (OSINT, no target contact) vs Active (port scanning, leaves logs).
**Bug Bounty** = ongoing, public crowd, pay per vuln. **Pentest** = contracted firm, fixed timeframe.

---

## Study Resources

| Resource | URL | Best For |
|----------|-----|----------|
| Hamada Question Bank | github.com/Hamada-khairi/Hamada-Security-Plus-Exam-Prep | 551 scenario questions in JSON |
| Packt/Dion Labs | github.com/PacktPublishing/TOTAL-CompTIA-Security-Cert-SY0-701- | Hands-on labs (RAID, physical, WPA2) |
| wilsonvs Study Guide | github.com/wilsonvs/CompTIA-Security-SY0-701 | Comprehensive markdown reference |

---

## Automation and Orchestration (4.7)

**Automation** — Single task, no human. **Orchestration** — Coordinates multiple automated tasks across systems.
- Exam tell: "single repetitive task" = automation. "coordinates multiple tools" = orchestration.

### Use Cases
- **User provisioning** — Auto-create/deactivate accounts from HR events
- **Resource provisioning** — Auto-deploy infra (VMs, storage) via IaC (Infrastructure as Code)
- **Guard rails** — Auto-block unsafe actions (e.g., opening port 22 to 0.0.0.0/0)
- **Security groups** — Auto-enforce firewall rules across cloud VPCs (Virtual Private Clouds)
- **Ticket creation** — SIEM alert → auto-create incident ticket
- **Escalation** — Unacknowledged alert → auto-escalate to manager
- **Enable/disable access** — Auto-disable VPN after failed MFA attempts
- **CI/CD security** — Code commit triggers SAST scan, blocks merge on critical vuln
- **Integrations/APIs** — Connect tools (vuln scanner → CMDB — Configuration Management Database)

### Benefits
Efficiency, enforcing baselines, standard configs, scaling securely, employee retention (less burnout), faster reaction time, workforce multiplier.

### Risks/Downsides (exam tests these five specifically)
**Complexity** — hard to build/debug. **Cost** — licensing + development. **Single point of failure** — platform down = no automation. **Technical debt** — undocumented scripts accumulate. **Ongoing supportability** — API changes break integrations.

**Playbook** = automated workflow for a scenario. **Runbook** = manual step-by-step procedures. Modern SOAR (Security Orchestration, Automation, and Response) automates playbooks that used to be runbooks.

---

## Digital Forensics Procedures (4.9)

### Legal Hold
Formal order to preserve ALL potentially relevant data. Overrides normal retention/deletion policies. Issued by legal counsel or court.
- **Spoliation** — destroying evidence after legal hold = sanctions, adverse inference, criminal contempt.
- Exam tell: "anticipates lawsuit, what first?" → legal hold.

### Chain of Custody
Documents EVERY person who handled evidence: who, what, when, where. ANY break = evidence inadmissible.
- Hash values (SHA-256) computed at acquisition, verified at every transfer. Mismatch = integrity compromised.

### Order of Volatility (collect MOST volatile FIRST)
1. CPU registers/cache (nanoseconds)
2. RAM (seconds-minutes) — running processes, encryption keys, malware
3. Swap/pagefile (minutes)
4. Disk (hours-days)
5. Logs (days-weeks)
6. Network captures (transient)
7. Backup media (months-years)

**Mnemonic: "Real Researchers Should Document Logs, Not Backups"**

"Power off the system" is almost always WRONG — destroys volatile evidence.

### Preservation
- **Write blockers** — read-only access to evidence media. MUST use before connecting to forensic workstation.
- **Forensic image** — bit-for-bit copy including deleted files, slack space, unallocated space. NOT a file copy.
- **Hash verification** — hash source BEFORE imaging, hash image AFTER. Must match.

### Forensic Image vs Logical Copy

| Feature | Forensic Image | Logical Copy |
|---------|---------------|-------------|
| Scope | Every bit (including deleted) | Visible files only |
| Court-admissible | Yes (with hash + chain of custody) | Generally insufficient |
| Use case | Legal proceedings | Quick triage |

### E-Discovery (Electronic Discovery)
Legal process for producing ESI (Electronically Stored Information) in litigation. Identification → preservation → collection → processing → review → production.

### Forensic Tools
- **FTK Imager** — disk imaging with auto-hashing. **EnCase** — "gold standard" court admissibility.
- **Autopsy** — free, open-source disk forensics. **dd** — raw bitstream imaging (Linux).
- **Volatility** — memory forensics (RAM dump analysis).
- "Analyze memory dump for malware" → Volatility. "Free disk forensics" → Autopsy.

---

## Risk Appetite and Assessment Types (5.2)

### Risk Appetite Types

| Type | Posture | Example |
|------|---------|---------|
| **Expansionary** | Accept more risk for growth | Tech startups, crypto exchanges |
| **Conservative** | Minimize risk, prioritize stability | Healthcare, banking, government |
| **Neutral** | Balanced, moderate risk | Mature enterprises in stable markets |

### Risk Appetite vs Risk Tolerance
- **Appetite** = organization-wide attitude (strategic). "We like spicy food."
- **Tolerance** = specific threshold for ONE risk (tactical). "We tolerate up to 4 hours downtime."

### Risk Assessment Types

| Type | When | Example |
|------|------|---------|
| **Ad hoc** | Triggered by event, reactive | "Assess after discovering zero-day" |
| **Recurring** | Scheduled intervals | "Annual PCI risk assessment" |
| **One-time** | Specific project/change | "Before cloud migration" |
| **Continuous** | Ongoing, real-time | "Automated vuln scanning with live risk scoring" |

### KRI (Key Risk Indicators)
Forward-looking metrics signaling increasing risk. Early warning system.
- KRI = forward-looking (where is risk heading?). KPI (Key Performance Indicator) = backward-looking (how did we perform?).
- Examples: unpatched critical vulns trending up, security team turnover rising, failed logins up 300%.

### Risk Register Fields
Description, impact, likelihood, risk level (impact × likelihood), outcome, cost, risk owner, KRIs, risk threshold.

### BIA (Business Impact Analysis) — Detail
- **Mission-essential functions** — restored FIRST after disaster
- **Single points of failure** — component failure takes down entire system
- **Impact priority**: Life/safety ALWAYS first. Then property → finance → reputation.

---

## Steganography and Obfuscation (1.4)

### Encryption vs Steganography vs Obfuscation

| Concept | Goal | Detectable? |
|---------|------|-------------|
| **Encryption** | Make data UNREADABLE without key | Yes — ciphertext is obviously encrypted |
| **Steganography** | HIDE data's existence inside other data | Not obvious — looks like normal file |
| **Obfuscation** | Make data CONFUSING but still accessible | Yes — visible but unclear |

### Steganography Techniques
- **LSB (Least Significant Bit) insertion** — Modifies last bit of each pixel. Imperceptible to human eye. Images (PNG, BMP).
- **Whitespace manipulation** — Invisible spaces/tabs in text files.
- **Audio/video steganography** — Modify inaudible frequencies or video frame LSBs.
- **DNS tunneling** — Encode data in DNS query subdomains. "Unusually long subdomain names" = DNS tunneling.
- **Protocol tunneling** — Hide data in ICMP (Internet Control Message Protocol) or HTTP headers.

### Steganalysis (Detection)
Statistical analysis (chi-square), file size comparison, signature detection (known stego tool patterns), network traffic analysis.

### Obfuscation Forms
- **Tokenization** — Replace sensitive data with non-sensitive token. PCI/payments context.
- **Data masking** — Substitute with fictional but structurally similar data. Dev/test environments.
- **Code obfuscation** — Rename variables, minify. Malware evasion, IP protection.

### Decision Rules
| Scenario | Technique |
|----------|-----------|
| C2 address hidden in JPEG | Steganography |
| Exfiltrated data encrypted before sending | Encryption |
| Card numbers replaced with tokens | Obfuscation (tokenization) |
| DNS queries with encoded long subdomains | Steganography (DNS tunneling) |
| File scrambled, needs password | Encryption |

---

## IoT Protocols and Constraints (3.1)

| Protocol | Range | Power | Primary Use |
|----------|-------|-------|-------------|
| **Zigbee** (IEEE 802.15.4) | 10-100m | Very low | Smart home (lights, sensors) |
| **Z-Wave** (sub-GHz) | 30-100m | Very low | Home automation (locks, HVAC) |
| **BLE (Bluetooth Low Energy)** | 10-100m | Ultra-low | Wearables, medical |
| **NFC (Near-Field Communication)** | 4-10 cm | Passive | Contactless payments, badges |
| **LoRaWAN (Long Range Wide Area Network)** | 2-15 km | Very low | Agricultural sensors, smart cities |
| **Cellular IoT** (LTE-M/NB-IoT) | km+ | Moderate | Vehicle tracking, fleet |

### IoT Security Constraints
Limited CPU/memory, limited/no crypto, limited battery, inability to patch, default credentials, no built-in security, weak authentication.

### IoT Security Controls
- **Network segmentation** = almost always the best answer for "how to protect IoT"
- Change default credentials, firmware updates, monitor traffic, disable UPnP (Universal Plug and Play)/Telnet
- **Mirai botnet** — canonical IoT attack, exploited default credentials for DDoS

---

## Edge and Fog Computing (3.1)

**Edge** — Processing at/near the device. Millisecond latency. Autonomous vehicle braking decision.
**Fog** — Intermediate layer between edge and cloud. Aggregates/filters data from multiple edge devices. Factory floor aggregating 50 sensors.
**Cloud** — Centralized. Higher latency acceptable. ML training on a year of data.

Security concerns: distributed attack surface, physical access to edge devices, data in transit between layers, limited security controls on edge, inconsistent policies.

---

## VDI and Thin Client Security (3.1)

**VDI (Virtual Desktop Infrastructure)** — Desktop OS runs on server. User connects via thin client/browser. Only pixels traverse network.
**Thin client** — Minimal hardware, no local storage. Reduced attack surface.

**Benefits:** Centralized patching, no data on endpoints, consistent config, easy reimage, data never leaves data center.
**Concerns:** Single point of failure, network dependency, clipboard/USB redirection risks.

**Non-persistent VDI** — Reverts to known-good state after each session. Malware wiped on reboot.
**Persistent VDI** — Changes survive. Behaves like traditional workstation.

---

## Post-Quantum Cryptography (1.4)

**Shor's Algorithm** — Breaks ALL asymmetric crypto (RSA, ECC, DH, DSA). These must be REPLACED.
**Grover's Algorithm** — Halves symmetric strength (AES-128 → effectively 64-bit). Fix: use AES-256.
- Quantum does NOT catastrophically break hashing (SHA-256 remains usable).

**NIST PQC (Post-Quantum Cryptography) Standards:**
- **CRYSTALS-Kyber** (ML-KEM) — key exchange. Lattice-based.
- **CRYSTALS-Dilithium** (ML-DSA) — digital signatures. Lattice-based.
- **SPHINCS+** (SLH-DSA) — backup signature algorithm. Hash-based.

**Crypto agility** — Design systems to swap algorithms easily. Not hardcoded.
**Harvest now, decrypt later** — Adversaries capture encrypted data today, decrypt when quantum arrives. Drives urgency for PQC migration NOW.

**Homomorphic encryption** — Compute on encrypted data without decrypting. Cloud processes sensitive data without seeing plaintext.
- Fully homomorphic = any operation (extremely slow). Partially = limited operations (more practical).

---

## Non-Persistence and Recovery (3.4)

| Concept | What It Does |
|---------|-------------|
| **Non-persistent** | System reverts to known-good state on reboot. Malware wiped. |
| **Revert to known state** | Snapshot rollback (VMware, Hyper-V checkpoints) |
| **Last known-good config** | Windows boot with last working registry/drivers |
| **Live boot media** | Boot from read-only USB. Host disk untouched. Forensic use. |
| **Golden image** | Approved baseline image for consistent deployment |
| **Immutable infrastructure** | Never patch in place. Build new image, redeploy, destroy old. Containers. |

- Immutable ≠ non-persistent. Immutable = never modify deployed instance. Non-persistent = changes don't survive reboot.

---

## Data Sovereignty and Geographic Restrictions (3.3)

**Data sovereignty** — Data subject to laws of the country where it is stored. German server = German law.
**Data residency** — Policy/regulation on WHERE data may be stored.
**Geographic restrictions** — Technical controls restricting data storage/access by location.

- Sovereignty (legal) → creates residency requirements (policy) → enforced by geographic restrictions (technical)
- **GDPR adequacy decisions** — EU Commission certifies countries with adequate data protection (Japan, UK, Canada). Transfers to non-adequate countries need SCCs (Standard Contractual Clauses) or BCRs (Binding Corporate Rules).
- **US CLOUD Act** — US claims jurisdiction over data held by US companies even if stored abroad. Conflicts with other nations' sovereignty.
- "Laws of the country where data is stored" = data sovereignty. "Configure cloud to specific region" = geographic restriction.

---

## Memory Aids for Persistent Confusion Areas

### Cloud Security Tools: CASB vs CSPM vs CWPP vs DLP

**Mental Model — "Who / How / What / Where":**
- **CASB (Cloud Access Security Broker)** = **WHO** is accessing the cloud? The bouncer at the door between users and cloud apps. Key word: "broker" = middleman. It's a policy enforcement checkpoint sitting between your users and SaaS (Software as a Service) apps.
- **CSPM (Cloud Security Posture Management)** = **HOW** is the cloud configured? The auditor checking for misconfigurations. Key word: "posture" = how you're standing (configured). "Is the S3 bucket public? Is encryption enabled?"
- **CWPP (Cloud Workload Protection Platform)** = **WHAT** is running in the cloud? The bodyguard protecting VMs (Virtual Machines), containers, serverless. Think "CWPP is EDR (Endpoint Detection and Response) for cloud workloads." Key word: "workload" = the actual compute.
- **DLP (Data Loss Prevention)** = **WHERE** is sensitive data going? The data watchdog. Doesn't care about cloud config or access — only cares about sensitive data at rest, in motion, in use. Key word: "loss" = data leaving.

**Exam Decision Tree — When the question says "cloud security":**
1. "Employee using unauthorized SaaS apps" or "shadow IT" or "policy between user and cloud" → **CASB**
2. "Misconfigured cloud storage" or "compliance scan of cloud infrastructure" → **CSPM**
3. "Protecting containers/VMs/serverless functions" or "runtime protection" → **CWPP**
4. "Sensitive data being emailed/copied/exfiltrated" (no mention of cloud access brokering) → **DLP**
5. "Combines CWPP + CSPM into one platform" → **CNAPP (Cloud-Native Application Protection Platform)**

**Why you keep picking DLP when it's CASB:** DLP watches data. CASB watches the *door to cloud apps*. If the question mentions a user accessing a cloud service and you need to enforce policy on that access, it's CASB even if data protection is mentioned. CASB *includes* some DLP-like features but the distinguishing factor is: CASB = user-to-cloud-app gateway. DLP = data-centric, works anywhere (email, USB, network), not just cloud.

### Security Frameworks: NIST CSF vs NIST SP 800-53 vs ISO 27001 vs CIS Controls

**Mental Model — "Building a House":**
- **NIST CSF (Cybersecurity Framework)** = The **blueprint/floor plan**. High-level, voluntary, tells you what rooms you need (Govern, Identify, Protect, Detect, Respond, Recover) but not how to build them. Starting point for any org. Key word: "framework" = structure, not specifics.
- **NIST SP 800-53** = The **building code**. 900+ specific controls. Mandatory for US federal agencies. Prescriptive and exhaustive. Key word: "federal" = government mandate.
- **ISO 27001** = The **home inspection certificate**. International, certifiable (auditors come verify). Establishes an ISMS (Information Security Management System). Key word: "certification" = third-party audit. Key word: "international."
- **CIS Controls (Critical Security Controls/CIS CSC)** = The **prioritized to-do list**. Non-governmental, community-driven. Three Implementation Groups (IG1/IG2/IG3) sized by org maturity. Key word: "prioritized" = tells you what to do FIRST.

**Exam Trigger Words:**
| You see... | Pick... |
|-----------|---------|
| "voluntary," "starting point," "functions," "Identify/Protect/Detect/Respond/Recover" | **NIST CSF** |
| "federal agency," "mandatory," "900+ controls," "prescriptive" | **NIST 800-53** |
| "international," "certification," "ISMS," "audit," "globally recognized" | **ISO 27001** |
| "prioritized," "implementation groups," "practical," "community-driven" | **CIS Controls** |

**Why you keep picking 800-53 when it's CSF:** Both are NIST. The trap: 800-53 is detailed and specific (900+ controls). CSF is the high-level strategic framework (6 functions). If the question says "organization wants to establish a cybersecurity program" or "communicate risk posture to leadership" or "voluntary framework" — that's CSF, not 800-53. 800-53 is for when you already know your strategy and need the specific control catalog to implement it.

### GDPR Documents: DPIA vs RoPA

**Mnemonic — "RoPA = Registry, DPIA = Danger":**
- **RoPA (Records of Processing Activities)** = Your **inventory/registry** of ALL data processing. GDPR Article 30. Ongoing. Every org that processes personal data must maintain one. Think: "RoPA = Rolodex of Processing Activities" — it's your master list.
- **DPIA (Data Protection Impact Assessment)** = A **risk assessment** for HIGH-RISK processing only. GDPR Article 35. Done BEFORE starting a new high-risk project. Think: "DPIA = Danger Probe In Advance" — you only do it when there's danger (high risk to individuals).

**Decision Rule:**
- "What data do we process and why?" → **RoPA** (the catalog)
- "Is this new project risky for people's privacy?" → **DPIA** (the risk check)
- "Maintain ongoing documentation of all processing" → **RoPA**
- "Assess impact before launching large-scale profiling/surveillance" → **DPIA**

**Analogy — "RoPA is the inventory, DPIA is the safety inspection":**
- A warehouse keeps an inventory (RoPA) of everything stored — always maintained, covers everything.
- When bringing in hazardous materials (high-risk processing), you do a safety inspection (DPIA) BEFORE accepting them.
- You always have the inventory. You only do the safety inspection for dangerous items.

### Agreement Types: MSA vs SOW vs MOU vs BPA

**Mental Model — "Hiring a Contractor to Remodel Your House":**
- **MOU (Memorandum of Understanding)** = The **handshake**. "We'd like to work together." Informal, broad goals, generally NOT legally binding. Think: "MOU = Mostly Our Understanding" — just mutual intent, no teeth.
- **MSA (Master Service Agreement)** = The **umbrella contract**. Sets the legal framework for the ENTIRE relationship — liability, IP, disputes, confidentiality, termination. Covers ALL future projects. Think: "MSA = Master = the boss contract that governs everything." You sign it once and it covers years of work.
- **SOW (Statement of Work)** = The **specific job order** under the MSA. "For THIS project: these deliverables, this timeline, this price." Think: "SOW = Specific Order of Work." Each new project gets its own SOW but they all live under the MSA umbrella.
- **BPA (Business Partnership Agreement/Blanket Purchase Agreement)** = The **partnership charter**. Defines how partners share profits, losses, responsibilities. Think: "BPA = Business Partners' Arrangement" — who owns what, who does what.

**The MSA-SOW Relationship (this is the key exam trap):**
MSA = umbrella. SOW = specific project under the umbrella. You don't renegotiate the MSA for each project. The MSA says "here are the legal terms for our whole relationship." The SOW says "here's what we're doing this month." If a question describes an overarching contract governing multiple future engagements → MSA, not SOW.

**Exam Trigger Words:**
| You see... | Pick... |
|-----------|---------|
| "informal," "mutual intent," "broad goals," "not binding" | **MOU** |
| "overarching terms," "umbrella," "governs the relationship," "multiple projects" | **MSA** |
| "specific deliverables," "timeline," "scope of work," "particular project" | **SOW** |
| "partnership," "profit sharing," "shared responsibilities" | **BPA** |

**Why you keep picking MOU when it's MSA:** Both are "agreements between parties." The key distinction: MOU is informal and non-binding (a handshake). MSA is a formal, legally binding contract that establishes the framework for all future work. If the question mentions legal terms, liability, IP rights, or governing future projects — that's MSA.

---

## Exam Question Angle Variations (Research — S11)

Compiled from 6 parallel research agents. These are alternate framings the exam uses to test concepts you know from non-obvious directions. Organized by topic cluster.

### CASB (Cloud Access Security Broker) — 8 Angles Beyond Shadow IT

Your default: "shadow IT = CASB." The exam also tests these CASB scenarios:
1. **Tokenization before cloud** — CASB encrypts/tokenizes data BEFORE it reaches SaaS. "Protect PII in Salesforce without trusting Salesforce" = CASB.
2. **BYOD reverse proxy mode** — CASB as reverse proxy for unmanaged devices. "Contractor's laptop accessing corporate SaaS" = CASB (not MDM).
3. **API-mode retroactive scanning** — CASB scans files ALREADY in cloud storage. "Audit existing OneDrive for PII" = CASB (not DLP).
4. **Compliance enforcement** — CASB checks if SaaS apps meet compliance. "Which cloud apps are HIPAA-compliant?" = CASB.
5. **OAuth token abuse** — third-party app requests too many OAuth permissions. "Rogue app with broad API access" = CASB.
6. **Multi-cloud visibility** — "single pane across AWS, Azure, GCP SaaS usage" = CASB (not CSPM — CSPM is infra config).
7. **Sanctioned vs unsanctioned** — CASB governs BOTH approved AND unapproved apps. "Enforce DLP on approved Slack" = CASB.
8. **Inline vs API deployment** — inline = real-time blocking, API = retroactive scanning. Both are CASB modes.

**CASB vs DLP trap**: CASB has DLP capabilities FOR cloud apps. Standalone DLP covers email/USB/printing. "DLP specifically for cloud" = CASB.

### Adaptive Auth — Decision Tree (Wrong 2x)

The exam uses "policy-driven access control" (SY0-701 term) rather than "conditional access" (Microsoft term).

| Signal | Answer |
|--------|--------|
| "Automatically adjusts," "real-time risk," "dynamic," "step-up" | Adaptive auth |
| "Admin configures rules," "IF device THEN require," "policy engine" | Policy-driven access control |
| "Never trust, always verify," "every request," "micro-segmentation" | Zero trust |
| "Posture check at connection time," "remediation VLAN" | NAC (Network Access Control) |

**Step-up authentication** = adaptive auth mechanism. User starts with password, system detects risk → adds MFA. "Dynamically escalates requirements" = adaptive auth.

**Impossible travel** = adaptive auth trigger. "Login from NYC, then London 30 min later" → adaptive auth flags and requires step-up.

### Kerberos Attack Cluster — Artifact-Based Decision Tree

| What was stolen/used? | Attack name |
|----------------------|-------------|
| Kerberos TGT (Ticket Granting Ticket) from memory | Pass the ticket |
| NTLM hash from SAM/LSASS | Pass the hash |
| krbtgt account hash → forge TGT | Golden ticket |
| Service account hash → forge TGS | Silver ticket |
| Request TGS tickets → crack offline | Kerberoasting |
| AS-REP (Authentication Service Reply) without pre-auth → crack offline | AS-REP roasting |

**Golden vs Silver**: Golden = domain-wide (forged TGT from krbtgt). Silver = single service (forged TGS from service account hash). "Unlimited domain access" = golden. "Access specific service" = silver.

**Kerberoasting vs brute force**: Kerberoasting is OFFLINE cracking of legitimately requested service tickets. No lockout risk. "Offline" + "service account" = Kerberoasting.

### Exfiltration Technique Cluster — Protocol Layer Decision Tree

| Protocol layer | Technique | Signal words |
|---------------|-----------|--------------|
| DNS (port 53) | DNS tunneling | "Encoded subdomains," "TXT records," "periodic DNS queries" |
| HTTPS (port 443) | Domain fronting | "CDN," "legitimate domain header," "different backend" |
| HTTPS (port 443) | Beaconing | "Regular intervals," "check-in," "C2 callback" |
| ICMP | ICMP tunneling | "Ping packets," "echo request payload" |
| Steganography | Data hiding | "Image file," "embedded in media," "hidden in picture" |

**DNS tunneling vs DNS exfiltration**: Same technique. "Tunneling" = bidirectional C2 channel. "Exfiltration" = one-way data theft. Both use encoded subdomains.

**Domain fronting vs CDN abuse**: Domain fronting specifically uses a trusted domain in the TLS SNI field while routing to a different backend on the same CDN. It exploits how CDNs route traffic.

### NIST Framework Cluster — Expanded Decision Tree

| Signal | Framework |
|--------|-----------|
| "Five functions" (ID/PR/DE/RS/RC), "board communication," "maturity tiers" | NIST CSF (Cybersecurity Framework) |
| "Control catalog," "federal systems," "FISMA," "impact levels (low/mod/high)" | NIST SP 800-53 |
| "Contractors," "CUI (Controlled Unclassified Information)," "DFARS," "CMMC" | NIST SP 800-171 |
| "Risk management lifecycle," "6 steps," "categorize/select/implement/assess/authorize/monitor" | NIST RMF (Risk Management Framework) |
| "Certifiable," "international," "ISMS (Information Security Management System)," "audit" | ISO 27001 |
| "Prioritized list," "18 controls," "practical," "implementation groups" | CIS Controls |

**RMF (Risk Management Framework)** is new — not the same as CSF. RMF = 6-step process for federal system authorization. CSF = 5-function strategic framework. "Authorize a system to operate" = RMF. "Communicate risk to the board" = CSF.

### Data Sanitization — NIST SP 800-88 Levels

| Level | Method | Result |
|-------|--------|--------|
| Clear | Overwrite with zeros/patterns | Data unrecoverable by standard tools. Drive REUSABLE. |
| Purge | Crypto erasure, block erase, secure erase firmware | Data unrecoverable even by lab techniques. Drive REUSABLE. |
| Destroy | Degauss, shred, incinerate, disintegrate | Drive DESTROYED. Not reusable. |

**SSD gotcha**: Degaussing does NOT work on SSDs (no magnetic media). For SSDs: crypto erasure or physical destruction.

**The "reuse" decision tree**:
- Reuse internally + no prior encryption stated → **overwrite (Clear)**
- Reuse internally + was encrypted → **crypto erasure (Purge)**
- Leave organization (donate/sell) → **Purge minimum**
- Classified/highly sensitive disposal → **Destroy**

### DPIA vs RoPA — 6 Alternate Angles

Beyond "new project = DPIA, ongoing record = RoPA":
1. **Who requires it?** — DPIA = required when processing is "likely to result in high risk." RoPA = required for ALL organizations with 250+ employees (GDPR Article 30).
2. **When created?** — DPIA = BEFORE starting new processing. RoPA = maintained continuously.
3. **Scope** — DPIA = one specific processing activity. RoPA = ALL processing across the entire organization.
4. **Supervisory authority** — DPIA may need to be submitted to the DPA (Data Protection Authority) if high risk remains. RoPA must be available on request.
5. **Content** — DPIA includes risk mitigation measures. RoPA lists purposes, categories, recipients, retention, transfers.
6. **Trigger** — DPIA triggered by profiling, large-scale monitoring, systematic evaluation. RoPA is always mandatory (no trigger).

### SCA/SAST/DAST/IAST — Alternate Angles

Beyond "what are you scanning?":
1. **IAST vs DAST deployment**: IAST requires an agent INSIDE the app (instrumented testing). DAST is purely external. "Agent deployed alongside app during QA" = IAST.
2. **SCA vs SAST overlap**: Both scan code, but SCA looks at DEPENDENCIES (package.json, pom.xml). SAST looks at YOUR code. "Third-party library vulnerability" = SCA, never SAST.
3. **RASP (Runtime Application Self-Protection)** = IAST's production cousin. IAST = testing only. RASP = same agent concept but in production, can block attacks.
4. **License compliance** — SCA also checks open-source LICENSE compliance (GPL, MIT). "License risk in dependencies" = SCA.

### EAP (Extensible Authentication Protocol) Types — Alternate Angles

1. **EAP-TLS**: BOTH client AND server have certificates. Most secure. "Mutual authentication" = EAP-TLS.
2. **PEAP (Protected EAP)**: Server cert only, creates TLS tunnel, then inner auth (MSCHAPv2). "Server cert + username/password inside tunnel" = PEAP.
3. **EAP-FAST (Flexible Authentication via Secure Tunneling)**: Cisco proprietary. Uses PAC (Protected Access Credential) instead of server cert. "No PKI infrastructure" = EAP-FAST.
4. **EAP-TTLS (Tunneled TLS)**: Like PEAP but supports more inner methods. Mostly interchangeable with PEAP on the exam.
5. **Key distinction**: "Client certificate required" = EAP-TLS. "Only server certificate" = PEAP or EAP-TTLS. "No certificates at all" = EAP-FAST.

### SLSA vs SBOM — Supply Chain Security Angles

1. **SBOM format standards**: CycloneDX and SPDX (Software Package Data Exchange) are SBOM formats. If the exam names them → SBOM.
2. **SLSA levels**: L0 (no guarantees) → L3 (hardened build platform). Higher = more build integrity assurance.
3. **Executive Order 14028** — requires SBOMs for software sold to the US government. "Federal software procurement" + "component transparency" = SBOM.
4. **SLSA prevents**: Compromised build systems, tampered source code, modified dependencies during build. "Build tampering" = SLSA.
5. **SBOM prevents**: Using components with known vulnerabilities or license conflicts. "Component inventory" = SBOM.

### SIEM vs XDR vs SOAR — Edge Cases Beyond Basic Distinction

Your current rule works. These are the tricky angles:
1. **SIEM for compliance** — "retain logs for 7 years," "audit reports for PCI" = SIEM (not XDR). XDR doesn't do long-term log storage.
2. **MDR (Managed Detection and Response)** — "no internal security staff + 24/7 monitoring" = MDR. It's a SERVICE with PEOPLE, not a tool. "Outsourced" + "lack staff" = MDR.
3. **SOAR vs XDR multi-vendor** — SOAR orchestrates across DIFFERENT vendor tools. XDR automates within its OWN platform. "Jira + Palo Alto + CrowdStrike coordinated" = SOAR.
4. **UEBA as SIEM feature** — modern SIEMs include UEBA. "What capability detects behavioral anomalies?" = UEBA. "What platform aggregates logs including behavioral analytics?" = SIEM.

### Deception Technology — Granularity Hierarchy

1. **Honeytoken vs honeyfile** — honeytoken = fake DATA (credential, API key) that alerts on USE. Honeyfile = fake FILE that alerts on ACCESS. "File opened" = honeyfile. "Credential used to authenticate" = honeytoken.
2. **Honeypot = ISOLATED. Honeytoken = EMBEDDED.** Honeypots live separate from production. Honeytokens are planted inside production systems. "Found in production DB" = honeytoken.
3. **Honeynet = MULTIPLE honeypots.** Network of decoy systems. Single system = honeypot.
4. **Deception technology = PLATFORM** that manages all of the above at scale. "Enterprise-wide decoy management" = deception technology.
5. **Canary tokens** = specific honeytoken implementation. URL/DNS entry that phones home when accessed. "Tripwire in document" = canary/honeytoken.

### Tokenization vs Pseudonymization vs Masking — Regulatory Context

1. **Pseudonymized data IS still personal data under GDPR** (reversible with mapping key). "Still requires GDPR compliance" = pseudonymization.
2. **Anonymized data is OUTSIDE GDPR scope** (irreversible). "No longer subject to GDPR" = anonymization.
3. **Tokenization is NOT encryption** — token has no mathematical relationship to original. "Reduces PCI scope" = tokenization (encrypted data doesn't reduce scope).
4. **Masking for dev/test** — "realistic data for developers that cannot be reversed" = masking. Developers don't need to recover originals.
5. **Pseudonymization for research** — "researchers may need to contact patients for follow-up" = pseudonymization (not anonymization — can't re-identify from anonymized data).

### SCAP Components — Individual Decision Rules

| Signal | Component |
|--------|-----------|
| "Standardized vulnerability identifier" (CVE-XXXX-YYYY) | CVE (Common Vulnerabilities and Exposures) |
| "Severity score" (0-10, Critical/High/Med/Low) | CVSS (Common Vulnerability Scoring System) |
| "Identifies affected software version/platform" | CPE (Common Platform Enumeration) |
| "Defines how to check if system is vulnerable" | OVAL (Open Vulnerability and Assessment Language) |
| "Security configuration checklist/benchmark" | XCCDF (Extensible Configuration Checklist Description Format) |
| "Automated compliance + scanning umbrella" | SCAP (Security Content Automation Protocol) |

**CVE vs CVSS (wrong S12 — said "knew it cold")** — exam loves this pair. CVE = the IDENTIFIER. CVSS = the SCORE. "Assigned CVE-2024-12345" = CVE. "Scored 9.8 Critical" = CVSS. TRAP: The question may mention a CVE number AND a score in the same scenario. Read what's being ASKED — "what provides the severity rating?" = CVSS, even though CVE appears in the question.

**STIX format vs TAXII transport** — independent standards. "Structure of threat data" = STIX. "Protocol that carries threat data" = TAXII. TAXII can carry non-STIX data.

### Kill Chain vs ATT&CK vs Diamond — Edge Cases

1. **Kill chain = LINEAR + defensive.** "Sequential phases," "break the chain at stage X" = kill chain. Designed for defenders to place countermeasures.
2. **ATT&CK = UNORDERED + adversary catalog.** Tactics are NOT sequential. "Compare two APT (Advanced Persistent Threat) groups' techniques" = ATT&CK.
3. **Diamond = RELATIONSHIPS.** Four nodes: Adversary, Victim, Infrastructure, Capability (AVIC). "Link incidents by shared C2 infrastructure" = Diamond Model.
4. **ATT&CK tactics vs techniques**: "Lateral Movement" = tactic (the WHY). "Pass the Hash" = technique (the HOW). Tactics = columns. Techniques = rows.
5. **Diamond for clustering**: "Three incidents used same C2 and targeted same industry" = Diamond Model (links related events by shared elements).
