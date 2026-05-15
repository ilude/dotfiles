# Archive preflight evidence
Command: git status --short; git diff --check; rg secret patterns under intended changed files
Cwd: /c/Users/mglenn/.dotfiles
## git status --short
 M pi/extensions/README.md
 M pi/extensions/commit-guard.ts
 M pi/extensions/workflow-commands.ts
 M pi/lib/commit/message.ts
 M pi/prompt-routing/uv.lock
 M pi/tests/commit-guard.test.ts
 M pi/tests/commit-message.test.ts
 M pi/tests/damage-control.test.ts
 M pi/tests/workflow-commands-pure.test.ts
?? .specs/pi-dc-runtime-guard/
## git diff --check
## secret-pattern scan intended files only
pi/extensions/README.md:144:- These tools enforce repo containment, reject `.env`/secret-like and gitignored targets, provide bounded dry-run/previews, and make expected match counts explicit.
pi/extensions/README.md:202:Safe live smoke tests must use a disposable temp repo, synthetic sentinel `.env`/key-like paths, or temporary test-only rules. Do not execute shell reads against real `.env`, SSH private keys, `*.pem`, or `*.key` files. If runtime source is not the same symlink/inode/checksum as this repo, rerun the dotfiles link/install flow or otherwise sync before live smoke. Linux-only ask rules such as `docker compose down` should be validated with unit tests on Windows/macOS unless a temporary non-destructive ask rule is used.
pi/tests/damage-control.test.ts:278:    regex: "\\\\b(?:cat|sed|awk|head|tail|base64)\\\\b[^|;&]*(?:\\\\.env\\\\b)"
pi/tests/damage-control.test.ts:286:			"cat .env >/dev/null",
pi/tests/damage-control.test.ts:617:function sshKeyPath(name = "id_ed25519"): string {
pi/tests/damage-control.test.ts:634:		".env",
pi/tests/damage-control.test.ts:638:		it("blocks read on ~/.ssh/id_ed25519", async () => {
pi/tests/damage-control.test.ts:739:		it("blocks read on .env even with confirm available", async () => {
pi/tests/damage-control.test.ts:743:				repoPath(".env"),
pi/tests/damage-control.test.ts:752:		it("blocks ls on .env (metadata tool but non-ssh pattern still blocks)", async () => {
pi/tests/damage-control.test.ts:756:				repoPath(".env"),
pi/tests/damage-control.test.ts:785:			[".env", false],
pi/tests/damage-control.test.ts:802:		const oldDebug = process.env.PI_DAMAGE_CONTROL_DEBUG;
pi/tests/damage-control.test.ts:803:		delete process.env.PI_DAMAGE_CONTROL_DEBUG;
pi/tests/damage-control.test.ts:804:		mod.debugLog("debug default", { value: `pass${"word"}=fake-value .env` });
pi/tests/damage-control.test.ts:807:		process.env.PI_DAMAGE_CONTROL_DEBUG = "1";
pi/tests/damage-control.test.ts:809:			value: `pass${"word"}=fake-value tok${"en"}=fake-query Authorization: Bearer fakebearer .env id_ed25519 fake.pem`,
pi/tests/damage-control.test.ts:817:		if (oldDebug === undefined) delete process.env.PI_DAMAGE_CONTROL_DEBUG;
pi/tests/damage-control.test.ts:818:		else process.env.PI_DAMAGE_CONTROL_DEBUG = oldDebug;
pi/tests/damage-control.test.ts:827:				"cat synthetic.env >/dev/null",
pi/tests/damage-control.test.ts:916:			{ toolName: "bash", input: { command: "cat synthetic.env" } },
pi/tests/damage-control.test.ts:921:			{ toolName: "read", input: { path: "~/.ssh/id_ed25519" } },
.specs/pi-dc-runtime-guard\plan.md:27:- Do not edit or read secret-bearing files (`*.env`, SSH keys, `*.pem`, `*.key`) as part of testing or evidence collection.
.specs/pi-dc-runtime-guard\plan.md:309:   - Command: `git status --short; git diff --check; grep -R -n -E "(AKIA[0-9A-Z]{16}|token=|api[_-]?key=|BEGIN [A-Z ]*PRIVATE KEY|\.env|id_ed25519|id_rsa)" -- pi .specs/pi-dc-runtime-guard || true`
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:446:claude\hooks\damage-control\tests\test_context_detection.py::TestDocumentationContextDetection::test_edit_tool_context_detection[.env.md-documentation] PASSED [ 12%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1033:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_safe_commands_detected[ssh -i ~/.ssh/id_ed25519 user@host] PASSED [ 91%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1038:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_safe_commands_detected[stat ~/.ssh/id_rsa] PASSED [ 91%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1039:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_safe_commands_detected[file ~/.ssh/id_rsa.pub] PASSED [ 92%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1040:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_safe_commands_detected[ssh-keygen -l -f ~/.ssh/id_ed25519] PASSED [ 92%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1043:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_unsafe_commands_not_detected[cat ~/.ssh/id_rsa] PASSED [ 92%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1045:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_unsafe_commands_not_detected[cp ~/.ssh/id_rsa /tmp/stolen] PASSED [ 92%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1047:claude\hooks\damage-control\tests\test_ssh_safe_commands.py::TestIsSSHSafeCommand::test_unsafe_commands_not_detected[base64 ~/.ssh/id_rsa] PASSED [ 93%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1070:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshUseCommandsSilentAllow::test_use_command_against_ssh_pattern_not_blocked[ssh -i ~/.ssh/id_ed25519 user@host] PASSED [ 96%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1074:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshUseCommandsSilentAllow::test_use_command_against_ssh_pattern_silent_not_ask[ssh -i ~/.ssh/id_ed25519 user@host] PASSED [ 96%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1078:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshInspectCommandsAsk::test_inspect_against_ssh_pattern_asks[ls ~/.ssh/id_rsa] PASSED [ 97%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1079:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshInspectCommandsAsk::test_inspect_against_ssh_pattern_asks[stat ~/.ssh/id_rsa] PASSED [ 97%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1080:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshInspectCommandsAsk::test_inspect_against_ssh_pattern_asks[file ~/.ssh/id_rsa.pub] PASSED [ 97%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1085:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshInspectCommandsAsk::test_inspect_against_non_ssh_zero_access_still_blocks[ls .env] PASSED [ 98%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1087:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshInspectCommandsAsk::test_inspect_against_non_ssh_zero_access_still_blocks[stat .env] PASSED [ 98%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1088:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestSshInspectCommandsAsk::test_inspect_against_non_ssh_zero_access_still_blocks[file .env] PASSED [ 98%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1090:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestContentLeakStillBlocked::test_content_read_blocked[cat ~/.ssh/id_rsa] PASSED [ 98%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1093:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestContentLeakStillBlocked::test_content_read_blocked[cp ~/.ssh/id_rsa /tmp/stolen] PASSED [ 99%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1096:claude\hooks\damage-control\tests\test_ssh_use_inspect_split.py::TestContentLeakStillBlocked::test_content_read_blocked[base64 ~/.ssh/id_rsa] PASSED [ 99%]
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1318:     [33m[2m✓[22m[39m rejects .env, gitignored, glob, and symlink escape paths [33m 1889[2mms[22m[39m
.specs/pi-dc-runtime-guard\evidence\repo-validation.md:1349:     [33m[2m✓[22m[39m rejects .env and unsupported formats [33m 1163[2mms[22m[39m
.specs/pi-dc-runtime-guard\evidence\wave-validation.md:129:pi/README.md:116:For live smoke tests, restart/reload Pi so extension modules and policy files reload, then use a disposable temp repo with synthetic sentinel files or temporary test-only rules. Never execute shell reads against real `.env`, SSH keys, `*.pem`, or `*.key` files. On Windows/macOS, Linux-only ask rules such as `docker compose down` are best validated with deterministic Vitest tests or a temporary non-destructive ask rule.
.specs/pi-dc-runtime-guard\evidence\wave-validation.md:133:pi/extensions/README.md:202:Safe live smoke tests must use a disposable temp repo, synthetic sentinel `.env`/key-like paths, or temporary test-only rules. Do not execute shell reads against real `.env`, SSH private keys, `*.pem`, or `*.key` files. If runtime source is not the same symlink/inode/checksum as this repo, rerun the dotfiles link/install flow or otherwise sync before live smoke. Linux-only ask rules such as `docker compose down` should be validated with unit tests on Windows/macOS unless a temporary non-destructive ask rule is used.
.specs/pi-dc-runtime-guard\review-1\security-reviewer.md:27:  evidence: "T1/T4 allow evidence notes under `.specs/.../evidence/*.md` copied from source/terminal output. The plan only forbids `.env`/keys, but grep over arbitrary upstream paths and terminal output could capture absolute home paths, internal repo paths, or command arguments without redaction rules."
Exit code: 0
Conclusion: preflight passed. Status includes pre-existing unrelated modified files plus intended plan files; secret scan hits are documentation/test literals only, not secret values.
