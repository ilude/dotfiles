---
name: typescript-testing/dom-testing
description: DOM testing and React Testing Library patterns for component testing.
---

# DOM and Component Testing

Patterns for testing DOM interactions and React components with Bun.

## React Component Testing

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "bun:test:dom";
import { Button } from "./Button";

describe("Button component", () => {
  it("should render button with text", () => {
    render(<Button label="Click me" />);

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeDefined();
  });

  it("should call onClick handler", async () => {
    const handleClick = mock();
    render(<Button label="Click" onClick={handleClick} />);

    const button = screen.getByRole("button");
    button.click();

    expect(handleClick.mock.calls.length).toBe(1);
  });

  it("should disable button when disabled prop is true", () => {
    render(<Button label="Disabled" disabled={true} />);

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
```

## Component Test File Organization

```
src/
├── components/
│   ├── Button.tsx
│   ├── Button.test.tsx        # Colocated test
│   ├── Form.tsx
│   └── Form.test.tsx
└── __tests__/
    └── integration/
        └── UserFlow.test.tsx  # Integration tests
```

## Testing Component Props

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "bun:test:dom";
import { Card } from "./Card";

describe("Card component", () => {
  it("should render with required props", () => {
    render(<Card title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeDefined();
  });

  it("should render with optional children", () => {
    render(
      <Card title="Title">
        <p>Child content</p>
      </Card>
    );
    expect(screen.getByText("Child content")).toBeDefined();
  });

  it("should apply custom className", () => {
    render(<Card title="Title" className="custom-class" />);
    const card = screen.getByRole("article");
    expect(card.classList.contains("custom-class")).toBe(true);
  });
});
```

## Testing User Interactions

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "bun:test:dom";
import { Counter } from "./Counter";

describe("Counter component", () => {
  it("should increment on button click", () => {
    render(<Counter initialValue={0} />);

    const button = screen.getByRole("button", { name: "Increment" });
    fireEvent.click(button);

    expect(screen.getByText("Count: 1")).toBeDefined();
  });

  it("should handle multiple clicks", () => {
    render(<Counter initialValue={5} />);

    const button = screen.getByRole("button", { name: "Increment" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.getByText("Count: 8")).toBeDefined();
  });
});
```

## Testing Form Inputs

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "bun:test:dom";
import { LoginForm } from "./LoginForm";

describe("LoginForm component", () => {
  it("should update input values", () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    expect(emailInput.value).toBe("test@example.com");
    expect(passwordInput.value).toBe("password123");
  });

  it("should submit form with data", () => {
    const handleSubmit = mock();
    render(<LoginForm onSubmit={handleSubmit} />);

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitButton = screen.getByRole("button", { name: "Login" });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    expect(handleSubmit.mock.calls.length).toBe(1);
    expect(handleSubmit.mock.calls[0][0]).toEqual({
      email: "test@example.com",
      password: "password123",
    });
  });
});
```

## Testing Conditional Rendering

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "bun:test:dom";
import { UserProfile } from "./UserProfile";

describe("UserProfile component", () => {
  it("should show loading state", () => {
    render(<UserProfile loading={true} />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("should show error state", () => {
    render(<UserProfile error="Failed to load user" />);
    expect(screen.getByText("Failed to load user")).toBeDefined();
  });

  it("should show user data when loaded", () => {
    const user = { name: "John Doe", email: "john@example.com" };
    render(<UserProfile user={user} />);

    expect(screen.getByText("John Doe")).toBeDefined();
    expect(screen.getByText("john@example.com")).toBeDefined();
  });
});
```

## Query Methods Reference

| Method | Description |
|--------|-------------|
| `getByRole` | Find by ARIA role (button, textbox, etc.) |
| `getByText` | Find by visible text content |
| `getByLabelText` | Find form elements by label |
| `getByPlaceholderText` | Find by placeholder attribute |
| `getByTestId` | Find by data-testid attribute |
| `queryBy*` | Returns null instead of throwing |
| `findBy*` | Returns promise, waits for element |

## Testing Accessibility

```typescript
import { describe, it, expect } from "bun:test";
import { render, screen } from "bun:test:dom";
import { Navigation } from "./Navigation";

describe("Navigation accessibility", () => {
  it("should have proper ARIA labels", () => {
    render(<Navigation />);

    const nav = screen.getByRole("navigation");
    expect(nav.getAttribute("aria-label")).toBe("Main navigation");
  });

  it("should have keyboard navigation", () => {
    render(<Navigation />);

    const links = screen.getAllByRole("link");
    links.forEach(link => {
      expect(link.getAttribute("tabindex")).not.toBe("-1");
    });
  });
});
```

## Dependencies

```bash
# React testing (if using React)
bun add --dev jsdom

# Additional utilities
bun add --dev @testing-library/react
bun add --dev @testing-library/user-event
```

## Best Practices

1. **Query by accessibility** - Prefer `getByRole` over `getByTestId`
2. **Test user behavior** - Focus on what users see and do
3. **Avoid implementation details** - Don't test internal state directly
4. **Use semantic queries** - Makes tests more resilient to refactoring
5. **Test accessibility** - Verify ARIA attributes and keyboard navigation
