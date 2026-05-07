import { describe, expect, it } from "vitest";
import { checkUnsafeShellEdit } from "../extensions/commit-guard.ts";

describe("shell edit guardrail", () => {
	it("detects mutating Python heredocs and suggests safe tools", () => {
		const result = checkUnsafeShellEdit(
			"python - <<'PY'\nfrom pathlib import Path\nPath('x').write_text('y')\nPY",
		);
		expect(result?.block).toBe(true);
		expect(result?.reason).toContain("text_edit");
		expect(result?.reason).toContain("structured_edit");
	});
	it("detects sed -i, perl -pi, and cat > patterns", () => {
		for (const command of [
			"sed -i s/a/b/ file",
			"perl -pi -e s/a/b/ file",
			"cat > file <<'EOF'",
		])
			expect(checkUnsafeShellEdit(command)?.block).toBe(true);
	});
	it("allows non-mutating shell commands", () => {
		expect(
			checkUnsafeShellEdit("python - <<'PY'\nprint('read only')\nPY"),
		).toBeUndefined();
	});
});
