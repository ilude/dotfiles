import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import featureMemoryExtension, {
	boundFeatureContextInjection,
	MAX_FEATURE_INJECTION_CHARS,
} from "../extensions/feature-memory.ts";
import {
	appendFeatureMemoryEvent,
	buildFeatureContext,
	createFeatureMemoryEvent,
	type FeatureMemoryEvent,
	featureMemoryEventsPath,
	type FeatureRegistry,
	loadFeatureRegistry,
	matchFeatureIds,
	MAX_FEATURE_CONTEXT_CHARS,
	readRecentFeatureEvents,
} from "../lib/feature-memory-store.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

interface Fixture {
	root: string;
	registryPath: string;
	dossierPath: string;
	eventsPath: string;
}

function makeFixture(root: string): Fixture {
	const dossierPath = path.join(root, ".specs/features/pi-improve/context.md");
	const registryPath = path.join(root, "pi/feature-memory.json");
	const eventsPath = path.join(root, "local/events.jsonl");
	fs.mkdirSync(path.dirname(dossierPath), { recursive: true });
	fs.mkdirSync(path.dirname(registryPath), { recursive: true });
	fs.writeFileSync(dossierPath, "# Dossier\n\nStable ordinal snapshot.\n");
	fs.writeFileSync(
		registryPath,
		JSON.stringify({
			schemaVersion: 1,
			features: {
				"pi-improve": {
					title: "Pi improve",
					dossierPath: ".specs/features/pi-improve/context.md",
					promptTriggers: ["/improve", "learning_candidate_decide"],
					pathTriggers: ["pi/extensions/workflow-friction-review.ts"],
				},
			},
		}),
	);
	return { root, registryPath, dossierPath, eventsPath };
}

async function registerFixture(fixture: Fixture) {
	const pi = createMockPi();
	await featureMemoryExtension(pi as unknown as ExtensionAPI, {
		repoRoot: fixture.root,
		registryPath: fixture.registryPath,
		eventsPath: fixture.eventsPath,
	});
	return pi;
}

