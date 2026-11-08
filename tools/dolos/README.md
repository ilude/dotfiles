# Dolos

Dolos is the repository-owned private archive utility. It encrypts the ignored plaintext `private/` vault into the tracked `.dolos/artifacts/private.tar.gz.age` artifact and prevents unsafe private paths from being committed.

## Ownership

Dolos belongs in this dotfiles repository because its commands, metadata, Git hook, installer, and Pi private-store workflow share one repository contract. It is not an Onclave service.

## Layout

- `main.go` and `internal/` - Go command implementation and tests.
- `Dockerfile` - cross-platform release builder.
- `build.sh` - builds one selected platform artifact through Docker and copies it to the repository `bin/` directory.
- `../../bin/dolos.exe` - ignored Windows runtime binary.
- `../../bin/dolos` - ignored Unix runtime binary when built for a Unix target.
- `~/.local/bin/dolos[.exe]` - installer-managed shared command used by linked worktrees and direct Herdr Pi launches.
- `../../.dolos/` - tracked recipient metadata and encrypted private archive.
- `../../private/` - ignored plaintext vault.

Do not commit generated binaries or plaintext private data. The dotfiles installer refreshes the shared command from the lasting checkout. On Unix it creates a symlink; on Windows it copies the executable because ordinary symlink creation may require extra privileges. The pre-commit hook prefers a checkout-local binary and falls back to `dolos` on `PATH`.

## Build

Build for the current host with Go 1.26 or newer:

```bash
cd tools/dolos
go build -o ../../bin/dolos .
```

On Windows, use `../../bin/dolos.exe` as the output name.

Build a selected target through Docker:

```bash
cd tools/dolos
./build.sh windows-amd64
```

Run `./build.sh --help` for the six supported platform names. Help and invalid arguments do not start Docker. Without a target argument, the script honors `GOOS`/`GOARCH` or detects the host. The Docker builder uses Go 1.27.3 and builds the existing six-platform matrix before exporting the selected binary.

## Sync and overwrite behavior

Commands work from the repository root or a nested directory. State and exclusive locks are private to each Git worktree.

`dolos status` distinguishes the sync direction:

| Status | Meaning | Next action |
| --- | --- | --- |
| `clean` | Plaintext and artifact match the last successful sync | No sync needed |
| `plain-changed` | Only plaintext changed | Pack to update the archive |
| `artifact-changed` | Only the artifact changed, such as after pulling | Unpack to restore it |
| `diverged` | Both sides changed | Preserve and compare both before choosing a direction |
| `untracked` / `no-index` | There is no trusted sync baseline | Inspect existing data and explicitly choose pack or unpack |

Clean status exits 0; other sync states exit 4. Read, validation and operational failures exit 1. Usage and repository-discovery errors exit 2, and unsafe staged paths exit 3. If `private/` is missing and an artifact exists, the next-step guidance recommends unpacking without `--force`, even when the trusted baseline makes the missing plaintext count as `plain-changed`.

`pack private` is an explicit choice to replace the artifact with current plaintext. It validates the candidate and refuses publication if the source or previous artifact changes during the operation. The index records the manifest actually archived. With `--verify-identity KEY`, the candidate must decrypt and validate before the existing artifact or index is replaced.

`unpack private --identity KEY` refuses to replace local plaintext that changed since the last sync, or existing plaintext without a trusted index. Preserve those files first. Use `--force` only when intentionally discarding them:

```bash
dolos unpack private --identity ~/.ssh/id_ed25519 --force
```

Unpack validates in Git-private scratch before replacing `private/`. An existing `private.bak` is never silently deleted: inspect and move it before retrying. The temporary backup path is ignored by Git and blocked by staged-path scanning.

Packing rejects symlinks, junctions and other non-regular entries instead of omitting or following them. Names must be safe on the supported Windows and Unix platforms; ordinary Unicode and names such as `draft..md` are allowed. The top-level `.dolos-manifest.json` name is reserved. Both packing and extraction enforce the same limits: 10,000 regular files, 100 MiB per file, 512 MiB total file data, and a 1 MiB JSON manifest. The manifest limit can be reached before the file-count limit.

## Optional pre-commit hook

`scripts/install-dolos-hook` installs the hook explicitly; changing Dolos does not enable it automatically. The hook always scans staged paths, using lossless Git path output, including quoted/non-ASCII names and `private.bak`.

Where `private/` exists, the hook auto-packs only `plain-changed`. It uses `pack private --if-plain-changed` to recheck that state under the lock. It refuses to choose a direction for changed artifacts, divergence or an unknown baseline. Artifact-only worktrees without `private/` retain scan-only behavior.

Full-index commits, including `git commit -a` and `git commit -i PATH`, can auto-pack; Git's normal `index.lock` used for those commits is accepted. Automatic packing is refused for other alternate-index commits such as `git commit --only PATH`, because staging from that hook can desynchronize the normal index. Pack explicitly, stage the intended artifact and make a full-index commit instead. Clean pathspec commits that need no packing remain allowed.

A lock is never stolen just because it is old. If a process exited without releasing its lock, confirm no Dolos operation is running before manually removing the exact lock identified by the error.

## Validate

```bash
cd tools/dolos
go test ./...
go vet ./...
```

Before committing private content, follow the repository private-store workflow:

```bash
bin/dolos.exe status
bin/dolos.exe pack private
bin/dolos.exe scan --staged
git status --short -- .dolos private
```
