---
date: 2026-07-27
status: synthesis-complete
---

# Plan Review Synthesis: menos-discovery (reviewed as menos-srv-discovery)

## Provenance note

Seven reviewers were launched through a coordinator agent. The coordinator
exited before collecting them and reported that no reviewer returned and that it
had written this file. Both claims were wrong: six reviewers completed and
routed their reports to the session lead after failing to reach the coordinator,
and no file was written. This synthesis was reconstructed by the session lead
from the reviewers' own reports, with the decisive claims independently
re-verified. The coordinator's own solo analysis is included as a seventh
perspective where it added findings.

## Review Panel

| Reviewer | Role | Findings | Verified |
|---|---|---|---|
| completeness | Completeness and explicitness | 5 | 2 substantive |
| redteam | Adversarial | 3 | 2 CRITICAL |
| outsidebox | Simplicity and approach | 3 | 1 decisive |
| dns | DNS specialist | 9 | 1 MEDIUM, 8 confirmations |
| sre | Operational risk | 3 | 1 HIGH, 1 MEDIUM |
| python | Python and tooling | 3 | 2 HIGH, 1 MEDIUM |
| gitdata | Git and data integrity | 3 | 1 HIGH, 1 MEDIUM |
| coordinator | Solo pass, all domains | 17 | corroborated most |

## Outside-the-Box Assessment

**Verdict: the SRV mechanism was unnecessary. Adopted.**

The reviewer checked whether a fixed hostname beats SRV and found it does
decisively. Independently re-verified by the session lead:

- `menos.<domain>` already exists as an A record in the private
  `values/dns-records.local.json` (1 of 28 A records). Discovery in the DNS
  sense was already solved.
- `menos_server_name` is the deployed convention across the homelab, served by
  Caddy on 443 always.
- Every SRV-specific capability was unused. The plan fixed port 443 and
  hardcoded priority and weight to zero, which is a config knob for values that
  do not vary, forbidden by the plan's own constraints.
- The Alternatives Considered table compared SRV against UDP broadcast,
  hand-placed records, a Primary zone, and joyride-emitted SRV. It never
  compared against a plain hostname convention, which is the alternative that
  wins.

Roughly two thirds of the confirmed defects existed only because of the SRV
machinery. Removing it removed them.

## Bugs (must fix before executing)

Numbered as found. Items marked REMOVED no longer apply after adopting the
hostname convention, and are retained so the reasoning is not re-derived.

1. **CRITICAL - declaring the record armed a live-mutation hazard.** REMOVED.
   Flagged by redteam. Once the SRV entry existed in
   `values/dns-records.local.json`, the next routine `just apply` for any
   unrelated reason would push it live. `technitium-dns.yml` runs
   unconditionally for enabled services and has no dry-run mode. Verified by
   reading `justfile`, `scripts/apply-infra.sh`,
   `scripts/apply-ansible-services.py`, and the playbook.
2. **CRITICAL - `just plan` cannot show a DNS record.** REMOVED. Flagged by
   redteam and the coordinator. `plan-infra.sh` is `tofu plan` only; DNS state
   is not in Terraform state. The acceptance criterion was unsatisfiable.
   Verified: no DNS or Ansible references in `plan-infra.sh`.
3. **CRITICAL - an explicit `:443` in the URL breaks RFC 9421 signing.**
   RETAINED as a design constraint. Flagged by the coordinator, verified
   empirically by the session lead: `signing.py:62` signs `@authority` from
   `urlparse(base).netloc`, giving `host:443`, while httpx strips the default
   port and sends `Host: host`. The signed authority and transmitted Host do not
   match.
4. **CRITICAL - the onramp-vNext grep was unscoped.** RETAINED. Flagged by
   redteam and completeness, who disagreed on the count. Verified: the grep hits
   three files, two of which were outside the task's scope
   (`onramp-generated-service-secrets-prd.md:331`,
   `onramp-personal-paas-redesign-prd.md:62`). redteam was correct;
   completeness found only one.
5. **HIGH - the `DNS_NAME_RE` guard command would false-fail.** REMOVED.
   Flagged by completeness. `DNS_NAME_RE` is line 15 and `TOP_LEVEL_KEYS`, which
   the task required editing, is line 16. Default diff context pulls line 15 in
   as unchanged context, and plain grep cannot distinguish context from changes.
   The criterion would have misdirected a builder into reverting correct work.
6. **HIGH - verification used bare `python`.** RETAINED. Flagged by python.
   Bare `python` resolves to the system interpreter, not the project venv, and
   contradicts the plan's own constraint preferring `uv run`. Verified:
   `uv run pytest` works in `tools/menos-youtube` and 20 tests already pass.
