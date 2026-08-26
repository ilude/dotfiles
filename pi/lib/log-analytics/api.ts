import path from "node:path";
import { definitionFor, discoverSourcePaths, registeredSources, runtimeRoots, sourcePath } from "./registry.ts";
import { LogAnalyticsStore, type RefreshOptions } from "./store.ts";

export type AnalyticsSourceId = (typeof registeredSources)[number]["name"];
export type AnalyticsColumnId = string;
export type AnalyticsCatalogEntry = { source: AnalyticsSourceId; columns: readonly { name: string; type: string }[] };

export type AnalyticsFilter = {
	column: AnalyticsColumnId;
	op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
	value: string | number | boolean | null;
};

export type AnalyticsSelectRequest = {
	source: AnalyticsSourceId;
	columns: readonly AnalyticsColumnId[];
	filters?: readonly AnalyticsFilter[];
	orderBy?: readonly { column: AnalyticsColumnId; direction?: "asc" | "desc" }[];
	limit?: number;
};

export type AnalyticsAggregateRequest = {
	source: AnalyticsSourceId;
	groupBy?: readonly AnalyticsColumnId[];
	measures: readonly {
		kind: "count" | "sum";
		column?: AnalyticsColumnId;
		as?: string;
	}[];
	filters?: readonly AnalyticsFilter[];
	limit?: number;
};

export type AnalyticsBudget = {
	maxRows?: number;
	maxBytes?: number;
	maxElapsedMs?: number;
};

export type AnalyticsOperationOptions = AnalyticsBudget & {
	signal?: AbortSignal;
	refresh?: RefreshOptions;
};

export class AnalyticsBoundaryError extends Error {
	readonly code: "invalid_request" | "budget_exceeded" | "cancelled" | "unknown_id";
	constructor(code: AnalyticsBoundaryError["code"], message: string) {
		super(message);
		this.name = "AnalyticsBoundaryError";
		this.code = code;
	}
}

const DEFAULT_BUDGET: Required<AnalyticsBudget> = {
	maxRows: 1000,
	maxBytes: 256 * 1024,
	maxElapsedMs: 5000,
};

function definition(source: string) {
	const value = definitionFor(source);
	if (!value) throw new AnalyticsBoundaryError("unknown_id", `unknown analytics source: ${source}`);
	return value;
}

function columnNames(source: string): Set<string> {
	return new Set(definition(source).columns.map((column) => column.name));
}

function assertColumn(source: string, column: string): void {
	if (!columnNames(source).has(column))
		throw new AnalyticsBoundaryError("unknown_id", `unknown analytics column: ${source}.${column}`);
}

function assertLimit(limit: number | undefined, maxRows = DEFAULT_BUDGET.maxRows): number {
	if (limit === undefined) return maxRows
	if (!Number.isInteger(limit) || limit < 1 || limit > maxRows)
		throw new AnalyticsBoundaryError("invalid_request", "limit must be between 1 and the row budget");
	return limit;
}

