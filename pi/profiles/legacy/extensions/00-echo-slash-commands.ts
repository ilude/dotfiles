/**
 * Slash Command Echo Renderer
 *
 * This extension owns the visible transcript renderer for slash echoes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	SLASH_COMMAND_ECHO_TYPE,
	type SlashCommandEchoEntry,
} from "../lib/slash-command-echo.js";

export default function (pi: ExtensionAPI) {
	pi.registerEntryRenderer<SlashCommandEchoEntry>(
		SLASH_COMMAND_ECHO_TYPE,
		(entry, _options, theme) => {
			const data = entry.data;
			if (!data) return undefined;
			const prefix = data.kind === "next-command" ? "next: " : "> ";
			const color = data.kind === "next-command" ? "accent" : "text";
			return new Text(
				theme.bold(theme.fg("success", prefix)) +
					theme.bold(theme.fg(color, data.text)),
				0,
				0,
			);
		},
	);
	pi.registerMessageRenderer(
		SLASH_COMMAND_ECHO_TYPE,
		(message, _options, theme) => {
			if (typeof message.content !== "string") return undefined;
			return new Text(
				theme.bold(theme.fg("success", "> ")) +
					theme.bold(theme.fg("text", message.content)),
				0,
				0,
			);
		},
	);
}
