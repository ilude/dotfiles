# Infisical Restore Runbook

## Scope

Restore Infisical from an encrypted backup bundle that contains both the Postgres dump and `infisical.env`. The env file is required because the database stores encrypted secret material.

## Procedure

1. Pick the backup artifact:
   ```bash
   ls -1t /backups/menos/infisical/infisical-backup-*.tar.gz.age | head -1
   ```

2. Decrypt the artifact:
   ```bash
   age -d -i /path/to/age-identity.txt -o /tmp/infisical-restore.tar.gz /backups/menos/infisical/infisical-backup-YYYYMMDDTHHMMSSZ.tar.gz.age
   ```

3. Unpack the bundle:
   ```bash
   mkdir -p /tmp/infisical-restore
   tar -xzf /tmp/infisical-restore.tar.gz -C /tmp/infisical-restore
   ```

4. Stop the existing stack before replacing state:
   ```bash
   cd /apps/menos/infisical
   docker compose -p infisical down
   ```

5. Restore the env file:
   ```bash
   install -m 0600 /tmp/infisical-restore/infisical.env /apps/menos/infisical/infisical.env
   ```

6. Recreate a clean Postgres volume:
   ```bash
   docker volume rm infisical_infisical_postgres_data || true
   docker compose -p infisical up -d infisical-postgres
   ```

7. Restore the SQL dump:
   ```bash
   docker compose -p infisical exec -T infisical-postgres psql -U infisical -d infisical < /tmp/infisical-restore/infisical-postgres.sql
   ```

8. Bring the full stack up:
   ```bash
   docker compose -p infisical up -d
   ```

9. Verify the API is healthy:
   ```bash
   curl -fsS https://infisical.<host-domain>/api/status
   ```

10. Log in with the restored root admin account:
    ```text
    https://infisical.<host-domain>/login
    ```

11. Verify a known secret value round-trips in the UI or API:
    ```bash
    infisical secrets get PLAN_VALIDATION --env=prod --path=/shared
    ```

12. Remove temporary restore files:
    ```bash
    shred -u /tmp/infisical-restore/infisical.env || true
    rm -rf /tmp/infisical-restore /tmp/infisical-restore.tar.gz
    ```

## Restore drill log

- Drill completed: pending. A V2 restore drill must restore into a throwaway `infisical-postgres-test` container, bring up a sibling Infisical container with the restored env, log in, and confirm a known secret round-trips.