function parametersForFilters(source: string, filters: readonly AnalyticsFilter[] | undefined): { sql: string; values: unknown[] } {
	if (filters && filters.length > 16) throw new AnalyticsBoundaryError("invalid_request", "at most 16 filters are allowed");
	if (!filters?.length) return { sql: "", values: [] };
	const clauses: string[] = [];
	const values: unknown[] = [];
	for (const filter of filters) {
		assertColumn(source, filter.column);
		if (!["eq", "neq", "lt", "lte", "gt", "gte"].includes(filter.op)) throw new AnalyticsBoundaryError("invalid_request", "unknown filter operator");
		if (typeof filter.value === "number" && !Number.isFinite(filter.value)) throw new AnalyticsBoundaryError("invalid_request", "filter values must be finite");
		if (filter.value === null && !["eq", "neq"].includes(filter.op))
			throw new AnalyticsBoundaryError("invalid_request", "null filters support only eq or neq");
		const operator = { eq: "=", neq: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" }[filter.op];
		clauses.push(filter.value === null ? `${quote(filter.column)} IS ${filter.op === "neq" ? "NOT " : ""}NULL` : `${quote(filter.column)} ${operator} ?`);
		if (filter.value !== null) values.push(filter.value);
	}
	return { sql: ` WHERE ${clauses.join(" AND ")}`, values };
}

function alias(value: string | undefined, fallback: string): string {
	const result = value ?? fallback;
	if (!result || result.length > 64) throw new AnalyticsBoundaryError("invalid_request", "aggregate aliases must be 1 to 64 characters");
	return result;
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }

function budget(options: AnalyticsOperationOptions): Required<AnalyticsBudget> {
	const limits = {
		maxRows: options.maxRows ?? DEFAULT_BUDGET.maxRows,
		maxBytes: options.maxBytes ?? DEFAULT_BUDGET.maxBytes,
		maxElapsedMs: options.maxElapsedMs ?? DEFAULT_BUDGET.maxElapsedMs,
	};
	for (const [name, value] of Object.entries(limits)) {
		const maximum = DEFAULT_BUDGET[name as keyof AnalyticsBudget];
		if (!Number.isInteger(value) || value < 1 || value > maximum)
			throw new AnalyticsBoundaryError("invalid_request", "invalid analytics budget: " + name);
	}
	return limits;
}

function checkBudget(rows: Record<string, unknown>[], started: number, limits: Required<AnalyticsBudget>): Record<string, unknown>[] {
	if (Date.now() - started > limits.maxElapsedMs) throw new AnalyticsBoundaryError("budget_exceeded", "analytics operation exceeded its time budget");
	if (rows.length > limits.maxRows) throw new AnalyticsBoundaryError("budget_exceeded", "analytics operation exceeded its row budget");
	const encoded = Buffer.byteLength(JSON.stringify(rows, (_key, value) => typeof value === "bigint" ? Number(value) : value), "utf8");
	if (encoded > limits.maxBytes) throw new AnalyticsBoundaryError("budget_exceeded", "analytics operation exceeded its byte budget");
	return rows;
}

async function runBounded<T>(work: (signal: AbortSignal) => Promise<T>, options: AnalyticsOperationOptions): Promise<T> {
	if (options.signal?.aborted) throw new AnalyticsBoundaryError("cancelled", "analytics operation was cancelled");
	const limits = budget(options);
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onAbort, { once: true });
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new AnalyticsBoundaryError("budget_exceeded", "analytics operation exceeded its time budget"));
		}, limits.maxElapsedMs);
	});
	const abort = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(options.signal?.aborted ? new AnalyticsBoundaryError("cancelled", "analytics operation was cancelled") : new AnalyticsBoundaryError("budget_exceeded", "analytics operation exceeded its time budget")), { once: true }));
	try { return await Promise.race([work(controller.signal), timeout, abort]); } finally {
		if (timer) clearTimeout(timer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

export function analyticsCatalog(): AnalyticsCatalogEntry[] {
	return registeredSources.map((source) => ({ source: source.name, columns: source.columns }));
}

export async function openAnalyticsStore(databasePath: string): Promise<LogAnalyticsStore> {
	const store = await LogAnalyticsStore.open(databasePath);
	for (const source of registeredSources) {
		const current = definitionFor(source.name);
		if (current) await store.register(current);
	}
	return store;
}

export async function refreshRegisteredAnalytics(
	store: LogAnalyticsStore,
	root: string,
	options: RefreshOptions = {},
): Promise<void> {
	for (const source of registeredSources) {
		const roots = runtimeRoots(root, source.name);
		const paths = (await Promise.all(roots.map((candidateRoot) => discoverSourcePaths(candidateRoot, source.name)))).flat();
		const uniquePaths = [...new Set(paths.length > 0 ? paths : sourcePath(root, source.name))];
		const current = definitionFor(source.name, roots);
		if (!current) continue;
		try { await store.refresh(current, uniquePaths, options); } catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
	}
}

export async function selectAnalytics(
	store: LogAnalyticsStore,
	request: AnalyticsSelectRequest,
	options: AnalyticsOperationOptions = {},
): Promise<Record<string, unknown>[]> {
	const limits = budget(options);
	const columns = [...request.columns];
	if (columns.length === 0) throw new AnalyticsBoundaryError("invalid_request", "at least one column is required");
	if (columns.length > 32) throw new AnalyticsBoundaryError("invalid_request", "at most 32 columns are allowed");
	for (const column of columns) assertColumn(request.source, column);
	const filters = parametersForFilters(request.source, request.filters);
	if ((request.orderBy?.length ?? 0) > 8) throw new AnalyticsBoundaryError("invalid_request", "at most 8 order columns are allowed");
	const ordering = (request.orderBy ?? []).map((item) => { assertColumn(request.source, item.column); return `${quote(item.column)} ${item.direction === "desc" ? "DESC" : "ASC"}`; });
	const sql = `SELECT ${columns.map(quote).join(", ")} FROM source_${request.source}${filters.sql}${ordering.length ? ` ORDER BY ${ordering.join(", ")}` : ""} LIMIT ${assertLimit(request.limit)}`;
	return runBounded(async (signal) => checkBudget(await store.query(sql, filters.values, signal), Date.now(), budget(options)), options);
}

export async function aggregateAnalytics(
	store: LogAnalyticsStore,
	request: AnalyticsAggregateRequest,
	options: AnalyticsOperationOptions = {},
): Promise<Record<string, unknown>[]> {
	const limits = budget(options);
	const groups = [...(request.groupBy ?? [])];
	if (groups.length > 16) throw new AnalyticsBoundaryError("invalid_request", "at most 16 group columns are allowed");
	for (const column of groups) assertColumn(request.source, column);
	if (!request.measures?.length) throw new AnalyticsBoundaryError("invalid_request", "at least one measure is required");
	if (request.measures.length > 16) throw new AnalyticsBoundaryError("invalid_request", "at most 16 measures are allowed");
	const measures = request.measures.map((measure, index) => {
		if (measure.kind === "count") return `COUNT(*) AS ${quote(alias(measure.as, "count"))}`;
		if (measure.kind !== "sum") throw new AnalyticsBoundaryError("invalid_request", "unknown aggregate measure");
		if (!measure.column) throw new AnalyticsBoundaryError("invalid_request", "sum requires a column");
		assertColumn(request.source, measure.column);
		if (!definition(request.source).columns.find((column) => column.name === measure.column && ["BIGINT", "DOUBLE"].includes(column.type)))
			throw new AnalyticsBoundaryError("invalid_request", "sum requires a numeric registered column");
		return `SUM(${quote(measure.column)}) AS ${quote(alias(measure.as, "sum_" + measure.column + "_" + index))}`;
	});
	const filters = parametersForFilters(request.source, request.filters);
	const sql = `SELECT ${[...groups.map(quote), ...measures].join(", ")} FROM source_${request.source}${filters.sql}${groups.length ? ` GROUP BY ${groups.map(quote).join(", ")}` : ""} LIMIT ${assertLimit(request.limit)}`;
	return runBounded(async (signal) => checkBudget(await store.query(sql, filters.values, signal), Date.now(), budget(options)), options);
}

export function defaultAnalyticsDatabase(root: string): string {
	return path.join(root, "analytics", "log-analytics.duckdb");
}
