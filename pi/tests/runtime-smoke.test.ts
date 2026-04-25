/**
 * Pi runtime smoke checks.
 *
 * The plan in .specs/extensions-consistency/plan.md calls for verifying that
 * shared helper modules under pi/lib/ are NOT auto-discovered as extensions
 * by Pi. Pi auto-discovers top-level *.ts files under pi/extensions/, so the
 * load-bearing invariant is "no helper module from pi/lib/ has a sibling
 * copy at the top level of pi/extensions/."
 *
 * These tests assert that invariant deterministically (faster and more
 * reliable than spawning a full Pi process), plus a few related structural
 * properties that protect against regressions in helper placement.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EXTENSIONS_DIR = path.join(REPO_ROOT, "pi", "extensions");
const LIB_DIR = path.join(REPO_ROOT, "pi", "lib");

function listTopLevelTsFiles(dir: string): string[] {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isFile() && d.name.endsWith(".ts") && !d.name.endsWith(".d.ts"))
		.map((d) => d.name);
}

describe("Pi runtime smoke: helper module placement", () => {
	it("pi/lib/extension-utils.ts exists at the canonical location", () => {
		expect(fs.existsSync(path.join(LIB_DIR, "extension-utils.ts"))).toBe(true);
	});

	it("pi/lib/yaml-mini.ts exists at the canonical location", () => {
		expect(fs.existsSync(path.join(LIB_DIR, "yaml-mini.ts"))).toBe(true);
	});

	it("no helper module from pi/lib/ has a sibling copy in pi/extensions/", () => {
		const libModules = listTopLevelTsFiles(LIB_DIR);
		const extensions = listTopLevelTsFiles(EXTENSIONS_DIR);

		const collisions: string[] = [];
		for (const libFile of libModules) {
			if (extensions.includes(libFile)) collisions.push(libFile);
		}

		expect(collisions).toEqual([]);
	});

	it("pi/extensions/ contains no obviously non-extension top-level files", () => {
		const extensions = listTopLevelTsFiles(EXTENSIONS_DIR);
		// These names would indicate a helper accidentally placed at the top
		// level where Pi would try to auto-discover it.
		const FORBIDDEN_NAMES = new Set([
			"_utils.ts",
			"extension-utils.ts",
			"yaml-mini.ts",
			"yaml-helpers.ts",
			"transcript.ts",
			"expertise-snapshot.ts",
			"model-routing.ts",
			"repo-id.ts",
			"util.ts",
			"utils.ts",
			"helpers.ts",
		]);
		const offenders = extensions.filter((name) => FORBIDDEN_NAMES.has(name));
		expect(offenders).toEqual([]);
	});

	it("scaffold (if present) uses the .ts.example suffix so it is not auto-discovered", () => {
		const scaffold = path.join(EXTENSIONS_DIR, "template.extension.ts");
		const example = path.join(EXTENSIONS_DIR, "template.extension.ts.example");
		const scaffoldExists = fs.existsSync(scaffold);
		const exampleExists = fs.existsSync(example);
		// Either the scaffold does not exist yet, or it must be the .example form.
		expect(!scaffoldExists || exampleExists).toBe(true);
		expect(scaffoldExists).toBe(false);
	});

	it("every top-level *.ts in pi/extensions/ exports a default function", () => {
		const extensions = listTopLevelTsFiles(EXTENSIONS_DIR);
		const missing: string[] = [];
		for (const name of extensions) {
			const text = fs.readFileSync(path.join(EXTENSIONS_DIR, name), "utf-8");
			if (!/export default function\b/.test(text)) missing.push(name);
		}
		expect(missing).toEqual([]);
	});
});
