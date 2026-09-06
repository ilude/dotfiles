import { spawn, type ChildProcess } from "node:child_process";

export type ProcessTreeHandle = Pick<
	ChildProcess,
	"pid" | "exitCode" | "signalCode" | "kill"
>;

type ProcessTreeOperations = {
	platform?: NodeJS.Platform;
	killGroup?: typeof process.kill;
	runTaskkill?: (pid: number, force: boolean) => Promise<number | null>;
};

type TerminateProcessTreeOptions = ProcessTreeOperations & {
	forceImmediately?: boolean;
	graceMs?: number;
	onError?: (error: unknown) => void;
};

function isRunning(child: ProcessTreeHandle): boolean {
	return child.exitCode === null && child.signalCode === null;
}

async function runTaskkill(pid: number, force: boolean): Promise<number | null> {
	const child = spawn(
		"taskkill",
		[...(force ? ["/F"] : []), "/T", "/PID", String(pid)],
		{ stdio: "ignore", windowsHide: true },
	);
	return new Promise<number | null>((resolve, reject) => {
		child.once("close", (code) => resolve(code));
		child.once("error", reject);
	});
}

export async function signalProcessTree(
	child: ProcessTreeHandle,
	force: boolean,
	operations: ProcessTreeOperations = {},
): Promise<void> {
	const pid = child.pid;
	if (!pid || !isRunning(child)) return;
	if ((operations.platform ?? process.platform) === "win32") {
		const exitCode = await (operations.runTaskkill ?? runTaskkill)(pid, force);
		if (exitCode !== 0 && isRunning(child)) {
			throw new Error(`taskkill exited with code ${exitCode ?? "unknown"}`);
		}
		return;
	}

	const signal = force ? "SIGKILL" : "SIGTERM";
	try {
		(operations.killGroup ?? process.kill)(-pid, signal);
	} catch (groupError) {
		try {
			if (!child.kill(signal)) throw groupError;
		} catch (childError) {
			if (isRunning(child)) throw childError;
		}
	}
}

export function terminateProcessTree(
	child: ProcessTreeHandle,
	options: TerminateProcessTreeOptions = {},
): void {
	const {
		forceImmediately = false,
		graceMs = 5_000,
		onError,
		...operations
	} = options;
	const report = (error: unknown) => onError?.(error);
	if (forceImmediately) {
		void signalProcessTree(child, true, operations).catch(report);
		return;
	}
	void signalProcessTree(child, false, operations).catch(report);
	const timer = setTimeout(() => {
		if (!isRunning(child)) return;
		void signalProcessTree(child, true, operations).catch(report);
	}, graceMs);
	timer.unref();
}
