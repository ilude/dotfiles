---
name: api-design-patterns/graphql-patterns
description: GraphQL patterns including schema design, queries, mutations, subscriptions, and N+1 prevention.
---

# GraphQL Patterns

Detailed reference for GraphQL API design patterns including schema design, queries, mutations, resolvers, N+1 prevention, error handling, and security considerations.

## Core Principles

- **Deprecation over versioning** - SHOULD use `@deprecated` directive instead of API versions
- **DataLoaders for N+1 prevention** - MUST use batching for nested resolvers
- **Query depth limiting** - SHOULD limit to 10-15 levels to prevent abuse

---

## Schema Design

**Build around data needs, not database structure:**
```graphql
# Good: Organized by domain
type User {
  id: ID!
  name: String!
  email: String!
  posts(first: Int, after: String): PostConnection!
  followers(first: Int): UserConnection!
}

type Post {
  id: ID!
  title: String!
  body: String!
  author: User!
  comments(first: Int): CommentConnection!
  publishedAt: DateTime!
}

# Avoid: Exposing raw database structure
type UserRow {
  user_id: Int!
  user_name: String!
  created_timestamp: String!
}
```

### Nullability
```graphql
# Sensible defaults
type User {
  id: ID!             # MUST be present
  email: String!      # Required
  bio: String         # Optional, may be null
  posts: [Post!]!     # Required array, posts required
}
```

---

## Relay Connection Spec (RECOMMENDED)

For pagination, use the Relay Connection specification:
```graphql
type Query {
  users(first: Int, after: String, last: Int, before: String): UserConnection!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

**Benefits:**
- Standardized cursor-based pagination
- Bi-directional navigation (first/after, last/before)
- Edge metadata (cursor per item)
- Works with Relay client out of the box

---

## Query vs Mutation

### Queries
Read operations, MUST be safe to execute multiple times:
```graphql
query {
  user(id: "123") {
    name
    email
    posts { title }
  }
}
```

### Mutations
Write operations, may have side effects:
```graphql
mutation {
  createPost(input: {title: "...", body: "..."}) {
    id
    createdAt
  }
}
```

### Batch operations
```graphql
mutation {
  updateUsers(updates: [{id: "1", name: "Alice"}, {id: "2", name: "Bob"}]) {
    id
    name
  }
}
```

---

## Resolvers

### Resolver anatomy
```
function resolve(parent, args, context, info) {
  // parent: object containing this field
  // args: arguments passed to field
  // context: shared data (user, db, etc)
  // info: field metadata
  return data
}
```

### Example
```javascript
const resolvers = {
  Query: {
    user: (parent, { id }, context) => {
      return context.userDB.findById(id);
    }
  },
  User: {
    posts: (user, { first }, context) => {
      return context.postDB.findByAuthorId(user.id).limit(first);
    }
  }
};
```

**Key principle:** Resolvers should be simple, push logic to services/repositories.

---

## N+1 Query Problem

### Problem
```
User query returns 100 users
For each user, resolve posts (100 queries!)
Total: 1 + 100 = 101 queries
```

### Solution 1: DataLoader (Batching)
```javascript
const userLoader = new DataLoader(async (userIds) => {
  // Load all users at once instead of individually
  return database.users.findByIds(userIds);
});

// In resolver:
User: {
  posts: (user, args, context) => {
    // Uses batched loader
    return context.postLoader.loadByAuthorId(user.id);
  }
}
```

### Solution 2: Proactive Loading
```javascript
Query: {
  users: async (parent, args, context) => {
    const users = await context.userDB.find();
    // Batch load all posts for users
    const postMap = await context.postDB.findByAuthorIds(
      users.map(u => u.id)
    );
    users.forEach(u => u._postsMap = postMap[u.id]);
    return users;
  }
}
```

**Recommendation:** Use DataLoader for most cases. Simple and effective.

---

## Error Handling

### Option 1: GraphQL errors (standard)
```json
{
  "data": {
    "user": null
  },
  "errors": [
    {
      "message": "User not found",
      "path": ["user"],
      "extensions": {
        "code": "NOT_FOUND",
        "status": 404
      }
    }
  ]
}
```

### Option 2: Union types for typed errors (RECOMMENDED for mutations)
```graphql
union CreateUserResult = User | ValidationError | EmailAlreadyExists

type ValidationError {
  field: String!
  message: String!
}

type EmailAlreadyExists {
  email: String!
  message: String!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
}
```

### Client handling
```graphql
mutation {
  createUser(input: {email: "test@example.com", name: "Test"}) {
    ... on User {
      id
      name
    }
    ... on ValidationError {
      field
      message
    }
    ... on EmailAlreadyExists {
      email
      message
    }
  }
}
```

**Benefits:** Type-safe error handling, exhaustive checking, clear error contracts.

---

## Query Depth & Complexity Limiting

Prevent malicious or expensive queries:
```graphql
# Dangerous: deeply nested query
query {
  user {
    friends {
      friends {
        friends {
          friends { ... }
        }
      }
    }
  }
}
```

**Implementation:**
- SHOULD limit query depth to 10-15 levels
- MAY implement query complexity scoring
- SHOULD return 400 with clear error message when limits exceeded

---

## Persisted Queries

For production security and performance:
```
# Instead of sending full query:
POST /graphql
{
  "query": "query GetUser($id: ID!) { user(id: $id) { name email } }",
  "variables": { "id": "123" }
}

# Send query hash:
POST /graphql
{
  "extensions": {
    "persistedQuery": {
      "sha256Hash": "abc123..."
    }
  },
  "variables": { "id": "123" }
}
```

**Benefits:**
- Prevents arbitrary query injection
- Reduces request payload size
- Enables query whitelisting in production

---

## Deprecation Strategy

SHOULD use deprecation over versioning:
```graphql
type User {
  id: ID!
  name: String!
  fullName: String! @deprecated(reason: "Use 'name' instead")

  # Old field kept for compatibility
  emailAddress: String @deprecated(reason: "Use 'email' instead. Will be removed 2025-06-01")
  email: String!
}
```

**Pattern:** Partial data + errors in extensions. Allows graceful degradation.

---

## Schema Documentation

### Introspection (built-in)
```graphql
{
  __schema {
    types {
      name
      description
      fields { name, description, type }
    }
  }
}
```

### Tools
- GraphQL Playground - Interactive IDE
- GraphQL Explorer (Apollo) - Documented explorer
- Voyager - Schema visualization

### Write descriptive type/field definitions
```graphql
"""
User account in the system.
Each user has a unique email and can create multiple posts.
"""
type User {
  """Unique identifier (UUID)"""
  id: ID!

  """User's full name"""
  name: String!

  """Email address (must be unique)"""
  email: String!
}
```

---

## Common Pitfalls

### Over/Under Fetching Issues

**Problem (Over-fetching with REST):**
```
GET /users/123
Returns: { id, name, email, phone, address, ... }
Client only needs: id, name
```

**Solution:** Use GraphQL's precise field selection
```graphql
query {
  user(id: "123") {
    id
    name
  }
}
```

**Problem (Under-fetching with GraphQL):**
```graphql
query {
  user(id: "123") { posts { id } }
  user(id: "456") { posts { id } }
  # Separate queries for each user
}
```

**Solution:** Batch queries
```graphql
query {
  user1: user(id: "123") { posts { id } }
  user2: user(id: "456") { posts { id } }
  # Single request, clear
}
```
