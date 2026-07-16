import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import featureMemoryExtension from "../extensions/feature-memory.ts";
import {
	appendFeatureMemoryEvent,
	createFeatureMemoryEvent,
	type FeatureRegistry,
	loadFeatureRegistry,
	matchFeatureIds,
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
