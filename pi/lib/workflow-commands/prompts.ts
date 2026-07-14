export interface CommitPlanningPromptContext {
	files: string[];
	diffStat: string;
	cachedStat: string;
	cachedDiff: string;
	hint: string;
}

export interface SecretReviewPromptFinding {
	id: number;
	path: string;
	label: string;
	match: string;
	line: number;
	context: string;
}

export function buildCommitPlanningPrompt(
	claudeInstructions: string,
	context: CommitPlanningPromptContext,
) {
	const payload = {
		files: context.files,
		diffStat: context.diffStat,
		cachedStat: context.cachedStat,
		hint: context.hint,
		cachedDiff: context.cachedDiff,
	};
	return `${claudeInstructions}

You are helping Pi's deterministic /commit command.

Your ONLY job is to plan logical commit groups and produce conventional commit messages.
Do NOT tell the user to run shell commands.
Do NOT describe a workflow.
Do NOT omit any listed files.
All files must be assigned to exactly one group.
Return JSON only with this schema:
{
  "groups": [
    {
      "files": ["path"],
      "subject": "type(scope): description",
      "body": "optional body"
    }
  ],
  "warnings": ["optional warning"]
}

Rules:
- Group files into atomic commits.
- Use conventional commit subjects.
- Each subject must be exactly one line in the form "type(scope): description".
- Do not put a newline before or after the colon in a subject.
- Do not include Markdown, explanations, or extra prose in any subject.
- Keep descriptions specific and human.
- If only one commit makes sense, return one group.
- If you are uncertain, cannot infer a split, or think no split is justified, return one group containing all listed files.
- You MUST return a non-empty plain-text response containing exactly one valid JSON object.
- Never return an empty response.
- Prefer no body unless it adds useful why/context.

Commit planning context (JSON):
${JSON.stringify(payload, null, 2)}`;
}

export function buildSecretReviewPrompt(
	findings: SecretReviewPromptFinding[],
	coverageCorrection?: string,
) {
	const payload = findings.map((finding) => ({
		id: finding.id,
		path: finding.path,
		label: finding.label,
		match: finding.match,
		line: finding.line,
		context: finding.context,
	}));
	return `You are reviewing candidate secret findings for Pi's /commit workflow.

Classify each candidate as exactly one of:
- likely_secret -> appears to be a real credential, private key, token, password assignment, or other sensitive secret that should block commit
- false_positive -> keyword-only match, ordinary code, documentation, sample text, test fixture, placeholder, redacted value, or other content with no usable credential value
- ambiguous -> unclear from context; may be real, should require human confirmation

Be skeptical of false positives in code, markdown docs, comments, tests, examples, and instructional text.
Classify identifier-only declarations, type annotations, function parameters, property names, and runtime expressions as false_positive when no literal credential value is present.
Only mark likely_secret when the content looks like an actual usable secret or credential-bearing assignment.

Return one finding for every candidate ID exactly once.
Return JSON only in this schema:
{
  "findings": [
    {
      "id": 1,
      "classification": "likely_secret|false_positive|ambiguous",
      "reason": "short reason"
    }
  ]
}

Candidate findings JSON:
${JSON.stringify(payload, null, 2)}${coverageCorrection ? `\n\nCoverage correction:\n${coverageCorrection}` : ""}`;
}

export function buildSkillPrompt(
	template: string,
	args: string,
	options: { replaceArguments?: boolean } = {},
) {
	const trimmedArgs = args.trim();
	const resolvedTemplate = options.replaceArguments
		? template.replace("$ARGUMENTS", trimmedArgs)
		: template;
	const appendSuffix = !options.replaceArguments && trimmedArgs;
	return resolvedTemplate + (appendSuffix ? `\n\nArgs: ${args}` : "");
}

export function buildGitlabTicketPrompt(template: string, args: string) {
	const followOn =
		"\n\nFollow the full GitLab workflow in the skill: issue first, then if the user wants follow-on work, prefer an <issue-number>-<kebab-case-title> branch name and a draft MR by default.";
	return buildSkillPrompt(template + followOn, args);
}
