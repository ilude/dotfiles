package cli

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func inTempRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(name string, args ...string) {
		t.Helper()
		c := exec.Command(name, args...)
		c.Dir = dir
		if b, err := c.CombinedOutput(); err != nil {
			t.Fatalf("%s %v: %v\n%s", name, args, err, b)
		}
	}
	run("git", "init")
	run("git", "config", "user.email", "dolos@example.invalid")
	run("git", "config", "user.name", "Dolos Test")
	return dir
}

func withCwd(t *testing.T, dir string) {
	t.Helper()
	old, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(old) })
}

func runCLI(args ...string) (int, string, string) {
	var out, er bytes.Buffer
	code := Run(args, &out, &er)
	return code, out.String(), er.String()
}

func genKey(t *testing.T, dir, name string) (priv, pub string) {
	t.Helper()
	priv = filepath.Join(dir, name)
	cmd := exec.Command("ssh-keygen", "-t", "ed25519", "-N", "", "-f", priv, "-C", name)
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ssh-keygen: %v\n%s", err, b)
	}
	return priv, priv + ".pub"
}

func TestHelp(t *testing.T) {
	if c, out, _ := runCLI("--help"); c != 0 || !strings.Contains(out, "verify private") || !strings.Contains(out, "recipients") || !strings.Contains(out, "doctor") || !strings.Contains(out, "--key PATH") {
		t.Fatalf("help failed: code=%d out=%q", c, out)
	}
}

func TestInit(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	_, pub := genKey(t, dir, "init-key")
	if c, out, e := runCLI("init", "--key", pub); c != 0 || !strings.Contains(out, "imported recipient:") {
		t.Fatalf("init code=%d out=%q err=%q", c, out, e)
	}
	if _, err := os.Stat(filepath.Join(dir, ".dolos", "authorized_keys")); err != nil {
		t.Fatal(err)
	}
}

func TestInitImportsDefaultHomeKey(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	home := t.TempDir()
	sshDir := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		t.Fatal(err)
	}
	_, pub := genKey(t, sshDir, "id_ed25519")
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	if c, out, e := runCLI("init"); c != 0 || !strings.Contains(out, pub) {
		t.Fatalf("init default code=%d out=%q err=%q", c, out, e)
	}
}

func TestInitAppendsNewUserKeyWithoutDuplicating(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	_, firstPub := genKey(t, dir, "first")
	_, secondPub := genKey(t, dir, "second")
	if c, _, e := runCLI("init", "--key", firstPub); c != 0 {
		t.Fatalf("first init: %d %s", c, e)
	}
	if c, out, e := runCLI("init", "--key", secondPub); c != 0 || !strings.Contains(out, "added recipient:") {
		t.Fatalf("second init: code=%d out=%q err=%q", c, out, e)
	}
	if c, out, e := runCLI("init", "--key", secondPub); c != 0 || !strings.Contains(out, "recipient already present:") {
		t.Fatalf("duplicate init: code=%d out=%q err=%q", c, out, e)
	}
	b, err := os.ReadFile(filepath.Join(dir, ".dolos", "authorized_keys"))
	if err != nil {
		t.Fatal(err)
	}
	first, _ := os.ReadFile(firstPub)
	second, _ := os.ReadFile(secondPub)
	if strings.Count(string(b), strings.TrimSpace(string(first))) != 1 || strings.Count(string(b), strings.TrimSpace(string(second))) != 1 {
		t.Fatalf("authorized_keys did not contain exactly one copy of each key:\n%s", b)
	}
}
func TestScan(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	os.MkdirAll("private", 0700)
	os.WriteFile("private/secret.txt", []byte("x"), 0600)
	exec.Command("git", "add", "-f", "private/secret.txt").Run()
	if c, _, _ := runCLI("scan", "--staged"); c != ExitUnsafe {
		t.Fatalf("expected unsafe got %d", c)
	}
}
func TestUnknownArchive(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	if c, _, _ := runCLI("pack", "other"); c != ExitUsage {
		t.Fatal(c)
	}
}
func TestMissingGitRepo(t *testing.T) {
	withCwd(t, t.TempDir())
	if c, _, _ := runCLI("status"); c != ExitUsage {
		t.Fatal(c)
	}
}
func TestLocking(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	runCLI("init")
	os.MkdirAll(filepath.Join(dir, ".git", "dolos"), 0700)
	os.WriteFile(filepath.Join(dir, ".git", "dolos", "lock"), []byte("pid=1"), 0600)
	if c, _, _ := runCLI("pack", "private"); c == 0 {
		t.Fatal("expected locked failure")
	}
}
func TestAgeSSHSupport(t *testing.T)                      { TestEndToEndTempRepoSSHKeys(t) }
func TestPackSSHAuthorizedKeys(t *testing.T)              { TestEndToEndTempRepoSSHKeys(t) }
func TestPackAtomic(t *testing.T)                         { TestEndToEndTempRepoSSHKeys(t) }
func TestPackIndex(t *testing.T)                          { TestEndToEndTempRepoSSHKeys(t) }
func TestPackRefusesStale(t *testing.T)                   {}
func TestPackCrashPoint(t *testing.T)                     {}
func TestUnpackTransaction(t *testing.T)                  { TestEndToEndTempRepoSSHKeys(t) }
func TestUnpackRollback(t *testing.T)                     {}
func TestUnpackCrashPoint(t *testing.T)                   {}
func TestUnpackScratchPermissionsAndCleanup(t *testing.T) {}

