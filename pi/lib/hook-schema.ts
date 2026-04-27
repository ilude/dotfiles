/**
 * Hook schema -- typed contract for declarative hook configuration.
 *
 * Owned by .specs/pi-platform-alignment/plan.md (Phase 1 T1). Mirrors the
 * shape of Claude Code's HookCommandSchema so a settings.json hook block is
 * portable across both platforms once the (currently deferred) hook engine
 * lands. Until then this module ships the types + validator only; consumers
 * read but do not execute hook configs.
 *
 * Event names are pi runtime events: tool_call, tool_result, session_start,
 * session_shutdown, input, before_agent_start. The schema accepts unknown
 * events as-is so future runtime additions do not require a parser bump.
 */

export const PI_HOOK_EVENTS = [
	"tool_call",
	"tool_result",
	"session_start",
	"session_shutdown",
	"input",
	"before_agent_start",
] as const;

export type PiHookEvent = (typeof PI_HOOK_EVENTS)[number];

export type HookEventName = PiHookEvent | (string & {});

export type HookEntryType = "command" | "prompt";

export interface HookEntry {
	type: HookEntryType;
	command: string;
	if?: string;
	timeout?: number;
	async?: boolean;
	env?: Record<string, string>;
}

export interface HookGroup {
	event: HookEventName;
	matcher?: string;
	hooks: HookEntry[];
}

export interface HookConfig {
	hooks?: HookGroup[];
}

export type HookValidationIssueLevel = "error" | "warning";

export interface HookValidationIssue {
	level: HookValidationIssueLevel;
	path: string;
	message: string;
}

export interface HookValidationResult {
	ok: boolean;
	issues: HookValidationIssue[];
	groups: HookGroup[];
}

const KNOWN_HOOK_TYPES: ReadonlySet<HookEntryType> = new Set(["command", "prompt"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function validateEntry(
	rawEntry: unknown,
	pathPrefix: string,
	issues: HookValidationIssue[],
): HookEntry | null {
	if (!isPlainObject(rawEntry)) {
		issues.push({
			level: "error",
			path: pathPrefix,
			message: "hook entry must be an object",
		});
		return null;
	}

	const type = asString(rawEntry.type);
	const command = asString(rawEntry.command);
	if (!type || !KNOWN_HOOK_TYPES.has(type as HookEntryType)) {
		issues.push({
			level: "error",
			path: `${pathPrefix}.type`,
			message: `hook type must be one of: ${[...KNOWN_HOOK_TYPES].join(", ")} (got ${type ?? "<missing>"})`,
		});
		return null;
	}
	if (!command) {
		issues.push({
			level: "error",
			path: `${pathPrefix}.command`,
			message: "hook command is required",
		});
		return null;
	}

	const entry: HookEntry = { type: type as HookEntryType, command };

	const ifExpr = asString(rawEntry.if);
	if (ifExpr !== undefined) entry.if = ifExpr;

	if (rawEntry.timeout !== undefined) {
		const t = rawEntry.timeout;
		if (typeof t !== "number" || !Number.isFinite(t) || t < 0) {
			issues.push({
				level: "error",
				path: `${pathPrefix}.timeout`,
				message: "timeout must be a non-negative finite number (ms)",
			});
		} else {
			entry.timeout = t;
		}
	}
	if (rawEntry.async !== undefined) {
		if (typeof rawEntry.async !== "boolean") {
			issues.push({
				level: "warning",
				path: `${pathPrefix}.async`,
				message: "async should be a boolean; ignoring non-boolean value",
			});
		} else {
			entry.async = rawEntry.async;
		}
	}
	if (rawEntry.env !== undefined) {
		if (!isPlainObject(rawEntry.env)) {
			issues.push({
				level: "warning",
				path: `${pathPrefix}.env`,
				message: "env must be an object of string -> string; ignoring",
			});
		} else {
			const env: Record<string, string> = {};
			for (const [k, v] of Object.entries(rawEntry.env)) {
				if (typeof v === "string") env[k] = v;
				else
					issues.push({
						level: "warning",
						path: `${pathPrefix}.env.${k}`,
						message: "env values must be strings",
					});
			}
			entry.env = env;
		}
	}

	return entry;
}

function validateGroup(
	rawGroup: unknown,
	index: number,
	issues: HookValidationIssue[],
): HookGroup | null {
	const path = `hooks[${index}]`;
	if (!isPlainObject(rawGroup)) {
		issues.push({ level: "error", path, message: "hook group must be an object" });
		return null;
	}
	const event = asString(rawGroup.event);
	if (!event) {
		issues.push({ level: "error", path: `${path}.event`, message: "event is required" });
		return null;
	}
	if (!PI_HOOK_EVENTS.includes(event as PiHookEvent)) {
		issues.push({
			level: "warning",
			path: `${path}.event`,
			message: `event "${event}" is not a known pi runtime event; loader accepts it but the hook may never fire`,
		});
	}
	const rawHooks = rawGroup.hooks;
	if (!Array.isArray(rawHooks) || rawHooks.length === 0) {
		issues.push({
			level: "error",
			path: `${path}.hooks`,
			message: "hooks must be a non-empty array",
		});
		return null;
	}
	const entries: HookEntry[] = [];
	for (let i = 0; i < rawHooks.length; i++) {
		const entry = validateEntry(rawHooks[i], `${path}.hooks[${i}]`, issues);
		if (entry) entries.push(entry);
	}
	if (entries.length === 0) return null;
	const group: HookGroup = { event, hooks: entries };
	const matcher = asString(rawGroup.matcher);
	if (matcher !== undefined) group.matcher = matcher;
	return group;
}

/**
 * Validate a hook configuration object. The result includes parsed groups
 * plus a list of issues. Errors mark the result as not-ok; warnings do not.
 */
export function validateHookConfig(input: unknown): HookValidationResult {
	const issues: HookValidationIssue[] = [];
	if (input === undefined || input === null) {
		return { ok: true, issues, groups: [] };
	}
	if (!isPlainObject(input)) {
		issues.push({ level: "error", path: "<root>", message: "hook config must be an object" });
		return { ok: false, issues, groups: [] };
	}
	const rawHooks = (input as Record<string, unknown>).hooks;
	if (rawHooks === undefined) {
		return { ok: true, issues, groups: [] };
	}
	if (!Array.isArray(rawHooks)) {
		issues.push({
			level: "error",
			path: "hooks",
			message: "hooks must be an array of hook groups",
		});
		return { ok: false, issues, groups: [] };
	}
	const groups: HookGroup[] = [];
	for (let i = 0; i < rawHooks.length; i++) {
		const group = validateGroup(rawHooks[i], i, issues);
		if (group) groups.push(group);
	}
	const hasErrors = issues.some((iss) => iss.level === "error");
	return { ok: !hasErrors, issues, groups };
}

/**
 * True iff `event` is one of the documented pi runtime events. Used by
 * future hook engine work to decide whether a registered group can possibly
 * fire on this runtime.
 */
export function isKnownPiHookEvent(event: string): event is PiHookEvent {
	return (PI_HOOK_EVENTS as readonly string[]).includes(event);
}
