import { exportLegacyTasks, importLegacyTasks, TaskMigrationError } from "../lib/task-store.ts";

const USAGE = "Usage: task-store-migrate.ts <import|export> --operator-dir <path>";
const HELP = `${USAGE}

Exit codes:
  0 success
  2 invalid command line
  3 migration lock already held
  4 unstable legacy or SQLite state
  5 invalid, unsafe, cyclic, duplicate, or unrepresentable state
  6 authority or I/O failure`;

function parseArgs(argv: readonly string[]): { mode: "import" | "export"; operatorDir: string } {
	if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
		process.stdout.write(`${HELP}\n`);
		process.exit(0);
	}
	const mode = argv[0];
	if ((mode !== "import" && mode !== "export") || argv[1] !== "--operator-dir" || !argv[2] || argv.length !== 3)
		throw new TaskMigrationError("invalid", USAGE);
	return { mode, operatorDir: argv[2] };
}

function exitCode(error: unknown): number {
	if (!(error instanceof TaskMigrationError)) return 6;
	if (error.code === "locked") return 3;
	if (error.code === "unstable") return 4;
	if (error.code === "invalid") return 5;
	return 6;
}

try {
	const args = parseArgs(process.argv.slice(2));
	const result = args.mode === "import" ? importLegacyTasks(args.operatorDir) : exportLegacyTasks(args.operatorDir);
	process.stdout.write(`${args.mode} complete: ${result.imported} task records\n`);
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = error instanceof TaskMigrationError && error.code === "invalid" && error.message === USAGE ? 2 : exitCode(error);
}
