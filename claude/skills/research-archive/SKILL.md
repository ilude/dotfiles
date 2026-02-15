---
name: research-archive
description: Activate when saving research findings, referencing prior investigations, citing sources, documenting references, or using the /research command. Guides consistent research documentation in ~/.claude/research/.
---

# Research Archive Skill

**Auto-activate when:** User mentions research, sources, references, citations, investigation, deep dive, web research, prior art, literature review, or when using the `/research` command. Also activates when saving findings, checking prior research, or building reference materials.

## Purpose

Ensure research findings, source documentation, and reference materials are consistently stored in `~/.claude/research/` for future reuse. Build on prior work rather than duplicating effort.

---

## Core Workflow

### 1. Check Before Researching

**ALWAYS check `~/.claude/research/` for existing work on the topic before starting new research.**

```bash
# Quick search for existing research
ls ~/.claude/research/ | grep -i <topic>

# Or search within files
grep -ri "<topic>" ~/.claude/research/
```

**If existing file found:** Update and expand it rather than creating a new one. Add new findings, update sources, note date of latest research.

**If no existing file:** Create new research file following the standard format below.

---

## File Naming Convention

Use **kebab-case topic slugs** for filenames:

```
~/.claude/research/ai-hallucination-prevention.md
~/.claude/research/terraform-module-patterns.md
~/.claude/research/python-async-patterns.md
~/.claude/research/kubernetes-security-best-practices.md
```

**Rules:**
- Lowercase only
- Hyphens separate words (not underscores or spaces)
- Descriptive but concise (3-5 words typical)
- `.md` extension always
- No dates in filenames (dates go in file content)

---

## Required File Structure

Every research file MUST contain these sections:

```markdown
# Topic Title

Brief 1-2 sentence description of what this research covers.

## Summary

Key takeaways and findings (3-5 bullet points). What did you learn? What matters most?

## Sources

| Resource | URL | Notes |
|----------|-----|-------|
| Official Documentation | https://example.com/docs | Primary reference for API patterns |
| Research Paper (Author, Year) | https://arxiv.org/... | Academic foundation for algorithm |
| Blog Post | https://blog.example.com/... | Practical implementation guide |

## Key Findings

1. **Finding #1**: Actionable insight with context
2. **Finding #2**: Another important discovery
3. **Finding #3**: Trade-offs or decision guidance

## Date

Last updated: 2026-02-15
```

---

## Source Quality Hierarchy

Prefer sources in this order:

1. **Primary sources** (highest confidence)
   - Official documentation
   - Academic papers, RFCs, specifications
   - Source code from authoritative repositories

2. **Secondary sources** (good, but verify)
   - Technical articles from recognized experts
   - Conference talks with published slides
   - Well-maintained project wikis

3. **Tertiary sources** (use cautiously)
   - Blog posts (check author credentials)
   - Stack Overflow answers (verify with docs)
   - Tutorials (may be outdated)

**Never fabricate references.** If you cannot find a source, state "no authoritative source found" rather than inventing one.

---

## Source Documentation Format

Always include **full URLs** with descriptive titles:

```markdown
## Sources

### Academic
- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Transformer architecture foundation
- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - Bidirectional context encoding

### Official Documentation
- [Python asyncio Documentation](https://docs.python.org/3/library/asyncio.html) - Event loop and coroutine reference
- [Kubernetes API Reference](https://kubernetes.io/docs/reference/) - Resource definitions and schemas

### Practical Guides
- [Martin Fowler: Event Sourcing](https://martinfowler.com/easyEventSourcing.html) - Pattern overview with examples
- [High Scalability: Netflix Architecture](https://highscalability.com/blog/2017/12/11/netflix-what-happens-when-you-press-play.html) - Real-world implementation

### Tools & Libraries
- [FastAPI Documentation](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest) - Infrastructure as code reference
```

**Grouping sources by type** makes them easier to scan and assess credibility.

---

## Cross-Referencing

When research relates to existing files in the archive, add cross-references:

```markdown
## Related Research

- [AI Rules & Skills](AI-RULES-SKILLS-REPOS-RESOURCES.md) - Claude Code skill patterns
- [Python Testing Patterns](python-testing-patterns.md) - Async test examples
- [Kubernetes Security](kubernetes-security-best-practices.md) - Pod security policies

## See Also

- [Event-Driven Architecture](event-driven-architecture.md) for message patterns
- [CQRS Patterns](cqrs-patterns.md) for command/query separation
```

