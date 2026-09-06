import * as fs from "node:fs";
import * as path from "node:path";

import { ensureDirectory, getOperatorStateDir } from "./operator-state.ts";

export const TASK_RENDER_MODES = ["hidden", "compact", "full"] as const;
export type TaskRenderMode = (typeof TASK_RENDER_MODES)[number];

const DEFAULT_MODE: TaskRenderMode = "compact";

function settingsPath(): string {
	return path.join(getOperatorStateDir(), "task-settings.json");
}

export function isTaskRenderMode(value: string): value is TaskRenderMode {
	return TASK_RENDER_MODES.includes(value as TaskRenderMode);
}

export function getTaskRenderMode(): TaskRenderMode {
	try {
		const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf-8")) as {
			mode?: string;
		};
		return parsed.mode && isTaskRenderMode(parsed.mode)
			? parsed.mode
			: DEFAULT_MODE;
	} catch {
		return DEFAULT_MODE;
	}
}

export function setTaskRenderMode(mode: TaskRenderMode): TaskRenderMode {
	ensureDirectory(getOperatorStateDir());
	fs.writeFileSync(
		settingsPath(),
		`${JSON.stringify({ mode }, null, 2)}\n`,
		"utf-8",
	);
	return mode;
}
