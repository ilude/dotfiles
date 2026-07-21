import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const CLIENT = "pi";
const HEARTBEAT_MS = 60_000;
const HELPER_PATH = fileURLToPath(
	new URL("../../scripts/agent_instance_lease.py", import.meta.url),
);

interface LeaseRecord {
	client: string;
	sessionId: string;
	pid: number;
}

interface LeaseStatus {
	active: LeaseRecord[];
	malformed: Array<{ path: string; error: string }>;
	removed: string[];
}

function sessionId(ctx: ExtensionContext): string | undefined {
	return ctx.sessionManager?.getSessionId?.();
}

function otherLeases(
	status: LeaseStatus,
	currentSessionId: string,
): LeaseRecord[] {
	return status.active.filter(
		(record) =>
			record.client !== CLIENT ||
			record.sessionId !== currentSessionId ||
			record.pid !== process.pid,
	);
}

export function formatOccupancyWarning(otherCount: number): string {
	return `${otherCount} other active agent ${otherCount === 1 ? "session occupies" : "sessions occupy"} this Git worktree. Further modifying work should move to a separate Git worktree.`;
}

function updateStatus(
	ctx: ExtensionContext,
	status: LeaseStatus,
	currentSessionId: string,
): string | undefined {
	const others = otherLeases(status, currentSessionId);
	const total = others.length + 1;
	ctx.ui.setStatus(
		"instances",
		others.length > 0 ? `instances ${total} !` : `instances ${total}`,
	);
	return others.length > 0 ? formatOccupancyWarning(others.length) : undefined;
}

async function runLeaseHelper(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	action: "register" | "release",
	currentSessionId: string,
): Promise<LeaseStatus | undefined> {
	const result = await pi.exec(
		"python",
		[
			HELPER_PATH,
			action,
			"--worktree",
			ctx.cwd,
			"--client",
			CLIENT,
			"--session-id",
			currentSessionId,
			"--pid",
			String(process.pid),
		],
		{ cwd: ctx.cwd, timeout: 5000 },
	);
	if (result.code !== 0) return undefined;
	const parsed = JSON.parse(result.stdout) as LeaseStatus & {
		released?: boolean;
	};
	return action === "register" ? parsed : undefined;
}

export default function (pi: ExtensionAPI) {
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let activeContext: ExtensionContext | undefined;
	let activeSessionId: string | undefined;
	let lastWarning: string | undefined;
	let refreshInFlight = false;

	const refresh = async (notifyContext: boolean): Promise<void> => {
		if (!activeContext || !activeSessionId || refreshInFlight) return;
		refreshInFlight = true;
		try {
			const status = await runLeaseHelper(
				pi,
				activeContext,
				"register",
				activeSessionId,
			);
			if (!status) {
				activeContext.ui.setStatus("instances", "");
				lastWarning = undefined;
				return;
			}
			const warning = updateStatus(activeContext, status, activeSessionId);
			if (notifyContext && warning && warning !== lastWarning) {
				pi.sendMessage(
					{
						customType: "agent-instance-occupancy",
						content: warning,
						display: true,
					},
					{ deliverAs: "nextTurn" },
				);
			}
			lastWarning = warning;
		} catch {
			activeContext.ui.setStatus("instances", "");
			lastWarning = undefined;
		} finally {
			refreshInFlight = false;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		if (process.env.PI_SUBAGENT_RUN_ID) return;
		activeContext = ctx;
		activeSessionId = sessionId(ctx);
		if (!activeSessionId) return;
		await refresh(true);
		heartbeat = setInterval(() => void refresh(true), HEARTBEAT_MS);
	});

	pi.on("session_shutdown", async () => {
		if (heartbeat) clearInterval(heartbeat);
		heartbeat = undefined;
		if (activeContext && activeSessionId) {
			try {
				await runLeaseHelper(pi, activeContext, "release", activeSessionId);
			} catch {
				// Lease expiry handles unclean shutdowns.
			}
			activeContext.ui.setStatus("instances", "");
		}
		activeContext = undefined;
		activeSessionId = undefined;
		lastWarning = undefined;
	});
}
