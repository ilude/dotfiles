import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export type InputKind = "text" | "image";

export type ThinkingLevelMap = Record<string, string | null>;

export type ModelLike = {
	provider: string;
	id: string;
	name: string;
	api: string;
	baseUrl: string;
	reasoning: boolean;
	input: InputKind[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	thinkingLevelMap?: ThinkingLevelMap;
	compat?: unknown;
};

export type ProviderModelDef = ProviderModelConfig & {
	api: NonNullable<ProviderModelConfig["api"]>;
};

export type RemoteModelInfo = {
	id: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	input?: InputKind[];
	contextWindow?: number;
	maxTokens?: number;
	thinkingLevelMap?: ThinkingLevelMap;
};

export type ProviderCatalogCache = {
	schemaVersion: 2;
	provider: string;
	fetchedAt: string;
	models: RemoteModelInfo[];
};

