# Python encryption script correctness review

## 1. Severity: High — stale encrypted outputs are not specified as a required invariant

**evidence:** The plan selects per-file artifacts and notes that “deletes/renames need explicit stale-output handling decisions,” but T1 acceptance only verifies that encrypt creates `.encrypted/a/note.txt.age` and decrypt restores it. No task or test requires removing `.encrypted/<old>.age` when `private/<old>` is deleted/renamed.

**required_fix:** Add an explicit stale-output policy and tests. Recommended: during encryption, compute the expected `.encrypted/**/*.age` set from current regular `private/**` files and remove stale `.age` files that no longer correspond to a plaintext source, while never touching non-`.age` files. Add pytest coverage for delete and rename so decrypting after encryption cannot resurrect removed private files.

## 2. Severity: High — partial encryption failure can leave a mixed generation staged by the hook

**evidence:** T2 requires the hook to run `private-archive-encrypt` and then `git add -- .encrypted`, but the plan does not require encryption to be all-or-nothing across multiple files. T1 only verifies a single-file success path. If age fails after some files are updated, `.encrypted/` can contain a mix of new, old, and missing artifacts; a subsequent hook/stage may commit an inconsistent private snapshot.

**required_fix:** Require the encrypt script to write all outputs into a temporary mirror of `.encrypted/`, complete every `age` subprocess successfully, then atomically promote the generated set or abort without modifying/staging `.encrypted/`. If full directory atomic replacement is too risky, require a manifest/generation check and make the hook refuse to stage after any failed encrypt. Add a multi-file test where the second encryption fails and assert no partial encrypted output is staged or left as the apparent current state.

## 3. Severity: Medium — symlink/device handling is under-specified for directory traversal

**evidence:** T1 says “each regular file under `private/`” but acceptance criteria only use a normal nested file. The existing tar helper rejected symlinks/devices, but the per-file plan does not require tests for symlinked files, symlinked directories, FIFOs/devices, or traversal escaping via symlinked directories. Python `Path.rglob()` plus `is_file()` behavior differs for symlinks and can include symlink-to-file unless explicitly excluded before regular-file checks.

**required_fix:** Specify and test refusal/skip behavior for: symlink to file, symlink to directory, FIFO/device where supported, and nested normal files. Implementation should use `Path.is_symlink()` before `is_file()`, avoid following symlinked directories, and only encrypt regular files whose resolved path remains under the resolved `private/` root.

## 4. Severity: Medium — Windows path and filename edge cases are not in the verification contract

**evidence:** The plan’s target platform is Windows Git Bash/MSYS2, but T1/T3 only verify POSIX-style paths (`private/a/note.txt`). Decrypt path safety mentions nested paths generally, yet no test covers backslash normalization, absolute/drive-like names, `.age` suffix stripping for names such as `file.age`, or case-collision behavior on case-insensitive filesystems.

**required_fix:** Add path-safety pytest cases that construct `.encrypted` entries with suspicious relative names and verify decrypt rejects escapes and handles legitimate names deterministically. Include at minimum nested paths, `file.age` plaintext becoming `file.age.age`, backslash-containing archive paths if creatable, `..`, absolute/drive-like path strings, and case collisions documented as either refused or deterministic on Windows.

## 5. Severity: Medium — subprocess/tool failure behavior is not testable enough

**evidence:** T1 acceptance uses real `age` happy paths only. The plan requires fail-safe missing recipients, but does not require tests for missing `age`, invalid recipients, nonzero decrypt, stderr preservation, or ensuring no output file is promoted after `subprocess.CalledProcessError`.

**required_fix:** Add injectable command execution or PATH-based fake `age` fixtures so pytest can force subprocess failures. Tests should assert nonzero exit, useful error text, no committed/promoted output on encrypt failure, no partially restored `private/` on decrypt failure, and safe status output when recipients are comments-only or the tool is absent.
