import json
import hashlib

domains = {
    "web": {
        "haiku_none": ["What HTTP status code means Not Found?", "Name one common CORS header.", "What does HTML stand for?"],
        "haiku_low": ["Rename the variable 'x' to 'inputValue' in this form handler.", "Format this JSON response for readability.", "Change the button color from #FF0000 to #00FF00 in the CSS."],
        "haiku_medium": ["Add a null check before accessing user.profile.name.", "Add a loading spinner while the API call completes."],
        "sonnet_low": ["Write a function that debounces input changes and only calls the API when user stops typing.", "Create a simple form validator that checks for empty fields and email format."],
        "sonnet_medium": ["Review this fetch call for proper error handling and network edge cases.", "Suggest how to optimize this component for mobile performance."],
    },
    "api": {
        "haiku_none": ["What does REST stand for?", "Which HTTP verb is used for updates?", "Name one authentication method."],
        "haiku_low": ["Update the endpoint path from /user to /users in all calls.", "Add the Content-Type header to this API request.", "Change the response field 'id' to 'userId'."],
        "haiku_medium": ["Add rate limiting headers to the API response.", "Validate that the request body contains required fields."],
        "sonnet_low": ["Design a REST endpoint structure for a comment system with nested replies.", "Write validation middleware that rejects requests missing required headers.", "Create a versioning strategy for this API (v1, v2)."],
        "sonnet_medium": ["Review this API for security issues like SQL injection or missing auth checks.", "Analyze the pagination strategy -- could it cause performance problems?"],
    },
    "cli": {
        "haiku_none": ["What does CLI stand for?", "Name one common CLI flag.", "What is stdout?"],
        "haiku_low": ["Rename the flag from --verbose to --debug.", "Change the error message from 'Failed' to 'Error: operation failed'.", "Add a help flag --help to the command."],
        "haiku_medium": ["Add color output to the success message.", "Fix the argument parsing to handle quoted strings."],
        "sonnet_low": ["Write a CLI command that reads a CSV file and outputs JSON.", "Create a progress bar for a long-running operation.", "Implement a command that validates a config file."],
        "sonnet_medium": ["Design a plugin system for extending this CLI tool.", "Review this shell script for portability across Linux and macOS."],
    },
    "database": {
        "haiku_none": ["What does SQL stand for?", "Name a common database type.", "What is a primary key?"],
        "haiku_low": ["Change the column name from 'user_id' to 'userId' in the schema.", "Add a NOT NULL constraint to the email column.", "Fix the typo in the table name: 'usrs' should be 'users'."],
        "haiku_medium": ["Add an index on the email column for faster lookups.", "Create a foreign key constraint between orders and users."],
        "sonnet_low": ["Write a migration that adds a new 'preferences' table linked to users.", "Design a schema for a multi-tenant SaaS application.", "Create a query that finds all users who signed up in the last 30 days."],
        "sonnet_medium": ["Analyze this query for N+1 problems and suggest optimizations.", "Review the schema for normalization issues and suggest improvements."],
    },
    "testing": {
        "haiku_none": ["Name three testing frameworks.", "What does TDD stand for?", "What is a unit test?"],
        "haiku_low": ["Rename the test file from 'test.js' to 'math.test.js'.", "Fix the assertion: expect(result).toBe(5) should expect 10.", "Add a describe block around these related tests."],
        "haiku_medium": ["Add a beforeEach hook to reset the state before each test.", "Mock the API response in this test."],
        "sonnet_low": ["Write unit tests for a password validation function.", "Create integration tests for a login flow.", "Write a test that verifies proper error handling for network failures."],
        "sonnet_medium": ["Design a test strategy for this payment processing module.", "Analyze the test coverage and identify untested code paths."],
    },
    "performance": {
        "haiku_none": ["What does latency mean?", "Name a common bottleneck.", "What is caching?"],
        "haiku_low": ["Add a cache for frequently accessed data.", "Change the loop to use map() instead of forEach().", "Remove the unnecessary deep clone of this object."],
        "haiku_medium": ["Optimize this regex for slower inputs.", "Add connection pooling to the database client."],
        "sonnet_low": ["Implement lazy loading for images below the fold.", "Create a caching strategy for API responses.", "Optimize the bundle size by removing unused dependencies."],
        "sonnet_medium": ["Profile this function to identify slow operations.", "Review the memory usage of this background worker and suggest optimizations."],
    },
    "devops": {
        "haiku_none": ["What does CI/CD stand for?", "Name a container technology.", "What is a deployment?"],
        "haiku_low": ["Update the Docker image version from 18 to 20.", "Change the environment variable from DEBUG=true to DEBUG=false.", "Fix the typo in the config: 'localhost' should be 'production'."],
        "haiku_medium": ["Add health check endpoints to the deployment.", "Create a backup script for the database."],
        "sonnet_low": ["Write a Docker Compose file for local development.", "Create a CI pipeline that runs tests on every push.", "Design a deployment strategy with blue-green deployments."],
        "sonnet_medium": ["Review this Kubernetes manifest for security and resource issues.", "Analyze the deployment logs to identify causes of crashes."],
    },
    "docs": {
        "haiku_none": ["What is a README?", "Name two documentation formats.", "What is a changelog?"],
        "haiku_low": ["Fix the typo in the documentation: 'dependancy' should be 'dependency'.", "Update the API endpoint example from /v1 to /v2.", "Add missing parameter descriptions to the function documentation."],
        "haiku_medium": ["Add code examples to the getting started section.", "Fix the broken link in the setup guide."],
        "sonnet_low": ["Write comprehensive API documentation with examples.", "Create a tutorial for new contributors.", "Document the architecture and design decisions."],
        "sonnet_medium": ["Review the documentation for accuracy and completeness.", "Improve the documentation structure for better discoverability."],
    },
    "infra": {
        "haiku_none": ["What does IaC stand for?", "Name a cloud provider.", "What is a subnet?"],
        "haiku_low": ["Change the instance type from t2.micro to t2.small.", "Update the security group to allow port 443.", "Fix the incorrect ARN in the policy."],
        "haiku_medium": ["Add monitoring and alerting for CPU usage.", "Create a disaster recovery plan."],
        "sonnet_low": ["Write Terraform code for a VPC with public and private subnets.", "Design a multi-region failover strategy.", "Create an autoscaling group for web servers."],
        "sonnet_medium": ["Review this infrastructure code for security vulnerabilities.", "Analyze costs and suggest optimizations."],
    },
    "security": {
        "haiku_none": ["What does encryption mean?", "Name one security vulnerability.", "What is a hash?"],
        "haiku_low": ["Add input validation to prevent XSS attacks.", "Use bcrypt instead of plain password storage.", "Fix the security header that is missing."],
        "haiku_medium": ["Add rate limiting to prevent brute force attacks.", "Implement HTTPS redirect for all traffic."],
        "sonnet_low": ["Implement a secure password reset flow.", "Design a role-based access control system.", "Create a security audit log."],
        "sonnet_medium": ["Review this authentication system for common vulnerabilities.", "Suggest a secure session management strategy."],
    },
    "backend": {
        "haiku_none": ["What is a microservice?", "Name a backend language.", "What is an ORM?"],
        "haiku_low": ["Rename the method from 'getUser' to 'fetchUser'.", "Change the return type from void to boolean.", "Fix the null pointer exception by adding a null check."],
        "haiku_medium": ["Add logging to track function calls.", "Add exception handling for database errors."],
        "sonnet_low": ["Implement a caching layer for frequently accessed data.", "Create a background job queue for async tasks.", "Design an event-driven architecture."],
        "sonnet_medium": ["Review this service for proper error handling and edge cases.", "Analyze the scalability of this backend design."],
    },
    "frontend": {
        "haiku_none": ["What is React?", "Name a CSS framework.", "What is the DOM?"],
        "haiku_low": ["Move this component to a separate file.", "Extract the hardcoded string to a constant.", "Fix the import statement: it should be '../utils' not './utils'."],
        "haiku_medium": ["Add proper error boundaries to this component tree.", "Refactor the state management to use Context API."],
        "sonnet_low": ["Build a reusable button component with multiple variants.", "Implement infinite scrolling for a feed.", "Create a form with client-side validation."],
        "sonnet_medium": ["Optimize this component for re-renders.", "Design a state management solution for complex features."],
    },
    "ml": {
        "haiku_none": ["What does ML stand for?", "Name a machine learning framework.", "What is a neural network?"],
        "haiku_low": ["Update the training parameter from 0.01 to 0.001.", "Change the model architecture to use more layers.", "Fix the data preprocessing: missing normalization step."],
        "haiku_medium": ["Add cross-validation to prevent overfitting.", "Implement data augmentation for the training set."],
        "sonnet_low": ["Build a model that predicts house prices from features.", "Implement a recommendation system.", "Train a classifier on the provided dataset."],
        "sonnet_medium": ["Review this model for bias and fairness issues.", "Analyze the performance metrics and suggest improvements."],
    },
    "data": {
        "haiku_none": ["What is a data warehouse?", "Name a data format.", "What is ETL?"],
        "haiku_low": ["Convert the XML file to JSON format.", "Clean the data by removing null values.", "Aggregate the sales by month."],
        "haiku_medium": ["Normalize the data for machine learning.", "Create a data quality report."],
        "sonnet_low": ["Write a pipeline that extracts data from an API and loads it into a database.", "Design a data warehouse schema for retail analytics.", "Create a dashboard for real-time metrics."],
        "sonnet_medium": ["Analyze the data quality and suggest improvements.", "Optimize the data pipeline for performance."],
    },
    "refactor": {
        "haiku_none": ["What is code smell?", "Name one refactoring technique.", "What is a code review?"],
        "haiku_low": ["Extract this method into a helper function.", "Rename the variable to be more descriptive.", "Remove the dead code in the commented section."],
        "haiku_medium": ["Simplify this nested if statement.", "Break this large function into smaller functions."],
        "sonnet_low": ["Refactor this code to follow SOLID principles.", "Extract duplicated logic into shared utilities.", "Simplify this complex conditional expression."],
        "sonnet_medium": ["Refactor this module for better testability.", "Review and improve the overall code structure."],
    },
    "auth": {
        "haiku_none": ["What is OAuth?", "Name an authentication method.", "What is a token?"],
        "haiku_low": ["Add JWT validation to the middleware.", "Change the session timeout from 1 hour to 30 minutes.", "Fix the typo in the auth header: 'Bearar' should be 'Bearer'."],
        "haiku_medium": ["Implement two-factor authentication.", "Add CSRF protection to forms."],
        "sonnet_low": ["Implement OAuth2 integration with Google.", "Design a secure session management system.", "Create a password reset flow."],
        "sonnet_medium": ["Review the authentication flow for security vulnerabilities.", "Design a single sign-on solution."],
    },
    "config": {
        "haiku_none": ["What is an environment variable?", "Name a config format.", "What is a secret?"],
        "haiku_low": ["Move hardcoded values to environment variables.", "Update the config file from YAML to JSON.", "Fix the typo in the config: 'databse' should be 'database'."],
        "haiku_medium": ["Add validation for required config values.", "Create a config schema for type safety."],
        "sonnet_low": ["Design a configuration system for multi-environment deployments.", "Implement feature flags for gradual rollouts.", "Create a secrets management solution."],
        "sonnet_medium": ["Review the configuration for security issues.", "Optimize the config loading for performance."],
    },
    "logging": {
        "haiku_none": ["What is structured logging?", "Name a logging level.", "What is a log aggregator?"],
        "haiku_low": ["Add log output to this function.", "Change the log level from debug to info.", "Fix the log message: missing variable interpolation."],
        "haiku_medium": ["Add context to logs for better debugging.", "Implement log rotation to manage disk space."],
        "sonnet_low": ["Implement structured logging with JSON format.", "Create a centralized logging system.", "Add tracing IDs for request correlation."],
        "sonnet_medium": ["Design a logging strategy for microservices.", "Analyze logs to identify performance bottlenecks."],
    },
    "lib": {
        "haiku_none": ["What is a library?", "Name a popular package manager.", "What is a dependency?"],
        "haiku_low": ["Update the package version from 1.0.0 to 2.0.0.", "Remove the unused import.", "Fix the import path: should be from 'lib' not 'src'."],
        "haiku_medium": ["Add type definitions to the library.", "Create unit tests for the public API."],
        "sonnet_low": ["Design a reusable utility library.", "Write a wrapper around an external API.", "Create a plugin system for extensibility."],
        "sonnet_medium": ["Review the library API for consistency and usability.", "Optimize the library for performance and bundle size."],
    },
}

