/**
 * Behavioral tests for quality-gates.ts.
 *
 * Covers a forced validation failure and a clean run after changed files
 * are collected during tool execution and validated when the agent settles.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	buildExtMap,
	buildValidatorCommand,
	filterNetChangedFiles,
	filterValidatorsByDetection,
	findProjectRoot,
	getFilePath,
	getFilePaths,
	matchesQualityPath,
	POLICY_PATH,
	registerQualityGates,
	runAvailableValidators,
	runFirstAvailableValidator,
} from "../extensions/quality-gates.ts";
import {
	evaluateDifferentialLizard,
	LIZARD_THRESHOLDS,
	parseGitDiffLineMapper,
	parseLizardCsv,
} from "../lib/quality-gates/lizard.ts";
import {
	loadQualityGatesPolicy,
	parseQualityGatesPolicy,
} from "../lib/quality-gates/policy.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

const metricsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-metrics-"));
let previousMetricsDir: string | undefined;

beforeAll(() => {
	previousMetricsDir = process.env.PI_METRICS_DIR;
	process.env.PI_METRICS_DIR = metricsDir;
});

afterAll(() => {
	if (previousMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = previousMetricsDir;
	fs.rmSync(metricsDir, { recursive: true, force: true });
});

describe("quality-gates extension", () => {
	describe("buildExtMap (pure function)", () => {
		it("maps each extension to its language config", () => {
			const config = {
				python: {
					extensions: [".py"],
					validators: [{ name: "ruff", command: ["ruff", "check", "{file}"] }],
				},
				typescript: {
					extensions: [".ts", ".tsx"],
					validators: [
						{ name: "biome", command: ["biome", "check", "{file}"] },
					],
				},
			};
			const map = buildExtMap(config);
			expect(map.has(".py")).toBe(true);
			expect(map.has(".ts")).toBe(true);
			expect(map.has(".tsx")).toBe(true);
			expect(map.get(".py")?.validators[0].name).toBe("ruff");
			expect(map.get(".ts")?.validators[0].name).toBe("biome");
		});

		it("returns an empty map when given no language configs", () => {
			expect(buildExtMap({}).size).toBe(0);
		});

		it("skips language entries that have no extensions array", () => {
			const config = { broken: { validators: [] } } as unknown as Parameters<
				typeof buildExtMap
			>[0];
			expect(buildExtMap(config).size).toBe(0);
		});
	});

	describe("validator command resolution", () => {
		it("finds a project root from a glob marker", () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-root-"));
			try {
				fs.writeFileSync(path.join(root, "Example.csproj"), "<Project />\n");
				const filePath = path.join(root, "src", "Example.cs");
				fs.mkdirSync(path.dirname(filePath), { recursive: true });
				fs.writeFileSync(filePath, "namespace Example;\n");

				expect(findProjectRoot(filePath, ["*.csproj"])).toBe(root);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("replaces file and project-root placeholders", () => {
			expect(
				buildValidatorCommand(
					["dotnet", "format", "{project_root}", "--include", "{file}"],
					"/repo/src/Example.cs",
					"/repo",
				),
			).toEqual([
				"dotnet",
				"format",
				"/repo",
				"--include",
				"/repo/src/Example.cs",
			]);
		});

		it("selects detected and always-applicable validators", () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-detect-"));
			try {
				fs.writeFileSync(path.join(root, "tsconfig.json"), "{}\n");
				const detected = {
					name: "tsc",
					command: ["tsc"],
					detectAll: ["tsconfig.json"],
				};
				const always = {
					name: "lizard",
					command: ["lizard"],
					always: true as const,
				};

				expect(filterValidatorsByDetection([detected, always], root)).toEqual([
					detected,
					always,
				]);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});
	});

	it("supports any-file and all-files detection", () => {
		const root = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-quality-detect-mode-"),
		);
		try {
			fs.writeFileSync(path.join(root, "biome.json"), "{}\n");
			fs.writeFileSync(path.join(root, "tsconfig.json"), "{}\n");
			const any = {
				name: "any",
				command: ["any"],
				detectAny: ["biome.json", "biome.jsonc"],
			};
			const all = {
				name: "all",
				command: ["all"],
				detectAll: ["tsconfig.json", "tsc-check.py"],
			};
			expect(filterValidatorsByDetection([any, all], root)).toEqual([any]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("runs every available applicable validator", async () => {
		const pi = {
			exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		} as unknown as ExtensionAPI;
		const language = {
			extensions: [".all"],
			validators: [
				{ name: "detected", command: ["detected"], detectAll: ["missing"] },
				{ name: "always-one", command: ["always-one"], always: true as const },
				{ name: "always-two", command: ["always-two"], always: true as const },
			],
		};
		await runAvailableValidators(pi, language, "file.all");
		expect(pi.exec).toHaveBeenCalledWith("always-one", [], expect.any(Object));
		expect(pi.exec).toHaveBeenCalledWith("always-two", [], expect.any(Object));
		expect(pi.exec).not.toHaveBeenCalledWith(
			"detected",
			[],
			expect.any(Object),
		);
	});

	it("limits automatic validation and reports skipped and unavailable outcomes", async () => {
		const outcomes: Array<{ name: string; outcome: string; reason?: string }> = [];
		const lookup = process.platform === "win32" ? "where.exe" : "which";
		const pi = {
			exec: vi.fn(async (command: string, args: string[] = []) => ({
				code:
					command === lookup && args[0] === "missing-validator" ? 1 : 0,
				stdout: "",
				stderr: "",
			})),
		} as unknown as ExtensionAPI;
		await runAvailableValidators(
			pi,
			{
				extensions: [".auto"],
				validators: [
					{
						name: "file-validator",
						command: ["file-validator", "{file}"],
						always: true,
					},
					{
						name: "project-validator",
						command: ["project-validator"],
						always: true,
						scope: "project",
					},
					{
						name: "long-validator",
						command: ["long-validator"],
						always: true,
						timeout: 60,
					},
					{
						name: "explicit-validator",
						command: ["explicit-validator"],
						automatic: false,
						always: true,
					},
					{
						name: "complexity",
						kind: "lizard",
						check: "lizard",
						always: true,
					},
					{
						name: "missing",
						command: ["missing-validator"],
						always: true,
					},
				],
			},
			"file.auto",
			process.cwd(),
			{
				automatic: true,
				onOutcome: (outcome) => outcomes.push(outcome),
			},
		);

		expect(pi.exec).toHaveBeenCalledWith(
			"file-validator",
			expect.any(Array),
			expect.any(Object),
		);
		expect(pi.exec).not.toHaveBeenCalledWith(
			"project-validator",
			expect.any(Array),
			expect.any(Object),
		);
		expect(outcomes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "file-validator", outcome: "passed" }),
				expect.objectContaining({
					name: "project-validator",
					outcome: "skipped",
					reason: "project_scope",
				}),
				expect.objectContaining({
					name: "long-validator",
					outcome: "skipped",
					reason: "long_running",
				}),
				expect.objectContaining({
					name: "explicit-validator",
					outcome: "skipped",
					reason: "explicit_only",
				}),
				expect.objectContaining({
					name: "complexity",
					outcome: "skipped",
					reason: "complexity",
				}),
				expect.objectContaining({ name: "missing", outcome: "unavailable" }),
			]),
		);
	});

	it("treats configured stdout as a validator failure", async () => {
		const pi = {
			exec: vi.fn(async (command: string) => ({
				code: 0,
				stdout: command === "gofmt" ? "unformatted.go\n" : "",
				stderr: "",
			})),
		} as unknown as ExtensionAPI;
		await expect(
			runAvailableValidators(
				pi,
				{
					extensions: [".go"],
					validators: [
						{
							name: "gofmt",
							command: ["gofmt", "-l", "{file}"],
							always: true,
							failOnStdout: true,
						},
					],
				},
				"unformatted.go",
			),
		).resolves.toEqual([{ name: "gofmt", output: "unformatted.go" }]);
	});

	it("returns advisory Lizard findings without making them blocking", async () => {
		const csv =
			'10,9,50,1,10,"target@1-10@target.ts","target.ts","target","target ( )",1,10';
		const pi = {
			exec: vi.fn(async (command: string, args: string[] = []) => {
				if (command === "where.exe" || command === "which")
					return { code: 0, stdout: "lizard", stderr: "" };
				if (command === "lizard") return { code: 0, stdout: csv, stderr: "" };
				if (command === "git" && args[0] === "rev-parse")
					return { code: 1, stdout: "", stderr: "not a repository" };
				return { code: 1, stdout: "", stderr: "unexpected command" };
			}),
		} as unknown as ExtensionAPI;
		await expect(
			runAvailableValidators(
				pi,
				{
					extensions: [".ts"],
					validators: [
						{
							name: "lizard-complexity",
							kind: "lizard",
							check: "lizard",
							always: true,
							advisory: true,
						},
					],
				},
				"target.ts",
			),
		).resolves.toEqual([
			{
				name: "lizard-complexity",
				output: "target: ccn 9 exceeds 8 (new)",
				advisory: true,
			},
		]);
		await expect(
			runAvailableValidators(
				pi,
				{
					extensions: [".ts"],
					validators: [
						{
							name: "lizard-complexity",
							kind: "lizard",
							check: "lizard",
							always: true,
							advisory: true,
							thresholds: { ccn: 10 },
						},
					],
				},
				"target.ts",
			),
		).resolves.toEqual([]);
	});

	it("runs a project-scoped validator once per validation batch", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-project-"));
		fs.writeFileSync(path.join(root, "project.marker"), "");
		const pi = {
			exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		} as unknown as ExtensionAPI;
		const executedProjectValidators = new Set<string>();
		const language = {
			extensions: [".ts"],
			markers: ["project.marker"],
			validators: [
				{
					name: "project-check",
					command: ["project-check"],
					always: true as const,
					scope: "project" as const,
				},
			],
		};
		try {
			await runAvailableValidators(pi, language, "one.ts", root, {
				executedProjectValidators,
			});
			await runAvailableValidators(pi, language, "two.ts", root, {
				executedProjectValidators,
			});
			expect(pi.exec).toHaveBeenCalledTimes(2);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("bounds validator output before returning it", async () => {
		const pi = {
			exec: vi.fn(async (command: string) =>
				command === "bounded-validator"
					? { code: 1, stdout: "x".repeat(9000), stderr: "" }
					: { code: 0, stdout: "", stderr: "" },
			),
		} as unknown as ExtensionAPI;
		const issues = await runAvailableValidators(
			pi,
			{
				extensions: [".bounded"],
				validators: [
					{
						name: "bounded",
						command: ["bounded-validator"],
						always: true,
					},
				],
			},
			"file.bounded",
		);
		expect(issues[0].output).toContain("... output truncated");
		expect(issues[0].output.length).toBeLessThan(8100);
	});

	describe("Pi policy and differential Lizard", () => {
		it("parses Lizard CSV function names and source lines", () => {
			expect(
				parseLizardCsv(
					'11,5,97,1,11,"buildExtMap@40-50@file.ts","file.ts","buildExtMap","buildExtMap ( config )",40,50',
				),
			).toEqual([
				{
					name: "buildExtMap",
					signature: "buildExtMap ( config )",
					ccn: 5,
					parameters: 1,
					length: 11,
					startLine: 40,
				},
			]);
		});

		it("loads the tracked Pi policy", () => {
			expect(POLICY_PATH).toMatch(/quality-gates\.json$/);
			const policy = loadQualityGatesPolicy(POLICY_PATH);
			expect(policy.version).toBe(1);
			expect(policy.lizardThresholds).toEqual({
				ccn: 8,
				parameters: 7,
				length: 250,
			});
			expect(policy.immutablePaths).toContain("**/migrations/**");
			expect(policy.languages.typescript.validators).toContainEqual(
				expect.objectContaining({
					name: "biome",
					command: [
						"pnpm",
						"--dir",
						"{project_root}",
						"exec",
						"biome",
						"lint",
						"{file}",
					],
				}),
			);
			expect(policy.languages.javascript.validators).toContainEqual(
				expect.objectContaining({
					name: "biome",
					command: [
						"pnpm",
						"--dir",
						"{project_root}",
						"exec",
						"biome",
						"lint",
						"{file}",
					],
				}),
			);
			expect(policy.languages.typescript.validators).toContainEqual(
				expect.objectContaining({
					kind: "lizard",
					always: true,
					advisory: true,
				}),
			);
			expect(policy.languages.go.validators).toContainEqual(
				expect.objectContaining({
					name: "go-vet",
					automatic: false,
				}),
			);
		});

		it("runs differential Lizard against the Git HEAD baseline", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-lizard-"));
			const sourceDir = path.join(root, "MixedCase");
			fs.mkdirSync(sourceDir);
			const filePath = path.join(sourceDir, "Target.ts");
			fs.writeFileSync(filePath, "function target() {}\n");
			let lizardRuns = 0;
			const csv = (ccn: number) =>
				`10,${ccn},50,1,10,"target@1-10@target.ts","target.ts","target","target ( )",1,10`;
			const pi = {
				exec: vi.fn(async (command: string, args: string[] = []) => {
					if (command === "where.exe" || command === "which")
						return { code: 0, stdout: "lizard", stderr: "" };
					if (command === "lizard") {
						lizardRuns += 1;
						return {
							code: 0,
							stdout: csv(lizardRuns === 1 ? 9 : 8),
							stderr: "",
						};
					}
					if (command === "git" && args[0] === "rev-parse")
						return { code: 0, stdout: `${root}\n`, stderr: "" };
					if (command === "git" && args[0] === "show")
						return { code: 0, stdout: "function target() {}\n", stderr: "" };
					return { code: 1, stdout: "", stderr: "unexpected command" };
				}),
			} as unknown as ExtensionAPI;
			try {
				const failures = await runAvailableValidators(
					pi,
					{
						extensions: [".ts"],
						validators: [
							{
								name: "lizard-complexity",
								kind: "lizard",
								check: "lizard",
								always: true,
							},
						],
					},
					filePath,
					root,
				);
				expect(failures).toEqual([
					{
						name: "lizard-complexity",
						output: "target: ccn 9 exceeds 8 (HEAD: 8)",
					},
				]);
				expect(lizardRuns).toBe(2);
				expect(pi.exec).toHaveBeenCalledWith(
					"git",
					["show", "HEAD:MixedCase/Target.ts"],
					expect.objectContaining({ cwd: root }),
				);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("rejects empty or contradictory validator selection modes", () => {
			const policyWith = (validator: Record<string, unknown>) => ({
				version: 1,
				lizardThresholds: { ccn: 8, parameters: 7, length: 250 },
				excludedPaths: [],
				immutablePaths: [],
				languages: {
					test: {
						extensions: [".test"],
						validators: [
							{ name: "validator", command: ["validator"], ...validator },
						],
					},
				},
			});
			for (const validator of [
				{ detectAny: [] },
				{ detectAll: [] },
				{ always: true, detectAny: ["config"] },
				{ always: true, automatic: true },
			])
				expect(() => parseQualityGatesPolicy(policyWith(validator))).toThrow(
					"Invalid validator",
				);
		});

		it("rejects malformed threshold configuration", () => {
			const policy = {
				version: 1,
				lizardThresholds: { ccn: 8, parameters: 7, length: 250 },
				excludedPaths: [],
				immutablePaths: [],
				languages: {
					test: {
						extensions: [".test"],
						validators: [
							{
								name: "lizard",
								kind: "lizard",
								check: "lizard",
								always: true,
								thresholds: { cnn: 9 },
							},
						],
					},
				},
			};
			expect(() => parseQualityGatesPolicy(policy)).toThrow(
				"Invalid validator",
			);
		});

		it("blocks only new or worsened Lizard violations", () => {
			const baseline = [
				{ name: "stable", ccn: 10, length: 300, parameters: 8, startLine: 1 },
				{ name: "worse", ccn: 8, length: 100, parameters: 2, startLine: 10 },
			];
			const current = [
				{ name: "stable", ccn: 10, length: 300, parameters: 8, startLine: 1 },
				{ name: "worse", ccn: 9, length: 100, parameters: 2, startLine: 10 },
				{ name: "new", ccn: 2, length: 251, parameters: 1, startLine: 20 },
			];
			expect(
				evaluateDifferentialLizard(current, baseline, LIZARD_THRESHOLDS),
			).toEqual([
				{
					functionName: "worse",
					metric: "ccn",
					current: 9,
					baseline: 8,
					limit: 8,
				},
				{ functionName: "new", metric: "length", current: 251, limit: 250 },
			]);
		});

		it("uses Git line mapping to identify inserted duplicate functions", () => {
			const baseline = [
				{
					name: "handler",
					signature: "handler ( oldName )",
					ccn: 10,
					length: 20,
					parameters: 1,
					startLine: 30,
				},
			];
			const current = [
				{
					name: "handler",
					signature: "handler ( )",
					ccn: 10,
					length: 20,
					parameters: 1,
					startLine: 1,
				},
				{
					name: "handler",
					signature: "handler ( newName )",
					ccn: 7,
					length: 20,
					parameters: 1,
					startLine: 50,
				},
			];
			const lineMapper = parseGitDiffLineMapper("@@ -0,0 +1,20 @@");
			expect(
				evaluateDifferentialLizard(
					current,
					baseline,
					LIZARD_THRESHOLDS,
					lineMapper,
				),
			).toEqual([
				{
					functionName: "handler",
					metric: "ccn",
					current: 10,
					limit: 8,
				},
			]);
		});

		it("does not treat a signature-only edit as new complexity", () => {
			const baseline = [
				{
					name: "handler",
					signature: "handler ( oldName )",
					ccn: 10,
					length: 20,
					parameters: 1,
					startLine: 30,
				},
			];
			const current = [
				{
					name: "handler",
					signature: "handler ( newName )",
					ccn: 10,
					length: 20,
					parameters: 1,
					startLine: 30,
				},
			];
			expect(evaluateDifferentialLizard(current, baseline)).toEqual([]);
		});

		it("compares repeated function names by mapped source line", () => {
			const baseline = [
				{ name: "handler", ccn: 9, length: 20, parameters: 1, startLine: 1 },
				{ name: "handler", ccn: 9, length: 20, parameters: 1, startLine: 30 },
			];
			const current = [
				{ name: "handler", ccn: 9, length: 20, parameters: 1, startLine: 1 },
				{ name: "handler", ccn: 10, length: 20, parameters: 1, startLine: 30 },
			];
			expect(
				evaluateDifferentialLizard(
					current,
					baseline,
					LIZARD_THRESHOLDS,
					(line) => line,
				),
			).toEqual([
				{
					functionName: "handler",
					metric: "ccn",
					current: 10,
					baseline: 9,
					limit: 8,
				},
			]);
		});

	});

	describe("changed path collection and exclusions", () => {
		it("reads every path from text_edit", () => {
			expect(
				getFilePaths({
					input: { paths: ["one.ts", "two.ts"] },
				} as unknown as ToolResultEvent),
			).toEqual(["one.ts", "two.ts"]);
		});

		it("matches excluded and immutable path globs", () => {
			expect(
				matchesQualityPath("src/migrations/001_create.py", process.cwd(), [
					"**/migrations/**",
				]),
			).toBe(true);
			expect(
				matchesQualityPath("src/service.py", process.cwd(), [
					"**/migrations/**",
				]),
			).toBe(false);
		});
	});

	describe("getFilePath (pure function)", () => {
		it("reads input.path when present", () => {
			expect(
				getFilePath({
					input: { path: "/a/b.ts" },
				} as unknown as ToolResultEvent),
			).toBe("/a/b.ts");
		});

		it("falls back to input.file_path when path is absent", () => {
			expect(
				getFilePath({
					input: { file_path: "/a/b.ts" },
				} as unknown as ToolResultEvent),
			).toBe("/a/b.ts");
		});

		it("returns undefined when neither field is set", () => {
			expect(
				getFilePath({ input: {} } as unknown as ToolResultEvent),
			).toBeUndefined();
		});
	});

	describe("filterNetChangedFiles", () => {
		it("drops missing touched files before invoking Git", async () => {
			const root = fs.mkdtempSync(
				path.join(os.tmpdir(), "pi-quality-missing-"),
			);
			try {
				const exec = vi.fn();
				const pi = { exec } as unknown as ExtensionAPI;

				const result = await filterNetChangedFiles(pi, ["deleted.ts"], root);

				expect(result).toEqual([]);
				expect(exec).not.toHaveBeenCalled();
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("drops touched files that have no net Git change", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-net-"));
			try {
				fs.writeFileSync(path.join(root, "changed.ts"), "changed\n");
				fs.writeFileSync(path.join(root, "restored.ts"), "restored\n");
				const exec = vi.fn(async (_command: string, args: string[]) => {
					if (args[0] === "rev-parse")
						return { code: 0, stdout: root, stderr: "" };
					return { code: 0, stdout: " M changed.ts\0", stderr: "" };
				});
				const pi = { exec } as unknown as ExtensionAPI;

				const result = await filterNetChangedFiles(
					pi,
					["changed.ts", "restored.ts"],
					root,
				);

				expect(result).toEqual(["changed.ts"]);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});
	});

	describe("runFirstAvailableValidator", () => {
		it("runs validators from the detected project root", async () => {
			const root = fs.mkdtempSync(
				path.join(os.tmpdir(), "pi-quality-validator-root-"),
			);
			try {
				fs.writeFileSync(path.join(root, "Example.csproj"), "<Project />\n");
				const filePath = path.join(root, "Example.cs");
				fs.writeFileSync(filePath, "namespace Example;\n");
				const lookup = process.platform === "win32" ? "where.exe" : "which";
				const exec = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
				const pi = { exec } as unknown as ExtensionAPI;
				const langConfig: Parameters<typeof runFirstAvailableValidator>[1] = {
					extensions: [".cs"],
					markers: ["*.csproj"],
					validators: [
						{
							name: "project-root-validator",
							command: ["project-root-validator", "{project_root}", "{file}"],
							check: "project-root-validator-check",
							timeout: 60,
						},
					],
				};

				await runFirstAvailableValidator(pi, langConfig, filePath, root);

				expect(exec).toHaveBeenCalledWith(
					lookup,
					["project-root-validator-check"],
					{ timeout: 2000 },
				);
				expect(exec).toHaveBeenCalledWith(
					"project-root-validator",
					[root, filePath],
					{ cwd: root, timeout: 60000 },
				);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("caches validator availability after first lookup", async () => {
			const lookup = process.platform === "win32" ? "where.exe" : "which";
			const exec = vi.fn(async (command: string) => ({
				code: command === lookup ? 0 : 0,
				stdout: "",
				stderr: "",
			}));
			const pi = { exec } as unknown as ExtensionAPI;
			const langConfig: Parameters<typeof runFirstAvailableValidator>[1] = {
				extensions: [".test-cache"],
				validators: [
					{
						name: "cache-test-validator",
						command: ["cache-test-validator", "check", "{file}"],
					},
				],
			};

			await runFirstAvailableValidator(pi, langConfig, "one.test-cache");
			await runFirstAvailableValidator(pi, langConfig, "two.test-cache");

			expect(
				exec.mock.calls.filter(([command]) => command === lookup),
			).toHaveLength(1);
			expect(
				exec.mock.calls.filter(
					([command]) => command === "cache-test-validator",
				),
			).toHaveLength(2);
		});
	});

	describe("batched hook timing", () => {
		it("validates once at agent_settled and reports without a follow-up", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-batch-"));
			const filePath = path.join(root, "foo.batch-failure");
			try {
				fs.writeFileSync(filePath, "broken\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => ({
					code: command === "batch-failure-validator" ? 1 : 0,
					stdout:
						command === "batch-failure-validator" ? "E501 line too long" : "",
					stderr: "",
				}));
				const map = buildExtMap({
					python: {
						extensions: [".batch-failure"],
						validators: [
							{
								name: "batch-failure-validator",
								command: ["batch-failure-validator", "check", "{file}"],
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				const toolResult = pi._getHook("tool_result")[0].handler;
				const agentSettled = pi._getHook("agent_settled")[0].handler;
				const event = {
					toolName: "text_edit",
					input: { paths: [filePath] },
				} as unknown as ToolResultEvent;

				await toolResult(event);
				await toolResult(event);
				expect(pi.exec).not.toHaveBeenCalled();
				expect(pi.sendMessage).not.toHaveBeenCalled();

				await agentSettled({}, { cwd: root });

				expect(
					pi.exec.mock.calls.filter(
						([command]) => command === "batch-failure-validator",
					),
				).toHaveLength(1);
				expect(pi.sendMessage).toHaveBeenCalledWith(
					{
						customType: "quality-gates",
						content:
							"Quality gate validation failed:\n\nbatch-failure-validator reported issues in foo.batch-failure:\nE501 line too long",
						display: true,
					},
					{ triggerTurn: false },
				);
				const metrics = fs
					.readdirSync(metricsDir)
					.map((name) => fs.readFileSync(path.join(metricsDir, name), "utf8"))
					.join("\n");
				expect(metrics).toContain('"event":"quality_gate_validator"');
				expect(metrics).toContain('"validator":"batch-failure-validator"');
				expect(metrics).toContain('"outcome":"failed"');
				expect(metrics).toContain('"event":"quality_gate_notification"');
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("skips complexity findings during automatic validation", async () => {
			const root = fs.mkdtempSync(
				path.join(os.tmpdir(), "pi-quality-advisory-"),
			);
			const filePath = path.join(root, "foo.advisory");
			try {
				fs.writeFileSync(filePath, "broken\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => {
					if (command === "git") return { code: 1, stdout: "", stderr: "" };
					if (command === "lizard")
						return {
							code: 0,
							stdout:
								'10,9,50,1,10,"target@1-10@foo.ts","foo.ts","target","target ( )",1,10',
							stderr: "",
						};
					return { code: 0, stdout: "", stderr: "" };
				});
				const map = buildExtMap({
					typescript: {
						extensions: [".advisory"],
						validators: [
							{
								name: "lizard-complexity",
								kind: "lizard",
								check: "lizard",
								always: true,
								advisory: true,
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				await pi._getHook("tool_result")[0].handler({
					toolName: "edit",
					input: { path: filePath },
				} as unknown as ToolResultEvent);
				await pi._getHook("agent_settled")[0].handler({}, { cwd: root });

				expect(
					pi.exec.mock.calls.filter(([command]) => command === "lizard"),
				).toHaveLength(0);
				expect(pi.sendMessage).not.toHaveBeenCalled();
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});


		it("discards stale validator output and validates the new content next", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-stale-"));
			const filePath = path.join(root, "changed.stale-result");
			try {
				fs.writeFileSync(filePath, "before\n");
				let validatorRuns = 0;
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => {
					if (command === "git") return { code: 1, stdout: "", stderr: "" };
					if (command === "stale-result-validator") {
						validatorRuns += 1;
						if (validatorRuns === 1) {
							fs.writeFileSync(filePath, "after\n");
							return { code: 1, stdout: "old diagnostic", stderr: "" };
						}
					}
					return { code: 0, stdout: "", stderr: "" };
				});
				const map = buildExtMap({
					typescript: {
						extensions: [".stale-result"],
						validators: [
							{
								name: "stale-result-validator",
								command: ["stale-result-validator", "check", "{file}"],
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				const toolResult = pi._getHook("tool_result")[0].handler;
				const agentSettled = pi._getHook("agent_settled")[0].handler;

				await toolResult({
					toolName: "edit",
					input: { path: filePath },
				} as unknown as ToolResultEvent);
				await agentSettled({}, { cwd: root });
				expect(pi.sendMessage).not.toHaveBeenCalled();

				await agentSettled({}, { cwd: root });
				expect(validatorRuns).toBe(2);
				expect(pi.sendMessage).not.toHaveBeenCalled();
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("skips unchanged content after a successful validation", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-cache-"));
			const filePath = path.join(root, "cached.content-cache");
			try {
				fs.writeFileSync(filePath, "first\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => ({
					code: command === "git" ? 1 : 0,
					stdout: "",
					stderr: "",
				}));
				const map = buildExtMap({
					typescript: {
						extensions: [".content-cache"],
						validators: [
							{
								name: "content-cache-validator",
								command: ["content-cache-validator", "check", "{file}"],
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				const toolResult = pi._getHook("tool_result")[0].handler;
				const agentSettled = pi._getHook("agent_settled")[0].handler;
				const event = {
					toolName: "edit",
					input: { path: filePath },
				} as unknown as ToolResultEvent;

				await toolResult(event);
				await agentSettled({}, { cwd: root });
				await toolResult(event);
				await agentSettled({}, { cwd: root });
				fs.writeFileSync(filePath, "second\n");
				await toolResult(event);
				await agentSettled({}, { cwd: root });

				expect(
					pi.exec.mock.calls.filter(
						([command]) => command === "content-cache-validator",
					),
				).toHaveLength(2);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});


		it("ignores failed edit results", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-error-"));
			const filePath = path.join(root, "failed.failed-edit");
			try {
				fs.writeFileSync(filePath, "unchanged\n");
				const pi = createMockPi();
				const map = buildExtMap({
					test: {
						extensions: [".failed-edit"],
						validators: [
							{
								name: "should-not-run",
								command: ["should-not-run", "{file}"],
								always: true,
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				await pi._getHook("tool_result")[0].handler(
					{
						toolName: "edit",
						input: { path: filePath },
						isError: true,
					} as unknown as ToolResultEvent,
					{ cwd: root },
				);
				await pi._getHook("agent_settled")[0].handler({}, { cwd: root });
				expect(pi.exec).not.toHaveBeenCalled();
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("resolves relative touched paths against the edit-time cwd", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-cwd-"));
			const filePath = path.join(root, "relative.edit-cwd");
			try {
				fs.writeFileSync(filePath, "changed\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => ({
					code: command === "git" ? 1 : 0,
					stdout: "",
					stderr: "",
				}));
				const map = buildExtMap({
					test: {
						extensions: [".edit-cwd"],
						validators: [
							{
								name: "cwd-validator",
								command: ["cwd-validator", "{file}"],
								always: true,
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				await pi._getHook("tool_result")[0].handler(
					{
						toolName: "edit",
						input: { path: "relative.edit-cwd" },
						isError: false,
					} as unknown as ToolResultEvent,
					{ cwd: root },
				);
				await pi._getHook("agent_settled")[0].handler(
					{},
					{ cwd: process.cwd() },
				);
				expect(pi.exec).toHaveBeenCalledWith(
					"cwd-validator",
					[filePath],
					expect.any(Object),
				);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("skips excluded and immutable paths", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-skip-"));
			const filePath = path.join(root, "migrations", "001.skip-quality");
			try {
				fs.mkdirSync(path.dirname(filePath));
				fs.writeFileSync(filePath, "unchanged artifact\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => ({
					code: command === "git" ? 1 : 0,
					stdout: "",
					stderr: "",
				}));
				const map = buildExtMap({
					test: {
						extensions: [".skip-quality"],
						validators: [
							{
								name: "should-not-run",
								command: ["should-not-run", "{file}"],
								always: true,
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				await pi._getHook("tool_result")[0].handler({
					toolName: "structured_edit",
					input: { path: filePath },
				} as unknown as ToolResultEvent);
				await pi._getHook("agent_settled")[0].handler({}, { cwd: root });

				expect(
					pi.exec.mock.calls.filter(
						([command]) => command === "should-not-run",
					),
				).toHaveLength(0);
				expect(pi.sendMessage).not.toHaveBeenCalled();
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("stays silent when end-of-run validation passes", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-clean-"));
			const filePath = path.join(root, "foo.batch-clean");
			try {
				fs.writeFileSync(filePath, "clean\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => ({
					code: command === "git" ? 1 : 0,
					stdout: "",
					stderr: "",
				}));
				const map = buildExtMap({
					typescript: {
						extensions: [".batch-clean"],
						validators: [
							{
								name: "batch-clean-validator",
								command: ["batch-clean-validator", "check", "{file}"],
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);

				await pi._getHook("tool_result")[0].handler({
					toolName: "write",
					input: { path: filePath },
				} as unknown as ToolResultEvent);
				await pi._getHook("agent_settled")[0].handler({}, { cwd: root });

				expect(
					pi.exec.mock.calls.filter(
						([command]) => command === "batch-clean-validator",
					),
				).toHaveLength(1);
				expect(pi.sendMessage).not.toHaveBeenCalled();
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});
	});
});
