---
description: "Guidelines for writing self-explanatory code with minimal but meaningful comments"
applyTo: "**"
---

# Self-explanatory Code Commenting Instructions

## Core Principle

**Write code that speaks for itself. Comment only when necessary to explain WHY, not WHAT.**

Most code does not need comments. Well-written code with clear naming and structure is self-documenting.

---

## The Commenting Philosophy

### When to Comment
✅ **DO comment when explaining:**
- **WHY** something is done (business logic, design decisions)
- **Complex algorithms** and their reasoning
- **Non-obvious trade-offs** or constraints
- **Workarounds** for bugs or limitations
- **API contracts** and public interfaces
- **Regex patterns** and what they match
- **Performance considerations** or optimizations

❌ **DON'T comment when:**
- The code is obvious
- The comment repeats the code
- Better naming would eliminate the need
- The comment would become outdated
- It's decorative or organizational

---

## Comment Anti-Patterns

### ❌ Obvious Comments
```python
# BAD: States the obvious
counter = 0  # Initialize counter to zero
counter += 1  # Increment counter by one

user_name = input("Enter name: ")  # Get user name from input
```

**Better:** No comment needed - the code is self-explanatory.

### ❌ Redundant Comments
```python
# BAD: Comment repeats the code
def get_user_name(user):
    return user.name  # Return the user's name

def calculate_total(items):
    # Loop through items and sum the prices
    total = 0
    for item in items:
        total += item.price
    return total
```

**Better:**
```python
def get_user_name(user):
    return user.name  # No comment needed

def calculate_total(items):
    return sum(item.price for item in items)  # Clear without comment
```

### ❌ Outdated Comments
```python
# BAD: Comment doesn't match the code
# Calculate tax at 5% rate
tax = price * 0.08  # Actually 8%, comment is wrong

# DEPRECATED: Use new_api_function() instead
def old_function():  # Still being used, comment is misleading
    pass
```

**Better:** Keep comments in sync with code, or remove them.

---

## Good Comment Examples

### ✅ Complex Business Logic
```python
# Apply progressive tax brackets: 10% up to $10k, 20% above
# This matches IRS publication 501 for 2024
def calculate_progressive_tax(income):
    if income <= 10000:
        return income * 0.10
    else:
        return 1000 + (income - 10000) * 0.20
```

### ✅ Non-obvious Algorithms
```python
# Using Floyd-Warshall for all-pairs shortest paths
# because we need distances between all nodes.
# Time: O(n³), Space: O(n²)
for k in range(vertices):
    for i in range(vertices):
        for j in range(vertices):
            dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])
```

### ✅ Regex Patterns
```python
# Match email format: username@domain.extension
# Allows letters, numbers, dots, hyphens in username
# Requires valid domain and 2+ char extension
email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
```

### ✅ API Constraints or Gotchas
```python
# GitHub API rate limit: 5000 requests/hour for authenticated users
# We implement exponential backoff to handle rate limiting
await rate_limiter.wait()
response = await fetch(github_api_url)
```

### ✅ Workarounds for Bugs
```python
# HACK: Workaround for bug in library v2.1.0
# Remove after upgrading to v2.2.0
# See: https://github.com/library/issues/123
if library_version == "2.1.0":
    apply_workaround()
```

---

## Decision Framework

Before writing a comment, ask yourself:

1. **Is the code self-explanatory?**
   - If YES → No comment needed
   - If NO → Continue to step 2

2. **Would a better variable/function name eliminate the need?**
   - If YES → Refactor the code instead
   - If NO → Continue to step 3

3. **Does this explain WHY, not WHAT?**
   - If explaining WHAT → Refactor code to be clearer
   - If explaining WHY → Good comment candidate

4. **Will this help future maintainers?**
   - If YES → Write the comment
   - If NO → Skip it

---

## Special Cases for Comments

### Public APIs and Docstrings
```python
def calculate_compound_interest(
    principal: float,
    rate: float,
    time: int,
    compound_frequency: int = 1
) -> float:
    """
    Calculate compound interest using the standard formula.

    Args:
        principal: Initial amount invested
        rate: Annual interest rate as decimal (e.g., 0.05 for 5%)
        time: Time period in years
        compound_frequency: Times per year interest compounds (default: 1)

    Returns:
        Final amount after compound interest

    Raises:
        ValueError: If any parameter is negative

    Example:
        >>> calculate_compound_interest(1000, 0.05, 10)
        1628.89
    """
    if principal < 0 or rate < 0 or time < 0:
        raise ValueError("Parameters must be non-negative")

    # Compound interest formula: A = P(1 + r/n)^(nt)
    return principal * (1 + rate / compound_frequency) ** (compound_frequency * time)
```

