import { checkCancelled, selectedProfiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { discoverSessions, type SessionFile } from "./sessions.js";
import { records } from "./search.js";

export type LineageRequest = { operation: "session_lineage"; profiles?: ProfileId[]; sessionId: string; maxRows?: number };
/** A node with a non-null role has an authenticated lineage marker. Null fields are an unclassified native header boundary. */
export type LineageNode = {
	profile: ProfileId; sessionId: string; role: string | null; parentSessionId: string | null; rootSessionId: string | null; fileKey: string;
};
type LineageRecord = { node: LineageNode; file: SessionFile };
type GraphEntry = { header: SessionFile; record?: LineageRecord };

type Identity = { profile: ProfileId; sessionId: string };
function identity(profile: ProfileId, sessionId: string): string { return JSON.stringify([profile, sessionId]); }
function identityOf(ref: { profile: ProfileId; sessionId: string }): string { return identity(ref.profile, ref.sessionId); }
function boundary(entry: GraphEntry): LineageNode {
	return { profile: entry.header.ref.profile, sessionId: entry.header.ref.sessionId, role: null, parentSessionId: null, rootSessionId: null, fileKey: entry.header.ref.fileKey! };
}

function validLineage(value: unknown, session: SessionFile): LineageNode | undefined {
	if (!value || typeof value !== "object") return;
	const record = value as Record<string, unknown>;
	if (record.type !== "custom" || record.customType !== "subagent-lineage" || !record.data || typeof record.data !== "object") return;
	const data = record.data as Record<string, unknown>;
	if (data.version !== 1 || typeof data.sessionId !== "string" || data.sessionId !== session.ref.sessionId ||
		typeof data.role !== "string" || !data.role || typeof data.parentSessionId !== "string" || !data.parentSessionId ||
		typeof data.rootSessionId !== "string" || !data.rootSessionId) return;
	return {
		profile: session.ref.profile, sessionId: data.sessionId, role: data.role, parentSessionId: data.parentSessionId,
		rootSessionId: data.rootSessionId, fileKey: session.ref.fileKey!,
	};
}

function graphEntries(files: SessionFile[], recordsByFile: Map<string, LineageRecord>): GraphEntry[] {
	return files.map(header => ({ header, record: recordsByFile.get(header.ref.fileKey!) }));
}
function sortedEntries(entries: GraphEntry[]): GraphEntry[] {
	return [...entries].sort((a, b) => `${a.header.ref.profile}/${a.header.ref.sessionId}/${a.header.ref.fileKey}`
		.localeCompare(`${b.header.ref.profile}/${b.header.ref.sessionId}/${b.header.ref.fileKey}`, "en"));
}

export async function sessionLineage(registry: ProfileRegistry, request: LineageRequest, signal?: AbortSignal) {
	const profiles = selectedProfiles(registry, request.profiles);
	if (typeof request.sessionId !== "string" || !request.sessionId || request.sessionId.length > 256) throw new Error("analytics session_lineage requires sessionId");
	const maxRows = request.maxRows ?? 100;
	if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 1000) throw new Error("invalid analytics maxRows");

	const discovery = { excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false };
	// discoverSessions reads and validates the native session header. It is the graph's
	// authoritative inventory; lineage markers are optional annotations on those headers.
	const files = await discoverSessions(registry, profiles, signal, discovery);
	const targetCandidates = files.filter(file => file.ref.sessionId === request.sessionId);
	if (targetCandidates.length > 1) {
		throw new Error("analytics session_lineage target is ambiguous; select one registered profile with a unique native session ID");
	}
	const recordsByFile = new Map<string, LineageRecord>();
	let malformedRecords = 0;
	let examinedBytes = 0;
	let examinedFiles = 0;
	for (const file of files) {
		checkCancelled(signal);
		examinedFiles++;
		examinedBytes += file.bytes;
		for await (const item of records(file.file, file.headerBytes, file.bytes, signal)) {
			checkCancelled(signal);
			if (item.oversized || item.malformed || !item.raw) { malformedRecords++; continue; }
			const node = validLineage(JSON.parse(item.raw.toString("utf8")), file);
			if (node && !recordsByFile.has(file.ref.fileKey!)) recordsByFile.set(file.ref.fileKey!, { node, file });
		}
	}

	const entries = graphEntries(files, recordsByFile);
	const byIdentity = new Map<string, GraphEntry[]>();
	for (const entry of entries) {
		const key = identityOf(entry.header.ref);
		byIdentity.set(key, [...(byIdentity.get(key) ?? []), entry]);
	}
	const targetEntry = entries.find(entry => entry.header.ref.sessionId === request.sessionId);
	const targetKey = targetEntry ? identityOf(targetEntry.header.ref) : undefined;

	const classified = entries.filter(entry => entry.record !== undefined);
	const missingParentKeys = new Map<string, Identity>();
	for (const entry of classified) {
		const node = entry.record!.node;
		for (const parentSessionId of [node.parentSessionId!, node.rootSessionId!]) {
			const parent: Identity = { profile: node.profile, sessionId: parentSessionId };
			const key = identityOf(parent);
			if (!byIdentity.has(key)) missingParentKeys.set(key, parent);
		}
	}
	const sortedMissing = [...missingParentKeys.values()].sort((a, b) => identityOf(a).localeCompare(identityOf(b), "en"));
	const missingParents = sortedMissing.slice(0, maxRows).map(item => item.sessionId);

	const ancestorsAll: LineageNode[] = [];
	const ancestorVisited = new Set<string>();
	if (targetEntry?.record) {
		let current = targetEntry.record.node;
		while (current) {
			checkCancelled(signal);
			const parentKey = identity(current.profile, current.parentSessionId!);
			if (ancestorVisited.has(parentKey) || parentKey === targetKey) break;
			ancestorVisited.add(parentKey);
			const parentEntries = byIdentity.get(parentKey) ?? [];
			// A parent ID without a unique native header cannot be attributed safely.
			if (parentEntries.length !== 1) {
				const rootKey = identity(current.profile, current.rootSessionId!);
				const rootEntries = byIdentity.get(rootKey) ?? [];
				if (rootEntries.length === 1 && !ancestorVisited.has(rootKey) && rootKey !== targetKey) {
					ancestorVisited.add(rootKey);
					ancestorsAll.unshift(rootEntries[0].record?.node ?? boundary(rootEntries[0]));
				}
				break;
			}
			const parent = parentEntries[0];
			ancestorsAll.unshift(parent.record?.node ?? boundary(parent));
			if (!parent.record) {
				const rootKey = identity(current.profile, current.rootSessionId!);
				const rootEntries = byIdentity.get(rootKey) ?? [];
				if (rootEntries.length === 1 && rootKey !== parentKey && !ancestorVisited.has(rootKey) && rootKey !== targetKey) {
					ancestorVisited.add(rootKey);
					ancestorsAll.unshift(rootEntries[0].record?.node ?? boundary(rootEntries[0]));
				}
				break;
			}
			current = parent.record.node;
		}
	}
	const ancestors = ancestorsAll.slice(-maxRows);

	const children = new Map<string, GraphEntry[]>();
	for (const entry of classified) {
		const key = identity(entry.record!.node.profile, entry.record!.node.parentSessionId!);
		children.set(key, [...(children.get(key) ?? []), entry]);
	}
	const allDescendants: LineageNode[] = [];
	// Mark the target itself visited so a corrupt cycle cannot return it as its own descendant.
	const descendantVisited = new Set<string>(targetEntry ? [targetEntry.header.ref.fileKey!] : []);
	const pending = targetKey ? sortedEntries(children.get(targetKey) ?? []) : [];
	while (pending.length) {
		checkCancelled(signal);
		const current = pending.shift()!;
		const currentFileKey = current.header.ref.fileKey!;
		if (descendantVisited.has(currentFileKey)) continue;
		descendantVisited.add(currentFileKey);
		allDescendants.push(current.record!.node);
		pending.push(...sortedEntries(children.get(identityOf(current.header.ref)) ?? []));
	}
	const descendants = allDescendants.slice(0, maxRows);
	const unclassified = entries.filter(entry => !entry.record).map(entry => entry.header.ref);
	checkCancelled(signal);

	return {
		profiles, sessionId: request.sessionId, target: targetEntry?.record?.node ?? null, ancestors, descendants,
		truncated: descendants.length < allDescendants.length,
		coverage: {
			selectedFiles: files.length, examinedFiles, selectedBytes: files.reduce((sum, file) => sum + file.bytes, 0), examinedBytes, malformedRecords,
			classifiedSessions: classified.length, historicalSessions: files.length,
			unclassifiedSessions: unclassified.slice(0, maxRows), unclassifiedSessionCount: unclassified.length,
			unclassifiedSessionsTruncated: unclassified.length > maxRows,
			missingParents, missingParentCount: sortedMissing.length, missingParentsTruncated: sortedMissing.length > maxRows,
			ancestorCount: ancestorsAll.length, ancestorsTruncated: ancestorsAll.length > maxRows,
			absence: targetEntry ? (targetEntry.record ? null : "no valid subagent-lineage record for this native session") : "no native session header for this session ID",
			discovery,
		},
	};
}
