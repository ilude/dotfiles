# Daytona

Repo: https://github.com/daytonaio/daytona  
Docs: https://www.daytona.io/docs

## What it is

Secure, elastic infrastructure for running AI-generated code and agent workflows in isolated sandboxes.

## Concrete implementation details

- Sandboxes are full isolated computers with filesystem, network stack, vCPU, RAM, and disk.
- Fast sandbox creation, advertised as sub-90ms.
- Supports Python, TypeScript, and JavaScript execution.
- SDKs/API/CLI for lifecycle, filesystem, process execution, and runtime configuration.
- Snapshots support persistent agent operations across sessions.
- Includes MCP server and computer-use docs.

## Source video

- ../videos/smart-pi-daytona-convex-video.md

## Patterns

- ../patterns/sandboxed-agent-runtimes.md

## KISS takeaways for Pi

- Use local execution by default.
- Use Daytona-like sandboxes only for risky code, unknown repos, long-running tasks, or reproducible demos.
- Define a small sandbox contract: create, upload files, run command, fetch artifacts, destroy/snapshot.
