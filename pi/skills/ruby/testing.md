# Ruby Testing with RSpec and Minitest

## Test framework and structure

- Prefer RSpec for new projects unless the repository uses Minitest; follow the existing framework rather than mixing styles.
- Mirror source paths with `*_spec.rb` or `*_test.rb`. Use `describe` for units, `context` beginning with `when`, `with`, or `without` for conditions, and `it` for observable behavior.
- Use `described_class` for the subject type, `subject` for the unit under test, `let` for lazy fixtures, and `let!` only when setup order requires it.
- Use Minitest test methods that state behavior; keep assertions focused on public contracts.

## Boundaries and fixtures

- Mock external services and assert the interaction at the boundary. Use verifying doubles when available.
- Stub HTTP with the project's HTTP test helper; never call a live external service in a unit test.
- Put shared examples and helpers under `spec/support/`; use shared examples only for a real common contract.
- Keep Factory Bot factories small, name meaningful traits, and create records only when persistence matters to the test.
- Test repositories and integration behavior against the configured test database, not mocks that duplicate query behavior.

## Commands

```bash
bundle exec rspec
bundle exec rspec spec/services/
bundle exec rspec spec/services/user_spec.rb:15
bundle exec rspec --tag focus
bundle exec rake test
bundle exec rake test TEST=test/services/user_test.rb
```

## Rules

- Use `bundle exec` for every test command.
- Name tests by behavior, for example `create_when_email_invalid_returns_failure`.
- Do not test private methods directly, commit failing tests, or skip tests without a documented reason.
- Coverage is a signal, not a replacement for tests of behavior, error handling, and external boundaries.
