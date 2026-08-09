/**
 * Slash Command Echo Renderer
 *
 * This extension owns the visible transcript renderer for slash echoes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { SLASH_COMMAND_ECHO_TYPE } from "../lib/slash-command-echo.js";

export default function (pi: ExtensionAPI) {
	pi.registerMessageRenderer(
		SLASH_COMMAND_ECHO_TYPE,
		(message, _options, theme) => {
			const text =
				typeof message.content === "string"
					? message.content
					: String(message.content ?? "");
			return new Text(
				theme.bold(theme.fg("success", "> ")) +
					theme.bold(theme.fg("text", text)),
				0,
				0,
			);
		},
	);
}
