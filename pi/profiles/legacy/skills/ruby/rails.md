# Rails Framework Guidelines

## Tool Grid

| Task | Command |
|------|---------|
| Lint | `bundle exec standardrb` |
| Security | `bundle exec brakeman --no-pager` |
| Test | `bundle exec rspec` |
| Console, server, routes | `bundle exec rails console`, `server`, `routes` |

## Rails 8

- Prefer Rails built-in authentication for new applications: `bundle exec rails generate authentication`.
- Rails 8 defaults to database-backed Solid Queue. Configure `:solid_queue` deliberately and keep jobs retry-safe and idempotent.
- Use Solid Cache and Solid Cable where their database-backed adapters fit the deployment; configure cache store and cable adapter per environment.

## Application boundaries

- Keep controllers thin: authorize, validate parameters, call an application service, and render or redirect.
- Use strong parameters; never use `params.permit!` in production.
- Give service objects one operation and a stable result shape. Place complex reads in `app/queries/` rather than growing models or controllers.
- Order models as constants, associations, validations, sparing callbacks, scopes, then methods. Prefer explicit service calls to lifecycle callbacks with external effects.
- Use parameterized Active Record queries. Rails escapes normal templates; sanitize intentionally accepted HTML.
- Resolve all Brakeman warnings before deployment.

## Jobs, realtime, and UI

- Jobs should locate records inside `perform`, handle deleted records explicitly, and use bounded retries only when the operation is safe to repeat.
- Action Cable channels should authorize subscriptions and stream scoped data; broadcast typed payloads rather than model internals.
- Use ViewComponent when a view unit has behavior or reuse. Use Turbo frames and streams for partial updates and small Stimulus controllers for browser behavior.

## Data and tests

- Use reversible migrations, appropriate defaults and null constraints, and indexes that match query paths. Review migration safety for existing production data.
- Cover models, services, and requests at their boundary; see [testing.md](testing.md) for shared test rules.

## Expected layout

```text
app/
  channels/ components/ controllers/ jobs/ models/ queries/ services/ views/
config/
  cable.yml solid_queue.yml
spec/
  factories/ models/ requests/ services/
```
