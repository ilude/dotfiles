/**
 * Echo Slash Commands Extension
 *
 * Pi treats `/<cmd>` registered via `pi.registerCommand` as out-of-band
 * control invocations: they execute immediately in the same code path and
 * never get appended to the conversation transcript (see core/agent-session.ts
 * `prompt()` -- the `_tryExecuteExtensionCommand` early-return). The user
 * never sees `/commit` or `/review-it` echoed back as a chat entry.
 *
 * Skill invocations (`/skill:foo`) and prompt-template invocations are
 * expanded inline into a normal user message, so they ARE visible. Only
 * extension-registered commands are silent.
 *
 * This extension restores parity by emitting a custom-typed message with the
 * raw invocation text whenever an input maps to a `source: "extension"`
 * slash command, before pi runs it. The original input continues unchanged
 * so the underlying command still executes normally.
 *
 * Skip cases:
 *   - non-slash input (skip)
 *   - input.source === "extension" (recursion guard, matches workflow-commands.ts)
 *   - command name resolves to a "prompt" or "skill" source (already visible)
 *   - command name does not resolve at all (let pi handle it as text or error)
 */

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const ECHO_TYPE = "slash-echo";

function commandNameOf(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return "";
	const space = trimmed.search(/\s/);
	return space === -1 ? trimmed.slice(1) : trimmed.slice(1, space);
}

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event, _ctx) => {
		// Recursion guard: don't echo inputs that other extensions injected.
		if (event.source === "extension") return { action: "continue" };

		const name = commandNameOf(event.text);
		if (!name) return { action: "continue" };

		// Only echo when the command resolves to a registered extension command.
		// "prompt" and "skill" sources expand inline and are already visible.
		if (typeof pi.getCommands !== "function") return { action: "continue" };
		const match = pi.getCommands().find((c) => c.name === name);
		if (!match || match.source !== "extension") return { action: "continue" };

		if (typeof pi.sendMessage === "function") {
			pi.sendMessage({
				customType: ECHO_TYPE,
				content: event.text.trim(),
				display: true,
			});
		}
		return { action: "continue" };
	});
}
