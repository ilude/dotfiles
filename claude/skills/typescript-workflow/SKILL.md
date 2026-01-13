---
name: typescript-workflow
description: TypeScript/JavaScript project workflow guidelines using Bun package manager. Triggers on `.ts`, `.tsx`, `bun`, `package.json`, TypeScript. Covers bun run, bun install, bun add, tsconfig.json patterns, ESM/CommonJS modules, type safety, Biome formatting, naming conventions (PascalCase, camelCase, UPPER_SNAKE_CASE), project structure, error handling, environment variables, async patterns, and code quality tools. Activate when working with TypeScript files (.ts, .tsx), JavaScript files (.js, .jsx), Bun projects, tsconfig.json, package.json, bun.lock, or Bun-specific tooling.
---

# TypeScript/JavaScript Projects Workflow

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

Guidelines for working with TypeScript and JavaScript projects using Bun as the primary package manager with modern tooling and best practices.

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint + Format | Biome | `bun run biome check --apply .` |
| Type check | tsc | `bun run tsc --noEmit` |
| Dead code | ts-prune | `bun run ts-prune` |
| Test | Bun test | `bun test` |
| Coverage | c8 | `bun run c8 bun test` |

## Extended Documentation

| Topic | File |
|-------|------|
| React patterns | [frameworks/react.md](frameworks/react.md) |
| Next.js patterns | [frameworks/nextjs.md](frameworks/nextjs.md) |
| CSS and styling | [styling/css.md](styling/css.md) |
| Bun testing | [testing/bun-testing.md](testing/bun-testing.md) |
| Web project setup | [web-projects.md](web-projects.md) |

## CRITICAL: Bun Package Manager

**You MUST use Bun commands** for all package and runtime operations in Bun projects:

```bash
# Package management
bun install        # Install dependencies from package.json
bun add <package>  # Add production dependency
bun add --dev <package>  # Add development dependency
bun remove <package>  # Remove dependency

# Running code and scripts
bun run <script>   # Run script defined in package.json
bun <file.ts>      # Run TypeScript/JavaScript directly
bun run build      # Run build script

# Testing
bun test           # Run tests with Bun's native test runner
```

## Module Systems

### ESM (ECMAScript Modules) - Preferred

**Default for Bun projects and modern TypeScript:**

```typescript
// Import named exports
import { UserService } from './services/user-service';
import { type User } from './types';

// Import default exports
import express from 'express';

// Export named
export function getUserById(id: string): Promise<User> { /* ... */ }

// Re-export
export { type User } from './types';
```

### CommonJS Fallback

Use only when necessary for legacy compatibility:

```javascript
const { UserService } = require('./services/user-service');
module.exports = { UserService };
```

## TypeScript Configuration

### tsconfig.json Best Practices

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@services/*": ["src/services/*"]
    },
    "declaration": true,
    "sourceMap": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Key Options

- **target:** ES2020 for modern environments
- **module:** ESNext for Bun/bundlers
- **moduleResolution:** bundler (for Bun/bundlers)
- **strict:** Enable all strict type checking
- **baseUrl + paths:** Enable path aliases

## Code Style and Formatting

### Biome (Preferred)

Biome is the RECOMMENDED all-in-one tool for linting and formatting.

```bash
bun add --dev @biomejs/biome
```

**Configuration (`biome.json`):**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": {
    "formatter": {
      "semicolons": "always",
      "quoteStyle": "single",
      "trailingCommas": "es5"
    }
  }
}
```

**Usage:**

```bash
bun run biome check --apply .  # Check and fix all issues
bun run biome format --write .  # Format only
bun run biome lint .  # Lint only
```

## Naming Conventions

### File Naming

- **Components:** PascalCase - `UserProfile.tsx`
- **Utilities/Helpers:** camelCase - `formatDate.ts`
- **Types/Interfaces:** PascalCase - `User.ts`
- **Constants:** UPPER_SNAKE_CASE - `API_ENDPOINTS.ts`
- **Test files:** `.test.ts` suffix - `user.service.test.ts`

### Code Naming

```typescript
// Classes/Types/Interfaces/Enums: PascalCase
class UserService { /* ... */ }
interface UserRepository { /* ... */ }
enum UserRole { Admin = 'ADMIN', User = 'USER' }

// Methods, properties, variables: camelCase
getUserById(id: string): Promise<User>
const userData = {};

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// React hooks: camelCase with use prefix
function useUserData(userId: string) { /* ... */ }
```

## Type Safety

### Type Hints

- **Explicit types** for function parameters and return values
- **MUST NOT use `any`** - use `unknown` and type narrowing
- **Avoid implicit `any`** - enable `noImplicitAny`

```typescript
function processUser(user: User): Promise<ProcessedUser> { /* ... */ }

const formatName = (first: string, last: string): string => `${first} ${last}`;

type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };
```

### Data Validation with Zod

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

function createUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

## Project Structure

```
project/
├── src/
│   ├── main.ts              # Entry point
│   ├── types/               # Type definitions
│   ├── services/            # Business logic
│   ├── repositories/        # Data access layer
│   ├── handlers/            # Request/event handlers
│   ├── utils/               # Utility functions
│   └── config/              # Configuration
├── tests/                   # Tests
├── dist/                    # Compiled output (gitignored)
├── package.json
├── tsconfig.json
├── biome.json
└── bun.lock
```

## Error Handling

```typescript
class AppError extends Error {
  constructor(message: string, public code: string, public statusCode = 500) {
    super(message);
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

// Result pattern
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function safeFetchUser(id: string): Promise<Result<User, AppError>> {
  try {
    const user = await getUser(id);
    return { ok: true, value: user };
  } catch (error) {
    return { ok: false, error: error instanceof AppError ? error : new AppError('Unknown', 'UNKNOWN') };
  }
}
```

## Environment Variables

Use Zod for environment validation:

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
});

export default EnvSchema.parse(process.env);
```

## Common Async Patterns

```typescript
// Async/await with error handling
async function fetchUserData(id: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) throw new Error('Failed to fetch');
    return response.json();
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

// Concurrent operations with Promise.all
async function loadDashboardData(): Promise<DashboardData> {
  const [users, products, stats] = await Promise.all([
    fetchUsers(),
    fetchProducts(),
    fetchStats(),
  ]);
  return { users, products, stats };
}
```

## Testing Integration

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { UserService } from '@services/user-service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  it('should fetch user by id', async () => {
    const user = await service.getById('123');
    expect(user).toBeDefined();
    expect(user?.id).toBe('123');
  });
});
```

See [testing/bun-testing.md](testing/bun-testing.md) for comprehensive testing patterns.

## Quick Reference

**Key Rules:**
- MUST use Bun commands in Bun projects
- MUST NOT use `any` - use `unknown` and type guards
- Use ESM (import/export) by default
- Enable strict TypeScript (`"strict": true`)
- Validate all external input with Zod
- Use custom error classes and Result types

---

**Note:** For project-specific TypeScript patterns, check `.claude/CLAUDE.md` in the project directory.
