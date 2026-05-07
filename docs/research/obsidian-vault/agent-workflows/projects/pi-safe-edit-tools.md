---
status: research-note
source: .specs/safe-edit-tools/plan.md
---

# Pi safe edit tools

## Why this matters

Recent session-log review found repeated mutating Python heredoc snippets for tracked repo edits: JSON mutation, bulk string replacement, regex/block replacement, newline normalization, and installed-file patching. These work, but they bypass Pi's auditable tool-call surface and make safety rules harder to enforce.

## Useful signals

- `replace-in-files-cli` (https://github.com/sindresorhus/replace-in-files-cli) shows value in explicit replacement inputs, predictable dry-run behavior, and clear match reporting.
- `sd` (https://github.com/chmln/sd) is a compact model for low-escaping regex/literal replacement.
- `dasel` (https://github.com/TomWright/dasel) and `yq` (https://github.com/mikefarah/yq) show the importance of parser-aware structured edits instead of regexing data files.
- `comby` (https://github.com/comby-tools/comby) and `ast-grep` (https://github.com/ast-grep/ast-grep) are useful future references for syntax-aware rewrites, but they are broader than the current recurring pain.

## Possible Pi fit

Add two first-class tools:

- `text_edit` for literal replacement, regex replacement, LF normalization, final newline enforcement, dry-run previews, and expected match counts.
- `structured_edit` for JSON-first `set` and `delete` operations using typed path arrays, not dot-path strings.

These tools make common Python heredoc edits safer and more reviewable while keeping the implementation small.

## Risks / reasons not to build yet

- A universal edit tool could become another unsafe mutation surface.
- Regex replacement still needs bounded input size and explicit match-count behavior.
- YAML/TOML/AST support should not be added until observed usage proves it is needed.
- Path safety must reject `.env`, secret-like names, ignored files, symlink escapes, outside-repo paths, directories, and globs.

## KISS recommendation

Implement only `text_edit` and JSON-first `structured_edit` now, plus a guardrail that warns/block common mutating shell patterns such as Python heredocs, `sed -i`, `perl -pi`, and `cat >`. Defer AST/code rewrite tooling until there is repeated syntax-sensitive demand.

## Related notes

- [Agent workflow research index](../index.md)
