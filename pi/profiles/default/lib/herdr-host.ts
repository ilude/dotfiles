import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type PiHost =
	| { kind: "terminal" }
	| { kind: "t3code" }
	| { kind: "herdr-tui"; pane: string; workspace: string; tab?: string }
	| { kind: "herdr-desktop"; terminal: string; space: string; tab: string }
	| { kind: "herdr-core"; terminal: string; membership: "none" | "unavailable" };

export type HerdrHost = Exclude<PiHost, { kind: "t3code" }>;
export type PiClient = "tui" | "rpc" | "t3code" | "json" | "print";

/** The immediate client is separate from a possibly inherited enclosing terminal host. */
export function resolvePiClient(
	mode: "tui" | "rpc" | "json" | "print",
	env: NodeJS.ProcessEnv = process.env,
): PiClient {
	if (mode !== "rpc") return mode;
	// Native children inherit parent markers but speak RPC to their own parent, not T3.
	if (env.PI_SUBAGENT_AUTHORITY) return "rpc";
	return resolvePiHost({ kind: "terminal" }, env).kind === "t3code" ? "t3code" : "rpc";
}

export function resolvePiHost(
	herdr: HerdrHost,
	env: NodeJS.ProcessEnv = process.env,
): PiHost {
	if (herdr.kind !== "terminal") return herdr;
	if (env.T3_PI_MCP_EXTENSION_PATH) return { kind: "t3code" };
	return herdr;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Detect the caller's host, not which Herdr binaries or windows happen to exist. */
export async function detectHerdrHost(
	exec: ExtensionAPI["exec"],
	env: NodeJS.ProcessEnv = process.env,
): Promise<HerdrHost> {
	// A nested original TUI can inherit HC_* from its outer desktop terminal.
	if (env.HERDR_ENV === "1" && env.HERDR_SOCKET_PATH && env.HERDR_PANE_ID && env.HERDR_WORKSPACE_ID) {
		return {
			kind: "herdr-tui", pane: env.HERDR_PANE_ID, workspace: env.HERDR_WORKSPACE_ID,
			...(env.HERDR_TAB_ID ? { tab: env.HERDR_TAB_ID } : {}),
		};
	}
	const terminal = env.HC_TERMINAL_ID;
	if (!terminal || !env.HC_TERMINAL_SOCKET) return { kind: "terminal" };
	const unavailable: HerdrHost = { kind: "herdr-core", terminal, membership: "unavailable" };
	try {
		const result = await exec("hc", ["get", terminal, "--json"], { timeout: 3000, maxBuffer: 32_768 });
		if (result.code !== 0 || result.killed || result.truncated) return unavailable;
		const current: unknown = JSON.parse(result.stdout);
		if (!isRecord(current) || current.address !== terminal || !isRecord(current.labels)) return unavailable;
		const space = current.labels["herdr.space"];
		const tab = current.labels["herdr.tab"];
		if (typeof space === "string" && space && typeof tab === "string" && tab) {
			return { kind: "herdr-desktop", terminal, space, tab };
		}
		return { kind: "herdr-core", terminal, membership: "none" };
	} catch {
		// Missing CLI, unreachable core or invalid JSON does not establish app membership.
		return unavailable;
	}
}

export function renderHerdrHost(host: HerdrHost): string {
	switch (host.kind) {
		case "terminal":
			return "Host: ordinary terminal (no Herdr caller context detected). For explicit Herdr work, load the herdr skill; installed binaries do not establish host membership.";
		case "herdr-tui":
			return [
				"Host: Herdr TUI (original herdr integration).",
				`Pane: ${JSON.stringify(host.pane)}; workspace: ${JSON.stringify(host.workspace)}${host.tab ? `; tab: ${JSON.stringify(host.tab)}` : ""}.`,
				"For Herdr operations, load the herdr skill and its TUI reference. Existing Herdr tools target this TUI server, not herdr-core or the desktop app.",
			].join("\n");
		case "herdr-desktop":
			return [
				"Host: Herdr desktop (herdr-app with herdr-core).",
				`Core terminal: ${JSON.stringify(host.terminal)}; space: ${JSON.stringify(host.space)}; tab: ${JSON.stringify(host.tab)}.`,
				"For desktop/core operations, load the herdr-desktop skill.",
				"Existing herdr_agent, herdr_layout and herdr_pane tools target the original TUI, not this desktop/core. Visible subagents, Pi tab launch/resume, plans and update integration have not been ported to desktop.",
			].join("\n");
		case "herdr-core":
			return [
				"Host: Herdr core terminal.",
				`Core terminal: ${JSON.stringify(host.terminal)}.`,
				host.membership === "none"
					? "This terminal has no complete desktop space/tab membership."
					: "Desktop membership is unverified: the bounded hc get probe was unavailable or invalid. Reload to retry detection.",
				"For core operations, load the herdr-desktop skill's core guidance; do not assume a desktop window. Existing herdr_agent, herdr_layout and herdr_pane tools target the original TUI, not this core.",
			].join("\n");
	}
}
