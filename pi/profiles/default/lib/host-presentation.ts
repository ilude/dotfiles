import { stripVTControlCharacters } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolvePiClient, type PiClient } from "./herdr-host.ts";

export type PresentationContext = Pick<ExtensionContext, "mode" | "hasUI"> & {
	ui: Pick<ExtensionContext["ui"], "notify" | "setStatus">;
};
export type NoticeLevel = "info" | "warning" | "error";

/** Presentation only: never appends model messages, starts turns, or controls host sessions. */
export interface HostPresentation {
	readonly client: PiClient;
	readonly nativeTranscript: boolean;
	readonly widgets: boolean;
	notify(text: string, level?: NoticeLevel): void;
	status(key: string, text: string | undefined): void;
}

export function createHostPresentation(
	ctx: PresentationContext,
	env: NodeJS.ProcessEnv = process.env,
): HostPresentation {
	const client = resolvePiClient(ctx.mode, env);
	const terminal = client === "tui";
	const plain = (text: string) => terminal ? text : stripVTControlCharacters(text);
	return {
		client,
		nativeTranscript: terminal,
		// Generic RPC clients can render string widgets. T3 explicitly ignores them.
		widgets: ctx.hasUI && (terminal || client === "rpc"),
		notify(text, level = "info") {
			if (ctx.hasUI) ctx.ui.notify(plain(text), level);
		},
		status(key, text) {
			if (ctx.hasUI) ctx.ui.setStatus(key, text === undefined ? undefined : plain(text));
		},
	};
}
