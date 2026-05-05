# Sandboxed agent runtimes

## Idea

Run risky or long-lived agent work in isolated environments with explicit file/process boundaries.

## Seen in

- ../projects/daytona.md
- ../videos/smart-pi-daytona-convex-video.md

## Useful primitives

- Create sandbox.
- Upload/input files.
- Run command or code.
- Read generated files.
- Download artifacts.
- Snapshot or destroy sandbox.

## KISS version for Pi

Use the local machine for trusted dotfiles work. Use a sandbox when:

- The repo is unknown.
- The code may execute untrusted dependencies.
- The task may run for a long time.
- The result needs a clean reproducible environment.
- Browser/computer-use automation needs isolation.

## Safety defaults

- No host secrets mounted by default.
- Network access explicit.
- Artifact export explicit.
- Budget/time limits explicit.
