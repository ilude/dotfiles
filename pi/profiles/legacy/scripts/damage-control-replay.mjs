import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const DECISION_TYPES = ["ask_approved", "ask_denied", "hard_block"];
const OUTCOMES = ["auto-allow", "ask", "block", "unparseable"];

function fail(message) {
	throw new Error(message);
}

function parseLogPath(argv) {
	if (argv.length > 1) {
		fail(
			"usage: node --loader pi/scripts/ts-strip-loader.mjs pi/scripts/damage-control-replay.mjs [events.jsonl]",
		);
	}
	if (argv[0]) return path.resolve(argv[0]);
	const operatorDir =
		process.env.PI_OPERATOR_DIR ??
		path.join(os.homedir(), ".pi", "agent", "operator");
	return path.join(operatorDir, "damage-control", "events.jsonl");
}

function readEvents(logPath) {
	if (!fs.existsSync(logPath)) fail(`eval log does not exist: ${logPath}`);
	return fs
		.readFileSync(logPath, "utf-8")
		.split(/\r?\n/)
		.flatMap((line, index) => {
			if (!line.trim()) return [];
			try {
				return [JSON.parse(line)];
			} catch {
				fail(`malformed JSONL: ${logPath}:${index + 1}`);
				return [];
			}
		});
}

function isInteractiveRmEvent(event) {
	return (
		event?.schemaVersion === 1 &&
		DECISION_TYPES.includes(event.decisionType) &&
		event.hasUI === true &&
		event.toolName === "bash" &&
		typeof event.redactedAction === "string" &&
		/\brm\b/.test(event.redactedAction)
	);
}

function isRedacted(action) {
	return /\[redacted(?:-[^\]]*)?\]/i.test(action);
}

function isLossyAction(event) {
	return (
		event?.redactedActionTruncated !== false ||
		event?.redactedActionLossy !== false ||
		isRedacted(event?.redactedAction ?? "")
	);
}

function historicalDecision(event) {
	return DECISION_TYPES.includes(event.decisionType)
		? event.decisionType
		: "other";
}

function formatTable(rows) {
	const header = [
		"historical decision",
		...OUTCOMES.map((outcome) => outcome.padStart(11)),
	].join(" | ");
	const separator = "-".repeat(header.length);
	return [header, separator]
		.concat(
			rows.map((row) => {
				const counts = OUTCOMES.map((outcome) =>
					String(row.counts[outcome]).padStart(11),
				);
				return `${row.decision.padEnd(19)} | ${counts.join(" | ")}`;
			}),
		)
		.join("\n");
}

async function replay(events, rules, evaluateDangerousCommand) {
	const rows = new Map();
	const wouldAutoAllowDenied = [];
	for (const event of events.filter(isInteractiveRmEvent)) {
		const decision = historicalDecision(event);
		const row = rows.get(decision) ?? {
			decision,
			counts: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])),
		};
		rows.set(decision, row);

		const cwd =
			typeof event.cwd === "string" && event.cwd ? event.cwd : undefined;
		let outcome = "unparseable";
		if (cwd && !isLossyAction(event)) {
			let autoAllowed = false;
			const result = await evaluateDangerousCommand(
				event.redactedAction,
				rules.dangerous_commands,
				{
					toolName: "bash",
					cwd,
					astAnalysis: rules.astAnalysis,
					noDeletePaths: rules.no_delete_paths,
					onAutoAllowed: () => {
						autoAllowed = true;
					},
				},
			);
			outcome = result
				? result.reason.startsWith("Confirmation required")
					? "ask"
					: "block"
				: autoAllowed
					? "auto-allow"
					: "unparseable";
		}
		row.counts[outcome] += 1;
		if (decision === "ask_denied" && outcome === "auto-allow") {
			wouldAutoAllowDenied.push(event);
		}
	}
	return { rows, wouldAutoAllowDenied };
}

async function main() {
	const logPath = parseLogPath(process.argv.slice(2));
	const [{ evaluateDangerousCommand }, { loadRules }] = await Promise.all([
		import("../extensions/damage-control-engine.js"),
		import("../extensions/damage-control-rules.js"),
	]);
	const loaded = loadRules();
	if (loaded.health.status !== "active") {
		fail(
			`damage-control rules failed to load: ${loaded.health.error ?? "unknown error"}`,
		);
	}
	const events = readEvents(logPath);
	const matchingEvents = events.filter(isInteractiveRmEvent);
	const { rows, wouldAutoAllowDenied } = await replay(
		events,
		loaded.rules,
		evaluateDangerousCommand,
	);
	const orderedRows = [
		...DECISION_TYPES.filter((decision) => rows.has(decision)).map((decision) =>
			rows.get(decision),
		),
		...Array.from(rows.values())
			.filter((row) => !DECISION_TYPES.includes(row.decision))
			.sort((left, right) => left.decision.localeCompare(right.decision)),
	];

	console.log(`damage-control replay: ${logPath}`);
	console.log(`interactive rm-family events: ${matchingEvents.length}`);
	console.log(formatTable(orderedRows));
	console.log("denied events that would auto-allow:");
	if (wouldAutoAllowDenied.length === 0) {
		console.log("  none");
	} else {
		for (const event of wouldAutoAllowDenied) {
			console.log(
				`  DENIED WOULD AUTO-ALLOW ${event.id}: ${event.redactedAction}`,
			);
		}
	}
	console.log(
		"Limitation: redacted or unparseable actions are reported as unparseable and fail closed.",
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
