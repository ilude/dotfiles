import fs from "node:fs";
import path from "node:path";

const REQUIRED = ["plan", "evidence-dir", "smoke-dir"];
const REQUIRED_CHECKS = [
	"T1",
	"T2",
	"V1",
	"T3",
	"T4",
	"T5",
	"V2",
	"T6",
	"T7",
	"V3",
	"F1",
	"F2",
	"F3",
	"F4",
];
const FORBIDDEN_KEYS = new Set([
	"prompt",
	"output",
	"stderr",
	"command",
	"path",
	"failureReason",
	"errorReason",
	"error",
	"text",
	"content",
]);
const MAX_SMOKE_AGE_MS = 24 * 60 * 60 * 1000;
const TERMINAL = new Set([
	"completed",
	"failed",
	"cancelled",
	"stopped",
	"failed_to_stop",
	"orphaned",
	"rejected",
]);

function fail(message) {
	throw new Error(message);
}

function options(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index]?.replace(/^--/, "");
		const value = argv[index + 1];
		if (!key || !value || !REQUIRED.includes(key) || values.has(key))
			fail("usage: --plan <path> --evidence-dir <path> --smoke-dir <path>");
		values.set(key, path.resolve(value));
	}
	if (
		values.size !== REQUIRED.length ||
		REQUIRED.some((key) => !values.has(key))
	)
		fail("usage: --plan <path> --evidence-dir <path> --smoke-dir <path>");
	return {
		plan: values.get("plan"),
		evidenceDir: values.get("evidence-dir"),
		smokeDir: values.get("smoke-dir"),
	};
}

function read(file) {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		fail(`missing required file: ${file}`);
	}
}

function jsonLines(file) {
	const records = [];
	for (const [index, line] of read(file).split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		try {
			records.push(JSON.parse(line));
		} catch {
			fail(`malformed JSONL: ${file}:${index + 1}`);
		}
	}
	return records;
}

function descendants(root) {
	const files = [];
	const visit = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const target = path.join(dir, entry.name);
			if (entry.isDirectory()) visit(target);
			else if (entry.isFile()) files.push(target);
		}
	};
	visit(root);
	return files.sort();
}

function assertContained(target, root, label) {
	const relative = path.relative(root, target);
	if (
		relative === "" ||
		(!relative.startsWith(`..${path.sep}`) &&
			relative !== ".." &&
			!path.isAbsolute(relative))
	)
		return;
	fail(`${label} is outside smoke directory`);
}

function checkPlan(plan) {
	for (const id of REQUIRED_CHECKS) {
		const match = plan.match(
			new RegExp(
				`- \\[([ x])\\] ${id}:.*?\\n  - Status: ([^\\n]+)\\n  - Evidence: ([^\\n]+)`,
				"s",
			),
		);
		if (
			match?.[1] !== "x" ||
			!/^completed$/i.test(match[2].trim()) ||
			!match[3].trim() ||
			/^(?:--|pending|placeholder)$/i.test(match[3].trim())
		)
			fail(`incomplete checklist evidence for ${id}`);
	}
	const f5 = plan.match(/- \[([ x])\] F5:.*?\n {2}- Status: ([^\n]+)/s);
	if (f5?.[1] !== " " || !/^pending$/i.test(f5[2].trim()))
		fail("F5 must remain pending");
}

function checkEvidence(evidenceDir) {
	if (!fs.statSync(evidenceDir).isDirectory())
		fail("evidence directory is not a directory");
	const files = descendants(evidenceDir);
	if (files.length === 0) fail("evidence directory is empty");
	for (const file of files) {
		if (path.basename(file) === "archive-preflight.log") continue;
		if (fs.statSync(file).size === 0) fail(`empty evidence capture: ${file}`);
	}
}

function forbiddenKey(value) {
	if (Array.isArray(value)) return value.some(forbiddenKey);
	if (!value || typeof value !== "object") return false;
	return Object.entries(value).some(
		([key, nested]) => FORBIDDEN_KEYS.has(key) || forbiddenKey(nested),
	);
}

function checkSmoke(smokeDir) {
	if (!fs.statSync(smokeDir).isDirectory())
		fail("smoke directory is not a directory");
	if (Date.now() - fs.statSync(smokeDir).mtimeMs > MAX_SMOKE_AGE_MS)
		fail("smoke directory is stale");
	for (const root of ["metrics", "operator", "friction"]) {
		const target = path.join(smokeDir, root);
		if (!fs.existsSync(target) || !fs.statSync(target).isDirectory())
			fail(`missing smoke root: ${root}`);
	}
	for (const file of descendants(smokeDir))
		assertContained(file, smokeDir, "smoke file");
	const metricFiles = descendants(path.join(smokeDir, "metrics")).filter(
		(file) =>
			path.basename(file).match(/^metrics(?:-\d{4}-\d{2}-\d{2})?\.jsonl$/),
	);
	if (metricFiles.length !== 1)
		fail("smoke must contain exactly one metrics capture");
	const events = jsonLines(metricFiles[0]);
	const runs = events.filter((event) => event?.event === "orchestration_run");
	const interactions = events.filter(
		(event) => event?.event === "orchestration_interaction",
	);
	if (runs.length !== 1 || interactions.length < 1)
		fail("smoke requires exactly one run and at least one interaction");
	const run = runs[0];
	if (
		!run?.id ||
		!run?.data?.orchestrationId ||
		!run?.data?.interactionId ||
		!run?.data?.mode ||
		!run?.data?.status ||
		!Array.isArray(run?.data?.workers) ||
		run.data.workers.some(
			(worker) =>
				!worker ||
				typeof worker.runId !== "string" ||
				typeof worker.agent !== "string" ||
				typeof worker.status !== "string",
		) ||
		forbiddenKey(run.data)
	)
		fail("run is missing required fields or contains forbidden content");
	if (!TERMINAL.has(run.data.status)) fail("smoke run is not terminal");
	const joined = interactions.filter(
		(event) => event?.data?.interactionId === run.data.interactionId,
	);
	if (
		joined.length !== 1 ||
		!Array.isArray(joined[0]?.data?.orchestrationIds) ||
		!Array.isArray(joined[0]?.data?.parentUsageByModel) ||
		typeof joined[0]?.data?.direct !== "boolean" ||
		joined[0].data.orchestrationIds.filter(
			(id) => id === run.data.orchestrationId,
		).length !== 1 ||
		forbiddenKey(joined[0].data)
	)
		fail("run-to-interaction join is not exact");
	for (const event of events) {
		if (
			event?.schemaVersion !== 1 ||
			typeof event.id !== "string" ||
			typeof event.ts !== "string"
		)
			fail("invalid metrics envelope");
	}
}

try {
	const { plan, evidenceDir, smokeDir } = options(process.argv.slice(2));
	checkPlan(read(plan));
	checkEvidence(evidenceDir);
	checkSmoke(smokeDir);
	console.log("orchestration telemetry archive preflight passed");
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
