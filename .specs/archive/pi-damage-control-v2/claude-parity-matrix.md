# Claude/Pi Damage-Control Parity Matrix

Pi damage-control is a Pi-native port of the Claude hook intent, not a line-for-line runtime copy. This matrix bounds V2 coverage.

| Family | Decision | Pi V2 coverage | Rationale |
|---|---|---|---|
| destructive `rm`/`git reset --hard`/`git clean -f`/force push | port-now | regex rules and registered handler tests | high data-loss risk |
| Linux container teardown prompts | port-now | ask rules for `docker compose down`/`docker down` on Linux | operational disruption risk with valid use cases |
| shell wrappers (`bash -c`, `sh -c`) | port-now | wrapper regexes that expose destructive payloads | common bypass path |
| interpreter wrappers (`python -c`, `node -e`) | port-now | destructive and secret-read regexes | common bypass path |
| secret reads (`.env`, SSH keys, PEM/key material) | port-now | file-tool zero access plus shell reader command rules | prevents accidental secret exposure |
| IMDS/metadata access | port-now | blocks obvious cloud metadata endpoints | credential exfil risk |
| secret-to-network pipelines | port-now | blocks obvious local-secret plus network-sink commands | exfil risk |
| complete shell parsing/AST equivalence | defer | tokenizer remains conservative regex/string matching | needs larger parser design |
| full Claude hook internals and Python implementation details | reject | Pi uses extension APIs, status, permissions, and doctor surfaces | native integration is the target |
| shared neutral policy schema | defer | documented follow-up | useful after Pi behavior is hardened |
