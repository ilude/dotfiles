# Scoped project instructions

The default-profile `scoped-instructions` extension adds project guidance from `.pi/instructions/` to tool results when an explicit tool-call path matches. Put instruction files in that directory, rather than relying on nested `AGENTS.md` files:

```text
.pi/instructions/
  general.md
  frontend.md
  operations/release.md
```

Files are discovered recursively; any filename ending in `.md` is eligible. A file without frontmatter applies to every target in its owning scope. Optional YAML frontmatter can narrow it with one string `applyTo` glob, relative to the directory that contains its `.pi` directory:

```markdown
---
applyTo: src/**/*.ts
---

Use the repository's typed service boundaries.
```

Patterns use normalized forward-slash paths. `*` and `?` match within one path segment; `**` can span segments, and `**/` also matches zero directories. Invalid frontmatter or a non-string/empty `applyTo` is skipped with a bounded warning, not widened to a global rule.

## Scope and delivery

The extension searches `.pi/instructions` roots in ancestors of the session working directory and discovers additional nested roots from explicit target paths. The outermost discovered root establishes the trusted session boundary; Git repositories, nested repositories, and submodules do not change scope. If outer and nested roots both match, their instructions are additive: outer roots first, then nested roots, with files ordered by relative path. Each glob is evaluated relative to its own root's owner. Source markers and injected ordering use stable boundary-relative paths, not absolute machine paths.

Only paths in tool-call arguments activate instructions. Structured path-bearing Pi tools and custom tools using string `path`, `file_path`, or `workdir` fields are supported. Bash and PowerShell use bounded best-effort extraction of literal path arguments and navigation targets. This is not shell interpretation: variables, computed expressions, scripts, subprocesses, and many shell constructs are not discovered. Paths appearing only in tool output, including grep/search results, do not activate instructions.

The operation always runs normally. After the result, newly applicable instruction bodies are appended as one text block after the original result content, for successful and failed calls alike. This includes first-touch edits, writes, and mutating shell commands, so the model sees guidance before its next decision, not before the operation that first exposed the path. The extension does not block mutations or enforce access control. It leaves the original result status, details, and usage unchanged.

A source is delivered once while its tagged contribution remains in active model-visible context. Delivery state is reconstructed from Pi's compaction-aware context after resume/reload and tree navigation. Branches without that contribution can receive it; retained compacted contributions remain delivered, while instructions removed from active context become eligible again. The file body is read at activation time. Changes after delivery do not replace the already-delivered copy during that session; start a new session to activate the changed body. Empty, deleted, or unreadable files are skipped with a bounded warning and may be tried on a later matching call.

The extension is inert when Pi reports the project as untrusted. Nested roots beneath the trusted session boundary do not prompt for separate trust decisions. Injection content and ordering are deterministic; this preserves the earlier prompt prefix by placing guidance in a tool-result suffix, but does not itself establish provider cache hits or savings.
