import { describe, expect, it, vi } from "vitest";
import damageControl, {
	analyzeUnsafeShellEdit,
} from "../extensions/damage-control.ts";
import { listDamageControlEvalEvents } from "../lib/damage-control-eval.ts";

describe("damage-control shell edit guardrail", () => {
	it("blocks mutating Python heredocs and suggests safe tools", async () => {
		for (const command of [
			"python - <<'PY'\nfrom pathlib import Path\nPath('x').write_text('y')\nPY",
			"python - <<'PY'\nopen('x', 'w').write('y')\nPY",
		]) {
			const result = await analyzeUnsafeShellEdit(command);
			expect(result?.block, command).toBe(true);
			expect(result?.reason).toContain('matched "unsafe_shell_edit"');
			expect(result?.reason).toContain("text_edit");
			expect(result?.reason).toContain("structured_edit");
		}
	});

	it("blocks in-place shell editors and truncating cat redirection", async () => {
		for (const command of [
			"sed -i s/a/b/ file",
			"sed --in-place=.bak s/a/b/ file",
			"perl -pi -e s/a/b/ file",
			"cat > file <<'EOF'\ncontent\nEOF",
		]) {
			expect(
				(await analyzeUnsafeShellEdit(command))?.block,
				command,
			).toBe(true);
		}
	});

	it("allows non-mutating shell commands and textual mentions", async () => {
		for (const command of [
			"python - <<'PY'\nprint('read only')\nPY",
			"python - <<'PY'\npattern = 'write_text'\nprint(pattern)\nPY",
			"rg -n 'sed -i|perl -pi|cat >' pi/tests",
			"printf '%s\\n' 'cat > file'",
		]) {
			expect(await analyzeUnsafeShellEdit(command)).toBeUndefined();
		}
	});

	it("records blocks through the damage-control Bash handler", async () => {
		type Handler = (
			event: {
				toolName: string;
				toolCallId?: string;
				input: Record<string, string>;
			},
			ctx: {
				cwd: string;
				hasUI: boolean;
				ui: {
					confirm: ReturnType<typeof vi.fn>;
					notify: ReturnType<typeof vi.fn>;
					setStatus: ReturnType<typeof vi.fn>;
				};
			},
		) => Promise<unknown>;
		const handlers: Handler[] = [];
		damageControl({
			on: vi.fn((name: string, handler: Handler) => {
				if (name === "tool_call") handlers.push(handler);
			}),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		} as unknown as Parameters<typeof damageControl>[0]);
		const [, bashHandler] = handlers;
		if (!bashHandler) throw new Error("Bash handler not registered");

		const result = await bashHandler(
			{
				toolName: "bash",
				toolCallId: "shell-edit-audit",
				input: { command: "sed -i s/a/b/ file" },
			},
			{
				cwd: process.cwd(),
				hasUI: false,
				ui: {
					confirm: vi.fn(),
					notify: vi.fn(),
					setStatus: vi.fn(),
				},
			},
		);

		expect(result).toMatchObject({ block: true });
		expect(
			listDamageControlEvalEvents().find(
				(event) => event.toolCallId === "shell-edit-audit",
			),
		).toMatchObject({
			decisionType: "hard_block",
			rule: "unsafe_shell_edit",
		});
	});
});
