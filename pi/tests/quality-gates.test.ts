/**
 * Behavioral tests for quality-gates.ts.
 *
 * Covers a forced validation failure and a clean run after changed files
 * are collected during tool execution and validated when the agent settles.
 */
import type {
	ExtensionAPI,
	ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	buildExtMap,
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
			expect(exec.mock.calls[0][2]).toEqual({ timeout: 2000 });
			expect(exec.mock.calls[1][2]).toEqual({ timeout: 10000 });
		});
	});

	describe("batched hook timing", () => {
		it("defers and deduplicates validation until agent_settled", async () => {
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
				input: { path: "foo.batch-failure" },
			} as unknown as ToolResultEvent;

			await toolResult(event);
			await toolResult(event);
			expect(pi.exec).not.toHaveBeenCalled();
			expect(pi.sendMessage).not.toHaveBeenCalled();

			await agentSettled();

			expect(
				pi.exec.mock.calls.filter(
					([command]) => command === "batch-failure-validator",
				),
			).toHaveLength(1);
			expect(pi.sendMessage).toHaveBeenCalledWith({
				customType: "quality-gates",
				content:
					"Quality gate validation failed:\n\nbatch-failure-validator reported issues in foo.batch-failure:\nE501 line too long",
				display: true,
			});

			await agentSettled();
			expect(pi.exec).toHaveBeenCalledTimes(2);
		});

		it("stays silent when settled validation passes", async () => {
			const pi = createMockPi();
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
				input: { path: "foo.batch-clean" },
			} as unknown as ToolResultEvent);
			await pi._getHook("agent_settled")[0].handler();

			expect(pi.sendMessage).not.toHaveBeenCalled();
		});
	});
});
