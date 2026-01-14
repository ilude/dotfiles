---
paths:
  - "**/*.rb"
  - "Gemfile"
  - "Gemfile.lock"
  - "Rakefile"
  - "*.gemspec"
  - ".rubocop.yml"
  - ".ruby-version"
---

# Ruby Projects Workflow

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

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

---

## Ruby Version

- Projects SHOULD target Ruby 3.x+
- `.ruby-version` file MUST be present in project root
- YJIT SHOULD be enabled in production (`--yjit` flag or `RUBY_YJIT_ENABLE=1`)

---

## Ruby 3.x+ Features

### Pattern Matching

Pattern matching SHOULD be used for complex conditionals:

```ruby
# Preferred
case response
in { status: 200, body: }
  process(body)
in { status: 404 }
  handle_not_found
in { status: 500.. }
  handle_server_error
end

# Also valid for single patterns
response => { data: { users: } }
```

### Data Class

`Data.define` SHOULD be used for immutable value objects (Ruby 3.2+):

```ruby
# Preferred over Struct for immutable data
Point = Data.define(:x, :y) do
  def distance_from_origin
    Math.sqrt(x**2 + y**2)
  end
end

point = Point.new(3, 4)
point.x = 5  # => FrozenError (immutable by default)
```

### The `it` Keyword

The `it` keyword (Ruby 3.4+) SHOULD be used for single-parameter blocks:

```ruby
# Preferred (Ruby 3.4+)
users.map { it.name.upcase }

# Also acceptable
users.map { _1.name.upcase }

# Legacy (still valid)
users.map { |user| user.name.upcase }
```

---

## Bundler & Dependencies

### Gemfile Rules

- `Gemfile` MUST be present for all projects
- `Gemfile.lock` MUST be committed to version control
- Gems SHOULD specify version constraints:

```ruby
# Preferred - pessimistic version constraint
gem "rails", "~> 7.1"

# Acceptable - exact version for critical deps
gem "pg", "1.5.4"

# Avoid - no version constraint
gem "nokogiri"  # May break unexpectedly
```

### Bundle Commands

| Command | Use Case |
|---------|----------|
| `bundle install` | Install dependencies |
| `bundle update GEM` | Update specific gem |
| `bundle exec CMD` | Run command with bundled gems |
| `bundle outdated` | Check for updates |
| `bundle audit` | Security vulnerability check |

All Ruby commands MUST use `bundle exec` prefix to ensure correct gem versions.

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | snake_case | `user_service.rb` |
| Classes/Modules | PascalCase | `UserService` |
| Methods | snake_case | `find_by_email` |
| Variables | snake_case | `current_user` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Predicates | trailing `?` | `valid?`, `empty?` |
| Dangerous | trailing `!` | `save!`, `destroy!` |
| Setters | trailing `=` | `name=` |

### Method Naming

- Predicate methods MUST return boolean and end with `?`
- Bang methods SHOULD indicate danger (mutation, exceptions) with `!`
- Private methods SHOULD NOT use underscore prefix (use `private` keyword)

---

## Code Style

### StandardRB

StandardRB SHOULD be used over RuboCop for simplicity:

- Zero configuration required
- Consistent style across projects
- Auto-fix available

```ruby
# .standard.yml (optional overrides)
ruby_version: 3.3
ignore:
  - "db/schema.rb"
  - "vendor/**/*"
```

### Style Guidelines

```ruby
# String literals - prefer double quotes
name = "Ruby"

# Symbol arrays
%i[foo bar baz]

# String arrays
%w[apple banana cherry]

# Heredocs for multiline strings
query = <<~SQL
  SELECT * FROM users
  WHERE active = true
SQL

# Safe navigation operator
user&.profile&.avatar_url

# Endless methods (Ruby 3.0+) for simple one-liners
def full_name = "#{first_name} #{last_name}"
```

### Method Definitions

```ruby
# Keyword arguments SHOULD be preferred for optional params
def create_user(name:, email:, role: :member)
  # ...
end

# Avoid positional arguments beyond 2-3 parameters
# Bad
def create_user(name, email, role, active, verified)

# Good
def create_user(name:, email:, role:, active:, verified:)
```

---

## Testing

Testing rules are automatically loaded when working with test files. For comprehensive RSpec and Minitest patterns see @~/.claude/rules/ruby/testing.md

### Quick Reference
```bash
bundle exec rspec              # Run all RSpec tests
bundle exec rspec spec/unit/   # Run specific directory
bundle exec rake test          # Run Minitest tests
```

---

## Blocks, Procs, and Lambdas

### Preference Order

1. **Blocks** - SHOULD be preferred for most cases
2. **Lambdas** - MAY be used when storing/passing callable
3. **Procs** - SHOULD be avoided unless specific behavior needed

```ruby
# Preferred: blocks
users.each { |user| notify(user) }

# Acceptable: lambda for callbacks
validator = ->(value) { value.present? }

# Lambda with arguments
process = ->(x, y) { x + y }

# Avoid: Proc.new unless needed
callback = Proc.new { |x| x * 2 }  # Different arity handling
```

### Block Conversion

```ruby
# Symbol to proc (preferred for simple cases)
names = users.map(&:name)

# Method reference
def process(item)
  item.upcase
end
items.map(&method(:process))
```

---

## Metaprogramming

### Guidelines

- Metaprogramming SHOULD be used sparingly
- All metaprogrammed methods MUST be documented
- Prefer explicit over implicit magic
- `define_method` over `method_missing` when possible

```ruby
# Acceptable: documented DSL
class Validator
  # Defines validation methods for each attribute
  # @param attrs [Array<Symbol>] attribute names to validate
  def self.validates(*attrs)
    attrs.each do |attr|
      define_method("validate_#{attr}") do
        # validation logic
      end
    end
  end
end

# Document what methods are generated
# Generated methods: validate_name, validate_email
validates :name, :email
```

### Avoid

```ruby
# Avoid: unbounded method_missing
def method_missing(name, *args)
  # Hard to debug, no autocomplete
end

# Prefer: explicit delegation or define_method
```

---

## Error Handling

```ruby
# Custom errors SHOULD inherit from StandardError
class ServiceError < StandardError; end
class ValidationError < ServiceError; end

# Rescue specific exceptions
begin
  risky_operation
rescue ValidationError => e
  handle_validation(e)
rescue ServiceError => e
  handle_service_error(e)
rescue StandardError => e
  handle_unexpected(e)
end

# Result objects SHOULD be used for expected failures
Result = Data.define(:success, :value, :error) do
  def success? = success
  def failure? = !success

  def self.success(value) = new(true, value, nil)
  def self.failure(error) = new(false, nil, error)
end
```

---

## File Structure

```
project/
  lib/           # Application code
  spec/          # RSpec tests
  test/          # Minitest tests
  bin/           # Executables
  Gemfile        # Dependencies
  Gemfile.lock   # Locked versions
  .ruby-version  # Ruby version
  .standard.yml  # StandardRB config (optional)
```

---

## Framework-Specific Patterns

For web framework patterns, load the appropriate framework rules:
- Rails projects: @~/.claude/rules/ruby/frameworks/rails.md
- Hanami projects: @~/.claude/rules/ruby/frameworks/hanami.md

---

## Out of Scope

- Gem publishing -> see `gem-publishing`
