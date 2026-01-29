# Data Loss Prevention (DLP) Patterns for AI Agent Security

> **Research Date**: 2025-01-29
> **Focus**: Regex patterns for detecting exfiltration commands and secrets
> **Sources**: Elastic Security, SigmaHQ, Gitleaks, TruffleHog, MITRE ATT&CK

---

## 1. Exfiltration Command Detection Patterns

### 1.1 HTTP-Based Exfiltration Tools

**Curl Detection:**
```regex
# Curl with data upload flags
curl\s+.*(-[dFT]|--data|--form|--upload-file)
curl\s+.*--data-binary
curl\s+.*--data-raw
curl\s+.*-X\s*(POST|PUT).*-d
```

**Wget Detection:**
```regex
wget\s+.*--post-file=
wget\s+.*--post-data=
```

**PowerShell Web Requests:**
```regex
(Invoke-WebRequest|Invoke-RestMethod|iwr|irm).*-Method\s*(POST|PUT)
(Invoke-WebRequest|Invoke-RestMethod|iwr|irm).*-Body
```

### 1.2 Netcat and Raw Socket Exfiltration

```regex
# Netcat patterns
(nc|ncat)\s+.*<                    # Input redirection (sending file)
(nc|ncat)\s+[^\s]+\s+\d+\s*<       # nc host port < file
(nc|ncat)\s+.*--send-only

# Bash /dev/tcp exfiltration
/dev/tcp/\d+\.\d+\.\d+\.\d+/\d+
/dev/tcp/[a-zA-Z0-9.-]+/\d+
bash\s+-c.*>/dev/tcp
echo.*>/dev/tcp
cat.*>/dev/tcp
```

### 1.3 Living-off-the-Land Binaries (LOLBins)

| Binary | Exfil Pattern | Detection Regex |
|--------|---------------|-----------------|
| `certutil.exe` | Encode/decode for transfer | `certutil.*-encode\|certutil.*-urlcache` |
| `bitsadmin.exe` | BITS upload jobs | `bitsadmin.*/upload\|bitsadmin.*/transfer.*upload` |
| `finger.exe` | Query-based exfil | `finger\.exe.*@` |
| `ftp.exe` | FTP upload | `ftp\.exe.*-s:` |
| `expand.exe` | Extract to remote | `expand\.exe.*\\\\\\\\` |

### 1.4 Cloud Upload Tools

**Rclone Detection:**
```regex
rclone\s+(copy|sync|move)
rclone.*--config
rclone.*--no-check-certificate
rclone.*--transfers\s+\d+
```

**Cloud CLI Tools:**
```regex
aws\s+s3\s+(cp|sync|mv).*s3://
gsutil\s+(cp|rsync).*gs://
az\s+storage\s+blob\s+upload
azcopy\s+copy
megacmd|megacopy|megasync
```

---

## 2. DNS Exfiltration Detection

### 2.1 Indicators

| Indicator | Detection Method |
|-----------|-----------------|
| Long FQDN queries | `LENGTH(query) > 50` |
| Base64 in subdomain | `query MATCHES '==\.'` |
| High entropy subdomains | Shannon entropy > 3.5 |
| Excessive TXT queries | Query type = TXT + high volume |

### 2.2 Command Patterns

```regex
# DNS exfil via dig/nslookup/host
dig\s+.*\$\(
dig\s+[A-Za-z0-9+/=]{20,}\.
nslookup\s+.*\$\(
nslookup\s+[A-Za-z0-9+/=]{20,}\.
host\s+.*\$\(
host\s+[A-Za-z0-9+/=]{20,}\.

# Base64 before DNS lookup
base64.*\|\s*(dig|nslookup|host)
\$\(.*base64.*\).*\.(dig|nslookup|host)

# DNS tunneling tools
iodine\s+-f
dnscat2?.*--dns
dns2tcp
```

---

## 3. Secret Detection Patterns

### 3.1 Cloud Provider Keys

