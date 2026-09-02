# Pattern Selection

Map a demonstrated structural problem to the smallest suitable pattern:

| Problem | Candidate |
| --- | --- |
| Construction has many required choices | Builder |
| Behavior varies behind one contract | Strategy |
| A stable boundary simplifies a complex subsystem | Facade |
| State changes need subscribers | Observer |
| State transitions need undo or replay | Command or Memento |
| Behavior changes with lifecycle state | State |

Before choosing one, name the concrete problem, show the existing cases, and compare the straightforward implementation. Do not add a pattern for hypothetical future variation.
