---
name: ansible
description: Ansible automation, playbooks, and configuration management. Activate when working with Ansible YAML files or discussing Ansible patterns.
---

# Ansible Workflow

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | ansible-lint | `ansible-lint` |
| YAML lint | yamllint | `yamllint .` |
| Syntax check | ansible | `ansible-playbook --syntax-check` |
| Dry run | ansible | `ansible-playbook --check` |
| Run | ansible | `ansible-playbook playbook.yml` |
| Test roles | molecule | `molecule test` |
| Encrypt | sops | `sops -e secrets.yml` |
| Decrypt | sops | `sops -d secrets.yml` |

## Runtime Requirements

- Ansible Core 2.18+ with Python 3.12+
- ansible-lint and yamllint installed
- SOPS for secrets management (RECOMMENDED over ansible-vault for GitOps)
- Molecule + docker driver for role testing

## Code Standards

### FQCN Requirement

All module names MUST use Fully Qualified Collection Names (FQCN):

```yaml
# CORRECT
- name: Copy configuration file
  ansible.builtin.copy:
    src: app.conf
    dest: /etc/app/app.conf

# INCORRECT - DO NOT USE
- name: Copy configuration file
  copy:
    src: app.conf
    dest: /etc/app/app.conf
```

### Linting

All playbooks and roles MUST pass linting before commit:

```bash
# Run both linters
ansible-lint && yamllint .
```

### Sensitive Data

Tasks handling sensitive data MUST use `no_log: true`:

```yaml
- name: Set database password
  ansible.builtin.shell: |
    mysql -u root -p'{{ db_root_password }}' -e "SET PASSWORD..."
  no_log: true

- name: Create API token
  ansible.builtin.uri:
    url: "{{ api_endpoint }}/tokens"
    headers:
      Authorization: "Bearer {{ admin_token }}"
  no_log: true
  register: token_result
```

## Secrets Management

### SOPS (RECOMMENDED for GitOps)

SOPS is RECOMMENDED over ansible-vault for GitOps workflows:

```yaml
# .sops.yaml
creation_rules:
  - path_regex: .*vars/secrets\.yml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# Encrypt
sops -e vars/secrets.yml > vars/secrets.enc.yml

# Decrypt inline during playbook
sops -d vars/secrets.enc.yml | ansible-playbook -e @/dev/stdin playbook.yml
```

### ansible-vault (Legacy)

When ansible-vault is required:

```bash
# Encrypt variable file
ansible-vault encrypt group_vars/prod/vault.yml

# Run with vault
ansible-playbook --ask-vault-pass playbook.yml
```

## Project Structure

### Environment-Based Inventory

```
inventories/
├── prod/
│   ├── hosts.yml
│   ├── group_vars/
│   │   ├── all.yml
│   │   ├── webservers.yml
│   │   └── databases.yml
│   └── host_vars/
├── staging/
│   ├── hosts.yml
│   └── group_vars/
└── dev/
    ├── hosts.yml
    └── group_vars/
```

### group_vars Organization

Organize group_vars by role name for clarity:

```
group_vars/
├── all/
│   ├── main.yml          # Common variables
│   └── secrets.enc.yml   # SOPS-encrypted secrets
├── webservers/
│   ├── nginx.yml         # Role: nginx
│   └── ssl.yml           # Role: ssl_certificates
└── databases/
    ├── postgresql.yml    # Role: postgresql
    └── backup.yml        # Role: db_backup
```

### Role Structure

Roles SHOULD be single-purpose:

```
roles/
├── nginx/                # Web server only
├── ssl_certificates/     # SSL management only
├── postgresql/           # Database only
└── app_deploy/           # Application deployment only
```

## Dynamic Inventories

### AWS EC2

```yaml
# inventories/aws/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
  - us-west-2
keyed_groups:
  - key: tags.Environment
    prefix: env
  - key: tags.Role
    prefix: role
filters:
  instance-state-name: running
hostnames:
  - private-ip-address
compose:
  ansible_host: private_ip_address
```

See Ansible docs for Azure (`azure.azcollection.azure_rm`) and GCP (`google.cloud.gcp_compute`) dynamic inventory plugins.

## Handler Patterns

### Proper Handler Usage

```yaml
# tasks/main.yml
- name: Update nginx configuration
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: Restart nginx

- name: Update SSL certificate
  ansible.builtin.copy:
    src: "{{ ssl_cert_file }}"
    dest: /etc/nginx/ssl/cert.pem
  notify:
    - Validate nginx config
    - Reload nginx

# handlers/main.yml
- name: Validate nginx config
  ansible.builtin.command: nginx -t
  changed_when: false

- name: Reload nginx
  ansible.builtin.systemd:
    name: nginx
    state: reloaded

- name: Restart nginx
  ansible.builtin.systemd:
    name: nginx
    state: restarted
```

### Handler Execution Order

Handlers execute in definition order, not notification order. Define handlers in logical sequence (validate -> reload -> restart).

## Variable Precedence

Key levels (highest to lowest):

1. Extra vars (`-e "var=value"`) - always wins
2. Task/block/role vars
3. Play vars_files and play vars
4. Role defaults - lowest priority

See [Ansible docs](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html#variable-precedence-where-should-i-put-a-variable) for the full 22-level precedence list.

### Best Practices

```yaml
# Use role defaults for safe defaults
# roles/nginx/defaults/main.yml
nginx_worker_processes: auto
nginx_worker_connections: 1024

# Use group_vars for environment-specific overrides
# group_vars/prod/nginx.yml
nginx_worker_connections: 4096

# Use extra vars for one-time overrides only
ansible-playbook playbook.yml -e "nginx_worker_connections=8192"
```

## Molecule Testing

### Role Testing Setup

```yaml
# roles/nginx/molecule/default/molecule.yml
dependency:
  name: galaxy
driver:
  name: docker
platforms:
  - name: instance
    image: geerlingguy/docker-${MOLECULE_DISTRO:-rockylinux9}-ansible
    pre_build_image: true
    privileged: true
    command: /usr/sbin/init
provisioner:
  name: ansible
verifier:
  name: ansible
```

### Running Tests

```bash
molecule test              # Full test cycle
molecule converge          # Apply role
molecule verify            # Run verification
molecule destroy           # Cleanup
```

## Performance Optimization

### ansible.cfg Settings

- `forks = 20` - Parallel execution
- `pipelining = True` - Reduce SSH operations
- `gathering = smart` - Cache facts
- `fact_caching = jsonfile` - Persist facts

### Task Optimization

```yaml
# Use async for long-running tasks
- name: Upgrade all packages
  ansible.builtin.dnf:
    name: "*"
    state: latest
  async: 600
  poll: 10

# Use free strategy for independent tasks
- hosts: all
  strategy: free
  tasks:
    - name: Independent task 1
      ansible.builtin.command: /opt/script1.sh
    - name: Independent task 2
      ansible.builtin.command: /opt/script2.sh
```

## Pre-Commit Checklist

Before committing Ansible code:

1. [ ] `ansible-lint` passes with no warnings
2. [ ] `yamllint .` passes
3. [ ] `ansible-playbook --syntax-check` passes
4. [ ] All modules use FQCN
5. [ ] Sensitive tasks have `no_log: true`
6. [ ] Secrets encrypted with SOPS (or vault)
7. [ ] Molecule tests pass for modified roles
8. [ ] Variables documented in role README
