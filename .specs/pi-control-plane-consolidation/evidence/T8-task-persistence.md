# T8 Task persistence evidence

- Item: T8
- Changes: task writes use temp-file plus atomic rename; legacy records are normalized with defaults; unknown fields are preserved by spreading parsed data during normalization; corrupt/unparseable JSON is ignored.
- Verification: focused task pnpm tests and extension typecheck exited 0.
