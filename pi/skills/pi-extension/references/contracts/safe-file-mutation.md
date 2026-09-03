# Safe File Mutation

- Scope: `text_edit` owns bounded tracked-text transformations and `structured_edit` owns typed structured-file operations. Native `edit` and `write` remain separate Pi tools but participate in the same instruction-loading boundary.
- Path safety: resolve repository paths canonically. Reject NULs, glob-shaped file arguments, directories, ignored targets, secret-like targets, and symlink escapes. A governed mutation must not escape its repository boundary.
- Text operations: support literal replacement, regular-expression replacement, line-ending normalization, and final-newline enforcement. Validate operation shape and expected match counts before writing. Repeated unchanged exact-match and non-unique native edit failures participate in the existing repeated-tool guard without rewriting the original result, inferring a correction, or retrying.
- Structured operations: parse the complete document, apply typed set/delete operations, serialize deterministically, and fail without mutation when the source or requested operation is invalid.
- Dry run: a dry run reports the proposed result without writing.
- Concurrency: serialize the complete read-modify-write window by canonical file. An aborted caller must not mutate after waiting for the queue.
- Instructions: if the target introduces unseen path-specific instructions, defer the mutation once, deliver those instructions, and require the caller to retry. Changed instruction content may defer a later call again.
- Shell boundary: repository rewrites through shell heredocs, truncating redirection, or in-place stream editors are not substitutes for safe mutation tools and remain subject to damage-control enforcement.
