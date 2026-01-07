#!/usr/bin/env python
"""Test git semantic analysis implementation."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Import with dash converted to underscore won't work, need to use importlib
import importlib.util
spec = importlib.util.spec_from_file_location(
    "hook_module",
    os.path.join(os.path.dirname(__file__), "..", "bash-tool-damage-control.py")
)
hook_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook_module)

analyze_git_command = hook_module.analyze_git_command

# Test cases: (command, expected_dangerous, description)
test_cases = [
    ('git checkout -b feature', False, 'Creating branch should be safe'),
    ('git checkout -- .', True, 'Discarding changes should be dangerous'),
    ('git push --force-with-lease', False, 'Force with lease should be safe'),
    ('git push --force', True, 'Force push should be dangerous'),
    ('git push -f', True, 'Force push short flag should be dangerous'),
    ('git push -fu origin main', True, 'Combined short flags with -f should be dangerous'),
    ('git reset --soft HEAD~1', False, 'Soft reset should be safe'),
    ('git reset --hard HEAD~1', True, 'Hard reset should be dangerous'),
    ('git clean -f', True, 'Clean with -f should be dangerous'),
    ('git clean -fd', True, 'Clean with combined flags should be dangerous'),
    ('git status', False, 'Status should be safe'),
    ('git checkout -b new-feature -- .', False, 'Creating branch makes it safe despite --'),
    ('ls -la', False, 'Non-git command should be safe'),
    ('git', False, 'Git with no subcommand should be safe'),
    ('git my-alias', False, 'Unknown subcommand should be safe'),
    ('git checkout -f branch', True, 'Checkout with -f should be dangerous'),
    ('git checkout -fb new-branch', True, 'Checkout with -fb should be dangerous (contains -f)'),
]

print('Testing git semantic analysis...\n')
all_passed = True
for cmd, expected_dangerous, description in test_cases:
    is_dangerous, reason = analyze_git_command(cmd)
    passed = is_dangerous == expected_dangerous
    status = 'PASS' if passed else 'FAIL'
    all_passed = all_passed and passed

    print(f'[{status}] {description}')
    print(f'  Command: {cmd}')
    print(f'  Expected dangerous: {expected_dangerous}, Got: {is_dangerous}')
    if reason:
        print(f'  Reason: {reason}')
    print()

if all_passed:
    print('\n[SUCCESS] All tests passed!')
    sys.exit(0)
else:
    print('\n[FAILURE] Some tests failed!')
    sys.exit(1)
