# Ruby Projects Workflow

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | StandardRB | `bundle exec standardrb` |
| Format | StandardRB | `bundle exec standardrb --fix` |
| Type check | Sorbet | `bundle exec srb tc` |
| Semantic | Reek | `bundle exec reek` |
| Dead code | debride | `bundle exec debride .` |
| Complexity | Flog | `bundle exec flog lib/` |
| Test | RSpec | `bundle exec rspec` |
| Test | Minitest | `bundle exec rake test` |

## Version and dependencies

- Target Ruby 3.x+, commit `.ruby-version` and `Gemfile.lock`, and run project commands through `bundle exec`.
- Enable YJIT in production when deployment evidence supports it: `--yjit` or `RUBY_YJIT_ENABLE=1`.
- Constrain gem versions; update one gem with `bundle update GEM` and inspect `bundle outdated` before broader updates.

## Language rules

- Use pattern matching for structural branching and `Data.define` for immutable value objects (Ruby 3.2+).
- In Ruby 3.4+, use the `it` block parameter for a single implicit parameter; use an explicit block parameter when it improves clarity.
- Use `snake_case` for files, methods, and variables; `PascalCase` for classes/modules; `SCREAMING_SNAKE_CASE` for constants; `?`, `!`, and `=` only for predicate, dangerous, and setter methods.
- Name domain constants instead of repeating meaningful literals; literals remain appropriate for tests, indices, one-off messages, and local glue.
- Prefer keyword arguments for optional or numerous inputs. Keep methods small enough that positional arguments remain obvious.
- Prefer blocks for immediate work, lambdas for stored callables, and avoid `Proc.new` unless its arity behavior is required.
- Use `&:method` only when it remains readable; an explicit block is clearer for transformations with domain meaning.

## Style and structure

- Use StandardRB; do not add RuboCop configuration to replace its project convention.
- Prefer double-quoted strings, symbol and word arrays (`%i[]`, `%w[]`), `<<~` for multiline text, safe navigation for optional chains, and endless methods only for obvious one-line methods.
- Keep application code in `lib/`, RSpec in `spec/`, Minitest in `test/`, and executables in `bin/`.
- Load [testing.md](testing.md) for test conventions and [rails.md](rails.md) or [hanami.md](hanami.md) for framework-specific rules.

## Errors and metaprogramming

- Define domain errors under `StandardError`, rescue the narrowest expected exception, and use result objects for expected business failures.
- Never rescue `Exception`; do not silently swallow `StandardError`.
- Prefer explicit methods and delegation. Use `define_method` only for a documented, bounded API; avoid unbounded `method_missing` because it hides typos and defeats tooling.
