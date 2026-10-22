// Check actual Git argv inside the private mutation shell, not model-written
// command text or localized failure output. -C/global options retain their scope.
export function commitShellCommand(command: string): string {
	return `git() {
  local -a commit_git_options=()
  local commit_git_status
  while (( $# )); do
    case "$1" in
      -C|-c|--git-dir|--work-tree|--namespace|--config-env|--attr-source)
        if (( $# < 2 )); then command git "\${commit_git_options[@]}" "$@"; return $?; fi
        commit_git_options+=("$1" "$2")
        shift 2
        ;;
      -*) commit_git_options+=("$1"); shift ;;
      commit)
        if command git "\${commit_git_options[@]}" diff --cached --quiet --exit-code --ignore-submodules=none --; then
          printf '%s\\n' 'No staged changes; commit skipped.'
          return 0
        else
          commit_git_status=$?
          if (( commit_git_status != 1 )); then return "$commit_git_status"; fi
        fi
        command git "\${commit_git_options[@]}" "$@"
        return $?
        ;;
      *) command git "\${commit_git_options[@]}" "$@"; return $? ;;
    esac
  done
  command git "\${commit_git_options[@]}"
}
${command}`;
}

// NUL records preserve spaces, tabs, newlines, and rename source/destination pairs.
export function formatStatus(output: string): string {
	const records = output.split("\0");
	const lines: string[] = [];
	for (let i = 0; i < records.length; i++) {
		const record = records[i];
		if (!record) continue;
		const xy = record.slice(0, 2);
		const destination = JSON.stringify(record.slice(3));
		const source = /[RC]/.test(xy) ? ` <- ${JSON.stringify(records[++i])}` : "";
		lines.push(`${xy} ${destination}${source}`);
	}
	return `XY: index/worktree; ?? = untracked. Paths are repository-relative JSON-quoted strings.\n${lines.join("\n") || "Working tree clean."}`;
}