task_types = ["code_write", "code_review", "code_debug", "explain", "design", "mechanical_edit", "factual", "analysis", "plan", "rewrite"]

def generate_prompt_id(index):
    hex_part = hashlib.md5(str(index).encode()).hexdigest()[:6]
    return f"GA-{hex_part.upper()}"

def generate_rows():
    rows = []
    idx = 0

    for effort_level, target_count in [("none", 100), ("low", 100), ("medium", 100)]:
        domain_list = list(domains.keys())
        for i in range(target_count):
            domain = domain_list[i % len(domain_list)]
            domain_templates = domains[domain].get(f"haiku_{effort_level}", [])
            if not domain_templates:
                continue

            prompt_text = domain_templates[i % len(domain_templates)]
            task_type = task_types[i % len(task_types)]

            row = {
                "prompt_id": generate_prompt_id(idx),
                "family_id": f"GA-{domain}-haiku-{effort_level}",
                "prompt": prompt_text,
                "source": "synthetic_small",
                "domain": domain,
                "task_type": task_type,
                "ambiguity": "clear",
                "cheapest_acceptable_route": {"model_tier": "Haiku", "effort": effort_level},
                "labels": {"cheapest_acceptable_route": {"model_tier": "Haiku", "effort": effort_level}},
                "provenance": {
                    "generator_model": "claude-haiku-4-5",
                    "generator_model_size": "small",
                    "adjudicator_model": "self",
                    "adjudicator_model_size": "small",
                    "temperature": 0.0,
                    "prompt_version_hash": "GA-v1",
                    "mode": "live_agent",
                    "cross_family": False
                }
            }
            rows.append(row)
            idx += 1

    for i in range(150):
        domain_list = list(domains.keys())
        domain = domain_list[i % len(domain_list)]
        domain_templates = domains[domain].get("sonnet_low", [])
        if not domain_templates:
            continue

        prompt_text = domain_templates[i % len(domain_templates)]
        task_type = task_types[(i + 3) % len(task_types)]

        row = {
            "prompt_id": generate_prompt_id(idx),
            "family_id": f"GA-{domain}-sonnet-low",
            "prompt": prompt_text,
            "source": "synthetic_small",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": "clear",
            "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "low"},
            "labels": {"cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "low"}},
            "provenance": {
                "generator_model": "claude-haiku-4-5",
                "generator_model_size": "small",
                "adjudicator_model": "self",
                "adjudicator_model_size": "small",
                "temperature": 0.0,
                "prompt_version_hash": "GA-v1",
                "mode": "live_agent",
                "cross_family": False
            }
        }
        rows.append(row)
        idx += 1

    for i in range(50):
        domain_list = list(domains.keys())
        domain = domain_list[i % len(domain_list)]
        domain_templates = domains[domain].get("sonnet_medium", [])
        if not domain_templates:
            continue

        prompt_text = domain_templates[i % len(domain_templates)]
        task_type = task_types[(i + 5) % len(task_types)]

        row = {
            "prompt_id": generate_prompt_id(idx),
            "family_id": f"GA-{domain}-sonnet-medium",
            "prompt": prompt_text,
            "source": "synthetic_small",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": "borderline",
            "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "medium"},
            "labels": {"cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "medium"}},
            "provenance": {
                "generator_model": "claude-haiku-4-5",
                "generator_model_size": "small",
                "adjudicator_model": "self",
                "adjudicator_model_size": "small",
                "temperature": 0.0,
                "prompt_version_hash": "GA-v1",
                "mode": "live_agent",
                "cross_family": False
            }
        }
        rows.append(row)
        idx += 1

    return rows

rows = generate_rows()
output_path = "chunk.jsonl"

with open(output_path, 'w', encoding='utf-8') as f:
    for row in rows:
        f.write(json.dumps(row) + '\n')

print(f"Generated {len(rows)} rows")
domain_counts = {}
for row in rows:
    d = row['domain']
    domain_counts[d] = domain_counts.get(d, 0) + 1

print(f"Domains: {len(domain_counts)}")
for d in sorted(domain_counts.keys()):
    print(f"  {d}: {domain_counts[d]}")

tier_effort = {}
for row in rows:
    key = (row['cheapest_acceptable_route']['model_tier'], row['cheapest_acceptable_route']['effort'])
    tier_effort[key] = tier_effort.get(key, 0) + 1

print(f"Tier/Effort:")
for (tier, effort), count in sorted(tier_effort.items()):
    print(f"  {tier}/{effort}: {count}")
