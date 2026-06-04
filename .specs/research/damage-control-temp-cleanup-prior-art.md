# Damage-Control Temp Cleanup and Command Safety Prior Art

Research into static analysis, approval systems, provenance tracking, and skill
patterns relevant to extending Pi damage-control for low-noise temp-file cleanup
without creating bypasses.

## Summary

- Prefer deterministic proof over ML for temp cleanup: source-to-sink provenance
  (`mktemp` assignment to exact `rm` target) is safer than model judgment.
- Borrow from taint/dataflow systems: produce an explainable trace for every
  downgrade from `ask` to low-risk.
- Keep analysis bounded: parse once, walk locally, use size/node/time caps, and
  fail closed to `ask` on ambiguity or timeout.
- Pair runtime validation with a skill that teaches models canonical,
  validation-friendly shell temp-file patterns.
- Add rule fixtures with positive and negative examples so bypass cases are
  tested before policy changes ship.

## Search Terms Used

These queries were useful starting points and should be reused/expanded later:

- `academic paper shell script static analysis dataflow security bash variable expansion command injection`
- `GitHub bash static analysis AST dataflow shell script analyzer tree-sitter bash security`
- `command safety approval system shell commands dangerous command classifier agent tool use safety research`
- `ShellCheck dataflow analysis shell scripts source code variable tracking temporary files mktemp rm cleanup`
- `tool approval dangerous command allowlist sandbox permissions shell execution safety`
- `terminal agent dangerous command approval bypass prompt injection payload written to file then executed`
- `Semgrep shell script rules dangerous rm mktemp bash taint analysis`
- `static analysis bash abstract interpretation shell variable expansion ABASH paper performance`
- `approval fatigue security warnings usable security false positives user habituation paper`
- `Open Policy Agent Rego policy as code deny allow security rules documentation`
- `Cedar authorization policy language AWS verified permissions policy examples`
- `Macaroons authorization credentials attenuation least privilege paper`
- `sandbox escape tool permission bypass command approval research paper`

Suggested future expansion terms:

- `tree-sitter bash dataflow variable assignment analysis`
- `shell abstract interpretation command signatures mktemp rm`
- `agent permission prompt fatigue approval telemetry`
- `policy as code inline tests match not_match command rules`
- `capability attenuation session approval caveats agent tools`
- `temporary file symlink attack mktemp shell script security`
- `prompt injection hidden payload writes script then executes agent`

## Sources

| Resource | URL | Notes |
|----------|-----|-------|
| Tree-sitter introduction | https://tree-sitter.github.io/tree-sitter/ | Parser goals: fast enough for editor use, robust under syntax errors. |
| ShellCheck man page | https://man.archlinux.org/man/shellcheck.1.en | Extended dataflow analysis can be disabled for very large scripts to reduce CPU/RAM. |
| Semgrep taint mode | https://semgrep.dev/docs/writing-rules/data-flow/taint-mode | Source/propagator/sanitizer/sink model for traceable dataflow. |
| Semgrep rule testing | https://semgrep.dev/docs/writing-rules/testing-rules | Positive/negative rule fixtures via `ruleid` and `ok` annotations. |
| CodeQL dataflow analysis | https://codeql.github.com/docs/writing-codeql-queries/about-data-flow-analysis/ | Dataflow graph, local vs global flow, taint vs value flow. |
| ABASH paper | https://dl.acm.org/doi/10.1145/1255329.1255347 | Bash abstract interpretation with shell expansion and command signatures. |
| ABASH PDF | https://www.cis.upenn.edu/~stevez/papers/MZ07.pdf | Alternate accessible copy of ABASH paper. |
| Apple Shell Script Security | https://developer.apple.com/library/archive/documentation/OpenSource/Conceptual/ShellScripting/ShellScriptSecurity/ShellScriptSecurity.html | `mktemp`, temp directory, symlink/race considerations for public temp dirs. |
| OPA/Rego policy language | https://www.openpolicyagent.org/docs/latest/policy-language/ | Declarative policy over structured input; policy separate from implementation. |
| Cedar policy language | https://docs.cedarpolicy.com/ | Authorization policies over principal/action/resource/context; schema validation. |
| Zanzibar paper | https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/ | Fast authorization at scale; uniform policy model, low-latency decisions. |
| Macaroons paper | https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/ | Caveats/attenuation as a model for scoped session approvals. |
| Alice in Warningland | https://www.usenix.org/conference/usenixsecurity13/technical-sessions/paper/akhawe | Empirical warning UX; warning frequency and design affect user behavior. |
| tree-sitter-ast-dfg | https://github.com/zzxn/tree-sitter-ast-dfg | Example of extracting dataflow from tree-sitter ASTs. |

## Key Findings

1. **Use provenance proof for temp cleanup, not model judgment.**
   The relevant safe pattern is not "command mentions mktemp". It is:
   `rm` target expression maps to a variable whose latest assignment is a safe
   temp source, with no reassignment or unsafe expansion before the sink.

2. **Model temp cleanup as source-to-sink flow.**
   Borrow Semgrep/CodeQL language:
   - Source: `tmpfile="$(mktemp)"`, `tmpdir="$(mktemp -d)"`
   - Propagator: optionally simple exact assignment, e.g. `other="$tmpfile"`
   - Sink: `rm -f -- "$tmpfile"`, `rm -rf -- "$tmpdir"`
   - Rejection: reassignment, fallback expansion, glob, mixed targets,
     command substitution, `eval`, or execution of the temp payload.

