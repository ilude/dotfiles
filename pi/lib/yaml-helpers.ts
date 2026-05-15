import { spawnSync } from "node:child_process";

export type YamlViaPythonResult<T> =
	| { ok: true; value: T; interpreter: string }
	| { ok: false; error: string; attempts: string[] };

export function loadYamlViaPythonDetailed<T>(
	content: string,
): YamlViaPythonResult<T> {
	const attempts: string[] = [];
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
					input: Buffer.from(content, "utf-8"),
					encoding: "utf-8",
					windowsHide: true,
				},
			);
			if (result.error) {
				attempts.push(`${cmd}: ${result.error.message}`);
				continue;
			}
			if (result.status !== 0) {
				attempts.push(`${cmd}: ${result.stderr.trim() || `exit ${result.status}`}`);
				continue;
			}
			try {
				return { ok: true, value: JSON.parse(result.stdout) as T, interpreter: cmd };
			} catch (err) {
				return {
					ok: false,
					error: `YAML JSON conversion failed via ${cmd}: ${err instanceof Error ? err.message : String(err)}`,
					attempts,
				};
			}
		} catch (err) {
			attempts.push(`${cmd}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	return { ok: false, error: `Unable to parse YAML via Python/PyYAML`, attempts };
}

export function loadYamlFileViaPythonDetailed<T>(
	filePath: string,
): YamlViaPythonResult<T> {
	const attempts: string[] = [];
	for (const cmd of ["python", "python3"]) {
		const result = spawnSync(
			cmd,
			[
				"-c",
				"import json, pathlib, sys\nimport yaml\nprint(json.dumps(yaml.safe_load(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))))",
				filePath,
			],
			{ encoding: "utf-8", windowsHide: true },
		);
		if (result.error) {
			attempts.push(`${cmd}: ${result.error.message}`);
			continue;
		}
		if (result.status !== 0) {
			attempts.push(`${cmd}: ${result.stderr.trim() || `exit ${result.status}`}`);
			continue;
		}
		try {
			return { ok: true, value: JSON.parse(result.stdout) as T, interpreter: cmd };
		} catch (err) {
			return {
				ok: false,
				error: `YAML JSON conversion failed via ${cmd}: ${err instanceof Error ? err.message : String(err)}`,
				attempts,
			};
		}
	}
	return { ok: false, error: "Unable to parse YAML file via Python/PyYAML", attempts };
}

export function loadYamlViaPython<T>(content: string): T | undefined {
	const result = loadYamlViaPythonDetailed<T>(content);
	return result.ok ? result.value : undefined;
}
