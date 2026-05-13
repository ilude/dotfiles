---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "prd-readiness"
  confidence: high
  evidence: "PRD says `/commit push` should fetch/block and `/commit` may auto-run `dolos pack private`, but does not define which implementation surface owns this behavior, command modes affected, or whether non-push commits also auto-pack."
  required_fix: "Specify exact `/commit` entrypoints/modes, trigger conditions, and expected behavior for normal commit, push, and dry-run/validation flows."
- severity: high
  category: "state-contract"
  confidence: high
  evidence: "Requirements mention `git rev-parse --git-path dolos/index.json`, local index entries, clean/diverged/no-index states, but not the index schema, fields, or update rules after pack/unpack/init."
  required_fix: "Define minimal index schema and when it is created, updated, invalidated, or ignored."
- severity: high
  category: "git-freshness"
  confidence: high
  evidence: "“upstream changed anything under `.dolos/artifacts/**`” is required, but the PRD does not specify how to compare upstream/base/local refs, what happens without upstream, or how fetched remote changes map to current branch state."
  required_fix: "Define exact Git comparison strategy and edge cases: no upstream, fetch failure, branch behind, diverged branch, artifact changed locally and remotely."
- severity: medium
  category: "key-handling"
  confidence: medium
  evidence: "Pack uses `.dolos/authorized_keys`, but unpack verification depends on matching private keys without specifying identity discovery, env vars, agent use, encrypted key behavior, or failure messages."
  required_fix: "State how Dolos finds SSH private keys for age decryption, what is supported in MVP, and how users configure/select identities."
- severity: medium
  category: "migration"
  confidence: medium
  evidence: "“Existing private archive scripts/hooks/tests must be migrated or removed” and AC #6 require searching active `.encrypted/` assumptions, but do not identify expected files, compatibility behavior, or deprecation messaging."
  required_fix: "Add an inventory/migration requirement: which scripts/hooks/docs/tests must be removed, wrapped, or updated, and what compatibility wrappers should do if retained."
