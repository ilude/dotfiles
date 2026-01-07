#!/usr/bin/env python
"""Test integration of git semantic analysis with check_command."""

import sys
import os

# Import the hook module
import importlib.util
spec = importlib.util.spec_from_file_location(
    "hook_module",
    os.path.join(os.path.dirname(__file__), "..", "bash-tool-damage-control.py")
)
hook_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook_module)

check_command = hook_module.check_command

# Test configuration (minimal)
config = {
    "bashToolPatterns": [],
    "zeroAccessPaths": [],
    "readOnlyPaths": [],
    "noDeletePaths": []
}

# Integration test cases: (command, expected_blocked, description)
test_cases = [
    # Git semantic analysis should catch these
    ('git checkout -- .', True, 'Git semantic: checkout with --'),
    ('git push --force', True, 'Git semantic: force push'),
    ('git reset --hard', True, 'Git semantic: hard reset'),
    ('git clean -fd', True, 'Git semantic: clean with flags'),

    # These should pass
    ('git checkout -b feature', False, 'Git semantic: safe checkout -b'),
    ('git push --force-with-lease', False, 'Git semantic: safe force with lease'),
    ('git status', False, 'Git semantic: safe status'),

    # Shell unwrapping + git semantic
    ('bash -c "git push --force"', True, 'Unwrapped git force push'),
    ('sh -c "git reset --hard"', True, 'Unwrapped git hard reset'),
]

print('Testing integration of git semantic analysis...\n')
all_passed = True
for cmd, expected_blocked, description in test_cases:
    is_blocked, should_ask, reason = check_command(cmd, config)
    passed = is_blocked == expected_blocked
    status = 'PASS' if passed else 'FAIL'
    all_passed = all_passed and passed

    print(f'[{status}] {description}')
    print(f'  Command: {cmd}')
    print(f'  Expected blocked: {expected_blocked}, Got blocked: {is_blocked}')
    if reason:
        print(f'  Reason: {reason}')
    print()

if all_passed:
    print('[SUCCESS] All integration tests passed!')
    sys.exit(0)
else:
    print('[FAILURE] Some integration tests failed!')
    sys.exit(1)
