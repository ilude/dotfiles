import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function remoteTabCommand(alias: string, client = "herdr"): string {
	const escaped = client.replaceAll("'", "''");
	const script = `Get-ChildItem Env:HERDR* | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }; & '${escaped}' --remote '${alias}'`;
	const encoded = Buffer.from(script, "utf16le").toString("base64");
	return encoded;
}

export default function connect(pi: ExtensionAPI): void {
	pi.registerCommand("connect", {
		description: "Open a Windows Terminal tab attached to a remote Herdr server via SSH",
		handler: async (rawArgs, ctx) => {
			const alias = rawArgs.trim();
			if (!alias || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(alias)) {
				ctx.ui.notify("Usage: /connect <ssh-alias>", "error");
				return;
			}
			if (process.platform !== "win32") {
				ctx.ui.notify("/connect currently requires Windows Terminal on Windows.", "error");
				return;
			}
			const encoded = remoteTabCommand(alias);
			const terminalArgs = ["-w", "0", "new-tab", "--title", `Herdr: ${alias}`, "pwsh.exe", "-NoExit", "-EncodedCommand", encoded];
			const child = spawn("wt.exe", terminalArgs, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
			child.on("error", error => ctx.ui.notify(`Could not launch Windows Terminal: ${error.message}`, "error"));
			child.unref();
			ctx.ui.notify(`Opening remote Herdr tab for ${alias}.`, "info");
		},
	});
}
