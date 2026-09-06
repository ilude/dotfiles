# Tactical DDD Reference

Read this file only when the task asks for code-level DDD patterns or a comparison of tactical choices. These are optional tools, not a checklist.

## Model elements

- **Entity:** An object whose continuity is defined by identity, not only by attributes. Its identity and lifecycle should have domain meaning.
- **Value object:** An immutable description whose meaning comes from its values. Equality can be based on those values when the domain permits it.
- **Domain service:** A stateless domain operation that belongs to the domain but does not naturally belong to one entity or value object. Do not use it to hide an anemic model.
- **Aggregate:** A cluster of model objects with one entry point and a consistency boundary. Protect invariants through the aggregate root; reference other aggregates by identity when that is enough.
- **Repository:** A domain-facing collection-like abstraction for retrieving and storing entities or aggregates when persistence concerns would otherwise leak into the model. Do not add one merely because a pattern list mentions it.
- **Factory:** A domain operation that makes a valid complex object or aggregate when construction is a meaningful responsibility of the model.
- **Domain event:** A named fact about a domain occurrence. Include only information needed by interested consumers and preserve the distinction between the fact and the transport mechanism.
- **Module:** A cohesive named grouping that reduces conceptual load and expresses a meaningful part of the model. It need not map one-to-one to a package, service, or deployment unit.

## Context relationships

A context map explains how bounded contexts relate. Choose the least elaborate relationship that accurately describes the dependency and translation:

- A **shared kernel** shares a deliberately small model portion and requires joint ownership of change.
- A **customer-supplier** relationship makes the upstream supplier accountable to downstream needs through an explicit negotiation.
- A **conformist** relationship accepts the upstream model rather than paying for translation.
- An **anticorruption layer** translates an external model so it does not contaminate the local model.
- A **published language** provides a stable shared exchange language that is richer than an accidental internal representation.

These labels describe collaboration and dependency. They do not require microservices, separate repositories, or a particular integration technology.

## Questions before adopting a pattern

- What scenario or invariant makes the pattern useful?
- Which team or bounded context owns the decision and the data?
- What consistency, lifecycle, or translation problem does it solve?
- What simpler option was considered?
- What observable behavior will show that the choice works?

## Reference

The definitions above are a compact working aid based on [Eric Evans, Domain-Driven Design Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf). Consult the source for the fuller definitions and context.
