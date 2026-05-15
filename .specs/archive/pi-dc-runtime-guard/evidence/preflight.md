# Preflight evidence
Command: mkdir -p .specs/pi-dc-runtime-guard/evidence; export PI_MONO_DIR="${PI_MONO_DIR:-C:/Projects/Personal/pi-mono}"; git status --short; test -f pi/tests/damage-control.test.ts; test -d "$PI_MONO_DIR"
Cwd: /c/Users/mglenn/.dotfiles
PI_MONO_DIR: C:/Projects/Personal/pi-mono
 M pi/extensions/commit-guard.ts
 M pi/extensions/workflow-commands.ts
 M pi/lib/commit/message.ts
 M pi/prompt-routing/uv.lock
 M pi/tests/commit-guard.test.ts
 M pi/tests/commit-message.test.ts
 M pi/tests/workflow-commands-pure.test.ts
?? .specs/pi-dc-runtime-guard/
damage-control.test.ts: present
PI_MONO_DIR: present
Exit code: 0
Conclusion: prerequisites present; proceed.
