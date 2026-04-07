"""
classify.py -- Thin CLI wrapper for the prompt router.

Called by the Pi prompt-router extension to classify a prompt.
Reads the prompt from sys.argv and prints the tier to stdout.

Usage:
    python classify.py "your prompt here"

Output:
    low | mid | high

Exits 0 on success, 1 on any error (extension will fall back silently).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

try:
    from router import route

    prompt = " ".join(sys.argv[1:]).strip()
    if not prompt:
        print("mid")  # safe default for empty input
    else:
        tier = route(prompt, log=True)
        print(tier)
    sys.exit(0)
except Exception as e:
    # Write error to stderr so the extension can surface it if needed
    print(f"error: {e}", file=sys.stderr)
    sys.exit(1)