3. **Every downgrade should have a human-readable trace.**
   Example:

   ```text
   source: tmpfile="$(mktemp)"
   sink: rm -f -- "$tmpfile"
   proof: exact quoted target, no reassignment, non-recursive file cleanup
   decision: low-risk temp cleanup
   ```

   If no trace can be produced, keep the existing `ask`.

4. **Evaluate hidden payloads separately from cleanup.**
   A benign wrapper must not hide a dangerous payload. For Pi, this means a
   script like this must not be downgraded just because `$tmpfile` came from
   `mktemp`:

   ```bash
   tmpfile="$(mktemp)"
   cat > "$tmpfile" <<'EOF'
   rm ~/.ssh/id_rsa
   EOF
   bash "$tmpfile"
   rm -f -- "$tmpfile"
   ```

   Cleanup may be safe, but executing the temp file is a separate sink.

5. **Keep analysis local and bounded.**
   ShellCheck and CodeQL both distinguish cheaper local analysis from broader
   expensive analysis. For damage-control, the first implementation should be
   local to one shell snippet, with a hard timeout and size/node caps. Timeout,
   parse failure, or unsupported syntax should return `ask`, not `allow`.

6. **Rule tests should include bypass attempts.**
   Borrow Codex/Semgrep test style. For temp cleanup, fixtures should include
   both match and not-match examples:

   ```yaml
   match:
     - 'tmpfile="$(mktemp)"; rm -f -- "$tmpfile"'
     - 'tmpdir="$(mktemp -d)"; rm -rf -- "$tmpdir"'
   not_match:
     - 'tmpfile="$(mktemp)"; rm -f -- "$tmpfile" ~/.ssh/id_rsa'
     - 'tmpfile="$(mktemp)"; tmpfile="$HOME/.ssh/id_rsa"; rm -f -- "$tmpfile"'
     - 'tmpfile="$(mktemp)"; rm -f -- "${tmpfile:-/}"'
     - 'tmpfile="$(mktemp)"; bash "$tmpfile"'
     - 'tmpfile="$(some_command)"; rm -f -- "$tmpfile"'
   ```

7. **A skill can reduce false positives before runtime.**
   Teach agents to emit validation-friendly shell:

   ```bash
   tmpfile="$(mktemp)"
   some_command > "$tmpfile"
   rm -f -- "$tmpfile"
   ```

   and for directories:

   ```bash
   tmpdir="$(mktemp -d)"
   some_command "$tmpdir"
   rm -rf -- "$tmpdir"
   ```

   Anti-patterns: mixed delete targets, globs, fallback expansions, dynamic
   provenance, reassignment, and `eval`.

8. **Protected-write noise should use scoped approvals, not ML.**
   Macaroons' caveat model suggests session approvals with constraints:

   ```yaml
   allow:
     tool: edit
     path: ~/.dotfiles/pi/settings.json
     cwd: ~/.dotfiles
     duration: session
     maxWrites: 1
     contentScanRequired: true
   ```

   This is safer and more explainable than a classifier deciding protected
   writes are okay.

9. **Structured facts prepare the system for future policy or classifier work.**
   Instead of feeding raw strings to future layers, build facts:

   ```json
   {
     "tool": "bash",
     "commandFamily": "rm",
     "targets": [
       {
         "raw": "$tmpfile",
         "quoted": true,
         "provenance": "mktemp_file",
         "recursive": false,
         "mixedWithUnsafeTarget": false
       }
     ],
     "hasDynamicEval": false,
     "hasPayloadExecution": false
   }
   ```

   Deterministic policy, explainable prompts, metrics, and possible later ML all
   become easier if they consume structured facts.

## Candidate Implementation Shape

```text
raw bash command
  -> existing dangerous-command checks
  -> AST parse, bounded by timeout/size/node caps
  -> temp provenance extractor
  -> per-rm-target proof checker
  -> if every target has proof: allow or low-risk ask annotation
  -> else keep existing ask/block behavior
```

Recommended first scope:

- Support `tmpfile="$(mktemp)"` and `tmpfile=$(mktemp)`.
- Support `tmpdir="$(mktemp -d)"` and `tmpdir=$(mktemp -d)`.
- Support exact quoted cleanup: `rm -f -- "$tmpfile"`.
- Support recursive cleanup only for `mktemp -d`: `rm -rf -- "$tmpdir"`.
- Reject all mixed targets unless every target independently proves safe.
- Reject reassignment, fallback parameter expansion, globs, command
  substitution in the sink, arrays, loops, aliases, and `eval` in v1.
- Fail closed to `ask` on parse error, timeout, or unsupported syntax.

## Open Questions

1. Should proven temp cleanup become actual `allow`, or only a low-risk
   annotation in the ask prompt for the first release?
2. Should literal `/tmp/*.tmp` ever be allowed, or should globs always remain
   `ask`? Current recommendation: always `ask`.
3. Should temp-file execution (`bash "$tmpfile"`, `source "$tmpfile"`) trigger
   additional payload inspection if the temp content was written earlier in the
   same script?
4. Should the rule schema grow embedded `match`/`not_match` fixtures, or should
   fixtures live only in Vitest tests?
5. Should safe temp cleanup facts be recorded in the eval log, even when allowed,
   to measure reduced ask volume?

## Related Research

- [Damage-Control Hooks - Gap Analysis & Missing Attack Mitigations](damage-control-gap-analysis.md)

## Date

Last updated: 2026-06-04
