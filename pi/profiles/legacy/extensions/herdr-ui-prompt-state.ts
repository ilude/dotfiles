import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function promptLabel(title: string | undefined): string {
	return title ? `Waiting for user: ${title}` : "Waiting for user";
}

export default function herdrUiPromptState(pi: ExtensionAPI): void {
	let managedCustomUiCount = 0;
	let reportedBlockedPrompt = false;

	pi.events.on("herdr:managed-custom-ui", (data) => {
		if (
			typeof data !== "object" ||
			data === null ||
			!("active" in data) ||
			typeof data.active !== "boolean"
		)
			return;
		managedCustomUiCount = Math.max(
			0,
			managedCustomUiCount + (data.active ? 1 : -1),
		);
	});

	pi.on("ui_prompt_start", (event) => {
		reportedBlockedPrompt = false;
		if (event.kind === "custom" && managedCustomUiCount > 0) return;

		reportedBlockedPrompt = true;
		pi.events.emit("herdr:blocked", {
			active: true,
			label: promptLabel(event.title),
		});
	});

	pi.on("ui_prompt_end", () => {
		if (!reportedBlockedPrompt) return;
		reportedBlockedPrompt = false;
		pi.events.emit("herdr:blocked", { active: false });
	});
}
