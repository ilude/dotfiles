# Stand-up

## Schedule reference

- Host: `DEV-WKS-MGLENN` only.
- Time: 11:20 a.m. Eastern (`America/New_York`), Monday through Friday.
- Holiday exclusions: evaluated by the run instructions below.
- Delivery: the existing stand-up conversation in this machine's T3 environment.
- Each run starts a fresh session and reads this file.

This is the prompt source and a reference for the schedule, not a task installer.
The active schedule and conversation binding remain local to T3. Pulling dotfiles
or running workstation setup does not create this task on other machines. Prompt
edits are read on the next run; changing these schedule notes does not update T3.

## Run instructions

Produce Mike Glenn's concise daily stand-up for gitlab-helm, EISA, and the MPS monorepo. This recurring task authorizes read-only evidence gathering, not implementation.

Calendar and window:
Use shell date/calendar calculations in America/New_York (Eastern, respecting DST), not mental date arithmetic. Before research or delegation, determine today's eligibility. Exclude weekends and observed U.S. federal holidays: New Year's Day, MLK Day (third Monday in January), Washington's Birthday (third Monday in February), Memorial Day (last Monday in May), Juneteenth, Independence Day, Labor Day (first Monday in September), Columbus Day (second Monday in October), Veterans Day, Thanksgiving (fourth Thursday in November), and Christmas. Observe Saturday fixed-date holidays on Friday and Sunday holidays on Monday; include adjacent-year holidays whose observed dates fall in this year. Also exclude the Friday after Thanksgiving and the actual dates December 24 and December 31. If excluded, reply only 'Stand-up skipped: <reason>.' Do no repository or session research.
On eligible days, calculate a nonempty reporting window from 11:20 a.m. Eastern on the preceding eligible business day, using these same exclusions, through this run's current time. Freeze both endpoints as literal ISO-8601 timestamps with UTC offsets and pass those exact values to every lookup. Include the window in the report. It includes intervening weekend/holiday work; do not imply coverage before that window or automatically recover missed runs.

Repositories:
- C:\Projects\Work\Gitlab\gitlab-helm
- C:\Projects\Work\Gitlab\eisa
- C:\Projects\Work\Gitlab\monorepo (current teams/mps/monorepo, not historical sibling repositories)

Repository evidence:
Use three parallel read-only explorer subagents, one per repository, under the active named-role policy. Supply each exact path and frozen endpoints. Read applicable repository instructions and run commands explicitly from that root. Record branch/revision. Query Git with --branches --remotes, not --all, using literal --since/--until endpoints. This excludes refs/t3 checkpoint refs and stash; do not report checkpoint commits as delivered work. Have each child return its exact query and commit count with its findings. If a valid query returns zero, inspect the latest three commits without the window before concluding 'no evidenced commits'. Failed or malformed queries are evidence gaps, not zero activity; a blocked child lookup warrants a bounded parent-side lookup or an explicit gap.
Attribute work using verified author identities. Known identity: Mike Glenn <michael.glenn@redcedartg.com>; check repository Git identity/history for relevant aliases. Agent commits under his identity count as his work. Filter Mike's commits by author; other authors' changes are context only, not his accomplishments. Read relevant diffs, dated changelogs, and tracked investigation notes for outcomes and validation. Git's committer-date window can include rebased/amended work: describe that as landed rather than newly authored when evident. Current uncommitted changes alone do not establish when work happened.

Session evidence:
The parent routinely performs a bounded session-history lookup for each repository, rather than guessing whether Git omitted work. Load pi-log-analytics, discover log_analytics, and use metadata-only sessions discovery with the repository filter to include linked worktrees. Use supported interval filters and bounded message searches/context within the frozen window to identify investigations or uncommitted work; account for old sessions resumed during the window. Session presence alone proves no accomplishment. Corroborate claims with recorded results and distinguish intent from completion. Do not scan unrelated repositories or treat prior stand-up text as new work evidence. If analytics is unavailable or coverage is partial, state the gap without an open-ended investigation.

Scope and output:
Use local evidence only. Do not fetch, change branches/files, commit, run tests, deploy, or create/change schedules. Local remote-tracking refs may be stale; deployment/CI outcomes are historical recorded evidence, not a fresh live check.
Output 'Stand-up: <date>' followed by a short list of work items, not a script. Put the state at the END of each main bullet: '- <work item and outcome>. **Finished.**', '- <work item and current state>. **Still working.**', or '- <work item>. **Blocked.**' Use indented sub-bullets for a specific blocker (what or who is needed), remaining work, or other details essential to understanding that item's state. Include these only when evidenced and useful; do not add empty blocker/detail placeholders. Assign state from the latest evidence available in the reporting window. An explicitly stated future task can end in '**Planned.**'; never label it started without evidence. If evidence does not establish the state, end in '**State unconfirmed.**' rather than inventing a completion or blocker. Distinguish finished source work from an unfinished deployment or verification when that affects the item's state.
Group related commits, investigations, collaboration, release coordination and cross-repository changes into work items instead of listing implementation steps. Recorded participation counts even when a teammate authors or merges the code; do not claim that teammate's changes as Mike's authorship. Include collaborators only when supported; AG is the stand-up lead referred to as 'you' in Mike's supplied example.
Use plain, brief wording, normally 3-6 bullets or fewer when little happened. Do not force sections or an activity bullet for each repository. Keep commit IDs, commands, test counts and routine validation details out of the summary unless essential to understanding an item's state. Mention material evidence limitations briefly, without turning the result into an audit report. Use 'main deployments', not 'staging', for our main environment. Do not invent today's plans or treat a planned task as already in progress. Do not equate missing evidence with no work. Complete the summary in this thread.
