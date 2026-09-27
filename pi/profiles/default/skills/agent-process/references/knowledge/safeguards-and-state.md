# Safeguards and state

## How much protection something deserves

Mike asks what the thing is for and what losing it would actually cost, not what category it falls in. "Homelab", "dev", and "production" do not settle it. Whether recovery already exists matters too: protection that duplicates an existing way back adds cost without adding safety.

*Illustration:* BookLore was being built, not used ("we are building not using"), so repeatable first installs mattered more than its prototype data. Menos was also low-stakes and single-user, but in real use, so a verified backup stayed while the surrounding ceremony went. (legacy `019e90d0-0d9f-7553-a64d-67a17000c12c` / `d374c723`; legacy `019f86a9-21a3-7c47-a358-c4e7c3c998a9` / `047cd4f6`)

## Whether a check earns its place

He weighs what a check actually protects against what it costs, and the cost includes his attention. A cheap check that interrupts him over something inconsequential breaks his train of thought and is a net loss. A check that stands in for the risk without really addressing it is worse than none, because it adds friction and false confidence.

He is not against safeguards. When a failure is real or clearly plausible, he wants protection that actually prevents it, including hard enforcement when softer measures have already failed. When protection is getting in the way, he would rather make the normal operation easy to verify than carve out exemptions or add prompts. A check can also be useful without being allowed to block: whether to run it and whether it gates delivery are separate choices.

Before keeping or removing a control, understand why it exists. When its cost defeats its own purpose in a particular case, change it for that case rather than dropping it everywhere.

*Illustration:* a read-before-edit ledger was removed because it accepted partial reads and forced pointless rereads, while the real protection, instructions delivered before mutation, stayed. A commit blocked on cosmetic whitespace was pure interruption. A todo file shared by several Pi instances had a real lost-update risk and got locking. (legacy `019f91ec-124a-744e-a6e9-8b620e111ea7` / `503b0e72`; default `01a0d00d-4421-72b7-bcc4-e1d9b5e6bb1a` / `d3b3aa32`; legacy `019e83d9-11ae-7162-8cb1-848224f6f465` / `46971efc`)

## Building a capability versus using it

When he asks for a capability, he wants it fully built, even if running it against something live needs his approval. Treating the approval requirement as a reason to stub or weaken the capability misses the point. The reverse also holds: having built it is not permission to run it, and destructive or hard-to-undo changes to live systems he wants to see before they happen.

*Illustration:* user lifecycle support was to be built for real without being run yet; stubs and extra flags were rejected while focused deletion protection stayed. (legacy `019eadef-16cf-7ea6-af0b-e04d6ce14262` / `a8f16707`; legacy `019ecc94-5e6c-7338-99e4-ce633eaff59f` / `bee2f91d`)
