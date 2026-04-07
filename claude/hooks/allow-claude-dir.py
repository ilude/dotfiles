#!/usr/bin/env python
# PermissionRequest hook: auto-approve writes to .claude/ directory
import json
import sys


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    path = tool_input.get("file_path") or tool_input.get("command") or ""

    if ".claude" in path.lower():
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PermissionRequest",
                        "permissionDecision": "allow",
                        "permissionDecisionReason": "Auto-approved: .claude directory write",
                    }
                }
            )
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
