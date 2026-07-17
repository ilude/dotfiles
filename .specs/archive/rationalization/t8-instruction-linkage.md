# T8 instruction linkage decision

Status: approved and executed

## Problem

`test/test_pi_agent_metadata.py::test_pi_instructions_are_canonical_source_for_shared_client`
requires `claude/CLAUDE.md` to be a symlink to `pi/AGENTS.md`.

Current repository instructions state that the two files are independent, and
commit `1601e21` split the shared file from the Pi instructions. The retained
T8 ledger decision is therefore stale and contradicts current repository state.

## Goal

Resolve the stale test without undoing an intentional client ownership split or
expanding T8 beyond its test-rationalization scope.

## Options

1. Delete the stale linkage test and record accepted loss. This matches current
   ownership and avoids testing a retired deployment shape.
2. Replace it with a test that asserts both files are independent regular files.
   This protects file layout, but file independence is not runtime behavior.
3. Restore the symlink. This restores the old test contract but contradicts
   current repository instructions and commit `1601e21`.

## Decision

The user selected option 1. The stale linkage test was deleted because the old
symlink is no longer a supported contract, and a replacement layout assertion
would repeat the same test-rationalization problem.
