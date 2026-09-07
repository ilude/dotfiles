# Default Damage Control provenance findings

## Method and evidence limits

Compared the checked-in legacy contract and implementation with the default implementation, migration fixture, completed port plan, and current contract. Port-authored plans, tests, migration rationales, and documentation show what was implemented, but do not independently prove operator approval. No original conversation transcript or separate operator-signed requirements record exists in the inspected sources.

## Confirmed incident and cause

The harmless repository-local command that triggered `REVIEW NEEDS INPUT` was:

```sh
find pi/profiles/legacy/extensions -maxdepth 2 -type f | sort | grep -Ei 'bedrock|usage|operator|model|aws'
```

The default parser classifies shell `find` as recursive metadata access. `analysis.ts` then calls `inspectPathTree()` for recursive shell searches. `paths.ts` recursively enumerates the entire supplied root, records every symlink as unresolved search scope, and records an uncertainty when more than 2,000 descendants are encountered. `engine.ts` converts those uncertainties into model review and then clarification. None of those facts establish a prohibited effect.

Legacy does not do this. It lists `find` as a read-only search command and treats `find` as an SSH metadata-only tool. Its destructive protections are tied to actual forms such as `find -delete` and `find -exec rm`. It does not recursively inspect the directory tree merely because a read-only `find` command names a directory.

**Disposition:** unapproved behavior. Remove recursive descendant inspection, symlink uncertainty, and enumeration-bound escalation from read-only shell searches. Keep direct path checks and actual destructive `find` analysis.

## Default-only behavior inventory

### Remove or restore to legacy behavior

1. **Speculative read-only descendant protection**
   - Default: recursively inventories `grep -R` and shell `find`, treats protected-looking descendants as candidate blocks, and prompts when symlinks, permissions, or count bounds prevent complete inventory.
   - Legacy: read-only search is allowed unless its explicit target itself hits a protected path; destructive `find` forms remain governed by rules.
   - Provenance: introduced by the port's recommendation and acceptance cases, not found in legacy. No independent approval evidence found.
   - Removal: stop tree walking for read/metadata operations. Retain tree walking for delete because deleting an ancestor actually deletes descendants.

2. **Search-completeness requirement for native `grep`/`find` and shell `rg`**
   - Default: launches metadata inventory subprocesses and creates candidate `search-scope` blocks when inventory is unavailable, too large, cancelled, externally configured, or otherwise incomplete.
   - Legacy: no requirement to prove every file a read-only search may inspect before allowing it.
   - Provenance: implementation-only supporting mechanism for item 1.
   - Removal: inventory may identify an actually selected protected path when available, but inventory failure must not itself prompt or block a read-only search. The simpler parity option is to remove read-search inventory entirely and check explicit roots only.

3. **Unknown effect implies user clarification for otherwise read-only operations**
   - Default: any unknown filesystem effect or candidate block survives Luna and forces a special clarification prompt whose answer cannot authorize the original call.
   - Legacy: covered calls have allow, ask, or block. There is no fourth clarification outcome for speculative read scope.
   - Provenance: the separate prompt presentation was documented as a port decision, but applying it to hypothetical read descendants was not legacy behavior and caused the incident.
   - Removal: retain fail-closed handling for malformed actual mutation targets and failed required enforcement. Do not manufacture unknown effects from incomplete read-only inventory.

4. **Failing harmless repository inspection because Damage Control cannot inspect every descendant**
   - Default: parser/inventory resource limits become operation-level uncertainty even when the command is non-mutating.
   - Legacy: bounded analysis exists, but ordinary read-only commands are explicitly recognized rather than requiring universal scope proof.
   - Removal: resource limits may limit extra protection analysis; they must not convert a known read-only invocation into a destructive candidate without a matching explicit target or command rule.

### Preserve as legacy behavior

