# Expertise Layering -- Normative Spec

This document is the authoritative contract for the two-layer Pi expertise system.
It defines repo ID derivation, layer storage layout, merge/read semantics, migration
ordering, and safety rules. Implementation (T3) must match this spec exactly.
Tests (T2) must use the fixture tables in this document as their source of truth.

---

## Contents

1. [Storage layout](#storage-layout)
2. [Repo ID derivation](#repo-id-derivation)
   - [Remote precedence](#remote-precedence)
   - [URL parsing rules](#url-parsing-rules)
   - [Provider prefix table](#provider-prefix-table)
   - [Compact slug format](#compact-slug-format)
   - [Windows normalization rules](#windows-normalization-rules)
   - [Non-git and no-remote fallbacks](#non-git-and-no-remote-fallbacks)
3. [Decision table: repo ID resolution](#decision-table-repo-id-resolution)
4. [Layer read semantics](#layer-read-semantics)
   - [Read order](#read-order)
   - [Dedupe and conflict rules](#dedupe-and-conflict-rules)
5. [Decision table: layered state read order](#decision-table-layered-state-read-order)
6. [Write semantics](#write-semantics)
7. [Migration rules](#migration-rules)
8. [Drift and rename handling](#drift-and-rename-handling)
9. [Safety rules](#safety-rules)
   - [Secret redaction](#secret-redaction)
   - [Sensitive-repo disable](#sensitive-repo-disable)
   - [Locking and concurrency](#locking-and-concurrency)
   - [Rollback and snapshot invalidation](#rollback-and-snapshot-invalidation)

---

## Storage layout

```
~/.pi/agent/multi-team/expertise/
  {agent}-expertise-log.jsonl          # global layer (legacy path, remains authoritative for global entries)
  {agent}-mental-model.json            # global snapshot
  {agent}-mental-model.state.json      # global snapshot state
  {repo-id-slug}/                      # project-local layer (one directory per repo ID)
    repo-id.json                       # persisted RepoIdMeta for drift detection
    {agent}-expertise-log.jsonl        # project-local log
    {agent}-mental-model.json          # project-local snapshot
    {agent}-mental-model.state.json    # project-local snapshot state
```

The flat `{agent}-expertise-log.jsonl` files in the expertise root are the **global layer**
(legacy path). They are never moved or deleted. New project-local entries are written to
the scoped subdirectory. Both layers remain permanently readable.

`repo-id.json` is written once when the scoped directory is created. It stores the slug,
the remote URL that produced it, and timestamps for drift detection. See `RepoIdMeta` in
`pi/lib/repo-id.ts`.

---

## Repo ID derivation

### Remote precedence

The canonical remote is selected in this order:

1. The remote named in `.pi/settings.json` `preferredRemote` (if set and present in git remotes)
2. `origin` (if it exists)
3. Lexically-first remote name (case-insensitive sort of all remote names)
4. No-remote fallback: `local/<cwd-slug>` (git repo exists but has no remotes)
5. Non-git fallback: slug `global` (not inside a git repo at all)

Only one remote is ever used per session. The selected remote name and its raw URL are
stored in `RepoId.selectedRemote` and `RepoId.selectedRemoteUrl` for provenance.

### URL parsing rules

Supported URL formats and normalization steps:

**HTTPS**
```
https://github.com/owner/repo.git
https://github.com:443/owner/repo.git
```
- Strip scheme (`https://`)
- Extract host (lowercase); strip port if present
- Extract path; lowercase all segments; strip trailing `.git` from last segment
- Remove empty segments

**SSH with explicit scheme**
```
ssh://git@github.com/owner/repo.git
ssh://git@github.com:22/owner/repo.git
```
- Strip scheme (`ssh://`) and user info (`git@`, `user@`)
- Same host/path treatment as HTTPS

**SCP-style (no scheme)**
```
git@github.com:owner/repo.git
git@gitlab.com:group/subgroup/repo.git
```
- Strip user info (`git@`, any `user@`)
- Split on `:` -- left side is host, right side is path
- Host is lowercased; path segments are lowercased; trailing `.git` stripped
- SCP-style paths use `:` as host/path separator, NOT `/`

**Azure DevOps** (`dev.azure.com`)
```
https://dev.azure.com/org/project/_git/repo
```
- Parsed as HTTPS above
- The `_git` path segment is removed from the segment list during parsing
- Results in segments: `[org, project, repo]`

**Non-standard ports**
```
https://example.com:8443/owner/repo.git
```
- Port is extracted and stored in `ParsedRemote.port`
- Port is NOT included in the slug (host-level identity only)
- Rationale: port changes on the same host should not fork expertise history

**Unsupported formats**
- `file://` or local paths: treated as parse failure; no remote derived
- Malformed URLs: `parseRemoteUrl` returns `null`; caller falls back to no-remote behavior

### Provider prefix table

| Host (normalized) | Prefix | Notes |
|---|---|---|
| `github.com` | `gh` | |
| `gitlab.com` | `gl` | |
| `bitbucket.org` | `bb` | |
| `dev.azure.com` | `az` | |
| `*.visualstudio.com` | `az` | Old Azure DevOps hostnames |
| Any other host | `ext` | Host included in slug path |

### Compact slug format

```
<prefix>/<segment>[/<segment>...]
```

Provider-specific path layout:

| Prefix | Slug path | Example |
|---|---|---|
| `gh` | `gh/<owner>/<repo>` | `gh/owner/repo` |
| `gl` | `gl/<all-path-segments>` | `gl/group/subgroup/repo` |
| `bb` | `bb/<workspace>/<repo>` | `bb/owner/repo` |
| `az` | `az/<org>/<project>/<repo>` | `az/myorg/myproject/myrepo` |
| `ext` | `ext/<host>/<segments>` | `ext/example.com/owner/repo` |
| `local` | `local/<cwd-basename>` | `local/my-project` |
| `global` | `global` | (non-git repos; single token) |

### Windows normalization rules

Applied in order to each path segment (not to `/` separators):

1. **Lowercase** -- all segments are lowercased (case-folding)
2. **Invalid characters** -- replace `<>:"/\|?*` and ASCII control characters (0x00-0x1F) with `-`
3. **Reserved names** -- if the original (pre-lowercase) URL segment is all-uppercase
   AND matches a Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM0`-`COM9`,
   `LPT0`-`LPT9`), append `_` to the lowercased segment. Pure-lowercase originals
   (e.g. `aux`, `con`) are passed through unchanged so existing repos that legitimately
   use lowercase reserved-name spellings as path segments do not collide with the
   guard. The general-purpose `windowsSafeSlug()` helper applies the suffix
   case-insensitively after lowercasing; that stricter rule is appropriate when
   normalizing arbitrary user-supplied slugs but would be too aggressive for
   remote-derived repo IDs, so `buildSlugFromParsed()` uses the original-uppercase
   variant defined here.
4. **Trailing dots/spaces** -- strip trailing `.` or ` ` from each segment
5. **Length** -- if the full slug exceeds 120 bytes (UTF-8), truncate the last segment and
   append `-` + first 7 hex chars of SHA-1(original un-truncated slug)

### Collision handling

When two different repos derive the same normalized slug, the second repo receives a
hash disambiguation suffix:

```
<slug>-<7-char SHA-1 of rawUrl>
```

Collision detection: before finalizing a repo ID, check whether the target expertise
directory already contains a `repo-id.json` with a different `remoteUrl`. If it does,
apply the hash suffix. `RepoId.hashSuffixApplied` is set to `true`.

### Non-git and no-remote fallbacks

| Condition | Behavior | Slug |
|---|---|---|
| Not inside a git repo | Global-only expertise; no project-local writes | `global` |
| Git repo, zero remotes | Local fallback slug; project-local writes allowed | `local/<cwd-basename>` |
| Git repo, remotes exist but all parse to null | Treat as zero-remotes case | `local/<cwd-basename>` |

---

## Decision table: repo ID resolution

Input remote -- Expected repo ID slug

| # | Input remote | Remote name | Additional context | Expected repo ID |
|---|---|---|---|---|
| 1 | `https://github.com/owner/repo.git` | origin | -- | `gh/owner/repo` |
| 2 | `https://github.com/owner/repo` | origin | no .git suffix | `gh/owner/repo` |
| 3 | `git@github.com:owner/repo.git` | origin | SCP-style | `gh/owner/repo` |
| 4 | `ssh://git@github.com/owner/repo.git` | origin | explicit SSH scheme | `gh/owner/repo` |
| 5 | `https://gitlab.com/owner/repo.git` | origin | -- | `gl/owner/repo` |
| 6 | `git@gitlab.com:owner/repo.git` | origin | SCP-style | `gl/owner/repo` |
| 7 | `https://gitlab.com/group/subgroup/repo.git` | origin | nested GitLab groups | `gl/group/subgroup/repo` |
| 8 | `git@gitlab.com:group/subgroup/repo.git` | origin | nested GitLab SCP | `gl/group/subgroup/repo` |
| 9 | `https://GITHUB.COM/Owner/Repo.git` | origin | uppercase host + owner | `gh/owner/repo` |
| 10 | `https://bitbucket.org/owner/repo.git` | origin | -- | `bb/owner/repo` |
| 11 | `https://dev.azure.com/org/project/_git/repo` | origin | Azure DevOps, _git stripped | `az/org/project/repo` |
| 12 | `https://example.com:8443/owner/repo.git` | origin | non-standard port, ext host | `ext/example.com/owner/repo` |
| 13 | `https://github.com/owner/aux` | upstream | `upstream` is preferred remote | `gh/owner/aux` |
| 14 | `https://github.com/owner/repo.git` (multiple remotes: origin + upstream) | origin | no preferred set; origin wins | `gh/owner/repo` |
| 15 | `https://github.com/owner/CON.git` | origin | Windows reserved name `CON` (uppercase) | `gh/owner/con_` |
| 16 | (non-git directory) | n/a | cwd not in a git repo | `global` |
| 17 | (git repo, no remotes) | n/a | e.g. `git init` with no push | `local/<basename-of-cwd>` |
| 18 | Two repos that both normalize to `gh/owner/repo` | origin | collision scenario | First: `gh/owner/repo`; Second: `gh/owner/repo-<7-char-hash>` |

---

## Layer read semantics

### Read order

`read_expertise` returns a merged view with the following priority order:

1. **Project-local layer first** -- all categories from the project-local snapshot
2. **Global layer second** -- all categories from the global snapshot, after deduplication

When neither layer exists, the behavior is the same as the existing single-layer system
(return empty / first-session message).

When only the global layer exists (legacy state), the behavior is identical to the
current single-layer system. No migration is required before reads work.

### Dedupe and conflict rules

These rules are applied during the merge of the two snapshot views:

**Dedupe key** for a snapshot item: `normalizeText(summary)` (lowercase, stripped of punctuation/whitespace).

| Category | Conflict rule |
|---|---|
| `strong_decision` | If two items share the same dedupe key, keep the project-local entry; discard the global duplicate. If they share the key but have different `why_good`, keep the project-local `why_good`. |
| `key_file` | Keyed by `normalizeText(path)`. Project-local entry wins on all fields. Global entry discarded if key matches. |
| `pattern` | Project-local entry wins on dedupe key match. |
| `observation` | Project-local entry wins. For observations, dedupe key includes the `project` prefix if present. |
| `open_question` | Both entries preserved unless dedupe key is identical -- open questions should remain distinct unless truly the same text. |
| `system_overview` | Both entries preserved; project-local entries appear first. |

**Conflict rule**: "project-local wins" means the global item is silently suppressed in the
rendered output. The global item is NOT deleted from disk -- it remains in the global JSONL
log and global snapshot. The suppression is read-time only.

**Nondeterminism guard**: within each layer, items are sorted by `last_seen` descending
(existing behavior). Across layers, project-local always precedes global -- this order
is deterministic and stable.

---

## Decision table: layered state read order

| # | State description | Expected read behavior |
|---|---|---|
| L1 | Only global expertise exists (legacy) | Return global entries; no project-local layer present |
| L2 | Only project-local expertise exists | Return project-local entries; no global layer |
| L3 | Both layers exist, no overlapping summaries | Return project-local entries first, then global entries appended |
| L4 | Both layers exist, duplicate summary (same dedupe key) | Project-local entry wins; global duplicate suppressed from output |
| L5 | Both layers, conflicting `strong_decision` (same key, different `why_good`) | Project-local `why_good` retained; global `why_good` discarded |
| L6 | Stale project-local snapshot, fresh global snapshot | Rebuild project-local snapshot synchronously; serve rebuilt project-local first |
| L7 | Project-local snapshot rebuild fails | Serve last-known-good project-local snapshot (with stale warning) + global layer |
| L8 | Repo ID drift: current ID differs from stored `repo-id.json` slug | Dual-read: read new ID path + old ID path; flag drift in snapshot metadata; do not delete old path |
| L9 | Legacy global migration cutover | Project-local path takes precedence; global path remains readable as fallback during dual-read window |
| L10 | `sensitive_repo: true` in `.pi/settings.json` or `AGENTS.md` | Block all project-local writes; all expertise routed to global layer only |

---

## Write semantics

`append_expertise` routing:

| Condition | Write destination |
|---|---|
| Inside a git repo AND `sensitive_repo` is NOT set | Project-local layer (`<expertise-dir>/<repo-id-slug>/`) |
| Inside a git repo AND `sensitive_repo: true` | Global layer (legacy path); project-local blocked |
| Not inside a git repo | Global layer |

On the first project-local write to a new repo ID directory:

1. Create the directory
2. Write `repo-id.json` with current `RepoIdMeta` (slug, remoteUrl, timestamps)
3. Append the expertise entry to the project-local JSONL log
4. Mark the project-local snapshot state as stale

---

## Migration rules

### Existing global state

Existing global `{agent}-expertise-log.jsonl` files are **never moved, renamed, or deleted**.
They remain the global layer permanently. No manual migration is required before the feature
works -- `read_expertise` reads both layers on every call once a project-local directory exists.

### Migration ordering

1. On the first session inside a git repo with the new code, `append_expertise` creates the
   project-local directory and starts writing there.
2. `read_expertise` immediately begins dual-reading (global + project-local) from that point.
3. Historical global entries remain in the global layer and are served (after dedup) forever.
4. No bulk migration of historical global entries to project-local storage is performed in v1.

### Snapshot invalidation on cutover

When the implementation is first deployed and a project-local directory is created:

- The global snapshot is NOT invalidated. It continues to be used for the global layer read.
- The project-local snapshot does not exist yet -- `read_expertise` rebuilds it from the
  (initially empty) project-local log synchronously on first read.

### Repo ID drift and rename handling

See the [Drift and rename handling](#drift-and-rename-handling) section below.

---

## Drift and rename handling

Repo ID drift occurs when the remote URL or preferred-remote configuration changes between
sessions, causing the derived slug to differ from the slug stored in `repo-id.json`.

**Detection**: on each session start (or on each `read_expertise` / `append_expertise` call),
compare the current `RepoId.slug` against the `slug` field in `repo-id.json` for the
matching directory (if any).

**Drift response (v1)**:

1. Do NOT delete or rename the old expertise directory.
2. Do NOT write to the old directory.
3. Enable dual-read: include both the old directory (by stored slug) and the new directory
   (by current slug) in `read_expertise`. The old directory is treated as a read-only
   migration source.
4. New writes go to the new slug directory. Create `repo-id.json` for the new directory.
5. Surface a drift warning in the `read_expertise` tool result details:
   `{ drifted: true, previousSlug: "...", currentSlug: "..." }`
6. The old directory remains indefinitely until the user explicitly deletes it.

**Rollback safety**: because old directories are never deleted, reverting the remote config
or preferred-remote setting re-activates the old directory as the primary path. No expertise
is lost across the drift event.

---

## Safety rules

### Secret redaction

`append_expertise` must not durably store content that matches known secret patterns.

Detection heuristics (applied to the serialized `entry` JSON before writing):

- API key patterns: `sk-ant-...`, `sk-...`, bearer tokens, `AKIA...` (AWS)
- Private key PEM headers: `-----BEGIN ... PRIVATE KEY-----`
- Password fields: JSON keys named `password`, `secret`, `token`, `credential` with
  non-empty string values
- Long random-looking hex or base64 strings (>40 chars, high entropy)

On detection:

1. Block the write entirely (v1 conservative policy)
2. Return an error result to the calling agent: `{ blocked: true, reason: "potential secret detected" }`
3. Do NOT write a redacted/partial version -- the whole entry is rejected

The secret check is applied to both global and project-local write paths. If detection
confidence is low, prefer blocking over storing. The raw JSONL must never contain a
durably stored secret even if the agent passed it in as part of a `key_file` note.

### Sensitive-repo disable

A repo can opt out of project-local expertise storage by setting `sensitive_repo: true`
in either:

- `.pi/settings.json` at the repo root
- A `SENSITIVE_REPO=true` environment variable

When this flag is active:

- `append_expertise` routes all writes to the global layer (existing behavior)
- No project-local directory is created for this repo
- `read_expertise` returns only the global layer (no project-local reads)
- The flag is checked on every call -- there is no session-level caching of this value

### Locking and concurrency

File writes use `withFileMutationQueue` (existing Pi concurrency primitive) for all JSONL
appends and snapshot/state file writes. This serializes concurrent agents writing to the
same per-agent files.

Project-local and global files are separate paths. A project-local write and a global write
for the same agent do NOT block each other.

Snapshot writes are atomic: write to a `.tmp-<pid>-<ts>` file, then rename. Interrupted
writes leave an orphan `.tmp` file but never corrupt the live snapshot. Orphan `.tmp` files
older than 5 minutes may be cleaned up on session start.

### Rollback and snapshot invalidation

If a deployment needs to be rolled back to single-layer behavior:

1. The global layer files are unmodified -- single-layer reads work immediately.
2. Project-local directories remain on disk but are ignored by the old code.
3. No data is lost in either direction.

Snapshot invalidation is triggered explicitly (by writing a dirty state file) whenever:

- A new expertise entry is appended to a layer's JSONL log
- A repo ID drift event is detected for a given directory
- The schema version of an existing snapshot does not match the current schema version

A stale or dirty snapshot triggers a synchronous rebuild on the next `read_expertise` call.
If the rebuild fails, the last-known-good snapshot is retained with a stale warning in the
tool result (existing behavior, preserved for both layers).
