---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/hooks/**/*.ts"
---

# React Framework Guidelines

Patterns for React applications. Complements the main TypeScript workflow rules.

## Component Architecture

### Functional Components Only

Components MUST be functional. Class components MUST NOT be used (except Error Boundaries).

```tsx
// CORRECT
function UserProfile({ user }: UserProfileProps) {
  return <div>{user.name}</div>;
}

// Props MUST be typed with explicit interfaces
interface ButtonProps {
  variant: 'primary' | 'secondary';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}
```

## React 19 Features

### useActionState

```tsx
import { useActionState } from 'react';

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Logging in...' : 'Log in'}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

### useOptimistic

```tsx
import { useOptimistic } from 'react';

function TodoList({ todos, addTodo }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo) => [...state, { ...newTodo, pending: true }]
  );

  async function handleAdd(formData: FormData) {
    const newTodo = { id: crypto.randomUUID(), text: formData.get('text') };
    addOptimisticTodo(newTodo);
    await addTodo(newTodo);
  }

  return (
    <form action={handleAdd}>
      {optimisticTodos.map(todo => (
        <li key={todo.id} style={{ opacity: todo.pending ? 0.5 : 1 }}>
          {todo.text}
        </li>
      ))}
    </form>
  );
}
```

## Server Components (RSC)

Components SHOULD be Server Components by default. Client Components MUST use `'use client'`.

```tsx
// Server Component (default) - no directive needed
async function UserList() {
  const users = await db.users.findMany();
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}

// Client Component - requires directive
'use client';
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### RSC Patterns

- Data fetching SHOULD happen in Server Components
- Interactive elements MUST be Client Components
- Server Components MUST NOT use hooks or browser APIs
- Client Components SHOULD be pushed to the leaves

## Testing

Tests MUST use accessible queries. Priority order:

1. `getByRole` (RECOMMENDED)
2. `getByLabelText` (for form fields)
3. `getByText` (for non-interactive elements)
4. `getByTestId` (last resort)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('submits form with user data', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(onSubmit).toHaveBeenCalled();
});
```

## State Management

State SHOULD follow this hierarchy (simplest to most complex):

1. **Local state** (useState) - component-specific
2. **Lifted state** - shared between siblings via parent
3. **Context** - deeply nested or cross-cutting
4. **External store** (Zustand, Jotai) - complex global state

### Context Usage

```tsx
const ThemeContext = createContext<Theme | null>(null);

function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within ThemeProvider');
  return theme;
}
```

## Custom Hooks

Custom hooks MUST start with `use`:

```tsx
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
```

## Error Boundaries

Applications MUST have error boundaries (the only exception to functional-only rule):

```tsx
'use client';
import { Component, ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

## Suspense and Lazy Loading

Route-level components SHOULD use lazy loading:

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Suspense>
  );
}
```

## Accessibility

Interactive elements MUST have accessible names and keyboard support:

```tsx
// CORRECT
<button aria-label="Close dialog">
  <CloseIcon />
</button>

// INCORRECT - no accessible name
<button>
  <CloseIcon />
</button>
```
