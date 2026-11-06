import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectHerdrHost, renderHerdrHost } from "../lib/herdr-host.ts";

export default function herdrHost(pi: Pick<ExtensionAPI, "on" | "exec">): void {
	let detection: ReturnType<typeof detectHerdrHost> | undefined;
	const detect = () => detection ??= detectHerdrHost((...args) => pi.exec(...args));

	pi.on("session_start", async () => { await detect(); });
	pi.on("before_agent_start", async (event) => {
		event.systemPromptOptions.sections.herdr_host = renderHerdrHost(await detect());
	});
}
