import { spawnSync } from "node:child_process";

export function loadYamlViaPython<T>(content: string): T | undefined {
	// Match the install script's interpreter preference so Pi uses the same
	// Python environment that received hook dependencies like pyyaml.
	for (const cmd of ["python", "python3"]) {
		try {
			const result = spawnSync(
				cmd,
				[
					"-c",
					"import json, sys\nimport yaml\nprint(json.dumps(yaml.safe_load(sys.stdin.read())))",
				],
				{
					input: content,
					encoding: "utf-8",
				},
			);
			if (result.status === 0 && result.stdout.trim()) {
				return JSON.parse(result.stdout) as T;
			}
		} catch {
			// Try the next interpreter.
		}
	}
	return undefined;
}