### Configuration and Constants
```python
# Based on network reliability studies (95th percentile)
MAX_RETRIES = 3

# AWS Lambda timeout is 15s, leaving 5s buffer for cleanup
API_TIMEOUT = 10000  # milliseconds

# Cache duration optimized for balance between freshness and load
# See: docs/performance-tuning.md
CACHE_TTL = 300  # 5 minutes
```

### Annotations for TODOs and Warnings
```python
# TODO: Replace with proper authentication after security review
# Issue: #456
def temporary_auth(user):
    return True

# WARNING: This function modifies the original array instead of creating a copy
def sort_in_place(arr):
    arr.sort()
    return arr

# FIXME: Memory leak in production - investigate connection pooling
# Ticket: JIRA-789
def get_connection():
    return create_connection()

# PERF: Consider caching this result if called frequently in hot path
def expensive_calculation(data):
    return complex_algorithm(data)

# SECURITY: Validate input to prevent SQL injection before using in query
def build_query(user_input):
    sanitized = escape_sql(user_input)
    return f"SELECT * FROM users WHERE name = '{sanitized}'"
```

### Common Annotation Keywords
- `TODO:` - Work that needs to be done
- `FIXME:` - Known bugs that need fixing
- `HACK:` - Temporary workarounds
- `NOTE:` - Important information or context
- `WARNING:` - Critical information about usage
- `PERF:` - Performance considerations
- `SECURITY:` - Security-related notes
- `BUG:` - Known bug documentation
- `REFACTOR:` - Code that needs refactoring
- `DEPRECATED:` - Soon-to-be-removed code

---

## Anti-Patterns to Avoid

### ❌ Dead Code Comments
```python
# BAD: Don't comment out code - use version control
# def old_function():
#     return "deprecated"

def new_function():
    return "current"
```

**Better:** Delete the code. Git has the history.

### ❌ Changelog Comments
```python
# BAD: Don't maintain history in comments
# Modified by John on 2023-01-15
# Fixed bug reported by Sarah on 2023-02-03
# Updated algorithm on 2023-03-10
def process_data():
    pass
```

**Better:** Use git log for history. Comments should describe current state.

### ❌ Divider Comments
```python
# BAD: Don't use decorative comments
#=====================================
# UTILITY FUNCTIONS
#=====================================

#-------------------------------------
# String Utilities
#-------------------------------------
```

**Better:** Organize code into modules and use clear function names.

### ❌ Noise Comments
```python
# BAD: Useless comments
# Start of function
def calculate():
    # Declare variable
    result = 0
    # Return result
    return result
# End of function
```

**Better:** Remove all of these comments.

---

## Refactoring Over Commenting

### Instead of Commenting Complex Code...
```python
# BAD: Complex code with comment
# Check if user is admin or has special permissions
if user.role == "admin" or (user.permissions and "special" in user.permissions):
    grant_access()
```

### ...Extract to Named Function
```python
# GOOD: Self-explanatory through naming
def user_has_admin_access(user):
    return user.role == "admin" or has_special_permission(user)

def has_special_permission(user):
    return user.permissions and "special" in user.permissions

if user_has_admin_access(user):
    grant_access()
```

---

## Language-Specific Examples

### JavaScript
```javascript
// Good: Explains WHY we debounce
// Debounce search to reduce API calls (500ms wait after last keystroke)
const debouncedSearch = debounce(searchAPI, 500);

// Bad: Obvious
let count = 0;  // Initialize count to zero
count++;  // Increment count
```

### Python
```python
# Good: Explains the algorithm choice
# Using binary search because data is sorted and we need O(log n) performance
index = bisect.bisect_left(sorted_list, target)

# Bad: Redundant
def get_total(items):
    return sum(items)  # Return the sum of items
```

### TypeScript
```typescript
// Good: Explains the type assertion
// TypeScript can't infer this is never null after the check
const element = document.getElementById('app') as HTMLElement;

// Bad: Obvious
const sum = a + b;  // Add a and b
```

---

## Comment Quality Checklist

Before committing, ensure your comments:

- [ ] Explain **WHY**, not **WHAT**
- [ ] Are grammatically correct and clear
- [ ] Will remain accurate as code evolves
- [ ] Add genuine value to code understanding
- [ ] Are placed appropriately (above the code they describe)
- [ ] Use proper spelling and professional language
- [ ] Follow team conventions for annotation keywords
- [ ] Could not be replaced by better naming or structure

---

## Summary

**The best comment is the one you don't need to write because the code is self-documenting.**

Priority order:
1. **Clear code** - Self-explanatory through naming and structure
2. **Good comments** - Explain WHY when necessary
3. **Documentation** - API docs, docstrings for public interfaces
4. **No comments** - Better than bad comments that lie or clutter

Remember: Comments are a failure to make the code self-explanatory. Use them sparingly and wisely.
