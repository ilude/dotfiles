export async function resolve(specifier, context, nextResolve) {
	if (specifier.endsWith(".js")) {
		const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
		try {
			return await nextResolve(tsSpecifier, context);
		} catch {
			// Fall through to default resolution.
		}
	}
	return nextResolve(specifier, context);
}
