# Redaction Checklist

- Commands executed: targeted pytest, validation helper, ansible-lint/syntax when container is available.
- Secret-bearing tasks use `no_log: true` and `diff: false` in `deploy.yml`.
- Captured output must contain key names only; no plaintext secret values are stored in evidence.
- Temp artifact cleanup confirmation: `{{ menos_infisical_tmp_dir }}` is removed by the playbook cleanup task; inspect controller path after live runs.