7. **HIGH - `git rm --cached` aborts atomically.** RETAINED. Flagged by the
   coordinator. Verified by dry run: including `migration-staging`, which has
   zero tracked files and is already gitignored, causes
   `fatal: pathspec 'migration-staging' did not match any files` and nothing is
   untracked at all.
8. **HIGH - the untracking scope missed a directory.** RETAINED. Flagged by the
   coordinator. Verified counts: `service-backups` 66, `hermes-backups` 2,
   `backups` 11, `migration-staging` 0. The task covered 68 of 79 tracked
   archive files and omitted `backups/` entirely.
9. **HIGH - untracking silently breaks a documented backup guarantee.**
   RETAINED. Flagged by gitdata. `docs/service-state-backup.md:81` instructs the
   operator to commit and push `values/` after a backup for off-site storage.
   Once those directories are gitignored that instruction silently no-ops, with
   no error surface.
10. **HIGH - the no-commit gate could not detect a commit.** RETAINED. Flagged
    by sre. Both validation gates used `git status --short`, which prints
    nothing for a clean tree, so a violated no-commit constraint reads
    identically to compliance. Fix: capture `git rev-parse HEAD` before and diff
    after.
11. **HIGH - the client tests were not wired into any test command.** RETAINED.
    Flagged by the coordinator. Verified: `make check` contains no reference to
    `tools/`. Note the reviewers missed that `tools/menos-youtube/tests/`
    already exists with a `test_api_config.py`, so the work extends existing
    tests rather than creating them.
12. **MEDIUM - dnspython targets carry a trailing dot.** REMOVED. Flagged by
    python (unverified, correctly downgraded) and the coordinator.
13. **MEDIUM - `record_matches` needed field-specific normalization.** REMOVED.
    Flagged by python, who noted line 217 already does `.rstrip(".")` for CNAME
    and that SRV `target` would need the same while the numeric fields would
    not.
14. **MEDIUM - TTL was never specified for the new record type.** REMOVED.
    Flagged by dns. The existing branches hardcode `"ttl": "300"`; the task
    never said so and no criterion would have caught it.
15. **MEDIUM - `get_api_base()` runs twice per invocation.** RETAINED as a note.
    `get_api_host()` calls it again. Harmless without a network lookup.
16. **MEDIUM - onramp-vNext has uncommitted changes with no baseline.**
    RETAINED. Flagged by sre. Verified: 43 dirty files, which would muddy review
    of the task's own diff.
17. **LOW - a handoff note was stale.** RETAINED. Flagged by sre and the
    coordinator. The note claimed `.dotfiles` had 68 uncommitted changes.

## Hardening Suggestions

1. The staged `git rm --cached` will sit uncommitted indefinitely under the
   repo's do-not-commit rule. A later `git reset --hard`, `git stash`, or
   `git clean` inside `values/` would silently revert it with no data loss.
   Worth a handoff note. (gitdata)
2. The archive-untracking verification could pass on a typo. Asserting the
   expected number of staged deletions is stronger than asserting zero tracked
   files. (coordinator)
3. The wave-and-gate machinery is heavier than the mechanical cleanup tasks it
   wraps. Proportionate for a solo operator bundling decided work, but not
   required. (outsidebox)

## Dismissed Findings

Confirmed correct and not defects:

- Technitium Forwarder zones serve locally declared records. Verified against
  both the production code path and Technitium's own guidance.
- The rejection of a more specific Primary zone was correct; it would answer
  NXDOMAIN rather than falling through.
- SRV field order matches RFC 2782, and the API parameters were correct.
- `DNS_NAME_RE` genuinely rejects underscore labels, and the instruction not to
  loosen it was right.
- `zone_for()` handles underscore-prefixed names correctly by suffix matching.
- The archive untracking causes no data loss, requires no history rewrite,
  cannot be staged accidentally from the parent, and breaks no restore path.
  Restore procedures read the filesystem directly, not git.
- `values/` is a plain nested repository, not a submodule, and is gitignored by
  the parent.
- Nearly every file path and line citation in the plan checked out verbatim.
  Two were off by a few lines and one described work already done.

## Positive Notes

Multiple reviewers independently remarked that the plan was unusually
well-grounded, with almost every file path, line number, and command name
matching the live repositories. The substantive failures were not in the
research but in two places: the verification commands, several of which would
have produced false passes or false failures against correct work, and the
choice of mechanism, which the simplicity reviewer overturned.

The single most valuable finding came from asking whether the work was necessary
at all, not from checking whether it was correct.
