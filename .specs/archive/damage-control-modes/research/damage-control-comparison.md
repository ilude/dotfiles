# Pi Damage-Control Comparison Findings

**Scope:** local `pi/extensions`, `pi/tests` vs. `disler/bash-damage-from-within/pi`
**Mode:** read-only; remote cloned to temp and inspected.

## Summary

Our local implementation is a production-oriented, policy-file-driven Pi safety layer. The external repo is a pedagogical “5 levels of bash security” ladder showing why prompt-only, blacklist, whitelist, and no-bash approaches differ. There is strong conceptual overlap at the Pi `tool_call` interception layer, but the safety models intentionally diverge.

## Key Findings

### Overlap

- Both use Pi extensions and `pi.on("tool_call")` to block unsafe tool calls by returning:

```ts
{ block: true, reason: "..." }
```

- Both recognize blacklist matching as useful but incomplete.
- Both identify “no arbitrary bash + purpose-built tools” as the strongest model.
- Both note that secrets exposure is not only a bash problem; read/file tools also need policy.

### Gaps in Our Local Implementation

1. **No default-deny bash mode**
   - Local damage-control is denylist/rules-based.
   - External Level 4 demonstrates a stricter bash allowlist with compound shell operator rejection.
   - Local rules catch many destructive/exfil patterns, but arbitrary unknown commands still run.

2. **No “no-bash” operating mode**
   - External Level 5 blocks bash entirely and replaces it with scoped tools.
   - Local implementation keeps bash available and adds guardrails.

3. **Shell parsing remains heuristic**
   - Local `extractBashDeleteTargets()` tokenizes by whitespace.
   - It will not fully understand quoting, aliases, nested shell constructs, process substitution, shell functions, or generated scripts.
   - Local regexes cover some wrappers like `bash -c`, `python -c`, and `node -e`, but not the broader “agent writes a script then runs safe-looking interpreter” class.

4. **Compound operator policy is narrower**
   - External whitelist rejects `&&`, `||`, `;`, `|`, redirects, backticks, `$()` before allowlist matching.
   - Local implementation only blocks specific dangerous compound patterns, not compounds generally.

### Strengths in Our Local Implementation

- **Much broader tool coverage**
  - Local protects `bash`, `pwsh`, `read`, `write`, `edit`, `find`, and `ls`.
  - External Levels 3–4 focus only on bash; Level 5 only suggests adding read restrictions.

- **Configurable policy**
  - Local `damage-control-rules.yaml` supports:
    - `dangerous_commands`
    - regex rules
    - `action: ask`
    - platform filters
    - `zero_access_paths`
    - `no_delete_paths`

- **Portability**
  - Local includes Windows/PowerShell handling and platform-specific rules.
  - External examples are primarily bash/Linux-oriented.

- **Operational safety**
  - Local has rule-load health, fail-closed behavior when rules fail, status publishing, debug logging, metrics, and decision provenance.
  - External repo is intentionally minimal/demo-grade.

- **Test coverage**
  - Local has substantial Vitest coverage for:
    - command blocking/asking
    - platform filters
    - YAML parsing
    - extension registration
    - no-delete paths
    - malformed paths
    - SSH/secret path read behavior
    - shell edit guard and commit guard adjacent safety
  - External Pi implementation appears to have no automated tests.

## Safety Model Comparison

| Area | Local implementation | External implementation |
|---|---|---|
| Primary model | Rule-based deny/ask policy | Educational ladder |
| Bash safety | Denylist + targeted extraction | Blacklist, whitelist, or full bash removal |
| File tool safety | Yes: zero-access/no-delete | Mostly only discussed in Level 5 |
| Windows/PowerShell | Yes | No meaningful coverage |
| Secrets | Bash + file-tool controls | Bash regex; read controls suggested |
| Fail mode | Fails closed if rules unavailable | Demo-level, no health model |
| Tests | Strong | None found |
| Hardest security posture | Not currently no-bash | Level 5 no-bash |

## Actionable Recommendations

1. **Add an optional “strict mode”**
   - Support config like:

```yaml
bash_policy:
  mode: denylist | allowlist | disabled
```

   - Keep current behavior as default.
   - Add allowlist/no-bash modes for high-risk sessions.

2. **Borrow Level 4’s compound-operator precheck for allowlist mode**
   - Reject `&&`, `||`, `;`, `|`, redirects, backticks, `$()` before command matching.
   - Do not apply globally unless intentionally accepting workflow breakage.

3. **Borrow Level 5’s design direction**
   - Add scoped custom tools for common safe operations:
     - `git_status`
     - `run_tests`
     - `list_files_metadata`
   - Use them as replacements when bash is disabled.

4. **Keep local file-tool protections**
   - This is an area where local implementation is materially stronger than the external repo.

5. **Add explicit tests for known Level 3 bypasses**
   - Agent writes script then runs `python cleanup.py`
   - renamed destructive binary
   - chained command
   - shell wrapper variants
   - interpreter file deletion variants

## Bottom Line

Our implementation is more portable, configurable, observable, and tested. The external repo’s main value is architectural: it clearly demonstrates that denylist safety is inherently weaker than allowlist/no-bash designs. Best next step is not replacing local damage-control, but adding optional strict `allowlist` and `disabled bash` modes using the external Level 4/5 patterns.
