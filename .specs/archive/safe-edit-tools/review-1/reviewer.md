---
reviewer: reviewer
status: changes_requested
---

## Findings

1. **severity: high**
   - **evidence:** T1 names `pi/extensions/safe-edit.ts` as the likely helper path, but `pi/extensions/README.md` says every top-level `*.ts` is auto-discovered as an extension and explicitly: “Do not put helpers, libraries, or scaffolds at the top level of `pi/extensions/`.”
   - **required_fix:** Move helper target to `pi/lib/safe-edit.ts` or a non-auto-discovered subdirectory, update all file lists, imports, acceptance checks, and rollback paths accordingly.

2. **severity: high**
   - **evidence:** Tool registration verification is grep-only (`name: "text_edit"`, operation names) and can pass with comments, dead code, or an unloaded/non-default-export extension. The README requires a top-level default extension factory for auto-discovery.
   - **required_fix:** Add a runtime registration test or smoke check that loads the extension(s), calls `pi.getAllTools()`/equivalent, and asserts both tools are active with expected schemas.

3. **severity: high**
   - **evidence:** Safety requirements say avoid ignored paths, broad globs, secrets, and `.env`, but implementation criteria only mention rejecting `.env` and directory paths. No explicit rule defines repo-root containment, symlink handling, ignored-file detection, path glob expansion limits, or whether untracked files are allowed.
   - **required_fix:** Specify exact path safety contract: canonicalization against `ctx.cwd`, repo-root containment, symlink behavior, ignored/untracked policy, glob policy/max path count, and secret filename patterns, with negative tests for each required rejection.

4. **severity: medium**
   - **evidence:** `structured_edit` requires “selector/path syntax” but does not define the syntax, escaping, array handling, creating missing parents, delete-missing behavior, duplicate keys, or expected operation ordering. `/do-it` cannot implement interoperable tests without inventing semantics.
   - **required_fix:** Define a minimal JSON path grammar and operation semantics, including arrays, missing paths, replacement vs creation, delete idempotence/failure behavior, ordering, and error messages.

5. **severity: medium**
   - **evidence:** Final gates F1–F5 have no instructions for what evidence to write back, and acceptance criteria include future-test placeholders (“covered by T5 tests”) before T5 exists. `/do-it` may mark gates complete based on weak grep checks without recording durable evidence.
   - **required_fix:** Require checklist evidence fields to include exact commands, exit status, and test names/files. Replace placeholder validations with explicit checks or state that they remain unchecked until specific T5 tests exist and pass.