```regex
# AWS Access Key
(A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}

# AWS Secret Key (context-dependent)
(?i)aws.{0,20}secret.{0,20}['"][0-9a-zA-Z/+=]{40}['"]

# GCP API Key
AIza[0-9A-Za-z\-_]{35}

# GCP Service Account
"type"\s*:\s*"service_account"

# Azure Client Secret
[a-zA-Z0-9_\-]{3}8Q~[a-zA-Z0-9_~.\-]{31,34}

# Azure Storage Key
(?i)DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{88}
```

### 3.2 Platform Tokens

```regex
# GitHub tokens (all types)
gh[pousr]_[0-9a-zA-Z]{36}
github_pat_[0-9a-zA-Z]{22}_[0-9a-zA-Z]{59}

# GitLab tokens
glpat-[0-9a-zA-Z\-_]{20}

# Slack tokens
xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*

# Discord tokens
[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}

# npm tokens
npm_[A-Za-z0-9]{36}

# PyPI tokens
pypi-AgEIcHlwaS5vcmc[A-Za-z0-9\-_]{50,}
```

### 3.3 Private Keys and Certificates

```regex
# PEM Private Keys
-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE\s+KEY-----

# PEM Certificates (less sensitive but worth flagging)
-----BEGIN\s+CERTIFICATE-----

# SSH Private Keys (OpenSSH format)
-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----

# PuTTY Private Keys
PuTTY-User-Key-File-[0-9]+:
```

### 3.4 Generic Secrets

```regex
# API Key assignments
(?i)(api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]

# Password assignments
(?i)(password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]

# Secret assignments
(?i)(secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]

# Connection strings
(?i)(connection[_-]?string|conn[_-]?str)\s*[:=]\s*['"][^'"]+['"]

# Bearer tokens
(?i)bearer\s+[A-Za-z0-9_\-\.]+
```

### 3.5 JWT Tokens

```regex
eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*
```

---

## 4. Encoded Data Detection

### 4.1 Base64 Detection

```regex
# Standard Base64 (MOD4 with padding)
(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})

# URL-safe Base64
(?:[A-Za-z0-9\-_]{4})*(?:[A-Za-z0-9\-_]{2,3})?

# PowerShell -EncodedCommand
(powershell|pwsh).*-e(ncodedcommand)?\s+[A-Za-z0-9+/=]{20,}

# Base64 in URL path/query
https?://[^\s]*[A-Za-z0-9+/]{40,}={0,2}

# Base64 piped to commands
base64\s+-d.*\|
echo\s+[A-Za-z0-9+/=]{20,}\s*\|\s*base64\s+-d
```

### 4.2 Hex Encoding

```regex
# Hex escape sequences
\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){10,}

# 0x prefix hex
0x[0-9a-fA-F]{20,}

# xxd reverse (hex to binary)
xxd\s+-r.*\|
echo\s+.*\|\s*xxd\s+-r
```

### 4.3 URL Encoding

```regex
# Excessive URL encoding (potential evasion)
(%[0-9a-fA-F]{2}){5,}

# Double encoding
%25[0-9a-fA-F]{2}
```

---

## 5. Combined Exfiltration Patterns

### 5.1 File Read + Network (High Risk)

```regex
# cat sensitive file piped to network
cat\s+.*\.(env|pem|key|crt).*\|\s*(curl|wget|nc)

# Environment variables to network
(env|printenv|set)\s*\|.*(curl|wget|nc)

# SSH keys to network
cat\s+.*\.ssh/(id_|known_hosts|authorized).*\|

# AWS credentials to network
cat\s+.*\.aws/(credentials|config).*\|

# Kubernetes secrets to network
cat\s+.*\.kube/config.*\|
```

### 5.2 Encoding + Network (High Risk)

```regex
# Base64 encode then network
base64.*\|\s*(curl|wget|nc)
\|\s*base64.*\|\s*(curl|wget)

# Gzip/tar then network
(gzip|tar).*\|\s*(curl|wget|nc)

# Encrypted then network
(openssl|gpg).*\|\s*(curl|wget|nc)
```

