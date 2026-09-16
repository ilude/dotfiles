import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const api = await jiti.import("./api.ts");
const active = new Map();

function errorText(error) {
	if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 16_384);
	return String(error).slice(0, 16_384);
}

process.on("message", async message => {
	if (!message || typeof message !== "object") return;
	if (message.type === "cancel" && typeof message.id === "string") {
		active.get(message.id)?.abort();
		return;
	}
	if (message.type !== "execute" || typeof message.id !== "string") return;
	const controller = new AbortController();
	active.set(message.id, controller);
	try {
		const { registry, request } = message;
		let details;
		switch (request.operation) {
			case "sessions": details = await api.sessionAnalytics(registry, request, controller.signal); break;
			case "query": details = await api.queryAnalytics(registry, request, controller.signal); break;
			case "search": details = await api.searchAnalytics(registry, request, controller.signal); break;
			case "follow_up": details = await api.followUpAnalytics(registry, request, controller.signal); break;
			case "session_lineage": details = await api.sessionLineageAnalytics(registry, request, controller.signal); break;
			default: throw new Error("unsupported analytics worker operation");
		}
		process.send?.({ type: "result", id: message.id, details });
	} catch (error) {
		process.send?.({ type: "error", id: message.id, error: errorText(error) });
	} finally {
		active.delete(message.id);
	}
});
