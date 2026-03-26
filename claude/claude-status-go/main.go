package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	green  = "\033[32m"
	orange = "\033[38;5;208m"
	dim    = "\033[2m"
	reset  = "\033[0m"
	yellow = "\033[33m"
	blue   = "\033[34m"
	white  = "\033[37m"
	cyan   = "\033[36m"
)

type input struct {
	Model struct {
		DisplayName string `json:"display_name"`
	} `json:"model"`
	Workspace struct {
		CurrentDir string `json:"current_dir"`
	} `json:"workspace"`
}

type settings struct {
	EffortLevel string `json:"effortLevel"`
}

func runCmd(args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func isWSL() bool {
	if os.Getenv("WSL_DISTRO_NAME") != "" {
		return true
	}
	data, err := os.ReadFile("/proc/version")
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(data)), "microsoft")
}

func toWSLPath(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	re := regexp.MustCompile(`^([A-Za-z]):/(.*)$`)
	if m := re.FindStringSubmatch(p); m != nil {
		return "/mnt/" + strings.ToLower(m[1]) + "/" + m[2]
	}
	return p
}

var (
	reDriveLetter = regexp.MustCompile(`^[A-Za-z]:`)
	reGitBashDrive = regexp.MustCompile(`^/[a-z]/`)
	reMntDrive    = regexp.MustCompile(`^/mnt/[a-z]/`)
	reVersion     = regexp.MustCompile(`[\d]+\.[\d.]+`)
)

func normalizePath(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	p = reDriveLetter.ReplaceAllString(p, "")
	p = reGitBashDrive.ReplaceAllString(p, "/")
	p = reMntDrive.ReplaceAllString(p, "/")
	return p
}

func homePattern() string {
	if isWSL() {
		return "Users/" + os.Getenv("USER")
	}
	home := os.Getenv("HOME")
	if home == "" {
		home = os.Getenv("USERPROFILE")
	}
	return normalizePath(home)
}

func effortLevel() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "medium"
	}
	data, err := os.ReadFile(filepath.Join(home, ".claude", "settings.json"))
	if err != nil {
		return "medium"
	}
	var s settings
	if err := json.Unmarshal(data, &s); err != nil || s.EffortLevel == "" {
		return "medium"
	}
	return s.EffortLevel
}

func claudeVersion() string {
	claudeBin, err := exec.LookPath("claude")
	if err != nil {
		claudeBin = "claude"
	}
	out := runCmd(claudeBin, "--version")
	if out == "" {
		if npmRoot := runCmd("npm", "root", "-g"); npmRoot != "" {
			candidate := filepath.Join(filepath.Dir(npmRoot), "bin", "claude")
			out = runCmd(candidate, "--version")
		}
	}
	if m := reVersion.FindString(out); m != "" {
		return m
	}
	return "?"
}

func main() {
	model := "unknown"
	cwd := ""

	raw, err := io.ReadAll(os.Stdin)
	if err == nil && len(raw) > 0 {
		var in input
		if json.Unmarshal(raw, &in) == nil {
			if in.Model.DisplayName != "" {
				model = in.Model.DisplayName
			}
			cwd = in.Workspace.CurrentDir
		}
	}
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	wsl := isWSL()
	gitPath := cwd
	if wsl {
		gitPath = toWSLPath(cwd)
	}
	normalized := normalizePath(cwd)
	homePat := homePattern()

	gitRoot := runCmd("git", "-C", gitPath, "rev-parse", "--show-toplevel")

	var displayDir string
	if gitRoot != "" {
		normRoot := normalizePath(gitRoot)
		basename := filepath.Base(strings.TrimRight(normRoot, "/"))
		if strings.HasPrefix(normRoot, homePat) {
			displayDir = "~/" + basename
		} else {
			displayDir = basename
		}
	} else {
		if strings.HasPrefix(normalized, homePat) {
			rel := normalized[len(homePat):]
			if rel == "" {
				displayDir = "~"
			} else {
				displayDir = "~" + rel
			}
		} else {
			displayDir = normalized
		}
	}

	branchName := runCmd("git", "-C", gitPath, "branch", "--show-current")
	branch := ""
	if branchName != "" {
		branch = yellow + "[" + blue + branchName + yellow + "]" + reset
	}

	effort := effortLevel()
	ver := claudeVersion()

	effortLabel := white + "[" + cyan + effort + white + "]" + reset
	versionLabel := dim + "v" + ver + reset

	var line string
	if branch != "" {
		line = green + displayDir + reset + branch +
			" | " + orange + model + reset + effortLabel +
			" | " + versionLabel
	} else {
		line = green + displayDir + reset +
			" | " + orange + model + reset + effortLabel +
			" | " + versionLabel
	}

	fmt.Println(line)
}
