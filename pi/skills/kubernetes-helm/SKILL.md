---
name: kubernetes-helm
description: "Kubernetes manifests, Helm charts, Kustomize, Argo CD, kubectl, helm, GitOps, or cluster rollout checks. Not for Docker-only files."
---

# Kubernetes, Helm, and GitOps Workflow

## Boundary

Use `kubernetes-helm` for cluster deployment contracts and GitOps validation. Use `docker` for image build and Compose-only work. Use `terraform` for cluster infrastructure provisioning.

## Core Principles

- Prefer immutable, Git-tracked image tags or digests. Avoid mutable `latest` style deployment inputs.
- Treat branch, environment, namespace, and Argo CD application mapping as a contract. Do not change it casually or infer a new mapping from naming alone.
- Keep reusable chart and manifest source separate from private values, kubeconfigs, sealed secrets source material, and tenant-specific credentials.

## Validation

For source changes, render or lint the affected chart or manifest and confirm any changed image identity from deployment source. When the request includes a live GitOps sync or rollout, verify the affected application health and workload status; inspect events or logs when needed to explain a failure or support a health claim.

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

- Claiming a live rollout is healthy from CI alone without checking the affected application and workload.
- Changing environment or branch mapping without updating the documented deployment contract.
- Deploying mutable image tags in GitOps flows.
- Mixing secret values into reusable chart defaults or examples.
