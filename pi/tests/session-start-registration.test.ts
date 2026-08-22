import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function extensionFiles(root: string): string[] {
	const files: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const directory = stack.pop();
		if (!directory) continue;
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) stack.push(fullPath);
			else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(fullPath);
		}
	}
	return files;
}

describe("session_start registration policy", () => {
	it("routes every extension session_start handler through onSessionStart", () => {
		const extensionRoot = path.resolve(import.meta.dirname, "../extensions");
		const violations = extensionFiles(extensionRoot)
			.filter((filePath) =>
				/\.on\(\s*["']session_start["']\s*,/.test(
					fs.readFileSync(filePath, "utf8"),
				),
			)
			.map((filePath) => path.relative(extensionRoot, filePath).replace(/\\/g, "/"))
			.sort();
		expect(violations).toEqual([]);
	});
});
