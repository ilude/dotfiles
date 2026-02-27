# Security+ SY0-701 — Complete Acronym Glossary

Organized by category. Decision rules for commonly confused groups appear in boxed sections after each group.

---

## 1. Security Operations & Monitoring

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **SIEM** | Security Information and Event Management | Aggregates and correlates logs from all sources. Generates alerts. Passive — analysts investigate. Compliance reporting. |
| **XDR** | Extended Detection and Response | Unified detection + automated response across endpoint, network, cloud, email. One platform. Active. |
| **SOAR** | Security Orchestration, Automation, and Response | Automates IR workflows via playbooks. Orchestrates multiple separate tools (firewall + AD + ticketing). |
| **UEBA** | User and Entity Behavior Analytics | ML baselines of normal behavior per user/entity. Flags deviations. Insider threat detection. |
| **EDR** | Endpoint Detection and Response | Monitors + detects + auto-responds on endpoints only. Agent-based. Isolate, kill process. |
| **HIDS** | Host-based Intrusion Detection System | Monitors + alerts on a single host. Passive. No response capability. Old school. |
| **NIDS** | Network-based Intrusion Detection System | Monitors + alerts on network traffic. Passive. Placed on span/mirror port or network tap. |
| **IDS** | Intrusion Detection System | Umbrella term for HIDS/NIDS. Detect and alert only. No blocking. |
| **IPS** | Intrusion Prevention System | Detect + automatically block attacks inline. Network layer. Signatures + anomaly detection. |
| **FIM** | File Integrity Monitoring | Detects unauthorized changes to critical files by comparing against known-good baseline. |
| **DLP** | Data Loss Prevention | Prevents unauthorized data exfiltration. Network DLP (email/web), Endpoint DLP (USB/print), Cloud DLP (SaaS). |
| **SOC** | Security Operations Center | The team/facility that monitors and responds to security events 24/7. |
| **MSSP** | Managed Security Service Provider | Outsourced 24/7 security monitoring. "Small company can't afford a SOC." |
| **NOC** | Network Operations Center | Monitors network availability and performance. NOT security-focused (that's SOC). |

> **SIEM vs XDR vs SOAR vs UEBA — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | Log aggregation, correlation, compliance reporting, retention | **SIEM** |
> | Unified detection + response across multiple layers in ONE platform | **XDR** |
> | Playbook, orchestrate multiple separate tools, automate IR workflow | **SOAR** |
> | Behavioral baseline, "unusual," "abnormal," "deviation from pattern," insider threat | **UEBA** |
>
> - Both SIEM and XDR "correlate." SIEM correlates **logs** passively. XDR correlates **telemetry across layers** and **responds** actively.
> - Both XDR and SOAR automate response. XDR does it **within its own platform**. SOAR **orchestrates separate tools** via playbooks.
> - Both SIEM and UEBA detect threats. SIEM uses **static rules** an analyst wrote. UEBA uses **ML behavioral baselines** per user.

> **IDS vs IPS vs Firewall vs WAF — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | Block traffic by port/protocol/IP at network boundary | **Firewall** |
> | Automatically block attacks based on signatures (network layer) | **IPS** |
> | Detect and alert only, no blocking | **IDS** |
> | Block web application attacks (SQLi, XSS, OWASP Top 10) | **WAF** |

> **EDR vs XDR vs HIDS — Decision Rules:**
>
> - HIDS = monitor + alert only (passive, single host)
> - EDR = monitor + detect + respond (active, endpoint only)
> - XDR = EDR extended across endpoint + network + cloud + email (cross-layer)

---

## 2. Cloud Security

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **CASB** | Cloud Access Security Broker | Sits between users and SaaS apps. Shadow IT discovery, cloud DLP, access control. "Cloud bouncer for users." |
| **CSPM** | Cloud Security Posture Management | Monitors cloud infrastructure configs for misconfigurations and compliance drift. "Cloud auditor for configs." |
| **CWPP** | Cloud Workload Protection Platform | Protects running workloads (VMs, containers, serverless). Runtime threat detection. "Cloud bodyguard for workloads." |
| **CNAPP** | Cloud-Native Application Protection Platform | CSPM + CWPP unified in one platform. Pick when question says "single/consolidated/unified." |
| **SWG** | Secure Web Gateway | Filters all web traffic (URLs, malware scanning). "Web proxy on steroids." Not cloud-specific. |
| **SASE** | Secure Access Service Edge | Umbrella: CASB + SWG + ZTNA + SD-WAN in one cloud platform. Multiple capabilities = SASE. |
| **ZTNA** | Zero Trust Network Access | Identity-verified access to specific apps. Replaces VPN. No broad network access. Per-app, per-session. |
| **SDP** | Software-Defined Perimeter | Dynamic 1-to-1 connections. Resources invisible to unauthorized users ("black cloud"). Implements ZTNA. |
| **IaaS** | Infrastructure as a Service | Provider gives you VMs/storage/networking. You manage OS and up. (AWS EC2, Azure VMs) |
| **PaaS** | Platform as a Service | Provider manages through runtime. You manage app + data only. (Heroku, Azure App Service) |
| **SaaS** | Software as a Service | Provider manages everything. You manage data + access only. (Office 365, Salesforce) |
| **FaaS** | Function as a Service | Serverless. Code runs on events, no server management. No OS patching. (AWS Lambda, Azure Functions) |
| **CSP** | Cloud Service Provider | The company providing cloud services (AWS, Azure, GCP). |

> **CASB vs CSPM vs CWPP vs CNAPP — Decision Rules:**
>
> | Question describes... | Answer |
> |---|---|
> | Users accessing unauthorized SaaS, shadow IT, cloud DLP | **CASB** |
> | Misconfigured security groups, public buckets, compliance drift | **CSPM** |
> | Container escape, runtime malware, workload vulnerability at runtime | **CWPP** |
> | "Single/unified/consolidated" combining config + workload protection | **CNAPP** |
>
> - CASB watches **people using cloud apps**. CSPM watches **cloud infrastructure settings**. Different things entirely.
> - Open S3 bucket = config problem = CSPM. Employee uploading PII to Dropbox = user behavior = CASB.
> - CNAPP = CSPM + CWPP. Only pick CNAPP when the question asks for both in one.

> **Shared Responsibility Model:**
>
> - Customer ALWAYS responsible for: **data, access management, identity** (all service models)
> - Provider ALWAYS responsible for: **physical security, hypervisor**
> - IaaS: customer manages OS and up. PaaS: customer manages app + data. SaaS: customer manages data + access only.

> **SASE vs CASB vs SWG vs ZTNA:**
>
> - CASB = cloud app access control. SWG = web traffic filtering. ZTNA = per-app zero trust access.
> - SASE = all three combined + SD-WAN. If the question lists multiple capabilities in one cloud platform → SASE.

---

## 3. Vulnerability Management & Threat Intelligence

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **CVE** | Common Vulnerabilities and Exposures | Unique identifier for a vulnerability (CVE-2024-12345). The "license plate." Maintained by MITRE. |
| **CVSS** | Common Vulnerability Scoring System | Severity rating 0-10. The "danger rating." Prioritizes patching. |
| **NVD** | National Vulnerability Database | NIST-maintained searchable database of CVEs with CVSS scores. The "DMV database." |
| **SCAP** | Security Content Automation Protocol | Umbrella framework for automated vuln scanning and compliance checking. Multi-vendor interoperability. |
| **CPE** | Common Platform Enumeration | Standardized IDs for platforms/products. Part of SCAP. "Which platforms are affected." |
| **CCE** | Common Configuration Enumeration | Standardized IDs for configuration settings. Part of SCAP. |
| **OVAL** | Open Vulnerability and Assessment Language | Machine-readable vuln test definitions. Part of SCAP. "Automated assessment." |
| **XCCDF** | Extensible Configuration Checklist Description Format | Security benchmark checklists (CIS benchmarks use this). Part of SCAP. |
| **STIX** | Structured Threat Information Expression | Language/format for describing threat intelligence (IOCs, campaigns, threat actors). The "package." |
| **TAXII** | Trusted Automated Exchange of Intelligence Information | Transport mechanism for STIX data. Publish/subscribe model. The "delivery truck." |
| **IoC** | Indicator of Compromise | Evidence breach HAS occurred (IPs, hashes, domains). Reactive/forensic. |
| **IoA** | Indicator of Attack | Evidence attack is in progress. Focuses on behavior/TTPs. Proactive. |
| **TTP** | Tactics, Techniques, and Procedures | Behavioral patterns of threat actors. Hardest to change (top of Pyramid of Pain). |

> **SCAP vs STIX/TAXII — Two Separate Worlds:**
>
> | World | Purpose | Standards |
> |---|---|---|
> | Vulnerability Management | Scanning, scoring, compliance | SCAP (CVE, CVSS, CPE, CCE, OVAL, XCCDF), NVD |
> | Threat Intelligence Sharing | Describing and exchanging threat data | STIX (format), TAXII (transport) |
>
> - "Automated vulnerability scanning / compliance checking" → **SCAP** (always)
> - "Sharing threat intel between organizations" → **STIX/TAXII** (always)
> - They never overlap. STIX never scans. SCAP never shares threat intel.

> **IoC vs IoA:**
>
> - IoC = evidence breach happened (past tense, forensic). File hashes, malicious IPs.
> - IoA = evidence attack is in progress (present tense, behavioral). Unusual process activity, lateral movement.

---

## 4. Threat Frameworks

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **ATT&CK** | Adversarial Tactics, Techniques, and Common Knowledge | MITRE's catalog of adversary TTPs with T-numbers. "What did attacker DO." Non-linear matrix. |
| **Kill Chain** | Cyber Kill Chain | Lockheed Martin's 7 sequential phases: Recon → Weaponize → Deliver → Exploit → Install → C2 → Actions. "At which STAGE." |
| **Diamond Model** | Diamond Model of Intrusion Analysis | 4 vertices: adversary, capability, infrastructure, victim. Attribution and relationships. "Pivot between elements." |
| **NIST CSF** | NIST Cybersecurity Framework | Identify, Protect, Detect, Respond, Recover. Organizational governance functions. "How should ORG handle it." |
| **NIST 800-53** | NIST Special Publication 800-53 | Comprehensive catalog of security controls for federal systems. The control library. |
| **NIST 800-207** | NIST Special Publication 800-207 | Zero trust architecture guidelines. "Never trust, always verify." |
| **ISO 27001** | ISO/IEC 27001 | International standard for Information Security Management Systems (ISMS). Certification-based. |
| **CIS** | Center for Internet Security | Publishes CIS Controls (prioritized security actions) and CIS Benchmarks (hardening guides). |

> **Framework Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | T-numbers, matrix of techniques, specific TTPs, threat hunting | **MITRE ATT&CK** |
> | Sequential phases, linear progression, delivery/exploitation/C2 | **Cyber Kill Chain** |
> | 4 elements, relationships, attribution, "pivot between known/unknown" | **Diamond Model** |
> | Organizational functions: Identify/Protect/Detect/Respond/Recover | **NIST CSF** |
> | Federal security controls catalog, compliance baselines | **NIST 800-53** |
> | Zero trust architecture principles | **NIST 800-207** |
> | International ISMS certification | **ISO 27001** |
> | Prioritized security actions, hardening benchmarks | **CIS** |

---

## 5. Identity & Access Management

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **AAA** | Authentication, Authorization, and Accounting | Three-part framework: verify identity, grant permissions, log activity. |
| **SSO** | Single Sign-On | One login grants access to multiple applications. |
| **MFA** | Multi-Factor Authentication | Requires 2+ factors: something you know, have, are, somewhere you are. |
| **SAML** | Security Assertion Markup Language | XML-based enterprise SSO. IdP → SP. Browser-based. "Signed XML." |
| **OAuth** | Open Authorization (2.0) | Authorization framework (NOT authentication). Grants limited access tokens. "Let app access my stuff." |
| **OIDC** | OpenID Connect | Authentication layer ON TOP of OAuth 2.0. ID tokens. "Log in with Google." |
| **SCIM** | System for Cross-domain Identity Management | Automated user provisioning/deprovisioning across SaaS. "Disable in AD → removed everywhere." Solves orphaned accounts. |
| **RADIUS** | Remote Authentication Dial-In User Service | Network access auth (Wi-Fi, VPN). UDP. Not web SSO. |
| **TACACS+** | Terminal Access Controller Access-Control System Plus | Like RADIUS but TCP, encrypts full payload, separates AAA functions. Cisco-heavy. |
| **LDAP** | Lightweight Directory Access Protocol | Queries directory services (Active Directory). Port 389 (636 for LDAPS). |
| **Kerberos** | Kerberos | Ticket-based auth for on-prem/AD. Port 88. Uses KDC (Key Distribution Center), TGT (Ticket Granting Ticket). |
| **PAM** | Privileged Access Management | Controls/audits elevated admin access. Credential vaulting, session recording, JIT. |
| **JIT** | Just-in-Time Access | No standing privileges. Time-limited elevated access with approval. Auto-revoked. |
| **FIDO2** | Fast Identity Online 2 | Passwordless auth standard using public key crypto. Hardware keys or platform authenticators. Phishing-resistant. |
| **RBAC** | Role-Based Access Control | Access by role (Admin, Editor, Viewer). AD groups. |
| **ABAC** | Attribute-Based Access Control | Access by attributes (time, location, department, clearance). Most flexible. Policy rules with conditions. |
| **MAC** | Mandatory Access Control | System/policy enforced, users can't override. SELinux, AppArmor. "Even root can't bypass." |
| **DAC** | Discretionary Access Control | Owner controls access. chmod, ACLs. Standard file permissions. |
| **ACL** | Access Control List | List of permissions attached to a resource defining who can do what. |
| **NAC** | Network Access Control | Posture check at the network door. Remediation VLAN if fail. Health check before granting access. |
| **PDP** | Policy Decision Point | Zero trust brain. Evaluates access requests, makes allow/deny decision. |
| **PEP** | Policy Enforcement Point | Zero trust bouncer. Executes PDP's decision. Allows/blocks traffic. |

> **SAML vs OAuth vs OIDC vs SCIM — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | Enterprise SSO, web-based, IdP → SP, XML assertions | **SAML** |
> | Third-party app access, "delegate permissions," API access tokens | **OAuth** |
> | "Log in with Google," prove identity via third party | **OIDC** |
> | Automated provisioning/deprovisioning, orphaned accounts, lifecycle | **SCIM** |
>
> - **OAuth ≠ authentication.** If question asks "prove identity" → OIDC, not OAuth.
> - **SAML stops login. SCIM removes the account.** SAML = authentication. SCIM = lifecycle management.

> **Access Control Models — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | System enforced, users can't override, labels/classifications, SELinux | **MAC** |
> | Owner controls access, chmod, file permissions | **DAC** |
> | Access by job role, AD groups, Admin/Editor/Viewer | **RBAC** |
> | Access by attributes/conditions (time, location, department) | **ABAC** |
>
> - MAC is the strictest (military/government). ABAC is the most flexible (policy engines with conditions).

> **NAC vs Zero Trust:**
>
> - NAC = posture check **to get on the network** (gate at the door)
> - Zero trust = verification **for every resource request regardless of network location** (already on LAN? still verified)

> **RADIUS vs TACACS+:**
>
> | | RADIUS | TACACS+ |
> |---|---|---|
> | Protocol | UDP | TCP |
> | Encryption | Password only | Entire payload |
> | AAA | Combined | Separated (more granular) |
> | Common use | Network access (Wi-Fi, VPN) | Device admin (routers, switches) |

---

## 6. Cryptography & PKI

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **AES** | Advanced Encryption Standard | Symmetric encryption. Current standard. 128/192/256-bit keys. Fast, bulk data. |
| **3DES** | Triple Data Encryption Standard | Symmetric. Legacy, being phased out. Three passes of DES. |
| **RSA** | Rivest-Shamir-Adleman | Asymmetric. Key exchange, digital signatures, encryption of small data. Most widely used. |
| **ECC** | Elliptic Curve Cryptography | Asymmetric. Smaller keys, same security as RSA. Mobile/IoT friendly. |
| **DH** | Diffie-Hellman | Key exchange algorithm. Establishes shared secret over untrusted network. |
| **ECDHE** | Elliptic Curve Diffie-Hellman Ephemeral | Key exchange with PFS. Ephemeral keys per session. Modern TLS default. |
| **DSA** | Digital Signature Algorithm | Asymmetric. Digital signatures only (not encryption). |
| **SHA** | Secure Hash Algorithm | Hashing (SHA-256, SHA-3). One-way, integrity verification. Not encryption. |
| **MD5** | Message Digest 5 | Hashing. **Weak/deprecated.** Collisions found. Legacy use only. |
| **HMAC** | Hash-based Message Authentication Code | Hash + secret key. Provides integrity AND authenticity. |
| **PFS** | Perfect Forward Secrecy | Compromising long-term keys doesn't compromise past sessions. Ephemeral key exchange (DHE/ECDHE). |
| **PKI** | Public Key Infrastructure | Framework for managing digital certificates and public keys. |
| **CA** | Certificate Authority | Issues and signs digital certificates. Root CA > Intermediate CA > End Entity. |
| **CRL** | Certificate Revocation List | CA publishes full list of revoked certs periodically. Old way, can be stale. |
| **OCSP** | Online Certificate Status Protocol | Real-time "is this cert revoked?" query. Modern, lighter than CRL. |
| **CSR** | Certificate Signing Request | What you submit to a CA to get a cert issued. Contains your public key. |
| **CT** | Certificate Transparency | Public logs of issued certs. Detect mis-issuance. Audit trail. |
| **CAA** | CA Authorization | DNS record specifying which CAs may issue certs for your domain. |
| **HSTS** | HTTP Strict Transport Security | Forces browsers to use HTTPS only. Prevents SSL stripping. |
| **HSM** | Hardware Security Module | Dedicated tamper-resistant appliance for crypto key management. Standalone. |
| **TPM** | Trusted Platform Module | Embedded motherboard chip. Secure boot, key storage, platform attestation. |
| **EAP-TLS** | Extensible Authentication Protocol - TLS | Client cert + server cert for Wi-Fi. Most secure wireless auth. |
| **PEAP** | Protected EAP | Server cert only, client uses username/password in TLS tunnel. No client certs needed. |
| **WPA3** | Wi-Fi Protected Access 3 | Latest wireless security. SAE (Simultaneous Authentication of Equals) replaces PSK handshake. |
| **SAE** | Simultaneous Authentication of Equals | WPA3's key exchange. Resistant to offline dictionary attacks. |
| **E2EE** | End-to-End Encryption | Data encrypted from sender to recipient. No intermediary can read it. |

> **Symmetric vs Asymmetric vs Hashing — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | Bulk data encryption, speed, shared key, "encrypt database" | **Symmetric** (AES) |
> | Key exchange, digital signatures, non-repudiation, public/private pair | **Asymmetric** (RSA, ECC, DH) |
> | Integrity verification, password storage, "detect tampering," one-way | **Hashing** (SHA-256) |
>
> - Digital signatures = asymmetric (private key signs, public key verifies). Non-repudiation = always asymmetric.
> - "Two parties who never communicated need a shared secret" = Diffie-Hellman (asymmetric key exchange).

> **HSM vs TPM:**
>
> - TPM = embedded chip on motherboard. Built into the device.
> - HSM = standalone dedicated appliance. Enterprise key management for CAs.

> **CRL vs OCSP:**
>
> - CRL = periodic full list download. Can be stale.
> - OCSP = real-time single-cert query. Modern.
> - OCSP stapling = server pre-fetches its own OCSP response, includes in TLS handshake. Best performance.

> **EAP-TLS vs PEAP:**
>
> - EAP-TLS = client AND server certs. Most secure. "Each device gets a certificate."
> - PEAP = server cert only, client uses password. Easier to deploy, less secure.

---

## 7. Application Security & DevSecOps

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **SAST** | Static Application Security Testing | Scans source code for vulns. Build-time. No running app. White box. |
| **DAST** | Dynamic Application Security Testing | Tests a running app from outside. Runtime. Black box. Simulates attacker. |
| **IAST** | Interactive Application Security Testing | Agent inside running app. Combines SAST + DAST. Runtime. Lowest false positives. |
| **SCA** | Software Composition Analysis | Scans third-party dependencies for known CVEs. Build-time. Checks libraries, not your code. |
| **SBOM** | Software Bill of Materials | Inventory of all components/versions in software. The list, not the scanner. SCA reads the SBOM. |
| **RASP** | Runtime Application Self-Protection | Security built into the application itself. Detects and blocks attacks from inside at runtime. |
| **WAF** | Web Application Firewall | Protects web apps from HTTP attacks (SQLi, XSS). Application layer. |
| **SLSA** | Supply-chain Levels for Software Artifacts | Framework for software supply chain integrity ("Salsa"). Build provenance and verification. |
| **IaC** | Infrastructure as Code | Managing infrastructure via config files (Terraform, CloudFormation). Version-controlled, reproducible. |
| **CI/CD** | Continuous Integration / Continuous Delivery | Automated build, test, deploy pipeline. |
| **API** | Application Programming Interface | Programmatic interface between software components. REST, GraphQL. |
| **SDK** | Software Development Kit | Tools and libraries for building applications on a platform. |

> **SAST vs DAST vs IAST vs SCA — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | Scan source code, no running app, build-time, white box | **SAST** |
> | Test running app from outside, black box, simulate attacker | **DAST** |
> | Agent inside running app, combines static + dynamic | **IAST** |
> | Third-party libraries, dependencies, known CVEs in components | **SCA** |
>
> - SAST/SCA = build-time (shift-left). DAST/IAST = runtime.
> - SAST scans YOUR code. SCA scans code YOU IMPORTED.

---

## 8. Web Vulnerabilities

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **XSS** | Cross-Site Scripting | Attacker's script runs in victims' browsers. Three types: stored, reflected, DOM-based. |
| **CSRF** | Cross-Site Request Forgery | Tricks logged-in browser into making unintended request. No script injection. Exploits auto cookie sending. |
| **SQLi** | SQL Injection | Malicious SQL in input fields to manipulate database. `' OR 1=1--` |
| **SSRF** | Server-Side Request Forgery | Tricks server into making requests to internal systems. Cloud metadata attack (169.254.169.254). |
| **LFI** | Local File Inclusion | Path manipulation to execute a local file on the server. |
| **RFI** | Remote File Inclusion | Like LFI but includes file from attacker's external URL. |
| **IDOR** | Insecure Direct Object Reference | Changing an object ID in URL to access another user's data. Authorization flaw. |
| **TOCTOU** | Time of Check to Time of Use | Race condition between validation and use. Application vulnerability. |
| **XXE** | XML External Entity | Exploits XML parser to read local files or make server-side requests via malicious XML input. |

> **XSS Types — Decision Rules:**
>
> | If the question says... | Answer |
> |---|---|
> | Script saved in database, affects ALL visitors, persistent | **Stored XSS** |
> | Victim clicks link, server reflects input back in response, in server logs | **Reflected XSS** |
> | Client-side JS, innerHTML/eval, URL fragment (#), server never sees payload | **DOM-based XSS** |
>
> - "Does the server process and return the payload?" YES = reflected. NO = DOM-based.
> - Fix stored/reflected = server-side. Fix DOM-based = client-side JavaScript.

> **XSS vs CSRF:**
>
> - XSS = attacker's script runs in browser. Script tag visible.
> - CSRF = no script injection. Tricks browser into making an unintended request. Fix: anti-CSRF tokens.

---

## 9. Attack Types & Techniques

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **APT** | Advanced Persistent Threat | Nation-state or well-funded group. Long-term, stealthy, targeted. |
| **BEC** | Business Email Compromise | Executive impersonation → financial fraud. The attack type, not the technique. |
| **DDoS** | Distributed Denial of Service | Overwhelm target with traffic from many sources. Availability attack. |
| **DoS** | Denial of Service | Overwhelm target from single source. |
| **MitM** | Man-in-the-Middle | Intercepts communication. SY0-701 calls this **"on-path attack."** |
| **MitB** | Man-in-the-Browser | Malware in browser intercepts/modifies web transactions. Banking trojans. |
| **RAT** | Remote Access Trojan | Malware providing attacker remote control of victim's system. |
| **C2/C&C** | Command and Control | Attacker's infrastructure for controlling compromised systems. |
| **PtH** | Pass the Hash | Authenticate using stolen NTLM hash without cracking the password. |
| **PtT** | Pass the Ticket | Authenticate using stolen Kerberos ticket. |

> **Password Attack Types:**
>
> | Attack | How It Works |
> |---|---|
> | **Brute force** | Try every possible combination. Slowest, guaranteed. |
> | **Dictionary** | Try common words/passwords from a list. |
> | **Password spraying** | Few common passwords against MANY accounts. Stays under lockout. |
> | **Credential stuffing** | Stolen creds from one breach tried on other services. Exploits reuse. |
> | **Rainbow table** | Pre-computed hash lookup table. Defeated by salting. |
> | **Kerberoasting** | Extract Kerberos service tickets from AD, crack offline. |

> **SY0-701 Terminology Updates:**
>
> - MitM → **"on-path attack"** (official exam term)
> - DMZ → **"screened subnet"** (official exam term)

---

## 10. Governance, Risk & Compliance

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **GRC** | Governance, Risk, and Compliance | Umbrella term for the discipline of managing risk, policies, and regulatory compliance. |
| **BIA** | Business Impact Analysis | Identifies critical business functions and impact of disruption. Prerequisite for BCP/DRP. |
| **BCP** | Business Continuity Plan | Keep business running during/after disaster. Broad — includes people, processes, facilities. |
| **DRP** | Disaster Recovery Plan | Restore IT systems after disaster. Narrow — subset of BCP, technical recovery. |
| **ALE** | Annual Loss Expectancy | SLE × ARO. Expected yearly financial loss from a threat. |
| **SLE** | Single Loss Expectancy | Asset Value × Exposure Factor. Cost of one incident. |
| **ARO** | Annual Rate of Occurrence | How often a threat is expected to occur per year. |
| **EF** | Exposure Factor | Percentage of asset value lost in one incident (0-100%). |
| **AV** | Asset Value | Dollar value of the asset. Starting point for quantitative risk. |
| **RPO** | Recovery Point Objective | Max acceptable data loss (time). "How old can the backup be?" Drives backup frequency. |
| **RTO** | Recovery Time Objective | Max acceptable downtime. "How fast must we recover?" Drives recovery infrastructure. |
| **MTTR** | Mean Time to Repair/Recover | Average time to restore operations after failure. |
| **MTTD** | Mean Time to Detect | Average time to discover an incident. SOC effectiveness metric. |
| **MTBF** | Mean Time Between Failures | Average time between repairable failures. Reliability metric. |
| **MTTF** | Mean Time to Failure | Expected lifespan of non-repairable component. |

> **Quantitative Risk Formulas (Memorize):**
>
> - SLE = AV × EF
> - ALE = SLE × ARO
> - Risk = Likelihood × Impact

> **Quantitative vs Qualitative:**
>
> - Quantitative = dollar amounts and numbers (ALE, SLE, ARO). "Calculate," "cost-benefit."
> - Qualitative = subjective ratings (high/medium/low), risk matrices, expert judgment. "Prioritize," "rank."

> **RPO vs RTO vs MTTR vs MTBF vs MTTF:**
>
> | Metric | Measures |
> |---|---|
> | RPO | Max acceptable DATA LOSS (drives backup frequency) |
> | RTO | Max acceptable DOWNTIME (drives recovery speed) |
> | MTTR | Average REPAIR time (maintainability) |
> | MTTD | Average DETECTION time (SOC speed) |
> | MTBF | Time between failures — REPAIRABLE devices |
> | MTTF | Time to failure — NON-REPAIRABLE devices |

> **BCP vs DRP:**
>
> - BCP = keep business running (broad, includes people/process/facilities)
> - DRP = restore IT systems (narrow, technical, subset of BCP)

---

## 11. Regulations & Compliance Frameworks

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **GDPR** | General Data Protection Regulation | EU data privacy law. Right to erasure, data portability, breach notification within 72 hours. |
| **HIPAA** | Health Insurance Portability and Accountability Act | US healthcare data protection. PHI (Protected Health Information). |
| **PCI DSS** | Payment Card Industry Data Security Standard | Credit card data protection. 12 requirements. Quarterly scans, annual audits. |
| **SOX** | Sarbanes-Oxley Act | US financial reporting integrity. Internal controls over financial data. |
| **FERPA** | Family Educational Rights and Privacy Act | US student education records privacy. |
| **COPPA** | Children's Online Privacy Protection Act | US children under 13 online data collection. |
| **FISMA** | Federal Information Security Management Act | US federal agency cybersecurity requirements. Uses NIST frameworks. |
| **SOC 1** | Service Organization Control Type 1 | Financial controls audit (SOX context). |
| **SOC 2** | Service Organization Control Type 2 | Security/trust controls audit (vendor risk). |
| **Type I** | Point-in-time | Control design assessment at a single point. "Exists today." |
| **Type II** | Over a period | Control effectiveness over 6-12 months. "Worked consistently." More valuable. |

> **SOC Reports:**
>
> - SOC 1 = financial controls. SOC 2 = security controls.
> - Type I = snapshot. Type II = over time. "Worked consistently" > "exists today."

> **PCI DSS Roles:**
>
> | Role | What They Do |
> |---|---|
> | **ASV** (Approved Scanning Vendor) | Quarterly external vulnerability scans |
> | **QSA** (Qualified Security Assessor) | On-site compliance audits |
> | **ISA** (Internal Security Assessor) | Employee trained for internal assessments |

---

## 12. Agreements & Policies

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **NDA** | Non-Disclosure Agreement | Prevents sharing confidential info. Sign FIRST before sharing anything proprietary. |
| **MSA** | Master Service Agreement | Foundational legal contract with vendor. Baseline terms for all future work. |
| **SOW** | Statement of Work | Specific project deliverables, timelines, milestones. References MSA. |
| **MOU** | Memorandum of Understanding | Informal agreement of mutual intent. Less binding than a contract. |
| **BPA** | Business Partners Agreement | Defines relationship/responsibilities between business partners. Joint ventures. |
| **SLA** | Service Level Agreement | Defines performance metrics (uptime, response time) a provider must meet. |
| **BAA** | Business Associate Agreement | HIPAA-required when vendor handles PHI. |
| **DPA** | Data Processing Agreement | GDPR-required when processor handles personal data. |
| **ISA** | Interconnection Security Agreement | Documents security requirements when connecting two organizations' networks. |
| **AUP** | Acceptable Use Policy | What users can/cannot do on org systems. Signed during onboarding. |
| **RoPA** | Records of Processing Activities | GDPR Art 30. Master register of ALL data processing org-wide. |
| **PIA/DPIA** | Privacy/Data Protection Impact Assessment | Evaluates privacy risks of ONE specific project or change. |

> **Agreement Order (typical vendor engagement):**
>
> 1. **NDA** — before sharing anything
> 2. **MSA** — baseline legal terms
> 3. **SOW** — specific project work
> 4. **SLA** — performance expectations

> **RoPA vs PIA/DPIA:**
>
> - RoPA = map of EVERYTHING (all processing activities org-wide)
> - PIA = assessment of ONE THING (single project's privacy impact)

---

## 13. Data Protection & Privacy

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **PII** | Personally Identifiable Information | Data that identifies an individual (name, SSN, email, biometrics). |
| **PHI** | Protected Health Information | Health-related PII (medical records, diagnoses, treatment). HIPAA-regulated. |
| **DLP** | Data Loss Prevention | Prevents unauthorized data exfiltration. Network, endpoint, or cloud variants. |
| **DRM** | Digital Rights Management | Controls how digital content can be used/distributed. Copy protection. |
| **CDE** | Cardholder Data Environment | Systems that store/process/transmit credit card data. PCI DSS scope boundary. |

> **Data Governance Roles:**
>
> | Role | Who | What They Do |
> |---|---|---|
> | **Data owner** | Business executive | Decides classification, access policies, retention. Makes the rules. |
> | **Data custodian** | IT staff | Implements owner's decisions. Backups, encryption, access provisioning. |
> | **Data steward** | Data management | Ensures data quality, consistency, metadata. "Data librarian." |
> | **Data controller** | Organization (GDPR) | Decides why/how data is processed. |
> | **Data processor** | Organization (GDPR) | Processes data on behalf of controller. |
>
> - Owner/custodian/steward = individual roles. Controller/processor = organizational/GDPR roles.
> - **Data owner is a BUSINESS role, not IT.** Exam will try to trick you.

> **De-identification Methods:**
>
> | Method | Reversible? | Context |
> |---|---|---|
> | **Tokenization** | Yes (vault) | PCI/payments, internal use |
> | **Pseudonymization** | Yes (mapping table) | GDPR/healthcare/research, external sharing |
> | **Anonymization** | No (permanent) | Irreversible, cannot re-link |
> | **Data masking** | No (for that copy) | Non-production environments, fictional values |
>
> - "Pseudo = sharing out, Token = keeping in." Hospital + research + re-link = pseudonymization.

---

## 14. Network & Infrastructure

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **VPN** | Virtual Private Network | Encrypted tunnel over untrusted network. Broad network access (vs ZTNA = per-app). |
| **VLAN** | Virtual Local Area Network | Logical network segmentation at Layer 2. |
| **SDN** | Software-Defined Networking | Separates control plane from data plane. Centralized programmable management. |
| **NFV** | Network Function Virtualization | Virtual firewalls/load balancers on commodity hardware. Replaces dedicated appliances. |
| **DMZ** | Demilitarized Zone | SY0-701 calls this **"screened subnet."** Network segment for public-facing services. |
| **ICS** | Industrial Control Systems | Umbrella for SCADA/DCS/PLCs. Availability > confidentiality. |
| **SCADA** | Supervisory Control and Data Acquisition | Monitors/controls industrial processes (power, water, manufacturing). Often air-gapped. |
| **DCS** | Distributed Control System | Controls industrial processes locally. Less geographically distributed than SCADA. |
| **PLC** | Programmable Logic Controller | Hardware device controlling physical processes (valves, motors). Component of ICS/SCADA. |
| **RTOS** | Real-Time Operating System | OS with guaranteed time constraints. Medical devices, avionics, manufacturing. |
| **IoT** | Internet of Things | Connected devices (cameras, sensors, appliances). Large attack surface, often unpatched. |
| **VPC** | Virtual Private Cloud | Isolated virtual network within a public cloud provider. |

---

## 15. Deception & Physical Security

| Term | What It Is |
|------|-----------|
| **Honeypot** | Single fake system, isolated from production. Attracts attackers. |
| **Honeynet** | Network of honeypots, still isolated/separate from production. |
| **Honeyfile** | Fake file (e.g., "passwords.txt") placed to detect unauthorized access. |
| **Honeytoken** | Fake credential or data element. Alerts when used. |
| **Deception technology** | Fake assets (servers, creds, files) deployed THROUGHOUT real production. Modern, automated, embedded. |

> **Deception Decision Rule:**
>
> - Isolated fake system(s) separate from production → **Honeypot/Honeynet**
> - Fake creds/files/tokens scattered throughout REAL production infrastructure → **Deception technology**
> - "Fake credentials in production network" = deception tech. Every time.

---

## 16. Incident Response & Forensics

| Acronym | Full Name | What It Does |
|---------|-----------|-------------|
| **CIRT/CSIRT** | Computer (Security) Incident Response Team | Team responsible for detecting, analyzing, responding to security incidents. |
| **IR** | Incident Response | The process of handling security incidents. |

> **IR Steps (order is sacred on the exam):**
>
> 1. **Preparation** — policies, tools, training, playbooks
> 2. **Detection/Identification** — alert fires, triage
> 3. **Containment** — stop the bleeding, isolate (DO NOT power off — preserve RAM)
> 4. **Eradication** — remove the threat (malware, compromised accounts)
> 5. **Recovery** — restore systems, verify clean
> 6. **Lessons Learned** — post-incident review, update procedures
>
> - Containment BEFORE eradication. Always.
> - "Pulling the plug" is almost always wrong. Isolate from network, preserve evidence.

> **Forensic Principles:**
>
> - **Order of volatility** — collect most volatile first: CPU registers → RAM → disk → logs → backups
> - **Chain of custody** — document every person, date, time, purpose. Any break = inadmissible.
> - **Legal hold** — suspends normal data retention/destruction. Overrides retention policies immediately.

---

## 17. Exam Terminology Quick Hits

| Exam Says | Means |
|-----------|-------|
| "On-path attack" | Man-in-the-middle |
| "Screened subnet" | DMZ |
| "Posture assessment" | Device health check (NAC context) or cloud config check (CSPM context) |
| "Shift left" | Integrate security earlier in SDLC |
| "Implicit trust zone" | Area where access granted by network location alone (zero trust eliminates these) |
| "Non-repudiation" | Digital signatures (asymmetric crypto) |
| "Key stretching" | bcrypt, PBKDF2 — makes password cracking computationally expensive |
| "Key escrow" | Third party holds copy of encryption keys |
| "Salting" | Random data added before hashing — defeats rainbow tables |
| "Credential vaulting" | PAM stores admin passwords, humans never know them |
