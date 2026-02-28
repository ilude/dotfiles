# Security+ SY0-701 — Concept Walkthrough

Quick-reference guide for persistent problem areas and reinforcement topics. Mental models, mnemonics, and decision rules.

---

## 1. CASB — "The Bouncer at the Cloud Door"

**CASB (Cloud Access Security Broker)** sits between your employees and all their cloud apps. Three jobs:

- **Discovers** what cloud apps employees are using (shadow IT — "who's sneaking into which clubs?")
- **Assesses risk** of each app ("is this club safe or sketchy?")
- **Enforces policy** ("you can go to approved clubs, blocked from sketchy ones")

### CASB vs DLP

DLP (Data Loss Prevention) doesn't care about *which app* — it cares about *what data* is moving. DLP flags "someone is emailing a spreadsheet with SSNs" whether via Outlook, Gmail, or USB. CASB cares about *the app itself* — "why are 50 employees using an unapproved file-sharing service?"

### The Who/How/What/Where Model

| Question | Tool | Key Word |
|----------|------|----------|
| **WHO** is accessing which cloud app? | CASB | "broker" = bouncer |
| **HOW** is our cloud infrastructure configured? | CSPM | "posture" = configuration |
| **WHAT** is running inside our cloud? | CWPP | "workload" = containers, VMs |
| **WHERE** is sensitive data going? | DLP | "loss" = data leaving |

### Exam Decision Tree

1. "Employee using unauthorized SaaS apps" or "shadow IT" → **CASB**
2. "Misconfigured cloud storage" or "open S3 bucket" → **CSPM**
3. "Protecting containers/VMs/serverless" or "runtime protection" → **CWPP**
4. "Sensitive data being emailed/copied/exfiltrated" → **DLP**
5. "Combines CWPP + CSPM into one platform" → **CNAPP**

### Exam trigger: **"shadow IT"** or **"unauthorized cloud apps"** = CASB, full stop.

---

## 2. NIST CSF — "The Blueprint, Not the Building Code"

### The "Building a House" Model

| Framework | Analogy | Key Word |
|-----------|---------|----------|
| **NIST CSF** | Blueprint/floor plan | "framework" = strategic structure |
| **NIST SP 800-53** | Building code | "federal" = mandatory, 900+ controls |
| **ISO 27001** | Home inspection certificate | "certification" = auditable, international |
| **CIS Controls** | Prioritized to-do list | "prioritized" = practical, ranked |

**NIST CSF (Cybersecurity Framework)** says "you need a kitchen, a bathroom, bedrooms" — but doesn't say what brand of faucet. High-level, voluntary. Six core functions: **Govern, Identify, Protect, Detect, Respond, Recover.** Show this to the board.

**NIST SP 800-53** has 900+ specific requirements: "outlets must be X inches from the floor, wiring must be Y gauge." Hand this to the security engineer, not the board.

**ISO 27001** — an auditor comes, checks your house, gives you a certificate. International, certifiable. Establishes an ISMS (Information Security Management System).

**CIS Controls** — "First install smoke detectors. Then deadbolts. Then a security system." Practical, ranked by impact, community-driven.

### Exam Trigger Words

| You see... | Pick... |
|-----------|---------|
| "voluntary," "starting point," "core functions," "Identify/Protect/Detect/Respond/Recover" | **NIST CSF** |
| "federal agency," "mandatory," "900+ controls," "prescriptive," "control catalog" | **NIST 800-53** |
| "international," "certification," "ISMS," "audit" | **ISO 27001** |
| "prioritized," "implementation groups," "practical," "community-driven" | **CIS Controls** |

### Also know: NIST 800-171

- **800-53** = federal agencies + their own systems
- **800-171** = contractors handling CUI (Controlled Unclassified Information). Derived from 800-53 but smaller scope.

---

## 3. DPIA vs RoPA — "The Safety Inspection vs the Inventory"

Imagine you run a warehouse.

**RoPA (Record of Processing Activities)** = the warehouse **inventory**. Lists *everything* you store: what, where from, why, how long, who sees it. Maintained continuously. Every warehouse needs one. GDPR Article 30. Mnemonic: **"RoPA = Rolodex of Processing Activities."**

**DPIA (Data Protection Impact Assessment)** = the **safety inspection** before accepting hazardous materials. Done *before* high-risk processing (biometrics, mass surveillance, health profiling). Evaluates risks, proportionality, mitigation. GDPR Article 35. Mnemonic: **"DPIA = Danger Probe In Advance."**

### Decision Rule

| You see... | Pick... |
|-----------|---------|
| "What data do we process and why?" | **RoPA** (the catalog) |
| "Is this new project risky for privacy?" | **DPIA** (the risk check) |
| "Maintain ongoing documentation of all processing" | **RoPA** |
| "Before launching," "new system," "evaluate risks," "high-risk" | **DPIA** |

You always have the inventory. You only do the safety inspection for dangerous items.

---

