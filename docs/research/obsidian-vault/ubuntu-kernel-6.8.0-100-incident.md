---
status: historical
incident_date: 2026-05-11
source: docs/UBUNTU.md
---

# Ubuntu 24.04 kernel 6.8.0-100 incident

> Historical incident record captured on 2026-05-11. This is not current Ubuntu networking guidance.

## Symptoms

On Ubuntu 24.04 (Noble) with kernel `6.8.0-100.100`, outbound traffic bursts could corrupt the FIB Next Hop Exception (fnhe) routing cache. External IPs were misclassified as broadcast addresses, causing:

- `ping` to fail with `Do you want to ping broadcast? Then -b. If not, check your local firewall rules`.
- `ip route get <external_ip>` to return `broadcast <ip>` instead of a normal unicast route.
- DNS queries to external servers to fail with `permission denied`.
- Intermittent connectivity, with some requests working while others silently failed.

## Diagnosis

Compare the route lookup with the expected unicast route:

```bash
ip route get 8.8.8.8
# Bad:  broadcast 8.8.8.8 via 192.168.16.1 dev eth0 src ... cache <local,brd>
# Good: 8.8.8.8 via 192.168.16.1 dev eth0 src ... cache
```

## Workaround

Flush the route cache:

```bash
sudo ip route flush cache
```

Connectivity restored immediately, but the bug could recur. A cron job was a stopgap:

```cron
# /etc/cron.d/flush-route-cache
*/5 * * * * root /sbin/ip route flush cache
```

## Permanent resolution

Upgrade to kernel `6.8.0-103` or later after the SRU was available, or boot into `6.8.0-90`:

```bash
# Check available kernels
dpkg -l | grep linux-image

# Set older kernel as default in GRUB
sudo grub-set-default "Advanced options for Ubuntu>Ubuntu, with Linux 6.8.0-90-generic"
sudo update-grub
sudo reboot
```

## References

- [Bug #2141531 - Network unstable on 6.8.0-100.100](https://bugs.launchpad.net/ubuntu/+source/linux/+bug/2141531)
- [Kernel 6.8.0-100 network problems - Ubuntu Community Hub](https://discourse.ubuntu.com/t/kernel-6-8-0-100-network-problems/76747)
- [Ubuntu 24.04 Kernel 6.8.0-100 breaks UDP - Home Assistant #162636](https://github.com/home-assistant/core/issues/162636)
