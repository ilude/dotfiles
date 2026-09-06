export interface DamageControlHealth {
	status: "active" | "failed";
	ruleSource?: string;
	error?: string;
	commandRules: number;
	zeroAccessRules: number;
	noDeleteRules: number;
}

let currentDamageControlHealth: DamageControlHealth = {
	status: "failed",
	error: "damage-control extension has not loaded rules yet",
	commandRules: 0,
	zeroAccessRules: 0,
	noDeleteRules: 0,
};

export function publishDamageControlHealth(health: DamageControlHealth): void {
	currentDamageControlHealth = { ...health };
}

export function getDamageControlHealth(): DamageControlHealth {
	return { ...currentDamageControlHealth };
}

export function formatDamageControlHealthDetail(
	health = getDamageControlHealth(),
): string {
	if (health.status === "active") {
		return `active; source=${health.ruleSource ?? "unknown"}; rules=${health.commandRules}/${health.zeroAccessRules}/${health.noDeleteRules}; fail-closed tools=bash,pwsh,read,write,edit,find,ls`;
	}
	return `failed; ${health.error ?? "rules unavailable"}; fail-closed tools=bash,pwsh,read,write,edit,find,ls; remediation: fix PI_DAMAGE_CONTROL_POLICY_PATH or pi/damage-control-rules.yaml`;
}