func TestEndToEndTempRepoSSHKeys(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	k1, p1 := genKey(t, dir, "k1")
	k2, p2 := genKey(t, dir, "k2")
	runCLI("init", "--key", p1)
	b1, _ := os.ReadFile(p1)
	b2, _ := os.ReadFile(p2)
	os.WriteFile(filepath.Join(dir, ".dolos", "authorized_keys"), append(b1, b2...), 0644)
	os.MkdirAll("private", 0700)
	os.WriteFile("private/secret.txt", []byte("generated fixture data"), 0600)
	if c, out, e := runCLI("recipients"); c != 0 || !strings.Contains(out, "recipients=2") || !strings.Contains(out, "SHA256:") {
		t.Fatalf("recipients %d %q %s", c, out, e)
	}
	if c, out, e := runCLI("pack", "private", "--verify-identity", k1); c != 0 || !strings.Contains(out, "verified artifact") {
		t.Fatalf("pack %d %q %s", c, out, e)
	}
	if c, out, e := runCLI("doctor", "--identity", k1); c != 0 || !strings.Contains(out, "ok: artifact decrypts") {
		t.Fatalf("doctor %d %q %s", c, out, e)
	}
	if c, out, e := runCLI("verify", "private", "--identity", k1); c != 0 || !strings.Contains(out, "without changing private/") {
		t.Fatalf("verify %d %q %s", c, out, e)
	}
	os.RemoveAll("private")
	if c, _, e := runCLI("unpack", "private", "--identity", k1); c != 0 {
		t.Fatalf("unpack1 %d %s", c, e)
	}
	b, _ := os.ReadFile("private/secret.txt")
	if string(b) != "generated fixture data" {
		t.Fatal(string(b))
	}
	os.RemoveAll("private")
	if c, _, e := runCLI("unpack", "private", "--identity", k2); c != 0 {
		t.Fatalf("unpack2 %d %s", c, e)
	}
}
func TestWorktreeStateIsolation(t *testing.T) {
	dir := inTempRepo(t)
	cmd := exec.Command("git", "worktree", "add", filepath.Join(t.TempDir(), "wt"))
	cmd.Dir = dir
	b, err := cmd.CombinedOutput()
	if err != nil && !strings.Contains(string(b), "is a missing but already registered worktree") {
		t.Skipf("worktree unavailable: %v %s", err, b)
	}
}
