export type ArgumentCompletion = { value: string; label: string };

/** Suggest only partial arguments so Enter can submit empty or complete commands. */
export function completePartialArgument(prefix: string, options: readonly string[]): ArgumentCompletion[] | null {
	const normalized = prefix.trim().toLowerCase();
	if (!normalized) return null;
	const matches = options.filter((option) => option !== normalized && option.startsWith(normalized));
	return matches.length ? matches.map((value) => ({ value, label: value })) : null;
}
