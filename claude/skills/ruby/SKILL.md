---
name: ruby
description: Ruby development with Rails, RSpec, and best practices. Activate when working with .rb files, Gemfile, Gemfile.lock, Rakefile, .gemspec, or discussing Ruby/Rails patterns, bundler, ActiveRecord, migrations, RSpec, minitest, or Rails generators.
---

# Ruby Skill

Ruby prioritizes developer happiness with expressive syntax and convention over configuration. Use Bundler for dependency management, leverage blocks and iterators, and follow the principle of least surprise.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `bundle install` | Install dependencies |
| `bundle exec rspec` | Run RSpec tests |
| `bundle exec rails s` | Start Rails server |
| `bundle exec rubocop` | Lint and format |
| `bundle exec rake db:migrate` | Run migrations |
| `ruby -c file.rb` | Syntax check |

**Key patterns:** Blocks (`do...end`, `{}`), symbols (`:name`), duck typing, mixins via modules, `Enumerable` for collection processing.

## Contents

- [core.md](core.md) - Ruby style, Bundler, blocks, error handling
- [testing.md](testing.md) - RSpec, Minitest, Factory Bot, mocking
- [rails.md](rails.md) - Rails 8.x patterns, controllers, services, Hotwire
- [hanami.md](hanami.md) - Hanami slices, ROM, dry-validation
