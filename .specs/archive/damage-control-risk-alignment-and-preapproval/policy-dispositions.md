# Active policy dispositions

Mapping from baseline `66a2f416` by exact regex equality, never list position. Historical regexes remain in the migration fixture. Runtime names describe actual operations; distinct detectors sharing a description may include a stable regex-derived suffix, not a migration ordinal.

Routine cache/history, hygiene-only document protection, TMPDIR assignment, and encoded-wrapper restrictions were removed. Supported encoded bodies still receive normal analysis. Contextual operations use review; configured path confirmations and independent publication/force-with-lease boundaries retain human approval. Concrete root/home/system/device destruction and recovery-mechanism protections remain blocked.

| Former ID | Current ID | Action | Operation / historical reason |
| --- | --- | --- | --- |
| `legacy-001` | `git-remove-working-tree` | review | git rm (deletes files from working tree and index). Use --cached to only remove from index. |
| `legacy-002` | `filesystem-delete-home-or-root` | block | rm recursive on home directory (~) - CATASTROPHIC |
| `legacy-003` | `filesystem-delete-home-or-root-env` | block | rm recursive on $HOME - CATASTROPHIC |
| `legacy-004` | `filesystem-delete-root` | block | rm recursive on root (/) - CATASTROPHIC |
| `legacy-005` | `filesystem-delete-windows-home-wsl` | block | rm recursive on Windows home via WSL (/mnt/c/Users) - CATASTROPHIC |
| `legacy-006` | `filesystem-delete-windows-home-git-bash` | block | rm recursive on Windows home via Git Bash (/c/Users) - CATASTROPHIC |
| `legacy-007` | `filesystem-rm-recursive-or-force` | review | rm with recursive or force flags |
| `legacy-008` | `filesystem-rm-recursive-or-force-short` | review | rm with recursive or force flags |
| `legacy-009` | removed | none | CLAUDE.md is a protected configuration file |
| `legacy-010` | removed | none | AGENT.md/AGENTS.md are protected configuration files |
| `legacy-011` | `filesystem-rm-file` | review | rm deletes files permanently |
| `legacy-012` | `filesystem-rm-recursive` | review | rm with --recursive flag |
| `legacy-013` | `filesystem-rm-force` | review | rm with --force flag |
| `legacy-014` | `filesystem-sudo-rm` | review | sudo rm |
| `legacy-015` | removed | none | rmdir ignore-fail |
| `legacy-016` | `permissions-chmod-world-writable` | review | chmod 777 (world writable) |
| `legacy-017` | `permissions-chmod-recursive-world-writable` | review | recursive chmod 777 |
| `legacy-018` | `permissions-chown-recursive-root` | review | recursive chown to root |
| `legacy-019` | `git-reset-hard` | review | git reset --hard (use --soft or stash) |
| `legacy-020` | `git-clean-forced` | review | git clean with force/directory flags |
| `legacy-021` | `git-push-force` | block | git push --force (use --force-with-lease for safer alternative) |
| `legacy-022` | `git-push-force-short` | block | git push -f (use --force-with-lease for safer alternative) |
| `legacy-023` | `git-push-force-with-lease` | user | git push --force-with-lease (rewrites remote history, but with safety check) |
| `legacy-024` | `git-stash-clear` | review | git stash clear (deletes ALL stashes) |
| `legacy-025` | `git-reflog-expire` | block | git reflog expire (destroys recovery mechanism) |
| `legacy-026` | `git-gc-prune-now` | block | git gc --prune=now (can lose dangling commits) |
| `legacy-027` | `git-rewrite-history` | block | git filter-branch (rewrites entire history) |
| `legacy-028` | `git-checkout-discard-worktree` | review | Discards all uncommitted changes. Use 'git stash' first |
| `legacy-029` | `git-checkout-overwrite-paths` | review | Overwrites working tree with ref version. Use 'git stash' first |
| `legacy-030` | `git-checkout-pathspec-file` | review | Can overwrite multiple files. Use 'git stash' first |
| `legacy-031` | `git-restore-discard-worktree` | review | Discards uncommitted changes. Use 'git stash' first or --staged to only unstage |
| `legacy-032` | `git-restore-worktree` | review | Explicitly discards working tree changes. Use 'git stash' first |
| `legacy-033` | `git-reset-merge` | review | Can lose uncommitted changes. Use 'git stash' first |
| `legacy-034` | `git-stash-drop` | review | Permanently deletes a stash. Consider 'git stash list' first |
| `legacy-035` | `git-branch-force-delete` | review | Force deletes branch without merge check. Use -d for safe delete |
| `legacy-036` | `git-worktree-force-remove` | review | Can delete uncommitted changes. Remove --force flag |
| `legacy-037` | `git-worktree-force-remove-short` | review | Can delete uncommitted changes. Remove -f flag |
| `legacy-038` | `git-push-delete-branch` | review | Deletes remote branch |
| `legacy-039` | `git-push-delete-branch-legacy-syntax` | review | Deletes remote branch (old syntax) |
| `legacy-040` | `filesystem-format-device` | block | filesystem format command |
| `legacy-041` | `filesystem-dd-device-write` | block | dd writing to device |
| `legacy-042` | `kill-all-processes` | block | kill all processes |
| `legacy-043` | `killall-9` | review | killall -9 |
| `legacy-044` | `pkill-9` | review | pkill -9 |
| `legacy-045` | removed | none | clearing shell history |
| `legacy-046` | `crontab-modifies-scheduled-tasks` | review | crontab modifies scheduled tasks (persistence mechanism) |
| `legacy-047` | `at-command-schedules-future-execution` | review | at command schedules future execution (persistence mechanism) |
| `legacy-048` | `schtasks-creates-modifies-windows-scheduled-tasks` | review | schtasks creates/modifies Windows scheduled tasks (persistence) |
| `legacy-049` | `systemd-run-creates-transient-service-units` | review | systemd-run creates transient service units (persistence mechanism) |
| `legacy-050` | `launchctl-loads-launch-agents-daemons` | review | launchctl loads launch agents/daemons (macOS persistence) |
| `legacy-051` | `powershell-scheduled-task-cmdlet` | review | PowerShell scheduled task cmdlet (Windows persistence) |
| `legacy-052` | `filesystem-find-delete` | review | find -delete permanently removes files. Use -print first to preview |
| `legacy-053` | `filesystem-find-exec-rm-recursive` | review | find -exec rm -rf can delete entire directory trees |
| `legacy-054` | `filesystem-find-exec-rm` | review | find -exec rm removes matched files |
| `legacy-055` | `filesystem-find-execdir-rm-recursive` | review | find -execdir rm -rf can delete entire directory trees |
| `legacy-056` | `filesystem-find-execdir-rm` | review | find -execdir rm removes matched files |
| `legacy-057` | removed | none | Empty TMPDIR is dangerous - $TMPDIR/foo expands to /foo |
| `legacy-058` | removed | none | TMPDIR redirected to non-temp path enables path traversal attacks |
| `legacy-059` | removed | none | TMPDIR redirected to Windows system path - dangerous |
| `legacy-060` | `ld-preload-hijacks-dynamic-linker-to-inject-shared-libraries` | review | LD_PRELOAD hijacks dynamic linker to inject shared libraries |
| `legacy-061` | `dyld-insert-libraries-injects-libraries-on-macos` | review | DYLD_INSERT_LIBRARIES injects libraries on macOS (same as LD_PRELOAD) |
| `legacy-062` | `ld-library-path-override-may-redirect-library-loading-to-attacker-controlled-paths` | review | LD_LIBRARY_PATH override may redirect library loading to attacker-controlled paths |
| `legacy-063` | `node-js-one-liner-with-potentially-dangerous-operation` | review | Node.js one-liner with potentially dangerous operation |
| `legacy-064` | `ruby-one-liner-with-potentially-dangerous-operation` | review | Ruby one-liner with potentially dangerous operation |
| `legacy-065` | `perl-one-liner-with-potentially-dangerous-operation` | review | Perl one-liner with potentially dangerous operation |
| `legacy-066` | `xargs-with-shell-c-can-execute-arbitrary-commands-from-dynamic-input` | review | xargs with shell -c can execute arbitrary commands from dynamic input |
| `legacy-067` | `xargs-rm-rf-with-dynamic-input-can-delete-many-files-unexpectedly` | review | xargs rm -rf with dynamic input can delete many files unexpectedly |
| `legacy-068` | `xargs-piping-to-rm-can-delete-many-files` | review | xargs piping to rm can delete many files |
| `legacy-069` | `xargs-with-find-delete-can-delete-files-from-dynamic-input` | review | xargs with find -delete can delete files from dynamic input |
| `legacy-070` | `xargs-with-destructive-git-commands-amplifies-damage` | review | xargs with destructive git commands amplifies damage |
| `legacy-071` | `parallel-piping-to-rm-rf-can-delete-many-files` | review | parallel piping to rm -rf can delete many files |
| `legacy-072` | `parallel-with-shell-execution-can-run-arbitrary-commands` | review | parallel with shell execution can run arbitrary commands |
| `legacy-073` | `aws-s3-rm-recursive` | review | aws s3 rm --recursive (deletes all objects) |
| `legacy-074` | `aws-s3-rb-force` | review | aws s3 rb --force (force removes bucket) |
| `legacy-075` | `aws-ec2-terminate-instances` | review | aws ec2 terminate-instances |
| `legacy-076` | `aws-rds-delete-db-instance-skip-final-snapshot` | block | aws rds delete-db-instance --skip-final-snapshot (no backup, IRREVERSIBLE) |
| `legacy-077` | `aws-rds-delete-db-cluster-skip-final-snapshot` | block | aws rds delete-db-cluster --skip-final-snapshot (no backup, IRREVERSIBLE) |
| `legacy-078` | `aws-secretsmanager-delete-secret-force-delete-without-recovery` | block | aws secretsmanager delete-secret --force-delete-without-recovery (IMMEDIATE, no recovery) |
| `legacy-079` | `aws-rds-delete-db-instance` | review | aws rds delete-db-instance |
| `legacy-080` | `aws-cloudformation-delete-stack` | review | aws cloudformation delete-stack (deletes infrastructure) |
| `legacy-081` | `aws-dynamodb-delete-table` | review | aws dynamodb delete-table |
| `legacy-082` | `aws-eks-delete-cluster` | review | aws eks delete-cluster |
| `legacy-083` | `aws-eks-update-kubeconfig` | review | aws eks update-kubeconfig (writes to ~/.kube/config) |
| `legacy-084` | `aws-eks-create-cluster` | review | aws eks create-cluster (creates infrastructure) |
| `legacy-085` | `aws-eks-update-cluster-config` | review | aws eks update-cluster-config (modifies cluster settings) |
| `legacy-086` | `aws-eks-update-cluster-version` | review | aws eks update-cluster-version (upgrades Kubernetes) |
| `legacy-087` | `aws-eks-create-nodegroup` | review | aws eks create-nodegroup (creates compute resources) |
| `legacy-088` | `aws-eks-delete-nodegroup` | review | aws eks delete-nodegroup |
| `legacy-089` | `aws-lambda-delete-function` | review | aws lambda delete-function |
| `legacy-090` | `aws-iam-delete-role` | review | aws iam delete-role |
| `legacy-091` | `aws-iam-delete-user` | review | aws iam delete-user |
| `legacy-092` | `aws-rds-delete-db-cluster` | review | aws rds delete-db-cluster (deletes entire DB cluster) |
| `legacy-093` | `aws-ec2-delete-volume` | review | aws ec2 delete-volume (permanently deletes EBS volume) |
| `legacy-094` | `aws-kms-schedule-key-deletion` | review | aws kms schedule-key-deletion (all data encrypted with this key becomes unrecoverable) |
| `legacy-095` | `aws-secretsmanager-delete-secret` | review | aws secretsmanager delete-secret |
| `legacy-096` | `aws-organizations-delete-organization` | review | aws organizations delete-organization |
| `legacy-097` | `aws-organizations-close-account` | review | aws organizations close-account |
| `legacy-098` | `aws-iam-delete-policy` | review | aws iam delete-policy |
| `legacy-099` | `aws-iam-delete-access-key` | review | aws iam delete-access-key |
| `legacy-100` | `aws-iam-delete-group` | review | aws iam delete-group |
| `legacy-101` | `aws-route53-delete-hosted-zone` | review | aws route53 delete-hosted-zone (deletes DNS zone) |
| `legacy-102` | `aws-cloudfront-delete-distribution` | review | aws cloudfront delete-distribution (deletes CDN distribution) |
| `legacy-103` | `aws-sqs-delete-queue` | review | aws sqs delete-queue (deletes queue and all messages) |
| `legacy-104` | `aws-sqs-purge-queue` | review | aws sqs purge-queue (purges all messages from queue) |
| `legacy-105` | `aws-sns-delete-topic` | review | aws sns delete-topic |
| `legacy-106` | `aws-elasticache-delete-cache-cluster` | review | aws elasticache delete-cache-cluster |
| `legacy-107` | `aws-elasticache-delete-replication-group` | review | aws elasticache delete-replication-group |
| `legacy-108` | `aws-ecs-delete-service` | review | aws ecs delete-service |
| `legacy-109` | `aws-ecs-delete-cluster` | review | aws ecs delete-cluster |
| `legacy-110` | `aws-backup-delete-recovery-point` | review | aws backup delete-recovery-point (deletes backup) |
| `legacy-111` | `aws-backup-delete-backup-vault` | review | aws backup delete-backup-vault (deletes backup vault) |
| `legacy-112` | `gcloud-projects-delete` | review | gcloud projects delete (DELETES ENTIRE PROJECT) |
| `legacy-113` | `gcloud-compute-instances-delete` | review | gcloud compute instances delete |
| `legacy-114` | `gcloud-sql-instances-delete` | review | gcloud sql instances delete |
| `legacy-115` | `gcloud-container-clusters-delete` | review | gcloud container clusters delete (GKE) |
| `legacy-116` | `gcloud-storage-rm-r` | review | gcloud storage rm -r (recursive delete) |
| `legacy-117` | `gcloud-functions-delete` | review | gcloud functions delete |
| `legacy-118` | `gcloud-iam-service-accounts-delete` | review | gcloud iam service-accounts delete |
| `legacy-119` | `firebase-projects-delete` | review | firebase projects:delete (deletes entire project) |
| `legacy-120` | `firebase-firestore-delete-all-collections` | review | firebase firestore:delete --all-collections (wipes all data) |
| `legacy-121` | `firebase-database-remove` | review | firebase database:remove (wipes Realtime DB) |
| `legacy-122` | `firebase-hosting-disable` | review | firebase hosting:disable |
| `legacy-123` | `firebase-functions-delete` | review | firebase functions:delete |
| `legacy-124` | `vercel-remove-yes` | review | vercel remove --yes (removes deployment) |
| `legacy-125` | `vercel-projects-rm` | review | vercel projects rm (deletes project) |
| `legacy-126` | `vercel-env-rm-yes` | review | vercel env rm --yes (removes env variables) |
| `legacy-127` | `netlify-sites-delete` | review | netlify sites:delete (deletes entire site) |
| `legacy-128` | `netlify-functions-delete` | review | netlify functions:delete |
| `legacy-129` | `wrangler-delete` | review | wrangler delete (deletes Worker) |
| `legacy-130` | `wrangler-r2-bucket-delete` | review | wrangler r2 bucket delete |
| `legacy-131` | `wrangler-kv-namespace-delete` | review | wrangler kv:namespace delete |
| `legacy-132` | `wrangler-d1-delete` | review | wrangler d1 delete (deletes database) |
| `legacy-133` | `wrangler-queues-delete` | review | wrangler queues delete |
| `legacy-134` | `docker-system-prune-a` | review | docker system prune -a (removes all unused data) |
| `legacy-135` | `docker-rm-f` | review | docker rm -f $(docker ps) (force removes containers) |
| `legacy-136` | `docker-rmi-f` | review | docker rmi -f (force removes images) |
| `legacy-137` | `container-volume-remove` | review | docker volume rm (data loss) |
| `legacy-138` | `docker-volume-prune` | review | docker volume prune (removes unused volumes) |
| `legacy-139` | `container-compose-remove-volumes` | review | docker compose down --volumes (removes containers AND volumes - DATA LOSS) |
| `legacy-140` | `docker-compose-down-rmi` | review | docker compose down --rmi (removes containers and images) |
| `legacy-141` | `container-compose-teardown` | review | Assess Compose teardown against the target environment; routine local development teardown does not require approval |
| `legacy-142` | `docker-down-volumes` | review | docker down --volumes (removes containers AND volumes - DATA LOSS) |
| `legacy-143` | `docker-down-rmi` | review | docker down --rmi (removes containers and images) |
| `legacy-144` | `docker-down` | review | docker down (stops and removes containers) |
| `legacy-145` | `docker-compose-rm-f` | review | docker compose rm -f (force removes containers without confirmation) |
| `legacy-146` | `podman-system-prune` | review | podman system prune (removes unused containers, pods, networks) |
| `legacy-147` | `podman-volume-rm-prune` | review | podman volume rm/prune (data loss) |
| `legacy-148` | `podman-machine-rm` | review | podman machine rm (removes virtual machine) |
| `legacy-149` | `podman-pod-rm` | review | podman pod rm (removes pod and containers) |
| `legacy-150` | `cluster-delete-namespace` | review | kubectl delete namespace |
| `legacy-151` | `kubectl-delete-all-all` | review | kubectl delete all --all |
| `legacy-152` | `kubectl-delete-across-all-namespaces` | review | kubectl delete across all namespaces |
| `legacy-153` | `cluster-apply` | review | kubectl apply (modifies cluster resources) |
| `legacy-154` | `kubectl-delete` | review | kubectl delete (removes resources) |
| `legacy-155` | `kubectl-rollout-restart` | review | kubectl rollout restart (restarts pods) |
| `legacy-156` | `kubectl-scale` | review | kubectl scale (changes replica count) |
| `legacy-157` | `kubectl-port-forward` | review | kubectl port-forward (network access) |
| `legacy-158` | `kubectl-create-secret` | review | kubectl create secret (creates sensitive data) |
| `legacy-159` | `helm-uninstall` | review | helm uninstall (removes release) |
| `legacy-160` | `helm-install` | review | helm install (deploys to cluster) |
| `legacy-161` | `helm-rollback` | review | helm rollback (reverts release) |
| `legacy-162` | `helm-delete` | review | helm delete (alias for uninstall, removes release and resources) |
| `legacy-163` | `helm-repo-remove` | review | helm repo remove (removes chart repository reference) |
| `legacy-164` | `helm-plugin-uninstall` | review | helm plugin uninstall (removes plugin) |
| `legacy-165` | `helm-uninstall-no-hooks` | review | helm uninstall --no-hooks (bypasses cleanup hooks, may orphan resources) |
| `legacy-166` | `helm-upgrade-reset-values` | review | helm upgrade --reset-values (discards all previous value customizations) |
| `legacy-167` | `helm-upgrade-rollback-force` | review | helm upgrade/rollback --force (forces resource replacement via delete/recreate) |
| `legacy-168` | `redis-cli-flushall` | review | redis-cli FLUSHALL (wipes ALL data) |
| `legacy-169` | `database-redis-flush-database` | review | redis-cli FLUSHDB (wipes database) |
| `legacy-170` | `mongodb-dropdatabase` | review | MongoDB dropDatabase |
| `legacy-171` | `mongodb-dropdatabase-998f68b0` | review | MongoDB dropDatabase |
| `legacy-172` | `database-postgres-drop` | review | PostgreSQL dropdb |
| `legacy-173` | `database-mysql-drop` | review | MySQL drop database |
| `legacy-174` | `surrealdb-remove-namespace-database` | review | SurrealDB REMOVE NAMESPACE/DATABASE (destroys namespace or database and all data) |
| `legacy-175` | `surrealdb-remove-table` | review | SurrealDB REMOVE TABLE (deletes table and all data) |
| `legacy-176` | `pg-restore-clean` | review | pg_restore --clean (drops all objects before restoring) |
| `legacy-177` | `secrets-read-tfvars` | review | reads or copies .tfvars file content (may contain variables/secrets) |
| `legacy-178` | `secrets-exfiltrate-tfvars` | review | potential exfiltration of .tfvars content to a network sink |
| `legacy-179` | `secrets-terraform-tfvars` | review | terraform command references .tfvars file (contains variables/secrets) |
| `legacy-180` | `infrastructure-terraform-destroy-unattended` | review | terraform destroy -auto-approve (unattended infrastructure destruction) |
| `legacy-181` | `terraform-apply-destroy` | review | terraform apply -destroy (alternative destroy syntax) |
| `legacy-182` | `terraform-destroy` | review | terraform destroy (destroys all infrastructure) |
| `legacy-183` | `terraform-apply-auto-approve` | review | terraform apply -auto-approve (unattended infrastructure changes) |
| `legacy-184` | `terraform-apply` | review | terraform apply (modifies infrastructure) |
| `legacy-185` | `terraform-import` | review | terraform import (imports existing resources) |
| `legacy-186` | `terraform-taint` | review | terraform taint (marks resource for recreation) |
| `legacy-187` | `terraform-state-rm` | review | terraform state rm (removes from state file) |
| `legacy-188` | `terraform-state-mv` | review | terraform state mv (moves resources in state) |
| `legacy-189` | `terraform-workspace-delete-force` | review | terraform workspace delete -force (creates dangling unmanaged resources) |
| `legacy-190` | `terraform-workspace-delete` | review | terraform workspace delete (deletes workspace) |
| `legacy-191` | `terraform-force-unlock` | review | terraform force-unlock (removes state lock, risks concurrent modifications) |
| `legacy-192` | `tofu-command-references-tfvars-file` | review | tofu command references .tfvars file (contains variables/secrets) |
| `legacy-193` | `tofu-destroy-auto-approve` | review | tofu destroy -auto-approve (unattended infrastructure destruction) |
| `legacy-194` | `tofu-destroy` | review | tofu destroy (destroys all infrastructure) |
| `legacy-195` | `tofu-apply-destroy` | review | tofu apply -destroy (alternative destroy syntax) |
| `legacy-196` | `tofu-apply-auto-approve` | review | tofu apply -auto-approve (unattended infrastructure changes) |
| `legacy-197` | `tofu-apply` | review | tofu apply (modifies infrastructure) |
| `legacy-198` | `tofu-import` | review | tofu import (imports existing resources) |
| `legacy-199` | `tofu-taint` | review | tofu taint (marks resource for recreation) |
| `legacy-200` | `tofu-state-rm` | review | tofu state rm (removes from state file) |
| `legacy-201` | `tofu-state-mv` | review | tofu state mv (moves resources in state) |
| `legacy-202` | `tofu-workspace-delete-force` | review | tofu workspace delete -force (creates dangling unmanaged resources) |
| `legacy-203` | `tofu-workspace-delete` | review | tofu workspace delete (deletes workspace) |
| `legacy-204` | `tofu-force-unlock` | review | tofu force-unlock (removes state lock, risks concurrent modifications) |
| `legacy-205` | `pulumi-destroy` | review | pulumi destroy (destroys all resources) |
| `legacy-206` | `serverless-remove` | review | serverless remove (removes stack) |
| `legacy-207` | `sls-remove` | review | sls remove (removes stack) |
| `legacy-208` | `sam-delete` | review | sam delete (deletes SAM application) |
| `legacy-209` | `heroku-apps-destroy` | review | heroku apps:destroy |
| `legacy-210` | `heroku-pg-reset` | review | heroku pg:reset (resets database) |
| `legacy-211` | `fly-apps-destroy` | review | fly apps destroy (Fly.io) |
| `legacy-212` | `fly-destroy` | review | fly destroy (Fly.io) |
| `legacy-213` | `doctl-droplet-delete` | review | doctl droplet delete (DigitalOcean) |
| `legacy-214` | `doctl-databases-delete` | review | doctl databases delete (DigitalOcean) |
| `legacy-215` | `supabase-db-reset` | review | supabase db reset |
| `legacy-216` | removed | none | go clean -modcache (removes global module cache, affects ALL Go projects) |
| `legacy-217` | removed | none | go clean -cache (removes global build cache, affects ALL Go projects) |
| `legacy-218` | removed | none | uv cache clean (removes all cached packages, slow rebuild) |
| `legacy-219` | `uv-python-uninstall` | review | uv python uninstall (removes managed Python installations) |
| `legacy-220` | `poetry-env-remove` | review | poetry env remove (deletes virtual environment) |
| `legacy-221` | removed | none | poetry cache clear (removes cached packages) |
| `legacy-222` | `molecule-destroy` | review | molecule destroy (destroys test infrastructure) |
| `legacy-223` | `ansible-galaxy-remove` | review | ansible-galaxy remove (removes roles or collections) |
| `legacy-224` | `brew-uninstall` | review | brew uninstall (removes package) |
| `legacy-225` | `brew-autoremove` | review | brew autoremove (removes unused dependencies) |
| `legacy-226` | `brew-untap` | review | brew untap (removes third-party repository) |
| `legacy-227` | `apt-remove-purge` | review | apt remove/purge (removes system packages) |
| `legacy-228` | `apt-autoremove-autopurge` | review | apt autoremove/autopurge (removes unused dependencies) |
| `legacy-229` | `dpkg-purge` | review | dpkg --purge (removes package and config files) |
| `legacy-230` | `gh-repo-delete` | review | gh repo delete (deletes repository) |
| `legacy-231` | `glab-api-delete` | review | glab api DELETE (destructive GitLab API call) |
| `legacy-232` | `glab-project-repo-delete` | review | glab project/repo delete (deletes entire GitLab project) |
| `legacy-233` | `glab-ci-delete` | review | glab ci delete (deletes pipelines, builds, logs, and artifacts) |
| `legacy-234` | `glab-mr-delete` | review | glab mr delete (permanently deletes merge requests) |
| `legacy-235` | `glab-issue-delete` | review | glab issue delete (permanently deletes issues) |
| `legacy-236` | `glab-release-delete` | block | glab release delete (deletes release, may delete tag with --with-tag) |
| `legacy-237` | `glab-ssh-key-delete` | review | glab ssh-key delete (removes SSH key access) |
| `legacy-238` | removed | none | glab token revoke (revokes access token) |
| `legacy-239` | removed | none | glab deploy-key delete (removes deploy key) |
| `legacy-240` | `glab-resource-delete` | review | glab resource delete (removes labels, milestones, schedules, or variables) |
| `legacy-241` | `curl-delete-against-gitlab-api` | review | curl DELETE against GitLab API (destructive) |
| `legacy-242` | `curl-delete-against-gitlab-api-72a592ce` | review | curl DELETE against GitLab API (destructive) |
| `legacy-243` | `npm-unpublish` | review | npm unpublish (removes package from registry) |
| `legacy-244` | `npm-publish` | user | npm publish (uploads package to registry, irreversible) |
| `legacy-245` | `npm-deprecate` | user | npm deprecate (marks package version as deprecated in registry) |
| `legacy-246` | `npm-dist-tag-rm` | user | npm dist-tag rm (removes distribution tag, affects install behavior) |
| `legacy-247` | `npm-owner-rm` | user | npm owner rm (removes package owner, revokes publish privileges) |
| `legacy-248` | `bun-publish` | user | bun publish (uploads package to npm registry, irreversible) |
| `legacy-249` | `uv-publish` | user | uv publish (uploads Python package to PyPI, irreversible) |
| `legacy-250` | `poetry-publish` | user | poetry publish (uploads Python package to PyPI, irreversible) |
| `legacy-251` | `cargo-publish` | user | cargo publish (uploads crate to crates.io, irreversible) |
| `legacy-252` | `cargo-yank` | user | cargo yank (yanks crate version, risks namespace takeover if all versions yanked) |
| `legacy-253` | `gem-push` | user | gem push (uploads gem to rubygems.org, irreversible) |
| `legacy-254` | `gem-yank` | user | gem yank (yanks gem version, risks namespace takeover) |
| `legacy-255` | `dotnet-nuget-push` | user | dotnet nuget push (uploads package to NuGet, irreversible) |
| `legacy-256` | `dotnet-nuget-delete` | user | dotnet nuget delete (unlists/deletes package from NuGet) |
| `legacy-257` | `delete-without-where-clause` | review | DELETE without WHERE clause (will delete ALL rows) |
| `legacy-258` | `delete-without-where-clause-7e164a10` | review | DELETE without WHERE clause (will delete ALL rows) |
| `legacy-259` | `delete` | review | DELETE * (will delete ALL rows) |
| `legacy-260` | `truncate-table` | review | TRUNCATE TABLE (will delete ALL rows) |
| `legacy-261` | `drop-table` | review | DROP TABLE |
| `legacy-262` | `drop-database` | review | DROP DATABASE |
| `legacy-263` | `sql-delete-with-specific-id` | review | SQL DELETE with specific ID |
| `legacy-264` | `remove-item-recurse-on-home-directory` | block | Remove-Item -Recurse on home directory (~) - CATASTROPHIC |
| `legacy-265` | `remove-item-recurse-on-home` | block | Remove-Item -Recurse on $HOME - CATASTROPHIC |
| `legacy-266` | `remove-item-recurse-on-env-userprofile` | block | Remove-Item -Recurse on $env:USERPROFILE - CATASTROPHIC |
| `legacy-267` | `remove-item-recurse-on-c-users` | block | Remove-Item -Recurse on C:\Users - CATASTROPHIC |
| `legacy-268` | `remove-item-recurse-on-c-root` | block | Remove-Item -Recurse on C:\ root - CATASTROPHIC |
| `legacy-269` | `remove-item-recurse-on-c-windows` | block | Remove-Item -Recurse on C:\Windows - CATASTROPHIC |
| `legacy-270` | `remove-item-recurse-on-c-program-files` | block | Remove-Item -Recurse on C:\Program Files - CATASTROPHIC |
| `legacy-271` | `remove-item-recurse-on-c-programdata` | block | Remove-Item -Recurse on C:\ProgramData - CATASTROPHIC |
| `legacy-272` | `remove-item-recurse-on-c-boot` | block | Remove-Item -Recurse on C:\Boot - CATASTROPHIC |
| `legacy-273` | `remove-item-recurse-on-c-recovery` | block | Remove-Item -Recurse on C:\Recovery - CATASTROPHIC |
| `legacy-274` | `remove-item-recurse-on-c-system-volume-information` | block | Remove-Item -Recurse on C:\System Volume Information - CATASTROPHIC |
| `legacy-275` | `remove-item-recurse-on-env-systemroot` | block | Remove-Item -Recurse on $env:SystemRoot - CATASTROPHIC |
| `legacy-276` | `remove-item-recurse-on-env-programfiles` | block | Remove-Item -Recurse on $env:ProgramFiles - CATASTROPHIC |
| `legacy-277` | `remove-item-recurse-on-env-programdata` | block | Remove-Item -Recurse on $env:ProgramData - CATASTROPHIC |
| `legacy-278` | `remove-item-recurse-on-env-appdata` | block | Remove-Item -Recurse on $env:APPDATA - CATASTROPHIC |
| `legacy-279` | `remove-item-recurse-on-env-localappdata` | block | Remove-Item -Recurse on $env:LOCALAPPDATA - CATASTROPHIC |
| `legacy-280` | `rd-s-on-c-users` | block | rd /s on C:\Users - CATASTROPHIC |
| `legacy-281` | `rd-s-on-c-root` | block | rd /s on C:\ root - CATASTROPHIC |
| `legacy-282` | `rd-s-on-c-windows` | block | rd /s on C:\Windows - CATASTROPHIC |
| `legacy-283` | `rd-s-on-c-program-files` | block | rd /s on C:\Program Files - CATASTROPHIC |
| `legacy-284` | `rd-s-on-c-programdata` | block | rd /s on C:\ProgramData - CATASTROPHIC |
| `legacy-285` | `rd-s-on-c-boot` | block | rd /s on C:\Boot - CATASTROPHIC |
| `legacy-286` | `rd-s-on-c-recovery` | block | rd /s on C:\Recovery - CATASTROPHIC |
| `legacy-287` | `rd-s-on-c-system-volume-information` | block | rd /s on C:\System Volume Information - CATASTROPHIC |
| `legacy-288` | `rmdir-s-on-c-users` | block | rmdir /s on C:\Users - CATASTROPHIC |
| `legacy-289` | `rmdir-s-on-c-root` | block | rmdir /s on C:\ root - CATASTROPHIC |
| `legacy-290` | `rmdir-s-on-c-windows` | block | rmdir /s on C:\Windows - CATASTROPHIC |
| `legacy-291` | `rmdir-s-on-c-program-files` | block | rmdir /s on C:\Program Files - CATASTROPHIC |
| `legacy-292` | `rmdir-s-on-c-programdata` | block | rmdir /s on C:\ProgramData - CATASTROPHIC |
| `legacy-293` | `rmdir-s-on-c-boot` | block | rmdir /s on C:\Boot - CATASTROPHIC |
| `legacy-294` | `rmdir-s-on-c-recovery` | block | rmdir /s on C:\Recovery - CATASTROPHIC |
| `legacy-295` | `rmdir-s-on-c-system-volume-information` | block | rmdir /s on C:\System Volume Information - CATASTROPHIC |
| `legacy-296` | `remove-item-with-recurse-flag` | review | Remove-Item with -Recurse flag (PowerShell rm -rf equivalent) |
| `legacy-297` | `remove-item-with-force-flag` | review | Remove-Item with -Force flag (PowerShell rm -f equivalent) |
| `legacy-298` | `ri` | review | ri (Remove-Item alias) with -Recurse |
| `legacy-299` | `del` | review | del (Remove-Item alias) with -Recurse |
| `legacy-300` | `rd-s` | review | rd /s (recursive directory delete) |
| `legacy-301` | `rmdir-s` | review | rmdir /s (recursive directory delete) |
| `legacy-302` | `del-f` | review | del /f (force delete) |
| `legacy-303` | `del-s` | review | del /s (recursive delete) |
| `legacy-304` | `erase-with-force-recursive-flags` | review | erase with force/recursive flags |
| `legacy-305` | `icacls-granting-everyone-full-control` | block | icacls granting Everyone full control |
| `legacy-306` | `icacls-granting-full-control` | block | icacls granting full control |
| `legacy-307` | `takeown-with-recursive-flag` | review | takeown with recursive flag |
| `legacy-308` | `attrib-removing-protection-attributes` | review | attrib removing protection attributes |
| `legacy-309` | `stop-process-force` | review | Stop-Process -Force (PowerShell kill -9) |
| `legacy-310` | `taskkill-force` | review | taskkill /F (force kill) |
| `legacy-311` | `taskkill-targeting-all-processes` | user | taskkill targeting all processes |
| `legacy-312` | `kill-alias-with-force` | review | kill alias with -Force |
| `legacy-313` | `format-volume` | block | Format-Volume (disk format) |
| `legacy-314` | `format-command-targeting-drive` | block | format command targeting drive |
| `legacy-315` | `clear-disk` | block | Clear-Disk (wipe disk) |
| `legacy-316` | `initialize-disk` | block | Initialize-Disk (can destroy partitions) |
| `legacy-317` | `clear-history` | review | Clear-History (PowerShell history clear) |
| `legacy-318` | `doskey-reinstall` | review | doskey /reinstall (cmd history clear) |
| `legacy-319` | `removing-hkey-local-machine-registry-keys` | block | Removing HKEY_LOCAL_MACHINE registry keys |
| `legacy-320` | `removing-hkey-local-machine-registry-paths` | block | Removing HKEY_LOCAL_MACHINE registry paths |
| `legacy-321` | `reg-delete-on-hkey-local-machine` | block | reg delete on HKEY_LOCAL_MACHINE |
| `legacy-322` | `reg-delete-with-force-flag` | review | reg delete with force flag |
| `legacy-323` | `environment-file-access-may-expose-secrets` | user | environment file access may expose secrets (API keys, passwords) |
| `legacy-324` | `environment-file-read-write-may-expose-or-modify-secrets` | user | environment file read/write may expose or modify secrets (API keys, passwords) |
| `legacy-325` | `powershell-recursive-deletion-of-a-system-or-home-path-is-catastrophic` | block | PowerShell recursive deletion of a system or home path is catastrophic |
| `legacy-326` | `powershell-recursive-deletion-can-cause-irreversible-data-loss` | review | PowerShell recursive deletion can cause irreversible data loss |
| `legacy-327` | `powershell-disk-mutation-can-destroy-partitions-or-data` | block | PowerShell disk mutation can destroy partitions or data |
| `legacy-328` | `deleting-hkey-local-machine-data-can-damage-the-operating-system` | block | Deleting HKEY_LOCAL_MACHINE data can damage the operating system |
| `legacy-329` | `forced-process-termination-can-interrupt-active-work` | review | Forced process termination can interrupt active work |
| `legacy-330` | `powershell-recursive-force-delete-can-cause-irreversible-data-loss` | review | PowerShell recursive force delete can cause irreversible data loss |
| `legacy-331` | removed | none | Encoded PowerShell commands hide behavior and are commonly used for bypass/obfuscation |
| `legacy-332` | `execution-policy-bypass-weakens-powershell-script-safety-controls` | review | Execution policy bypass weakens PowerShell script safety controls |
| `legacy-333` | `download-and-execute-patterns-can-run-untrusted-remote-code` | block | Download-and-execute patterns can run untrusted remote code |
| `legacy-334` | `invoke-expression-executes-dynamically-constructed-code` | review | Invoke-Expression executes dynamically constructed code |
| `legacy-335` | `weakens-microsoft-defender-or-adds-malware-style-exclusions` | block | Weakens Microsoft Defender or adds malware-style exclusions |
