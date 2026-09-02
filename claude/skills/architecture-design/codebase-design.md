# Codebase Design

Use this reference after an approach has been selected and the structural design remains.

1. Assign each responsibility to the module that owns its data and behavior.
2. Define the smallest interface needed by each caller.
3. Keep dependencies pointed toward stable contracts and inject replaceable boundaries only where tests or deployment require it.
4. Keep transformation and policy decisions at the boundary that controls them.
5. Exercise the interface through a focused test before adding another seam.

Completion means ownership, interfaces, dependency direction, and a representative executable boundary are explicit.