**Benefits:**
- Builds knowledge graph over time
- Helps discover connections between topics
- Reduces duplicate research effort

---

## When to Save Research

**Save when:**
- Research involved multiple sources (3+)
- Findings are reusable for future questions
- Significant time invested (10+ minutes)
- Topic will likely come up again
- You synthesized information from disparate sources

**Don't save when:**
- Single API doc lookup
- Quick syntax check
- Trivial "how do I..." question answered in 1 source
- One-time specific question unlikely to recur

**Rule of thumb:** If you think "I might need this again," save it.

---

## Integration with /research Command

The `/research` command automatically saves to `~/.claude/research/<topic-slug>.md` with the standard format. This skill ensures:

1. Consistent formatting across automated and manual research
2. Proper source attribution and URLs
3. Actionable findings, not just information dumps
4. Cross-references to related research

**Manual research** (outside `/research` command) should follow the same standards for consistency.

---

## Example Research File

```markdown
# Terraform Module Best Practices

Research into patterns for writing reusable, maintainable Terraform modules.

## Summary

- Use semantic versioning for module releases
- Prefer explicit variable types over `any`
- Output all resource IDs for composability
- Pin provider versions in modules
- Use `count` and `for_each` carefully (state implications)

## Sources

| Resource | URL | Notes |
|----------|-----|-------|
| HashiCorp Module Guidelines | https://developer.hashicorp.com/terraform/language/modules/develop | Official best practices |
| Gruntwork Terraform Style Guide | https://github.com/gruntwork-io/terraform-style-guide | Production-tested patterns |
| AWS Provider Docs | https://registry.terraform.io/providers/hashicorp/aws/latest | Resource reference |

## Key Findings

1. **Variable validation**: Use `validation` blocks to fail fast on invalid inputs
   ```hcl
   variable "environment" {
     type = string
     validation {
       condition     = contains(["dev", "staging", "prod"], var.environment)
       error_message = "Environment must be dev, staging, or prod."
     }
   }
   ```

2. **State considerations**: `count` and `for_each` affect resource addressing
   - Changing from `count` to `for_each` forces replacement
   - Use `for_each` when resource order doesn't matter
   - Use `count` when creating N identical resources

3. **Module versioning**: Always use version constraints in module sources
   ```hcl
   module "vpc" {
     source  = "terraform-aws-modules/vpc/aws"
     version = "~> 5.0"  # Allow patch updates, not breaking changes
   }
   ```

4. **Outputs for composition**: Output resource IDs/ARNs so modules can reference each other
   ```hcl
   output "vpc_id" {
     value = aws_vpc.main.id
   }
   ```

## Related Research

- [Infrastructure as Code Patterns](infrastructure-as-code-patterns.md) - General IaC principles
- [AWS Security Best Practices](aws-security-best-practices.md) - VPC and IAM considerations

## Date

Last updated: 2026-02-15
```

---

## Quality Checklist

Before saving research, verify:

- [ ] All sources have URLs (or explicit "no URL available" note)
- [ ] Key findings are actionable, not just facts
- [ ] File follows standard structure (Summary → Sources → Findings → Date)
- [ ] Topic slug is descriptive and uses kebab-case
- [ ] Cross-references added if related files exist
- [ ] No fabricated or unverified claims
- [ ] Date of research recorded

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Saving without sources | Can't verify claims later | Always include URLs and references |
| Vague findings | "X is good" | "X is good for Y because Z" |
| Missing dates | Can't assess staleness | Always date research |
| Duplicate files | `kubernetes.md` and `k8s-patterns.md` | Check before creating, update existing |
| No cross-references | Isolated knowledge | Link related topics |
| Copy-paste dumps | Just transcript of docs | Synthesize and extract key insights |

---

## Notes

- Research files are **reference material**, not executed code
- Focus on **reusable insights**, not one-time answers
- **Update over recreate**: If topic already researched, expand the existing file
- Date tracking helps identify stale research that may need refreshing
- Cross-referencing builds a knowledge graph over time

---

## Success Criteria

Research is well-archived when:
- Future questions on the topic check the archive first
- Sources are cited and verifiable
- Findings are actionable and context-aware
- Files follow consistent structure for easy scanning
- Related topics are cross-referenced
- No duplicate or redundant files exist
