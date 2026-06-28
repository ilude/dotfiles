---
name: kubernetes-helm
description: "Kubernetes, Helm, Argo CD, and GitOps deployment validation. Use when working with Kubernetes manifests, Helm charts, Kustomize overlays, Argo CD apps, kubectl, helm, or cluster rollout checks. Not for Docker-only container files."
---

# Kubernetes, Helm, and GitOps Workflow

**Auto-activate when:** editing Kubernetes manifests, Helm charts, values files, Kustomize overlays, Argo CD applications, deployment pipelines, or using `kubectl`, `helm`, or Argo CD sync and health checks.

## Boundary

Use `kubernetes-helm` for cluster deployment contracts and GitOps validation. Use `docker` for image build and Compose-only work. Use `terraform` for cluster infrastructure provisioning.

## Core Principles

- Prefer immutable, Git-tracked image tags or digests. Avoid mutable `latest` style deployment inputs.
- Treat branch, environment, namespace, and Argo CD application mapping as a contract. Do not change it casually or infer a new mapping from naming alone.
- Keep reusable chart and manifest source separate from private values, kubeconfigs, sealed secrets source material, and tenant-specific credentials.

## Validation Checklist

1. Run chart or manifest validation in CI or the same local commands CI uses.
2. Confirm the intended image identity: registry, repository, tag or digest, and build provenance from the deployment source.
3. Verify Argo CD sync status and health for the application when GitOps is in scope.
4. Check rollout status for changed workloads.
5. Inspect events for scheduling, image pull, probe, admission, or policy failures.
6. Check logs for changed pods or controllers before declaring the deployment healthy.

## Quick Commands

| Purpose | Commands |
|---|---|
| Render Helm | `helm template <release> <chart> -f <values>` |
| Lint Helm | `helm lint <chart>` |
| Diff rendered YAML | `kubectl diff -f <rendered.yaml>` |
| Rollout status | `kubectl rollout status deploy/<name> -n <namespace>` |
| Events | `kubectl get events -n <namespace> --sort-by=.lastTimestamp` |
| Logs | `kubectl logs -n <namespace> deploy/<name>` |

## Anti-patterns

- Claiming success from CI alone when Argo CD sync, health, rollout, events, or logs were not checked.
- Changing environment or branch mapping without updating the documented deployment contract.
- Deploying mutable image tags in GitOps flows.
- Mixing secret values into reusable chart defaults or examples.
