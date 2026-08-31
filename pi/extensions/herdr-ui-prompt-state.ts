import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function promptLabel(title: string | undefined): string {
	return title ? `Waiting for user: ${title}` : "Waiting for user";
}

export default function herdrUiPromptState(pi: ExtensionAPI): void {
	pi.on("ui_prompt_start", (event) => {
		pi.events.emit("herdr:blocked", {
			active: true,
			label: promptLabel(event.title),
		});
	});

	pi.on("ui_prompt_end", () => {
		pi.events.emit("herdr:blocked", { active: false });
	});
}
