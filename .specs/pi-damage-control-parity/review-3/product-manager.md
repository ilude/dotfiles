# Product Manager Review — Outside-the-box / Simplicity

## Finding 1 — High — MVP is overloaded and risks never shipping the `rm -f` fix

**Evidence:** The Objective marks both Phase A and Phase B as required, while Phase A alone already includes canonical policy selection, YAML loading through Python, typed normalization, regex compatibility checks, platform scoping, fail-closed health, tool integration, parity fixtures, and evidence archiving. The original trigger is narrower: `bash rm -f ...` did not prompt.

**required_fix:** Split delivery into a true MVP: ship Phase A command-policy parity for Bash ask/block plus the `rm` regression first. Move Phase B path/write parity and the full oracle/per-pattern coverage debt into a follow-up unless Phase A is already green. Make the success claim explicitly “Bash command ask/block parity subset” for the first delivery.

## Finding 2 — High — Runtime dependency on Claude policy path may reduce safety instead of improving it

**Evidence:** The plan requires an explicit configured `dangerCtrl.claudePolicyPath` for parity; if unset, Pi runs in “Pi-only mode” with warning. In normal local dotfiles use, the repo already contains `claude/hooks/damage-control/patterns.yaml`. Requiring users/settings to wire a path creates a new failure mode where parity is not active by default.

**required_fix:** Prefer deterministic in-repo discovery first: when running from this dotfiles repo, resolve the checked-in Claude policy path relative to the Pi extension/repo root. Keep `dangerCtrl.claudePolicyPath` as an override. Only use Pi-only mode when neither the override nor in-repo canonical policy exists.

## Finding 3 — Medium — Plan duplicates a test/oracle framework before proving reuse is insufficient

**Evidence:** T5 requires a new parity fixture runner, subprocess schema documentation, per-pattern representative inputs, mismatch reporting, and coverage-debt artifact. The plan also references existing Claude damage-control tests and Pi damage-control tests, but does not first require harvesting existing fixtures or shared cases from those suites.

**required_fix:** Add a staged reuse step before building new infrastructure: inventory existing Claude/Pi damage-control tests, extract the minimum shared fixture table needed for Phase A, and only build the oracle runner features that those fixtures require. Defer per-pattern coverage-debt until after command parity is working.

## Finding 4 — Medium — Fail-closed on unsupported fields can block all parity for metadata-only drift

**Evidence:** T2 says T1 must enumerate all keys and T2 must fail policy health closed if any rule carries a key not in the supported set. Claude rules may add metadata keys such as rationale, issue links, tags, or future classification fields that do not change matching semantics. Treating every unknown field as safety-affecting makes Pi brittle.

**required_fix:** Define a small allowlist of semantic keys that affect matching/outcome (`pattern`, `ask`, `platforms`, `exclude_platforms`, and any proven action modifiers). Unknown non-semantic metadata should warn and appear in inventory, not fail closed. Unknown semantic/action keys should fail closed.

## Finding 5 — Medium — Evidence process is heavier than the implementation risk warrants

**Evidence:** The plan requires many evidence files, exit-code files, manifests, secret scans, multiple gates, final reruns, and archive preflight for a local TypeScript policy change. This adds significant execution cost and makes simple fixes harder to complete.

**required_fix:** Use a lighter evidence contract for the first stage: preserve preexisting diffs, run targeted Pi tests, run extension typecheck, run Claude tests if oracle behavior is changed/queried, and write one concise validation summary. Reserve the full evidence manifest and secret scan for plans that collect broad logs or external data.