describe("feature memory", () => {
	let root: string;
	let fixture: Fixture;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-memory-"));
		fixture = makeFixture(root);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("matches literal and path triggers deterministically and case-insensitively", async () => {
		const registry = await loadFeatureRegistry(fixture);
		expect(matchFeatureIds(registry, "Use /IMPROVE now")).toEqual([
			"pi-improve",
		]);
		expect(
			matchFeatureIds(
				registry,
				"Inspect PI\\EXTENSIONS\\WORKFLOW-FRICTION-REVIEW.TS:20",
			),
		).toEqual(["pi-improve"]);
		expect(matchFeatureIds(registry, "unrelated task")).toEqual([]);
		expect(matchFeatureIds(registry, "Use /improvement now")).toEqual([]);
		expect(
			matchFeatureIds(registry, "learning_candidate_decide_extra"),
		).toEqual([]);

		const orderedRegistry: FeatureRegistry = {
			...registry,
			features: {
				zeta: registry.features["pi-improve"],
				alpha: registry.features["pi-improve"],
			},
		};
		expect(matchFeatureIds(orderedRegistry, "/improve")).toEqual([
			"alpha",
			"zeta",
		]);
	});

	it("fails explicitly for schema errors and dossiers outside the repository", async () => {
		fs.writeFileSync(
			fixture.registryPath,
			JSON.stringify({ schemaVersion: 2, features: {} }),
		);
		await expect(loadFeatureRegistry(fixture)).rejects.toThrow(
			"schemaVersion must be 1",
		);

		const outside = path.join(path.dirname(root), "outside-feature-context.md");
		fs.writeFileSync(outside, "outside");
		fs.writeFileSync(
			fixture.registryPath,
			JSON.stringify({
				schemaVersion: 1,
				features: {
					bad: {
						title: "Bad",
						dossierPath: "../outside-feature-context.md",
						promptTriggers: ["bad"],
						pathTriggers: ["pi/bad.ts"],
					},
				},
			}),
		);
		try {
			await expect(loadFeatureRegistry(fixture)).rejects.toThrow(
				"normalized repo-relative path",
			);
		} finally {
			fs.rmSync(outside, { force: true });
		}

		const outsideRegistry = path.join(
			path.dirname(root),
			"outside-feature-registry.json",
		);
		fs.writeFileSync(
			outsideRegistry,
			JSON.stringify({ schemaVersion: 1, features: {} }),
		);
		try {
			await expect(
				loadFeatureRegistry({
					repoRoot: root,
					registryPath: outsideRegistry,
				}),
			).rejects.toThrow("registry escapes the repository");
		} finally {
			fs.rmSync(outsideRegistry, { force: true });
		}
	});

	it("injects one hidden custom message per feature and resets on session start", async () => {
		const pi = await registerFixture(fixture);
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const start = pi._getHook("session_start")[0].handler;

		const first = await beforeAgentStart({ prompt: "/improve list" }, {});
		expect(first.message).toMatchObject({
			customType: "feature-memory",
			display: false,
		});
		expect(first.message.content).toContain("Stable ordinal snapshot");
		expect(
			await beforeAgentStart({ prompt: "/improve again" }, {}),
		).toBeUndefined();

		await start({ reason: "reload" }, {});
		expect(
			(await beforeAgentStart({ prompt: "/improve" }, {})).message,
		).toBeDefined();
	});

	it("bounds aggregate context across multiple matching features", () => {
		const context = boundFeatureContextInjection([
			"a".repeat(10_000),
			"b".repeat(10_000),
		]);
		expect(context.length).toBeLessThanOrEqual(MAX_FEATURE_INJECTION_CHARS);
		expect(context).toContain(
			"[feature context injection truncated at total character limit]",
		);
	});

	it("bounds injected feature context and marks truncation", async () => {
		fs.writeFileSync(fixture.dossierPath, "x".repeat(20_000));
		const registry = await loadFeatureRegistry(fixture);
		const context = await buildFeatureContext(registry, "pi-improve", {
			eventsPath: fixture.eventsPath,
		});
		expect(context.length).toBeLessThanOrEqual(MAX_FEATURE_CONTEXT_CHARS);
		expect(context).toContain("[dossier truncated at 12000 characters]");
	});

	it("activates the recording tool only after a feature match", async () => {
		const pi = await registerFixture(fixture);
		await pi._getHook("session_start")[0].handler({ reason: "new" }, {});
		expect(pi.getActiveTools()).not.toContain("feature_memory_record");
		await pi
			._getHook("before_agent_start")[0]
			.handler({ prompt: "/improve" }, {});
		expect(pi.getActiveTools()).toContain("feature_memory_record");
	});

	it("appends sanitized events and retrieves only the recent bounded set", async () => {
		for (let index = 0; index < 5; index += 1) {
			await appendFeatureMemoryEvent(
				createFeatureMemoryEvent({
					featureId: "pi-improve",
					kind: "evidence",
					summary: `evidence\n${index}`,
					sourcePaths: ["pi/tests/feature-memory.test.ts"],
				}),
				fixture.eventsPath,
			);
		}
		const recent = await readRecentFeatureEvents("pi-improve", {
			eventsPath: fixture.eventsPath,
			limit: 2,
		});
		expect(recent.map((event) => event.summary)).toEqual([
			"evidence 3",
			"evidence 4",
		]);
	});

	it("uses a sanitized stable writer ID in the event shard name", () => {
		vi.stubEnv("PI_FEATURE_MEMORY_WRITER_ID", "Workstation 01/Primary");
		expect(
			featureMemoryEventsPath({ directory: path.join(root, "shared") }),
		).toBe(path.join(root, "shared/events.workstation-01-primary.jsonl"));
	});

	it("merges, orders, and deduplicates events across writer shards", async () => {
		const eventsDirectory = path.join(root, "shared");
		const event = (
			eventId: string,
			recordedAt: string,
			summary: string,
		): FeatureMemoryEvent => ({
			...createFeatureMemoryEvent({
				featureId: "pi-improve",
				kind: "evidence",
				summary,
				sourcePaths: [],
			}),
			eventId,
			recordedAt,
		});
		const first = event("event-1", "2026-08-01T10:00:00.000Z", "first");
		const second = event("event-2", "2026-08-02T10:00:00.000Z", "second");
		const third = event("event-3", "2026-08-03T10:00:00.000Z", "third");
		await appendFeatureMemoryEvent(
			second,
			path.join(eventsDirectory, "events.host-b.jsonl"),
		);
		await appendFeatureMemoryEvent(
			first,
			path.join(eventsDirectory, "events.host-a.jsonl"),
		);
		await appendFeatureMemoryEvent(
			third,
			path.join(eventsDirectory, "events.jsonl"),
		);
		await appendFeatureMemoryEvent(
			second,
			path.join(eventsDirectory, "events.host-c.jsonl"),
		);
		fs.writeFileSync(path.join(eventsDirectory, "other.jsonl"), "invalid\n");

		const recent = await readRecentFeatureEvents("pi-improve", {
			eventsDirectory,
		});
		expect(recent.map((entry) => entry.summary)).toEqual([
			"first",
			"second",
			"third",
		]);
	});

	it("writes to one shard and injects events from the configured directory", async () => {
		vi.stubEnv("PI_FEATURE_MEMORY_WRITER_ID", "host-a");
		const eventsDirectory = path.join(root, "shared");
		await appendFeatureMemoryEvent(
			createFeatureMemoryEvent({
				featureId: "pi-improve",
				kind: "decision",
				summary: "Decision from host B",
				sourcePaths: [],
			}),
			path.join(eventsDirectory, "events.host-b.jsonl"),
		);
		const pi = createMockPi();
		await featureMemoryExtension(pi as unknown as ExtensionAPI, {
			repoRoot: fixture.root,
			registryPath: fixture.registryPath,
			eventsDirectory,
		});
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const result = await beforeAgentStart({ prompt: "/improve" }, {});
		expect(result.message.content).toContain("Decision from host B");

		const tool = pi._getTool("feature_memory_record");
		await tool?.execute("call", {
			featureId: "pi-improve",
			kind: "evidence",
			summary: "Evidence from host A",
			sourcePaths: [],
		});
		expect(
			fs.existsSync(path.join(eventsDirectory, "events.host-a.jsonl")),
		).toBe(true);
	});

	it("rejects unknown or unmatched feature IDs", async () => {
		const pi = await registerFixture(fixture);
		const tool = pi._getTool("feature_memory_record");
		await expect(
			tool?.execute("call", {
				featureId: "unknown",
				kind: "decision",
				summary: "Explicit choice",
				sourcePaths: [],
			}),
		).rejects.toThrow("Unknown feature ID");
		await expect(
			tool?.execute("call", {
				featureId: "pi-improve",
				kind: "decision",
				summary: "Explicit choice",
				sourcePaths: [],
			}),
		).rejects.toThrow("has not matched work in this session");
	});

	it("exposes no raw transcript field and stores only the event schema", async () => {
		const pi = await registerFixture(fixture);
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		await beforeAgentStart({ prompt: "learning_candidate_decide" }, {});
		const tool = pi._getTool("feature_memory_record");
		expect(tool?.parameters.properties).not.toHaveProperty("rawTranscript");
		await tool?.execute("call", {
			featureId: "pi-improve",
			kind: "decision",
			summary: "Use the explicit command boundary",
			sourcePaths: ["pi/extensions/workflow-friction-review.ts"],
		});
		const stored = JSON.parse(
			fs.readFileSync(fixture.eventsPath, "utf8").trim(),
		);
		expect(Object.keys(stored).sort()).toEqual([
			"eventId",
			"featureId",
			"kind",
			"recordedAt",
			"schemaVersion",
			"sourcePaths",
			"summary",
		]);
		expect(stored).not.toHaveProperty("rawTranscript");
	});

	it("retrieves dossier and recent events for /improve in a fresh session", async () => {
		await appendFeatureMemoryEvent(
			createFeatureMemoryEvent({
				featureId: "pi-improve",
				kind: "open_question",
				summary: "Define decide command grammar",
				sourcePaths: ["pi/extensions/workflow-friction-review.ts"],
			}),
			fixture.eventsPath,
		);
		const pi = await registerFixture(fixture);
		await pi._getHook("session_start")[0].handler({ reason: "new" }, {});
		const result = await pi
			._getHook("before_agent_start")[0]
			.handler({ prompt: "/improve" }, {});
		expect(result.message.content).toContain("# Dossier");
		expect(result.message.content).toContain("Define decide command grammar");
		expect(result.message.content).toContain("non-authoritative");
	});
});
