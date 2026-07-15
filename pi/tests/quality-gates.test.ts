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
import { describe, expect, it, vi } from "vitest";
import {
	buildExtMap,
	filterNetChangedFiles,
	getFilePath,
	registerQualityGates,
	runFirstAvailableValidator,
} from "../extensions/quality-gates.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

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
		it("validates once at agent_settled and queues a repair follow-up", async () => {
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
					toolName: "edit",
					input: { path: filePath },
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
							"Quality gate validation failed:\n\nbatch-failure-validator reported issues in foo.batch-failure:\nE501 line too long\n\nAddress every validation failure, re-run the relevant checks, and do not finish until they pass. After they pass, provide a complete final summary of the original task, all changes and repairs, changed files, and final validation results. Do not summarize only this repair.",
						display: true,
					},
					{ triggerTurn: true, deliverAs: "followUp" },
				);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});

		it("requeues only files whose validators failed", async () => {
			const root = fs.mkdtempSync(
				path.join(os.tmpdir(), "pi-quality-selective-"),
			);
			const goodPath = path.join(root, "good.selective");
			const badPath = path.join(root, "bad.selective");
			try {
				fs.writeFileSync(goodPath, "good\n");
				fs.writeFileSync(badPath, "bad\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(
					async (command: string, args: string[] = []) => {
						const bad = args.some((arg) => arg.endsWith("bad.selective"));
						return {
							code: command === "selective-validator" && bad ? 1 : 0,
							stdout:
								command === "selective-validator" && bad ? "still broken" : "",
							stderr: "",
						};
					},
				);
				const map = buildExtMap({
					typescript: {
						extensions: [".selective"],
						validators: [
							{
								name: "selective-validator",
								command: ["selective-validator", "check", "{file}"],
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				const toolResult = pi._getHook("tool_result")[0].handler;
				const agentStart = pi._getHook("agent_start")[0].handler;
				const agentSettled = pi._getHook("agent_settled")[0].handler;
				for (const filePath of [goodPath, badPath])
					await toolResult({
						toolName: "edit",
						input: { path: filePath },
					} as unknown as ToolResultEvent);

				await agentSettled({}, { cwd: root });
				await agentStart();
				await agentSettled({}, { cwd: root });

				const validatorCalls = pi.exec.mock.calls.filter(
					([command]) => command === "selective-validator",
				);
				expect(validatorCalls).toHaveLength(3);
				expect(
					validatorCalls.filter(([, args]) =>
						args.some((arg: string) => arg.endsWith("good.selective")),
					),
				).toHaveLength(1);
				expect(
					validatorCalls.filter(([, args]) =>
						args.some((arg: string) => arg.endsWith("bad.selective")),
					),
				).toHaveLength(2);
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

		it("stops automatic repair after two follow-up attempts", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-quality-limit-"));
			const filePath = path.join(root, "foo.repair-limit");
			try {
				fs.writeFileSync(filePath, "broken\n");
				const pi = createMockPi();
				pi.exec.mockImplementation(async (command: string) => ({
					code: command === "repair-limit-validator" ? 1 : 0,
					stdout: command === "repair-limit-validator" ? "still broken" : "",
					stderr: "",
				}));
				const map = buildExtMap({
					typescript: {
						extensions: [".repair-limit"],
						validators: [
							{
								name: "repair-limit-validator",
								command: ["repair-limit-validator", "check", "{file}"],
							},
						],
					},
				});
				registerQualityGates(pi as unknown as ExtensionAPI, map);
				await pi._getHook("tool_result")[0].handler({
					toolName: "write",
					input: { path: filePath },
				} as unknown as ToolResultEvent);
				const agentStart = pi._getHook("agent_start")[0].handler;
				const agentSettled = pi._getHook("agent_settled")[0].handler;

				await agentSettled({}, { cwd: root });
				await agentStart();
				await agentSettled({}, { cwd: root });
				await agentStart();
				await agentSettled({}, { cwd: root });

				expect(pi.sendMessage).toHaveBeenCalledTimes(3);
				expect(pi.sendMessage.mock.calls[0][1]).toEqual({
					triggerTurn: true,
					deliverAs: "followUp",
				});
				expect(pi.sendMessage.mock.calls[1][1]).toEqual({
					triggerTurn: true,
					deliverAs: "followUp",
				});
				expect(pi.sendMessage.mock.calls[2][1]).toBeUndefined();
				expect(pi.sendMessage.mock.calls[2][0].content).toContain(
					"Automatic repair limit reached",
				);
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
