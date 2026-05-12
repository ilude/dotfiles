# PowerShell/pwsh Damage-Control Pattern Recommendations

Assumptions: match against the full command string after light normalization: collapse whitespace, case-insensitive regex, preserve quoted substrings, and preferably remove PowerShell line-continuation backticks before matching.

Recommended default policy:

- **Block**: secret reads, credential exfiltration, encoded commands, execution-policy bypass, download-and-execute, destructive registry/security weakening.
- **Ask**: destructive filesystem, service/process kills, package/uninstall operations, broad ACL/security changes where legitimate admin use is plausible.

## High-Value Normalization

Before regex matching:

```ts
const normalized = command
  .replace(/`[\r\n]?/g, "")       // PowerShell line continuation / obfuscation
  .replace(/\s+/g, " ")
  .trim();
```

Use regex flags: `i` and often `s`.

Also consider expanding common aliases mentally in rules:

| Alias | Cmdlet |
|---|---|
| `rm`, `ri`, `del`, `erase`, `rmdir`, `rd` | `Remove-Item` |
| `cat`, `type`, `gc` | `Get-Content` |
| `iwr`, `wget`, `curl` | `Invoke-WebRequest` in Windows PowerShell |
| `irm` | `Invoke-RestMethod` |
| `iex` | `Invoke-Expression` |
| `sc` | ambiguous: `Set-Content` alias in PowerShell, `sc.exe` service tool if explicit |

---

## 1. Destructive Filesystem Operations

### Recursive/forced delete

**Action:** ask, block if targeting root/home/system paths.

```regex
(?i)\b(?:Remove-Item|rm|ri|del|erase|rmdir|rd)\b(?=[^|;&]*-(?:Recurse|r))(?=[^|;&]*-(?:Force|f))[^|;&]*
```

**Rationale:** PowerShell `Remove-Item -Recurse -Force` is equivalent to `rm -rf`.

### Delete dangerous roots/system paths

**Action:** block.

```regex
(?i)\b(?:Remove-Item|rm|ri|del|erase|rmdir|rd)\b[^|;&]*(?:^|\s|["'])((?:[A-Z]:\\?$)|(?:[A-Z]:\\Windows\b)|(?:[A-Z]:\\Program Files(?: \(x86\))?\b)|(?:\$env:(?:USERPROFILE|HOME|SystemRoot|ProgramFiles)\b)|(?:~\\?\*?)|(?:/))
```

**Rationale:** Broad deletion of drive roots, Windows, Program Files, or home directory is usually catastrophic.

### Wildcard recursive delete

**Action:** ask.

```regex
(?i)\b(?:Remove-Item|rm|ri|del|erase)\b(?=[^|;&]*-(?:Recurse|r))[^|;&]*(?:\*|\?)[^|;&]*
```

**Rationale:** Wildcard + recursion can delete much more than intended.

### Clear or overwrite file contents broadly

**Action:** ask.

```regex
(?i)\b(?:Clear-Content|Set-Content|Out-File)\b[^|;&]*(?:\*|\$env:USERPROFILE|~|[A-Z]:\\)
```

**Rationale:** Less obvious than deletion but can destroy data.

---

## 2. Privilege / Security Weakening

### Execution policy bypass

**Action:** block or ask depending on strictness; I recommend block.

```regex
(?i)\b(?:powershell|pwsh)(?:\.exe)?\b[^|;&]*-(?:ExecutionPolicy|ex|ep)\s+(?:Bypass|Unrestricted)
```

Also catch direct policy changes:

```regex
(?i)\bSet-ExecutionPolicy\b[^|;&]*(?:Bypass|Unrestricted)
```

**Rationale:** Common malware and “run this script” bypass pattern.

### Defender disabling / exclusions

**Action:** block.

```regex
(?i)\bSet-MpPreference\b[^|;&]*(?:-DisableRealtimeMonitoring\s+\$?true|-DisableBehaviorMonitoring\s+\$?true|-DisableIOAVProtection\s+\$?true|-ExclusionPath|-ExclusionProcess|-ExclusionExtension)
```

```regex
(?i)\bAdd-MpPreference\b[^|;&]*(?:-ExclusionPath|-ExclusionProcess|-ExclusionExtension)
```

**Rationale:** Weakens endpoint protection or hides future malicious files.

### Firewall weakening

**Action:** ask/block.

```regex
(?i)\bSet-NetFirewallProfile\b[^|;&]*-Enabled\s+False
```

```regex
(?i)\bNew-NetFirewallRule\b[^|;&]*-Action\s+Allow[^|;&]*(?:-Direction\s+Inbound|-LocalPort\s+(?:Any|\d+))
```

**Rationale:** Opens inbound access or disables host firewall.

### ACL permission broadening

**Action:** ask.

```regex
(?i)\bicacls\b[^|;&]*(?:/grant|/grant:r)[^|;&]*(?:Everyone|Users|Authenticated Users):\(?(?:F|M|W)
```

```regex
(?i)\bSet-Acl\b[^|;&]*
```

**Rationale:** Can make sensitive files world-readable/writable.

---

## 3. Credential / Secret Reads

### Reading env files, SSH keys, tokens, certificates

**Action:** block.

```regex
(?i)\b(?:Get-Content|gc|cat|type|more|Select-String)\b[^|;&]*(?:\.env\b|id_(?:rsa|ed25519|ecdsa)\b|\.ssh[\\/]|\.pem\b|\.key\b|credentials|secrets?|token|apikey|api_key)
```

**Rationale:** Prevents accidental secret disclosure to model/tool output.

### PowerShell secret-store reads

**Action:** ask/block.

```regex
(?i)\b(?:Get-Secret|Get-StoredCredential|Get-Credential)\b
```

**Rationale:** These commands intentionally retrieve credentials.

### Windows credential material

**Action:** block.

```regex
(?i)\b(?:cmdkey|vaultcmd)\b[^|;&]*(?:/list|/listcreds|/generic|/user)
```

```regex
(?i)\breg(?:\.exe)?\s+(?:query|save)\b[^|;&]*(?:HKLM\\SAM|HKLM\\SECURITY|HKLM\\SYSTEM|HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings|Credential)
```

**Rationale:** Credential store / registry credential probing.

---

## 4. Network Exfiltration

### Secret read piped to network

**Action:** block.

```regex
(?is)(?:Get-Content|gc|cat|type|more|Select-String)[^|;&]*(?:\.env\b|\.ssh[\\/]|id_(?:rsa|ed25519|ecdsa)\b|\.pem\b|\.key\b|credentials|secrets?|token).*(?:\||;|&&).*\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm|curl|wget|Start-BitsTransfer|nc|ncat)\b
```

**Rationale:** Classic local secret → remote sink chain.

### Network upload/body from stdin/file

**Action:** ask/block.

```regex
(?i)\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm|curl|wget)\b[^|;&]*(?:-Body|-InFile|-Form|--data|--data-binary|--form|--upload-file|-T)\b
```

**Rationale:** Could exfiltrate local data.

### Raw socket tools

**Action:** ask.

```regex
(?i)\b(?:nc|ncat|netcat|socat)\b[^|;&]*(?:-e|-c|--exec|--sh-exec|--send-only|--ssl)?\b
```

**Rationale:** Often used for reverse shells or exfiltration.

---

## 5. Encoded / Obfuscated Commands

### EncodedCommand

**Action:** block.

```regex
(?i)\b(?:powershell|pwsh)(?:\.exe)?\b[^|;&]*-(?:EncodedCommand|enc|e)\s+[A-Za-z0-9+/=]{20,}
```

**Rationale:** `-EncodedCommand` is heavily used to hide intent. Legitimate use exists but should not run silently.

### Hidden / noninteractive suspicious shell

**Action:** ask/block if combined with web/download/execution.

```regex
(?i)\b(?:powershell|pwsh)(?:\.exe)?\b[^|;&]*-(?:WindowStyle|w)\s+Hidden
```

```regex
(?i)\b(?:powershell|pwsh)(?:\.exe)?\b[^|;&]*-(?:NoProfile|nop)\b[^|;&]*-(?:NonInteractive|noni)\b
```

**Rationale:** Common malware-style launcher flags.

---

## 6. Download-and-Execute

### Invoke-WebRequest / Invoke-RestMethod piped to Invoke-Expression

**Action:** block.

```regex
(?is)\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm|curl|wget)\b[^|;&]*(?:https?://)[^|;&]*(?:\||;|&&).*\b(?:Invoke-Expression|iex)\b
```

### DownloadString / WebClient execute

**Action:** block.

```regex
(?is)\b(?:Invoke-Expression|iex)\b[^|;&]*\(?\s*(?:New-Object\s+Net\.WebClient|New-Object\s+System\.Net\.WebClient|\[System\.Net\.WebClient\])[^|;&]*\.DownloadString\s*\(
```

### DownloadFile then execute

**Action:** ask/block.

```regex
(?is)\b(?:Invoke-WebRequest|iwr|curl|wget|Start-BitsTransfer)\b[^|;&]*(?:-OutFile|-o|/outfile)\s+[^|;&]+\.(?:ps1|bat|cmd|exe|msi|vbs|js)\b.*(?:;|&&|\|).*\b(?:powershell|pwsh|cmd|cscript|wscript|Start-Process|&)\b
```

**Rationale:** Direct remote code execution or staged execution.

---

## 7. Registry Destructive / Security-Sensitive Changes

### Recursive registry delete

**Action:** block/ask.

```regex
(?i)\b(?:Remove-Item|rm|ri|reg(?:\.exe)?\s+delete)\b[^|;&]*(?:HKLM:|HKCU:|HKCR:|HKU:|HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKEY_CLASSES_ROOT)[^|;&]*(?:-(?:Recurse|r)|/f)
```

### Run key persistence modification

**Action:** ask/block.

```regex
(?i)\b(?:New-ItemProperty|Set-ItemProperty|reg(?:\.exe)?\s+add)\b[^|;&]*(?:\\Run\\?|\\RunOnce\\?|CurrentVersion\\Run|CurrentVersion\\RunOnce)
```

### UAC / security policy weakening

**Action:** block.

```regex
(?i)\b(?:Set-ItemProperty|reg(?:\.exe)?\s+add)\b[^|;&]*(?:EnableLUA|ConsentPromptBehaviorAdmin|DisableAntiSpyware|DisableRealtimeMonitoring)[^|;&]*(?:0x0|0|false)
```

**Rationale:** Registry edits can disable OS protections or create persistence.

---

## 8. Service / Process Destructive Operations

### Stop/kill broad or critical processes

**Action:** ask; block for critical names.

```regex
(?i)\b(?:Stop-Process|kill|taskkill)\b[^|;&]*(?:-Name|-ProcessName|/IM)?\s*(?:explorer|lsass|winlogon|csrss|services|svchost|System)\b
```

### Force-kill all matching processes

**Action:** ask.

```regex
(?i)\b(?:Stop-Process|taskkill)\b[^|;&]*(?:-Force|/F)\b
```

### Delete/disable services

**Action:** ask/block.

```regex
(?i)\b(?:Stop-Service|Restart-Service|Set-Service|Remove-Service)\b[^|;&]*(?:-Force|-StartupType\s+Disabled)?
```

```regex
(?i)\bsc(?:\.exe)?\s+(?:delete|stop|config)\b[^|;&]*(?:start=\s*disabled)?
```

**Rationale:** Can break system/network/security services.

---

## 9. Extra Windows/Pwsh Patterns Worth Including

### Disk / partition destructive commands

**Action:** block.

```regex
(?i)\b(?:Clear-Disk|Remove-Partition|Format-Volume|Initialize-Disk|diskpart)\b
```

### BitLocker destructive/sensitive changes

**Action:** ask/block.

```regex
(?i)\b(?:Disable-BitLocker|Suspend-BitLocker|Remove-BitLockerKeyProtector)\b
```

### Scheduled task persistence/destruction

**Action:** ask.

```regex
(?i)\b(?:Register-ScheduledTask|New-ScheduledTaskAction|Unregister-ScheduledTask|Disable-ScheduledTask)\b
```

### Package/app removal

**Action:** ask.

```regex
(?i)\b(?:winget|choco|scoop)\b[^|;&]*(?:uninstall|remove)\b
```

```regex
(?i)\b(?:Remove-AppxPackage|Remove-AppxProvisionedPackage)\b
```

---

## Suggested Rule Shape

Example YAML-style entries:

```yaml
- pattern: "PowerShell EncodedCommand"
  regex: "\\b(?:powershell|pwsh)(?:\\.exe)?\\b[^|;&]*-(?:EncodedCommand|enc|e)\\s+[A-Za-z0-9+/=]{20,}"
  action: "block"
  reason: "Encoded PowerShell hides command intent and is common in malware-style launchers"

- pattern: "PowerShell download and execute"
  regex: "\\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm|curl|wget)\\b[^|;&]*(?:https?://)[^|;&]*(?:\\||;|&&).*\\b(?:Invoke-Expression|iex)\\b"
  action: "block"
  reason: "Downloads remote content and immediately executes it"

- pattern: "PowerShell recursive force delete"
  regex: "\\b(?:Remove-Item|rm|ri|del|erase|rmdir|rd)\\b(?=[^|;&]*-(?:Recurse|r))(?=[^|;&]*-(?:Force|f))[^|;&]*"
  action: "ask"
  reason: "Recursive forced deletion can cause irreversible data loss"
```

## Implementation Notes

- Prefer **allowing explicit user confirmation** for admin maintenance commands, but **block silent execution** for secret reads, exfiltration, encoded commands, and download-execute.
- Regex alone will miss PowerShell AST tricks like string concatenation: `i''ex`, `Invo'ke-Expression`, `$x='iex'; &$x`. For higher assurance, parse with PowerShell AST or add a stricter “suspicious obfuscation” rule.
- Do not only match canonical cmdlets; PowerShell aliases are common and dangerous.