1. Explicit command-rule blocks and asks from `damage-control-rules.yaml`, including destructive `find -delete` and `find -exec rm` forms.
2. Direct protected-path checks for native file tools and explicit shell operands.
3. Canonical path and symlink-prefix checks for mutation/deletion targets.
4. No-delete and zero-access protections.
5. Complete-invocation checking so an allowed effect does not hide a later blocked effect.
6. Repeated-call breaker in principle. Legacy has this behavior, though thresholds and exact implementation should not be expanded during this fix.
7. Direct operator shell exemption.

### Documented default differences with explicit approval claims

The current port documents these as operator decisions or fixed requirements. Repository text alone cannot independently validate the original approval, so they are not candidates for silent removal in this incident fix:

1. Luna may authoritatively allow review-tier false positives and clearly safe work.
2. Confirmed blocks and mandatory user approvals remain outside Luna authority.
3. No approval reuse in the initial port.
4. Database destruction blocks remain blocks.
5. `/commit` internals are exempt.
6. Explicit recovery protects Damage Control's own implementation.
7. Ordinary blocks are quiet; policy prompts and review-input prompts are visually distinct.

These require direct operator review if their claimed approval is disputed. They are separate from the read-only search defect.

### Additional default-only mechanisms lacking primary approval evidence

These are broader than the observed defect and should not be silently retained merely because tests exist:

1. Blocking tools named `pwsh`, `bg_start`, `text_edit`, `structured_edit`, or `glob` whenever their source/schema does not match the default adapter inventory.
2. Requiring all five Tree-sitter grammars at startup, including nested Python/JavaScript/TypeScript analysis, rather than loading analysis only when relevant.
3. Docker daemon metadata queries, immutable container identity tracking, mount translation, and remote-bind clarification.
4. Git `ls-files` subprocesses to decide whether deletion contains meaningful tracked work.
5. Session-local creation ledgers used to classify later file/container deletion as disposable.
6. Strict rejection of any unexpected native tool input field as an unsupported safety-critical override.
7. Integrity protection for the complete new Damage Control implementation/recovery file set.

Some may be sensible and may have been approved, but the checked-in evidence does not prove that. They need a separate operator decision rather than being removed as part of the confirmed search-scope regression.

## Exact bounded remediation set

1. In `analysis.ts`, call `pathMatches()` directly for known read/metadata roots.
2. Do not call `inspectPathTree()` for read-only recursive shell commands. Keep it for delete effects.
3. Do not add `search-scope` candidate blocks or uncertainties when read-only inventory cannot establish complete scope.
4. Remove `shell-search-environment-descendant` candidate generation because it depends on speculative traversal rather than an explicit selected target.
5. Replace the test asserting `grep -R` over a directory containing `.env` must prompt with tests asserting:
   - ordinary recursive read-only search is quiet;
   - explicitly targeting a protected path remains blocked;
   - `find -delete` and `find -exec rm` retain their legacy outcomes;
   - deletion of an ancestor containing a no-delete path remains blocked.
6. Add a regression test for the exact `find ... | sort | grep ...` shape that triggered the prompt.
7. Update default Damage Control documentation so it no longer claims unresolved search scope or protected descendants require clarification for read-only searches.

## Applied remediation

The recovery boundary was enabled and the confirmed remediation was applied:

- Read-only shell searches no longer trigger recursive descendant inspection.
- Incomplete read-only search inventory no longer creates a candidate prohibition or uncertainty prompt.
- Direct protected targets and delete-tree descendant checks remain enforced.
- Common non-mutating pipeline filters, including `sort`, are recognized instead of sent to model review as unsupported execution.
- All Damage Control user interactions now use `Deny` / `Allow once`; typed clarification input was removed.
- A regression test covers the exact piped `find ... | sort | grep ...` command shape.

Focused result: 84 passed, one platform skip across prompt, search, path, enforcement, shell, engine, and lifecycle tests. Runtime readiness and all five failure/repair cases passed. Full-profile typecheck remains blocked by the two pre-existing unrelated `web-tools-gateway-transport.test.ts` `emit` errors already documented by the prior port.