## 4. MSA — "The Umbrella Contract"

### The "Hiring a Contractor" Model

| Agreement | Analogy | Binding? | Key Word |
|-----------|---------|----------|----------|
| **MOU** | Handshake over coffee | No | "intent," "non-binding" |
| **MSA** | Umbrella contract | Yes | "general terms," "governs relationship" |
| **SOW** | Specific job order | Yes | "deliverables," "timeline," "this project" |
| **BPA** | Pre-negotiated pricing | Yes | "repeat purchases," "pricing" |

**MOU (Memorandum of Understanding)** = "We'd like to work together." Not legally binding. Either side walks away. Mnemonic: **"MOU = Mostly Our Understanding"** — just intent, no teeth.

**MSA (Master Service Agreement)** = the umbrella you sign once. Covers liability, IP, disputes, confidentiality, payment terms, termination. Does NOT say what specific work will be done. Governs for years. Mnemonic: **"MSA = Master = the boss contract."**

**SOW (Statement of Work)** = specific job order under the MSA. "This project, these deliverables, this timeline, this price." Each project gets its own SOW. Mnemonic: **"SOW = Specific Order of Work."**

**BPA (Blanket Purchase Agreement)** = pre-negotiated pricing for repeat purchases. "500 widgets/month at $10 each all year." Government procurement, commodities.

### The MSA-SOW Relationship

MSA = umbrella. SOW = rain under the umbrella. You don't renegotiate the MSA for each project.

### The MSA vs MOU Trap

Both establish relationships. The difference: **MOU has no legal teeth, MSA is a binding contract.** If the question mentions *any* legal terms (liability, IP, indemnification, disputes) → MSA, not MOU.

### Exam Trigger Words

| You see... | Pick... |
|-----------|---------|
| "informal," "mutual intent," "non-binding" | **MOU** |
| "overarching terms," "umbrella," "governs relationship," "multiple projects," legal terms | **MSA** |
| "specific deliverables," "timeline," "scope," "particular project" | **SOW** |
| "pre-negotiated pricing," "repeat purchases" | **BPA** |

---

## 5. XDR vs SOAR — "One Platform vs Many Tools"

**XDR (Extended Detection and Response)** = one unified platform that collects and correlates data across endpoints, email, network, cloud. Single pane of glass. Detects threats across layers, responds automatically. Super-EDR that extends beyond endpoints.

**SOAR (Security Orchestration, Automation, and Response)** = the conductor that makes *different tools* dance together via playbooks. Doesn't replace SIEM, firewall, EDR — orchestrates them. "SIEM alert → SOAR playbook → block IP on firewall + disable account in AD + ticket in ServiceNow."

### The One-Liner

- **XDR** = one platform does everything
- **SOAR** = makes your existing tools dance together

| You see... | Pick... |
|-----------|---------|
| "single platform," "cross-layer detection," "unified" | **XDR** |
| "automates responses across multiple tools," "playbook," "orchestrate" | **SOAR** |

---

## 6. UEBA — "The Behavioral Baseline"

**UEBA (User and Entity Behavior Analytics)** builds a behavioral baseline of "normal" for each user/device, then alerts on deviations.

**SIEM (Security Information and Event Management)** uses static rules: "alert if 5 failed logins in 10 minutes."

**UEBA** learns that Bob always logs in from New York, 8am-6pm, work laptop. Bob suddenly logs in from Romania at 3am from an unknown device, accesses finance share he's never touched → UEBA flags it. No static rule was violated.

### Exam Trigger Words

"Unusual behavior," "baseline deviation," "never accessed before," "abnormal pattern," "outside normal hours from unusual location" → **UEBA**, not SIEM.

---

## 7. SCAP — "The Vulnerability Scanning Standard"

**SCAP (Security Content Automation Protocol)** = standardized language for automated vulnerability scanning and compliance checking. Not a product — the *standard* products use.

Every scanner (Nessus, Qualys) needs common vocabulary. SCAP provides it through:
- **CVE (Common Vulnerabilities and Exposures)** — the identifier (CVE-2024-XXXX)
- **CVSS (Common Vulnerability Scoring System)** — the score (9.1 = critical)
- **CCE (Common Configuration Enumeration)** — configuration issues

### SCAP vs STIX — Two Separate Worlds

| World | Protocol | Purpose |
|-------|----------|---------|
| Vulnerability management | **SCAP** | Scanning, compliance, benchmarks |
| Threat intelligence | **STIX/TAXII** | Sharing IOCs between organizations |

"Automate CIS benchmark compliance" = SCAP. "Share threat intel between ISACs" = STIX/TAXII.

### CVE vs CVSS (exam trap)

- **CVE** = the **identifier**. "CVE-2024-12345" — a name for a specific vulnerability.
- **CVSS** = the **score**. "9.1 critical" — how severe it is.

If the question asks about a *score*, the answer is CVSS. If it asks about an *identifier*, the answer is CVE. Read what's being asked.

