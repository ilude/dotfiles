# Terraform Common Patterns

## Count vs For Each

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

## Dynamic Blocks

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

## Data Sources

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
