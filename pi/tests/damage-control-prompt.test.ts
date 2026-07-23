import { describe, expect, it, vi } from "vitest";
import {
	classifyDamageControlPrompt,
	damageControlPromptPresentation,
	showDamageControlPrompt,
} from "../extensions/damage-control/prompt.ts";

describe("damage-control approval prompt", () => {
	it.each([
		["git branch -D old", "version-control"],
		["docker compose down", "infrastructure"],
		["aws ec2 terminate-instances", "remote-state"],
		["systemctl disable service", "system-execution"],
		["cat production.tfvars", "sensitive-data"],
		["rm -rf build", "local-state"],
	] as const)("classifies %s as %s", (action, expected) => {
		expect(classifyDamageControlPrompt({ action })).toBe(expected);
	});

	it("classifies generated execution rules without adding categories", () => {
		expect(
			classifyDamageControlPrompt({
				action: "bun -",
				rule: "bun stdin script",
			}),
		).toBe("system-execution");
		expect(
			classifyDamageControlPrompt({
				action: "python -c script",
				rule: "AST analysis",
			}),
		).toBe("system-execution");
	});

	it("uses semantic theme colors for every bounded category", () => {
		expect(damageControlPromptPresentation("local-state")).toMatchObject({
		severity: "critical",
		color: "error",
	});
		expect(damageControlPromptPresentation("infrastructure")).toMatchObject({
		severity: "high",
		color: "warning",
	});
		expect(damageControlPromptPresentation("sensitive-data")).toMatchObject({
		severity: "review",
		color: "accent",
	});
	});

	it("renders a themed TUI prompt with deny selected first", async () => {
		const requestRender = vi.fn();
		const theme = {
			fg: vi.fn((color: string, text: string) => `<${color}>${text}</${color}>`),
			bold: (text: string) => `<bold>${text}</bold>`,
		};
		let rendered = "";
		const custom = vi.fn(async (factory: (...args: any[]) => any) => {
			let selected: "allow" | "deny" | undefined;
			const component = await factory(
				{ requestRender },
				theme,
				{},
				(value: "allow" | "deny") => {
					selected = value;
				},
			);
			rendered = component.render(100).join("\n");
			component.handleInput("\r");
			return selected;
		});
		const confirm = vi.fn();
		const approved = await showDamageControlPrompt(
			{
				mode: "tui",
				ui: { custom, confirm } as any,
			},
			{
				category: "local-state",
				title: "Confirm dangerous command",
				message: "This removes local files.",
			},
		);

		expect(approved).toBe(false);
		expect(confirm).not.toHaveBeenCalled();
		expect(rendered).toContain("[CRITICAL] Local state");
		expect(rendered).toContain("Deny (recommended)");
		expect(rendered).toContain("Allow once");
		expect(theme.fg).toHaveBeenCalledWith("error", expect.any(String));
		expect(requestRender).toHaveBeenCalled();
	});

	it("uses a labeled plain confirmation outside TUI mode", async () => {
		const confirm = vi.fn(async () => true);
		const approved = await showDamageControlPrompt(
			{
				mode: "rpc",
				ui: { confirm } as any,
			},
			{
				category: "infrastructure",
				title: "Confirm dangerous command",
				message: "This changes cluster state.",
			},
		);

		expect(approved).toBe(true);
		expect(confirm).toHaveBeenCalledWith(
			"[HIGH] Infrastructure - Confirm dangerous command",
			"This changes cluster state.",
		);
	});
});
