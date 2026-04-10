# GitLab Ticket Creator

Generate a CMMI-style structured GitLab issue for an Angular 20 + C# Web API application.

## Context

The target application has two parts:
- **Frontend**: Angular 20
- **Backend**: C# with Web API controllers

All generated tickets must account for this architecture when identifying affected components.

## Input Resolution

Determine the feature/change description using this priority:

1. **Inline argument**: If the user passed a description after `/gitlab-ticket`, use that.
2. **Conversation context**: If no argument was provided, synthesize the description from the current conversation (recent discussion, code being reviewed, bug being investigated, etc.).
3. **If neither is available**: Ask the user ONE question: "What feature or change should this ticket describe?"

Do NOT ask clarifying questions beyond gathering the initial description. If information is missing for any section, write "Information Needed" in that section — the user will refine during review.

## Output Format

Generate the issue body using EXACTLY this structure:

```
**Requirement:**
[A detailed description of the functional requirement. Include specific inputs, outputs, constraints, and performance expectations. If information is missing, state "Information Needed".]

**Technical Design & Rationale:**
[Identify the specific components/modules affected. Describe the high-level logic or architectural change. Call out whether this touches Angular frontend, C# backend, or both. Name specific controllers, services, or Angular components/modules where applicable.]

**Acceptance Criteria:**
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]
- [ ] [Testable criterion 3]
[3-5 testable bullet points outlining the conditions for success. Use checkbox format for GitLab.]

**Priority:**
[High/Medium/Low — infer from context, or default to Medium if unclear]
```

Do NOT include any text outside this structure in the issue body.

## Workflow

### Step 1: Generate

Produce the structured ticket content from the description. Use your knowledge of Angular and C# Web API patterns to make the Technical Design section specific and actionable.

### Step 2: Review

Present the full ticket to the user with:

```
## Proposed GitLab Issue

**Title:** [short, imperative title — under 70 characters]

---
[full structured body from above]
---

Does this look right? You can:
- Ask me to revise any section
- Change the title or priority
- Say "file it" to create the issue
```

Wait for the user to approve or request changes. Loop on revisions until the user says to file it.

### Step 3: Detect GitLab Target

When the user approves, determine the target project:

1. Check if the current directory is a git repo with a GitLab remote:
   ```bash
   git remote get-url origin 2>/dev/null
   ```
2. Extract hostname and project path from the remote URL.
3. If no GitLab remote is found, ask the user for `--hostname` and `-R project/path`.

**MUST use explicit `--hostname`** per the multi-instance GitLab rules.

### Step 4: File

Create the issue:

```bash
glab issue create \
  --title "<title>" \
  --description "<body>" \
  --hostname <hostname> \
  -R <project/path>
```

Report the issue URL back to the user.

### Step 5: Labels (optional)

After filing, ask once: "Want to add any labels?" If the user provides labels:

```bash
glab issue update <number> --label "label1,label2" --hostname <hostname> -R <project/path>
```

## Rules

- Never add commentary, preamble, or explanation outside the structured format in the issue body
- Use "Information Needed" rather than guessing when details are missing
- Acceptance criteria must be testable — no vague statements like "works correctly"
- Technical Design must reference the actual architecture (Angular components, C# controllers/services)
- Always confirm with the user before filing
- Always use `--hostname` with glab commands
