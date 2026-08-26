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
- `../../.dolos/` - tracked recipient metadata and encrypted private archive.
- `../../private/` - ignored plaintext vault.

Do not commit generated binaries or plaintext private data.

## Build

Build for the current host with Go:

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

Run `./build.sh --help` for the supported platform names.

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
