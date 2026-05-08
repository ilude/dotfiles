import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	CLASSIFY_SCRIPT,
	loadRouterClassifierMode,
	PROMPT_ROUTING_DIR,
	type RouterClassifierMode,
} from "./config.js";
import { normalizeRouteCandidate } from "./route-vocabulary.js";

export interface ClassifierRecommendation {
	schema_version: string;
	primary: { model_tier: string; effort: string };
	candidates: Array<{ model_tier: string; effort: string; confidence: number }>;
	confidence: number;
	reason?: string;
	ensemble_rule?: string;
}

const KNOWN_SCHEMA_VERSIONS = new Set(["3.0.0"]);
const CLASSIFIER_FAILURE_LOG = path.join(
	PROMPT_ROUTING_DIR,
	"logs",
	"classifier_failures.jsonl",
);

interface ClassifierPi {
	exec(
		command: string,
		args: string[],
		options: { timeout: number },
	): Promise<{ stdout: string; stderr: string; code: number }>;
}

interface ClassifierContext {
	ui: {
		notify(message: string, level?: string): void;
	};
}

async function logClassifierFailure(
	event: Record<string, unknown>,
): Promise<void> {
	try {
		await fs.mkdir(path.dirname(CLASSIFIER_FAILURE_LOG), { recursive: true });
		await fs.appendFile(
			CLASSIFIER_FAILURE_LOG,
			`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`,
		);
	} catch {
		// Logging must never break routing.
	}
}

function promptHash(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Safely parse and schema-validate classifier stdout.
 *
 * Accepts v3 JSON with a known schema_version only. Returns null on parse
 * failure, version mismatch, missing required fields, or out-of-range values.
 * Callers treat null as "keep current applied route" (null-fallback path).
 */
export function safeParseClassifierOutput(
	raw: string,
): ClassifierRecommendation | null {
	const trimmed = raw.trim();

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null) return null;
	const obj = parsed as Record<string, unknown>;

	if (typeof obj.schema_version !== "string") return null;
	if (!KNOWN_SCHEMA_VERSIONS.has(obj.schema_version)) return null;

	if (typeof obj.primary !== "object" || obj.primary === null) return null;
	const primary = obj.primary as Record<string, unknown>;
	if (typeof primary.model_tier !== "string") return null;
	if (normalizeRouteCandidate(primary.model_tier) === null) return null;
	if (typeof primary.effort !== "string") return null;

	if (!Array.isArray(obj.candidates) || obj.candidates.length === 0)
		return null;

	if (typeof obj.confidence !== "number") return null;
	if (obj.confidence < 0 || obj.confidence > 1) return null;

	return {
		schema_version: obj.schema_version,
		primary: {
			model_tier: primary.model_tier,
			effort: primary.effort,
		},
		candidates: obj.candidates.map((candidate: unknown) => {
			const c =
				typeof candidate === "object" && candidate !== null
					? (candidate as Record<string, unknown>)
					: {};
			return {
				model_tier: String(c.model_tier ?? ""),
				effort: String(c.effort ?? ""),
				confidence: Number(c.confidence ?? 0),
			};
		}),
		confidence: obj.confidence,
		reason: typeof obj.reason === "string" ? obj.reason : undefined,
		ensemble_rule:
			typeof obj.ensemble_rule === "string" ? obj.ensemble_rule : undefined,
	};
}

export async function classifyWithV3(
	pi: ClassifierPi,
	text: string,
	ctx: ClassifierContext,
	mode: RouterClassifierMode = loadRouterClassifierMode(),
): Promise<ClassifierRecommendation | null> {
	let result: { stdout: string; stderr: string; code: number };
	try {
		result = await pi.exec(
			"uv",
			[
				"run",
				"--project",
				PROMPT_ROUTING_DIR,
				"python",
				CLASSIFY_SCRIPT,
				"--classifier",
				mode,
				text,
			],
			{ timeout: 5000 },
		);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		const low = msg.toLowerCase();
		if (low.includes("timed out") || low.includes("timeout")) {
			ctx.ui.notify(
				`router: classifier timed out (likely first-run dependency/model setup). Run: uv sync --project prompt-routing, then warm once: uv run --project prompt-routing python prompt-routing/classify.py --classifier ${mode} "warmup"`,
				"warning",
			);
			return null;
		}
		void logClassifierFailure({
			event: "exec_exception",
			error: msg,
			prompt_hash: promptHash(text),
		});
		ctx.ui.notify(
			`router: classifier exec failed (non-fatal): ${msg}`,
			"warning",
		);
		return null;
	}

	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	const combined = `${stdout}\n${stderr}`.toLowerCase();

	if (result.code !== 0) {
		if (
			combined.includes("no module named") ||
			combined.includes("modulenotfounderror") ||
			combined.includes("could not find") ||
			combined.includes("failed to build") ||
			combined.includes("resolution failed")
		) {
			ctx.ui.notify(
				"router: classifier dependencies missing/broken. Run: uv sync --project prompt-routing",
				"warning",
			);
			return null;
		}
		void logClassifierFailure({
			event: "nonzero_exit",
			code: result.code,
			stdout_length: stdout.length,
			stderr_length: stderr.length,
			prompt_hash: promptHash(text),
		});
		ctx.ui.notify(
			`router: classifier failed (exit ${result.code}), keeping current route. stderr=${stderr.slice(0, 160)}`,
			"warning",
		);
		return null;
	}

	const rec = safeParseClassifierOutput(stdout);
	if (rec === null) {
		if (
			combined.includes("downloading") ||
			combined.includes("installing") ||
			combined.includes("collecting")
		) {
			ctx.ui.notify(
				`router: classifier emitted setup logs instead of JSON (likely first run). Warm once: uv run --project prompt-routing python prompt-routing/classify.py --classifier ${mode} "warmup"`,
				"warning",
			);
			return null;
		}
		void logClassifierFailure({
			event: "invalid_output",
			code: result.code,
			stdout_length: stdout.length,
			stderr_length: stderr.length,
			prompt_hash: promptHash(text),
		});
		ctx.ui.notify(
			`router: classifier output invalid, keeping current route. stdout=${stdout.slice(0, 120)}`,
			"warning",
		);
		return null;
	}

	return rec;
}
