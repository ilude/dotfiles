# Ubuntu Known Issues

## Kernel 6.8.0-100: Route Cache Corruption (Networking)

**Affected:** Ubuntu 24.04 (Noble), kernel `6.8.0-100.100`

**Bug:** A regression between `6.8.0-90` and `6.8.0-100` causes the kernel to corrupt the FIB Next Hop Exception (fnhe) routing cache under outbound traffic bursts. External IPs get misclassified as broadcast addresses, causing:

- `ping` fails with: `Do you want to ping broadcast? Then -b. If not, check your local firewall rules`
- `ip route get <external_ip>` returns `broadcast <ip>` instead of a normal unicast route
- DNS queries to external servers fail with `permission denied`
- Intermittent connectivity — some requests work, others silently fail

**Diagnosis:**

```bash
ip route get 8.8.8.8
# Bad:  broadcast 8.8.8.8 via 192.168.16.1 dev eth0 src ... cache <local,brd>
# Good: 8.8.8.8 via 192.168.16.1 dev eth0 src ... cache
```

**Immediate fix:**

```bash
sudo ip route flush cache
```

Connectivity restores instantly but the bug will recur. Add a cron job as a stopgap:

```bash
# /etc/cron.d/flush-route-cache
*/5 * * * * root /sbin/ip route flush cache
```

**Permanent fix:** Upgrade to kernel `6.8.0-103` or later (pending SRU cycle completion), or boot into `6.8.0-90`:

```bash
# Check available kernels
dpkg -l | grep linux-image

# Set older kernel as default in GRUB
sudo grub-set-default "Advanced options for Ubuntu>Ubuntu, with Linux 6.8.0-90-generic"
sudo update-grub
sudo reboot
```

**References:**

- [Bug #2141531 — Network unstable on 6.8.0-100.100](https://bugs.launchpad.net/ubuntu/+source/linux/+bug/2141531)
- [Kernel 6.8.0-100 network problems — Ubuntu Community Hub](https://discourse.ubuntu.com/t/kernel-6-8-0-100-network-problems/76747)
- [Ubuntu 24.04 Kernel 6.8.0-100 breaks UDP — Home Assistant #162636](https://github.com/home-assistant/core/issues/162636)
