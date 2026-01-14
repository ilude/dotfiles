# Ruby Testing with RSpec and Minitest

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## RSpec (Preferred)

RSpec SHOULD be the default testing framework:

```ruby
# spec/services/user_service_spec.rb
RSpec.describe UserService do
  describe "#create" do
    context "with valid attributes" do
      it "creates a new user" do
        result = described_class.new.create(name: "Test")
        expect(result).to be_success
      end
    end

    context "with invalid attributes" do
      it "returns failure" do
        result = described_class.new.create(name: "")
        expect(result).to be_failure
      end
    end
  end
end
```

## Test Structure

- `describe` for classes/methods
- `context` for conditions/scenarios
- `it` for specific behaviors
- `let` for lazy-loaded test data
- `let!` for eager-loaded test data
- `before` for setup (use sparingly)

---

## Minitest (Alternative)

```ruby
# test/services/user_service_test.rb
class UserServiceTest < Minitest::Test
  def test_create_with_valid_attributes
    result = UserService.new.create(name: "Test")
    assert result.success?
  end
end
```

---

## RSpec Best Practices

### Use `described_class`

```ruby
RSpec.describe UserService do
  it "creates a user" do
    # Preferred - automatically updates if class renamed
    result = described_class.new.create(name: "Test")

    # Avoid - hardcoded class name
    result = UserService.new.create(name: "Test")
  end
end
```

### Use `let` for Test Data

```ruby
RSpec.describe Order do
  let(:user) { User.new(name: "Test") }
  let(:product) { Product.new(price: 100) }
  let(:order) { described_class.new(user: user, product: product) }

  it "calculates total" do
    expect(order.total).to eq(100)
  end
end
```

### Use `subject` for the Object Under Test

```ruby
RSpec.describe Calculator do
  subject(:calculator) { described_class.new }

  it "adds numbers" do
    expect(calculator.add(2, 3)).to eq(5)
  end
end
```

### Context Naming

- Start `context` blocks with "when", "with", or "without"
- Be specific about the scenario

```ruby
RSpec.describe User do
  describe "#admin?" do
    context "when user has admin role" do
      it "returns true" do
        # ...
      end
    end

    context "when user has member role" do
      it "returns false" do
        # ...
      end
    end
  end
end
```

---

## Mocking and Stubbing

### RSpec Mocks

```ruby
RSpec.describe OrderService do
  let(:payment_gateway) { instance_double(PaymentGateway) }
  let(:service) { described_class.new(payment_gateway: payment_gateway) }

  it "processes payment" do
    allow(payment_gateway).to receive(:charge).and_return(true)

    result = service.process(amount: 100)

    expect(payment_gateway).to have_received(:charge).with(100)
    expect(result).to be_success
  end
end
```

### Stubbing External Services

```ruby
RSpec.describe WeatherService do
  it "fetches current temperature" do
    stub_request(:get, "https://api.weather.com/current")
      .to_return(body: { temp: 72 }.to_json)

    result = described_class.fetch_temperature

    expect(result).to eq(72)
  end
end
```

---

## Shared Examples

```ruby
# spec/support/shared_examples/validatable.rb
RSpec.shared_examples "validatable" do
  it "validates presence of name" do
    subject.name = nil
    expect(subject).not_to be_valid
  end
end

# spec/models/user_spec.rb
RSpec.describe User do
  subject { described_class.new(name: "Test") }

  it_behaves_like "validatable"
end
```

---

## Factory Bot (Test Data)

```ruby
# spec/factories/users.rb
FactoryBot.define do
  factory :user do
    name { "Test User" }
    email { "test@example.com" }

    trait :admin do
      role { :admin }
    end

    trait :with_posts do
      after(:create) do |user|
        create_list(:post, 3, user: user)
      end
    end
  end
end

# Usage in specs
RSpec.describe UserService do
  let(:user) { create(:user) }
  let(:admin) { create(:user, :admin) }
  let(:author) { create(:user, :with_posts) }
end
```

---

## Test Organization

### Directory Structure

```
spec/
  factories/           # Factory Bot definitions
  support/             # Shared examples, helpers
  models/              # Model specs
  services/            # Service object specs
  requests/            # Request/integration specs
  spec_helper.rb       # RSpec configuration
  rails_helper.rb      # Rails-specific config (if Rails)
```

### Naming Conventions

- Test files: `*_spec.rb` (RSpec) or `*_test.rb` (Minitest)
- Mirror source structure: `app/services/user_service.rb` -> `spec/services/user_service_spec.rb`

---

## Essential Commands

```bash
# RSpec
bundle exec rspec                          # Run all specs
bundle exec rspec spec/services/           # Run directory
bundle exec rspec spec/services/user_spec.rb  # Run file
bundle exec rspec spec/services/user_spec.rb:15  # Run specific line
bundle exec rspec --tag focus              # Run focused specs
bundle exec rspec --format documentation   # Verbose output

# Minitest
bundle exec rake test                      # Run all tests
bundle exec rake test TEST=test/services/user_test.rb  # Run file
bundle exec ruby -Itest test/services/user_test.rb     # Direct run
```

---

## Coverage

```ruby
# spec/spec_helper.rb
require "simplecov"
SimpleCov.start do
  add_filter "/spec/"
  minimum_coverage 80
end
```

---

## Quick Reference

**MUST:**
- Use `bundle exec` for all test commands
- Name test files with `_spec.rb` or `_test.rb` suffix
- Use `described_class` instead of hardcoded class names
- Mock external services and APIs

**SHOULD:**
- Use RSpec for new projects
- Use Factory Bot for test data
- Use `let` for lazy-loaded test data
- Use meaningful context names

**MUST NOT:**
- Commit with failing tests
- Skip tests without documented reason
- Test private methods directly
