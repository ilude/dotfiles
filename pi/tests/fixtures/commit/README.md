# Commit fixtures

Commit mutation tests use disposable real Git repositories created under the OS temp directory. Fixture expectations cover:

- confirmation token required for `commit_stage`, `commit_create`, and future `commit_push` mutation
- final staged-set revalidation immediately before `commit_create`
- no force-add of ignored files
- `commit_create` reports committed state with `pushed: false`

`commit_push` is deferred; when implemented it must add explicit upstream/ref/rejection tests here before any push-capable tool ships.
