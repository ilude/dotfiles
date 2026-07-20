import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Redirect operator/metrics state to a temp dir so test runs never write
// telemetry (damage-control eval events, decisions, metrics) into the live
// ~/.pi/agent state. Tests that need their own dirs still override these.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tests-"));
process.env.PI_OPERATOR_DIR = path.join(scratch, "operator");
process.env.PI_METRICS_DIR = path.join(scratch, "metrics");
