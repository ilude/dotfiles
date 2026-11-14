---
name: dev-setup-testing
description: Test dev-setup onboarding scripts in disposable Windows VMs. Use for fresh AWS onboarding, authenticated reruns, result collection, and coordinated VM plus dedicated IAM test-key cleanup.
---

# dev-setup testing

Use [network-iac](../network-iac/SKILL.md) for VM creation, spawning method selection,
transfers, user-context execution and VM reset. This skill owns the installer test
cycle, including AWS state that survives a VM reset. Read
[AWS test identity and reset](references/aws-test-reset.md) before provisioning an
identity, testing fresh authentication or cleaning cloud keys. Read
[Windows runner practice](references/windows-runner.md) for payload staging,
installation-only trials and interpreting prerequisite failures.

## Establish the case

Read the selected dev-setup checkout's `AGENTS.md`, `README.md` and relevant script.
The known local checkout is `C:/Projects/Work/Gitlab/dev-setup`. Select the client,
source revision or working-tree payload, and scenario the user wants tested:

- **Fresh onboarding:** clean VM/profile and no leftover IAM keys for this run's
  dedicated test identity. Exercise real SSO and let the installer create its key.
- **Rerun/preservation:** retain the same VM, working credentials and key. Verify
  intended reuse and preservation; do not reset between the first run and rerun.
  Package upgrades can still occur, so a rerun is not necessarily a complete no-op.
- **Existing-cloud-key/missing-local-key case:** deliberately reset local state
  while retaining the test key in AWS. Expect setup to refuse silent replacement.
  Do not clean away the condition before testing it or call that refusal a defect.
- **Installation without AWS (`-SkipBedrock`):** exercise prerequisites, runtime
  bootstrap, clients and protection before the test identity is available. This
  is useful partial progress, not proof of AWS login or Bedrock configuration.
- **Client/configuration/model-access case:** use a dedicated IAM-only test user
  and its working test key; no email or SSO account is required. Choose routine
  test naming when the operator leaves it open. Do not claim this exercised the
  browser SSO or installer-created-key bootstrap.

These are available scenarios, not a mandatory test matrix. Run only the requested
cases. An authorized sandbox test is an iterative development task: investigate
failures, fix established task-related source/runtime defects, reset and retest.
Do not stop at each finding to request permission for routine fixes within that
scope. Ask for missing human input or changes outside the agreed repositories,
accounts and resources. Agree once on the test/reset cycle, including deletion of
keys created for the dedicated test identity. Routine cleanup within that scope needs no extra
approval prompt for every iteration. A request to write this skill grants no live
provisioning or cleanup authority.

## Run the selected installer

1. Prepare/reuse the VM through network-iac. Keep the golden template and clean
   snapshot before AWS authentication and client installation. Use a dedicated AWS
   test principal, not the operator's employee keys or administrative credentials.
2. Stage the intended source and required distribution files, excluding secrets,
   `.aws`, controller state and unrelated ignored files. If testing local changes,
   do not silently substitute the published main-branch script. Record what ran.
3. Start in the real Sandbox user profile, not SYSTEM or an elevated SSH process.
   The clean OS has native PowerShell 5.1; follow the current installer's supported
   PowerShell 7 bootstrap/handoff rather than preinstalling prerequisites that the
   fresh-onboarding case is meant to exercise.
4. Use limited-token jobs for noninteractive wrappers and probes. Full onboarding
   has `Read-Host`, browser SSO and possible UAC interaction; use the logged-on
   desktop/console when input is required. Do not queue it without input support
   and misclassify its timeout as an AWS failure. Do not bypass MFA or elevation.
5. Use current documented flags, such as `-Pi` for Pi only or `-All` for all clients.
   A narrow protection-maintenance request is not authorization for full onboarding.
   Use secure user-input facilities for passwords/OTP, not chat or retained logs.
6. Collect final exit status, stdout/stderr, source identity, selected client paths,
   AWS principal, discovery/configuration outcomes and requested functional results.
   Separate installation, authentication, model discovery and actual invocation.
   Only run bounded model/tool probes when included in the authorized test scope.

Use current repository acceptance criteria rather than adding unrelated gates.
Keep results and non-secret key identifiers in the run's private ignored evidence;
never collect AWS secret keys, credentials files, SSO caches or whole user profiles.
A queued job, installed file or successful catalog query is not end-to-end success.

## End or repeat a run

1. Let the test finish or resolve cancellation, then collect wanted evidence. Keep
   unexpected failures available for inspection rather than erasing them to retry.
2. For a fresh-onboarding reset, delete only this run's identified IAM test key in
   AWS through the reference procedure. Do not alter employee or unrelated keys.
   If the key is already absent, there is no cloud key left to clean up.
3. Restore the pre-authentication snapshot or use the selected clone/reset method.
   A VM reset removes local files and cached credentials; it does not revoke IAM
   keys in AWS. Conversely, deleting an IAM key does not clean installed VM state.
4. Follow the current VM UUID and recheck the intended starting state. For a fresh
   run, confirm old local credentials are gone and the identified cloud key is
   absent. Reuse the dedicated SSO/IAM identity; do not recreate the user each run.

Do not change the installer's protection against replacing unknown keys. Clean up
through the dedicated test lifecycle instead. Preserve the original Windows
evaluation deadline, and do not create credential-bearing golden/clean baselines.
