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
		(entry, _options, theme) =>
			new Text(
				theme.bold(theme.fg("success", "> ")) +
					theme.bold(theme.fg("text", entry.data?.text ?? "")),
				0,
				0,
			),
	);
}
