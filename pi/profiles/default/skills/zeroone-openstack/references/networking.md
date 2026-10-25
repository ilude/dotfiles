# Public networking and port forwarding

OpenStack Neutron can provide native floating-IP port forwarding: different external TCP/UDP ports on one floating IP can target ports on different private workers. A gateway VM is not inherently required. Actual support depends on the deployment.

## Check the deployment

Using the `os` helper from [local access](local-access.md):

```sh
os extension list --network -f json
os floating ip list -f json
os floating ip port forwarding list <floating-ip-id> -f json
```

Inspect the core `floating-ip-port-forwarding` extension, not just `floating-ip-port-forwarding-detail`. The latter alone does not establish that the forwarding API works.

A 404 from the forwarding endpoint is evidence that the request is unavailable in the queried context, not conclusive proof of a permanent provider-wide limitation. Check API support, endpoint/context, and provider guidance as needed before choosing a workaround.

## Observed on 2026-10-19

In the configured ZeroOne cloud:

- The extension list advertised `floating-ip-port-forwarding-detail`, but not the core `floating-ip-port-forwarding` extension.
- Listing forwarding rules on the project's existing floating IP returned HTTP 404.
- That floating IP was directly associated with the existing worker's Neutron port.

Native forwarding was therefore unconfirmed. No forwarding rules or network associations were changed. Recheck these observations when the capability matters; do not encode them as a permanent lack of support.

## Deployment implications

- Distinguish Neutron security-group permissions from NAT/forwarding. Opening a port does not create a forwarding rule.
- A shared public IP needs non-conflicting external ports per protocol. Internal destination ports may be identical on different workers.
- Native forwarding uses a different floating-IP arrangement from direct whole-IP association to a worker. Plan that transition explicitly because it can interrupt existing game and SSH access.
- If native forwarding is unavailable, compare a provider-enabled feature, additional floating IP quota, and a forwarding gateway as alternatives. Do not assume a gateway is required before checking Neutron.
