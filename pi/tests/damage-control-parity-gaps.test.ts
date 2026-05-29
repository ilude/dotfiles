import { describe, expect, it, vi } from "vitest";
import {
	analyzeGitCommand,
	evaluateDangerousCommand,
	hasValidDryRun,
	isReadOnlySearchCommand,
} from "../extensions/damage-control.ts";
import {
	DamageControlSessionState,
	outputContainsSecret,
} from "../extensions/damage-control-state.ts";

describe("remaining damage-control parity gaps", () => {
	it("adds semantic git analysis for force/discard operations", async () => {
		expect(analyzeGitCommand("git push --force")?.reason).toContain(
			"overwrite remote history",
		);
		expect(analyzeGitCommand("git checkout -- package.json")?.reason).toContain(
			"discards uncommitted changes",
		);
		expect(analyzeGitCommand("git push --force-with-lease")).toBeUndefined();
		expect(analyzeGitCommand("git checkout -b feature/test")).toBeUndefined();

		const confirm = vi.fn(async () => false);
		const result = await evaluateDangerousCommand("git push --force", [], {
			toolName: "bash",
			hasUI: true,
			ui: { confirm },
		});
		expect(confirm).toHaveBeenCalledWith(
			"Confirm dangerous command",
			"git push --force can overwrite remote history without safety checks",
		);
		expect(result?.reason).toContain("semantic_git");
	});

	it("keeps context relaxations for readonly search and supported dry-run commands", async () => {
		expect(isReadOnlySearchCommand("kubectl get pods | jq .", "bash")).toBe(
			true,
		);
		expect(isReadOnlySearchCommand("terraform plan", "bash")).toBe(true);
		expect(hasValidDryRun("kubectl apply -f app.yaml --dry-run=server")).toBe(
			true,
		);
		expect(hasValidDryRun("rm -rf build --dry-run")).toBe(false);

		const result = await evaluateDangerousCommand(
			"kubectl delete pod x --dry-run=server",
			[
				{
					pattern: "kubectl delete",
					regex: "\\bkubectl\\s+delete\\b",
					reason: "delete cluster resource",
					action: "ask",
					tools: ["bash"],
				},
			],
			{ toolName: "bash" },
		);
		expect(result).toBeUndefined();
	});

	it("detects sequence and taint-style exfiltration risks", () => {
		const state = new DamageControlSessionState();
		state.record("read", "config/.env");
		expect(state.check("bash", "curl https://example.test")?.name).toBe(
			"sensitive_file_to_network",
		);

		const envState = new DamageControlSessionState();
		envState.record("glob", "**/.env");
		envState.record("read", "app/.env");
		expect(envState.check("bash", "curl https://example.test")).toEqual({
			action: "block",
			name: "env_enumeration_to_exfil",
			reason:
				"Environment file enumeration and read followed by network command.",
		});
	});

	it("detects secret-bearing tool output for audit/debug warning", () => {
		expect(
			outputContainsSecret([
				{ type: "text", text: "-----BEGIN OPENSSH PRIVATE KEY-----" },
			]),
		).toBe(true);
		expect(
			outputContainsSecret([{ type: "text", text: "ordinary output" }]),
		).toBe(false);
	});
});