---

## 6. Recommended Patterns for damage-control

### 6.1 Immediate Additions (Block)

```yaml
# DNS exfiltration (CVE-2025-55284 pattern)
- pattern: '\b(dig|nslookup|host)\s+\S+\.\S+\.\S+'
  reason: "DNS lookup can exfiltrate data via subdomain encoding"
  ask: true

- pattern: '\bping\s+\S+\.\S+\.\S+\.\S+\.'
  reason: "Ping to hostname can leak data via DNS"
  ask: true
```

### 6.2 Network + Sensitive Data Combinations (Ask)

```yaml
# curl/wget with data flags
- pattern: '\bcurl\s+.*(-d|--data|--data-binary|-F|--form|-T|--upload)'
  reason: "curl uploading data"
  ask: true

- pattern: '\bwget\s+.*--post-(file|data)'
  reason: "wget posting data"
  ask: true

# Netcat sending data
- pattern: '\b(nc|ncat|netcat)\s+[^\s]+\s+\d+\s*<'
  reason: "Netcat sending file to remote host"
  ask: true

- pattern: '/dev/tcp/'
  reason: "Bash TCP socket - potential exfiltration"
  ask: true
```

### 6.3 Encoding Before Network (Ask)

```yaml
- pattern: '\bbase64\b.*\|\s*(curl|wget|nc|ncat)'
  reason: "Base64 encoding before network command"
  ask: true

- pattern: '\bcurl\b.*\$\(.*base64'
  reason: "Curl with base64 encoded data"
  ask: true

- pattern: '\bgzip\b.*\|\s*(curl|wget|nc)'
  reason: "Compression before network command"
  ask: true
```

### 6.4 Cloud Upload Commands (Ask)

```yaml
- pattern: '\baws\s+s3\s+(cp|sync|mv)\s+[^\s]+\s+s3://'
  reason: "AWS S3 upload"
  ask: true

- pattern: '\bgsutil\s+(cp|rsync)\s+[^\s]+\s+gs://'
  reason: "GCP Storage upload"
  ask: true

- pattern: '\brclone\s+(copy|sync|move)'
  reason: "Rclone cloud sync"
  ask: true
```

---

## 7. Secret Scanning for Output (PostToolUse)

These patterns should be checked against tool outputs to detect accidental secret exposure:

```python
OUTPUT_SECRET_PATTERNS = {
    "aws_access_key": r"(A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}",
    "github_token": r"gh[pousr]_[0-9a-zA-Z]{36}",
    "gitlab_token": r"glpat-[0-9a-zA-Z\-_]{20}",
    "slack_token": r"xox[baprs]-[0-9]{10,13}-",
    "private_key_header": r"-----BEGIN\s+(\w+\s+)?PRIVATE\s+KEY-----",
    "jwt_token": r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.",
    "generic_api_key": r"(?i)api[_-]?key['\"]?\s*[:=]\s*['\"][A-Za-z0-9_\-]{20,}['\"]",
}
```

---

## Source URLs

- https://www.elastic.co/guide/en/security/8.19/potential-data-exfiltration-through-curl.html
- https://github.com/SigmaHQ/sigma
- https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml
- https://github.com/trufflesecurity/trufflehog
- https://github.com/mazen160/secrets-patterns-db
- https://www.huntress.com/blog/exposing-data-exfiltration-lolbin-ttp-binaries
- https://research.splunk.com/endpoint/32e0baea-b3f1-11eb-a2ce-acde48001122/
- https://www.nccgroup.com/research-blog/detecting-rclone-an-effective-tool-for-exfiltration/
- https://www.anthropic.com/engineering/claude-code-sandboxing
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- https://www.akamai.com/blog/security/akamais-real-time-detections-for-dns-exfiltration
- https://bluegoatcyber.com/blog/dns-exfiltration-with-base64-encoding-a-stealthy-data-theft-technique/
- https://attack.mitre.org/techniques/T1567/002/