---

## 8. CWPP and CSPM — "Bodyguard vs Auditor"

**CSPM (Cloud Security Posture Management)** = the **auditor** with a clipboard. "This S3 bucket is public — violation. This security group allows 0.0.0.0/0 on SSH — violation." Checks *how your cloud infrastructure is configured*.

**CWPP (Cloud Workload Protection Platform)** = the **bodyguard** next to your containers and VMs. "Something tried to escape this container — blocked. This process inside the pod is abnormal — alert." Protects *what's actually running*.

CSPM never looks inside a container. CWPP doesn't care about your S3 bucket policies.

**CWPP is EDR for cloud workloads.** That single sentence locks it in.

---

## 9. ICS/SCADA — "The Factory Floor"

**ICS (Industrial Control Systems)** = umbrella term for systems controlling physical processes — manufacturing, power plants, water treatment, oil refineries.

**SCADA (Supervisory Control and Data Acquisition)** = a type of ICS for monitoring/controlling geographically dispersed systems — pipelines, electrical grids, water distribution. The remote monitoring layer.

### The Security Challenge

- Run on proprietary **RTOS (Real-Time Operating Systems)**
- Can't be patched easily (downtime = physical danger)
- Can't install endpoint agents
- Designed for *availability*, not security

### Exam Answer for "How do you protect ICS/SCADA?"

**NIDS (Network Intrusion Detection System)** — monitor the network because you can't touch the devices. Also: network segmentation, air gapping, compensating controls.

---

## 10. SCIM — "The Account Lifecycle Manager"

**SCIM (System for Cross-domain Identity Management)** automatically syncs user accounts between your identity provider (Active Directory) and all your SaaS apps.

### The Problem It Solves

Employee leaves. IT disables their AD account. But they still have active accounts in Salesforce, Slack, GitHub, AWS — **orphaned accounts**. SCIM automatically deprovisions those.

### SCIM vs SAML

| Protocol | Purpose |
|----------|---------|
| **SAML** | Authentication — "prove who you are" |
| **SCIM** | Provisioning — "create/disable the account itself" |

SAML stops you from logging in. SCIM removes the account entirely.

### Exam trigger: **"orphaned accounts"** or **"offboarded but still has SaaS access"** = SCIM.

---

## 11. OCSP and the Revocation Family

When a certificate is compromised, it must be revoked. Four ways to check revocation:

| Method | Analogy | How It Works |
|--------|---------|-------------|
| **CRL** | The phonebook | CA publishes a big list of revoked cert serial numbers. Client downloads the whole thing periodically. Gets huge, goes stale. |
| **OCSP** | Calling 411 | Client asks the CA about one specific cert in real-time. Adds latency, CA sees your browsing. |
| **OCSP Stapling** | Server does the homework | Server pre-fetches the OCSP response and includes it in the TLS handshake. No latency, no privacy leak. |
| **Certificate Pinning** | Different concept | Hardcodes which cert/key an app will accept for a domain. Prevents MitM with rogue certs. Not about revocation. |

### Decision Tree

| You see... | Pick... |
|-----------|---------|
| "Downloads a list of revoked certs" | **CRL** |
| "Real-time check for one cert, client contacts CA" | **OCSP** |
| "Server includes revocation proof in TLS handshake," "eliminate latency" | **OCSP stapling** |
| "App only trusts this specific cert/key" | **Certificate pinning** |

---

## 12. Bonus: Remaining Persistent Gaps (from S12)

### Pass the Ticket vs Pass the Hash

The tool (Mimikatz) extracts BOTH. The **artifact** determines the attack:

| Artifact | Attack | Protocol |
|----------|--------|----------|
| Kerberos TGT (ticket) | **Pass the ticket** | Kerberos |
| NTLM hash | **Pass the hash** | NTLM |

"Kerberos" or "TGT" or "ticket" in the question → Pass the Ticket. "NTLM" or "hash" → Pass the Hash.

### ATT&CK vs Diamond Model

| Framework | Purpose | Key Words |
|-----------|---------|-----------|
| **MITRE ATT&CK** | Knowledge base of techniques. Compare techniques between groups. | "knowledge base," "compare techniques," "T-numbers," "matrix" |
| **Diamond Model** | Link elements of an intrusion by relationships. | "adversary-victim-infrastructure-capability," "pivot between elements," "shared infrastructure" |

### Adaptive Auth vs Conditional Access vs Zero Trust

| Concept | What It Is | Scope |
|---------|-----------|-------|
| **Zero trust** | Architecture philosophy | "Never trust, always verify" — the big picture |
| **Adaptive auth** | Mechanism that dynamically adjusts auth requirements based on real-time risk | "Same user, different context → different experience" |
| **Conditional access** | Admin-configured IF/THEN policy rules | Specific product-level implementation (e.g., Azure AD) |

If the question describes *automatic, real-time risk adjustment* → adaptive auth. If it describes the *philosophy* → zero trust.
