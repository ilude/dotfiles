---
name: terraform
description: Terraform IaC, modules, and cloud infrastructure patterns. Activate when working with .tf files or discussing Terraform.
---

# Terraform Projects Workflow

Guidelines for infrastructure as code with Terraform, covering module development, state management, multi-environment workflows, and enterprise patterns.

## Philosophy

- **Immutable infrastructure** - Replace, don't modify
- **DRY modules** - Reusable, versioned, well-documented
- **State is sacred** - Remote backends, locking, encryption
- **Plan before apply** - Always review changes
- **Least privilege** - Minimal IAM permissions

---

## Module Development

### Structure
```
modules/
├── vpc/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── README.md
```

### Best Practices
- Keep modules small and focused
- Use semantic versioning for module releases
- Validate inputs with `validation` blocks
- Document with `description` on all variables/outputs
- Pin provider versions in `versions.tf`

### Variable Patterns
```hcl
variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}
```

---

## State Management

### Remote Backend (Required)
```hcl
terraform {
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "project/environment/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

### Critical Rules
- **MUST** use remote backend with state locking
- **MUST** encrypt state at rest
- **MUST NOT** commit state files to version control
- Use workspaces OR directory structure for environments, not both

### State Operations
```bash
# Import existing resource
terraform import aws_instance.example i-1234567890abcdef0

# Move resource in state
terraform state mv aws_instance.old aws_instance.new

# Remove from state (doesn't destroy)
terraform state rm aws_instance.orphaned
```

---

## Multi-Environment Workflows

### Directory Structure (Recommended)
```
environments/
├── dev/
│   ├── main.tf
│   ├── terraform.tfvars
│   └── backend.tf
├── staging/
└── prod/
```

### Variable Files
```bash
# Environment-specific variables
terraform plan -var-file="environments/dev/terraform.tfvars"

# Multiple var files
terraform plan -var-file="common.tfvars" -var-file="dev.tfvars"
```

---

## Provider Configuration

### Version Constraints
```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

### Provider Aliases (Multi-Region)
```hcl
provider "aws" {
  region = "us-east-1"
}

provider "aws" {
  alias  = "west"
  region = "us-west-2"
}

resource "aws_instance" "west_instance" {
  provider = aws.west
  # ...
}
```

---

## Security Compliance

### Sensitive Data
```hcl
variable "database_password" {
  type        = string
  sensitive   = true
  description = "Database password - retrieved from secrets manager"
}

output "connection_string" {
  value     = local.connection_string
  sensitive = true
}
```

### IAM Least Privilege
- Use specific resource ARNs, not wildcards
- Prefer managed policies over inline
- Use assume role for cross-account access
- Audit with `terraform plan` before apply

### Secret Management
- **MUST NOT** hardcode secrets in `.tf` files
- Use AWS Secrets Manager, HashiCorp Vault, or environment variables
- Reference secrets dynamically:
```hcl
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "prod/database/password"
}
```

---

## Testing Strategies

### Validation
```bash
# Format check
terraform fmt -check -recursive

# Validate syntax
terraform validate

# Plan with detailed output
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
```

### Policy as Code
- Use Sentinel, OPA, or Checkov for policy enforcement
- Scan for security issues before apply
- Integrate into CI/CD pipeline

---

## CI/CD Integration

### Pipeline Stages
1. `terraform fmt -check` - Style validation
2. `terraform validate` - Syntax validation
3. `terraform plan` - Preview changes
4. Manual approval gate (for prod)
5. `terraform apply -auto-approve` - Apply changes

### Automation Best Practices
- Store plan output as artifact
- Require plan review before apply
- Use service accounts with minimal permissions
- Lock state during CI runs

---

## Cost Management

### Tagging Strategy
```hcl
locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    CostCenter  = var.cost_center
  }
}

resource "aws_instance" "example" {
  # ...
  tags = merge(local.common_tags, {
    Name = "example-instance"
  })
}
```

### Cost Estimation
```bash
# Use Infracost for cost estimates
infracost breakdown --path .
infracost diff --path . --compare-to infracost-base.json
```

---

## Common Patterns

### Count vs For Each
```hcl
# Use count for simple on/off
resource "aws_instance" "optional" {
  count = var.create_instance ? 1 : 0
  # ...
}

# Use for_each for collections
resource "aws_iam_user" "users" {
  for_each = toset(var.user_names)
  name     = each.value
}
```

### Dynamic Blocks
```hcl
resource "aws_security_group" "example" {
  name = "example"

  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }
}
```

### Data Sources
```hcl
# Look up existing resources
data "aws_vpc" "existing" {
  filter {
    name   = "tag:Name"
    values = ["main-vpc"]
  }
}

# Use in resources
resource "aws_subnet" "example" {
  vpc_id = data.aws_vpc.existing.id
  # ...
}
```

---

## Troubleshooting

### Common Issues
- **State lock stuck**: Check DynamoDB/backend for stale locks
- **Provider timeout**: Increase timeouts in resource blocks
- **Dependency issues**: Use `depends_on` for implicit dependencies

### Debug Mode
```bash
TF_LOG=DEBUG terraform plan
TF_LOG_PATH=terraform.log terraform apply
```
