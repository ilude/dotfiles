// Check actual Git argv inside the private mutation shell, not model-written
// command text or localized failure output. -C/global options retain their scope.
// A nonzero read-only check is a result for the reviewer, not a failed mutation:
// end this call successfully so the reviewer can interpret it and continue.
// Worktree discards are refused the same way; staging never needs them.
export function commitShellCommand(command: string): string {
	return `commit_git_stop() {
  printf '%s\\n' "$1" "This mutation call stopped here; later commands in it did not run, earlier ones may have. Refresh state with inspect, then continue."
  exit 0
}
git() {
  local -a commit_git_options=()
  local commit_git_status commit_git_arg commit_git_staged commit_git_worktree
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
      diff|diff-index|diff-files|status|log|show|ls-files|check-ignore|grep|rev-parse|cat-file|merge-base)
        command git "\${commit_git_options[@]}" "$@"
        commit_git_status=$?
        if (( commit_git_status != 0 )); then commit_git_stop "Read-only git $1 returned $commit_git_status (for example differences found or no match). Run checks with inspect, not in mutation calls."; fi
        return 0
        ;;
      restore)
        commit_git_staged=0 commit_git_worktree=0
        for commit_git_arg in "\${@:2}"; do
          [[ $commit_git_arg == -- ]] && break
          [[ $commit_git_arg == --staged || $commit_git_arg =~ ^-[A-Za-z]*S ]] && commit_git_staged=1
          [[ $commit_git_arg == --worktree || $commit_git_arg =~ ^-[A-Za-z]*W ]] && commit_git_worktree=1
        done
        if (( commit_git_worktree || !commit_git_staged )); then commit_git_stop "Refused git restore of working-tree contents: /commit never discards working changes. Use git restore --staged to unstage."; fi
        command git "\${commit_git_options[@]}" "$@"; return $?
        ;;
      checkout|switch|clean)
        commit_git_stop "Refused git $1: /commit never switches branches or discards working changes."
        ;;
      reset)
        for commit_git_arg in "\${@:2}"; do
          [[ $commit_git_arg == -- ]] && break
          if [[ $commit_git_arg == --hard || $commit_git_arg == --merge || $commit_git_arg == --keep ]]; then commit_git_stop "Refused git reset $commit_git_arg: /commit never discards working changes."; fi
        done
        command git "\${commit_git_options[@]}" "$@"; return $?
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
