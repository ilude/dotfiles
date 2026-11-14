# AWS test identity and reset

## One-time identity provisioning

The owning project is
`C:/Projects/Work/Gitlab/gitlab-helm/regions/us-east-2/claude-code-bedrock/terraform`.
Read its ancestor/project instructions, `variables.tf`, `iam.tf` and
`identity-center.tf` before making changes. Follow its feature-start Git check and
preserve existing work. Use the existing account and Bedrock developer workflow,
not a new AWS Organizations account or a new administrative permission set.

A dedicated username such as `dev-setup-test` needs a matching IAM user and
Identity Center username, plus a deliverable sign-in email/alias. A suggested name
is not evidence that it has been created. Verify actual provisioning before use.
Obtain missing identity details from the operator; do not invent an email address.

Current Terraform inputs are `users_to_create`, `bedrock_users` and
`identity_center_users`. Follow the existing membership pattern. The installer
derives its IAM username from the SSO session, so the usernames must match.
From the gitlab-helm root, use scoped `just plan bedrock` and, when authorized,
`just deploy bedrock`, not an aggregate infrastructure deployment. Inspect the plan
for the intended identity changes; writing a skill does not authorize an apply.

Do not pre-create a permanent access key for a fresh-onboarding test: the installer
must create and store it after real SSO login. Existing test credentials are useful
for rerun/configuration cases, but do not prove that the SSO bootstrap works.

## Two independent kinds of state

- **VM/profile state:** installed tools, local `~/.aws/credentials`, configuration
  and SSO caches. A clean VM reset removes these files when the baseline predates
  authentication. A snapshot taken after authentication restores them instead.
- **AWS IAM state:** the access-key record associated with the test IAM user. This
  survives VM reset, snapshot rollback and clone deletion. AWS returns the secret
  only at creation; listing the key cannot recover a discarded secret.

The installer deliberately stops when a key exists in IAM but the corresponding
local credentials are absent. Do not work around that by modifying the installer,
copying employee credentials or blindly creating additional keys. For another
fresh-onboarding run, clean this run's dedicated cloud key and reset local state.
For an intentional stale-key refusal case, retain it until that case is complete.

## Targeted test-key cleanup

Use the primary session and an existing authorized AWS management profile. Do not
copy that profile's secrets into the VM. Verify the caller account against the
selected gitlab-helm project's account before operating; do not assume the default
profile is the intended account. Resolve the dedicated test username and key ID
from the test run, not from the operator's own identity.

Retain only non-secret metadata needed for cleanup: account, test-user ARN, created
access-key ID and run timing. The installer reports the key ID; IAM metadata can
also identify it. Do not print, preserve or copy the secret access key into evidence.

These Bash commands illustrate the existing AWS CLI operations; set the variables
to the approved profile, test user and this run's key first:

```bash
aws sts get-caller-identity --profile "$MANAGEMENT_PROFILE" --output json
aws iam get-user --profile "$MANAGEMENT_PROFILE" \
  --user-name "$TEST_USER" --query User.Arn --output text
aws iam list-access-keys --profile "$MANAGEMENT_PROFILE" \
  --user-name "$TEST_USER" --output json
# Verify the account, test principal and run's key before this mutation.
aws iam delete-access-key --profile "$MANAGEMENT_PROFILE" \
  --user-name "$TEST_USER" --access-key-id "$RUN_KEY_ID"
aws iam list-access-keys --profile "$MANAGEMENT_PROFILE" \
  --user-name "$TEST_USER" --output json
```

Delete the identified run key, not every key returned by a list. If the key is
already absent, continue the authorized reset. If retained metadata was lost,
use unambiguous test-user/run metadata to resolve it; do not guess or delete an
unknown key to unblock onboarding. Unexpected ownership needs clarification, not
another approval for a previously authorized and clearly identified cleanup.

Once that key is absent, reset the VM through network-iac and repeat the selected
case. No automatic key-rotation feature, new cleanup service, global SSO reset or
per-run Terraform user deletion is needed. Keep the dedicated identity for later
tests unless its deletion is separately requested.
