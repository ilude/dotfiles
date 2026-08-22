import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll } from "vitest";

// Redirect operator/metrics state to a temp dir so test runs never write
// telemetry (damage-control eval events, decisions, metrics) into the live
// ~/.pi/agent state. Tests that need their own dirs still override these.
const previousOperatorDir = process.env.PI_OPERATOR_DIR;
const previousMetricsDir = process.env.PI_METRICS_DIR;
const subagentEnvironmentNames = [
	"PI_SUBAGENT_RUN_ID",
	"PI_SUBAGENT_STARTED_AT",
	"PI_SUBAGENT_ROLE",
	"PI_SUBAGENT_DEPTH",
	"PI_SUBAGENT_PARENT_RUN_ID",
	"PI_SUBAGENT_COORDINATOR_TASK_ID",
	"PI_SUBAGENT_TREE_ID",
	"PI_SUBAGENT_TREE_RUN_ID",
	"PI_SUBAGENT_TREE_ROLE",
	"PI_SUBAGENT_TREE_DEPTH",
	"PI_SUBAGENT_TREE_CALLER_TOKEN",
	"PI_SUBAGENT_TREE_BROKER_HOST",
	"PI_SUBAGENT_TREE_BROKER_PORT",
	"PI_SUBAGENT_TREE_BROKER_TOKEN",
	"PI_SUBAGENT_TREE_PROTOCOL_VERSION",
	"PI_SUBAGENT_TREE_RUNTIME_GENERATION",
	"PI_SUBAGENT_SCOPE_POLICY",
	"ONCLAVE_PI_ROOT_CAPABILITY",
	"ONCLAVE_PI_SUBAGENT_INELIGIBLE",
] as const;
const previousSubagentEnvironment = Object.fromEntries(
	subagentEnvironmentNames.map((name) => [name, process.env[name]]),
) as Record<(typeof subagentEnvironmentNames)[number], string | undefined>;
for (const name of subagentEnvironmentNames) delete process.env[name];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tests-"));
process.env.PI_OPERATOR_DIR = path.join(scratch, "operator");
process.env.PI_METRICS_DIR = path.join(scratch, "metrics");

afterAll(() => {
	if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = previousOperatorDir;
	if (previousMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = previousMetricsDir;
	for (const name of subagentEnvironmentNames) {
		const previous = previousSubagentEnvironment[name];
		if (previous === undefined) delete process.env[name];
		else process.env[name] = previous;
	}
	fs.rmSync(scratch, { recursive: true, force: true });
});
