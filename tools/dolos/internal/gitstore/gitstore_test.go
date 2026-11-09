package gitstore

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func command(t *testing.T, dir string, args ...string) string {
	t.Helper()
	c := exec.Command("git", args...)
	c.Dir = dir
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
	return strings.TrimSuffix(string(out), "\n")
}
func inDir(t *testing.T, dir string) {
	t.Helper()
	old, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(old) })
}
func repo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	command(t, dir, "init")
	command(t, dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "base")
	return dir
}
func TestDiscoverNestedAndWorktreeIsolation(t *testing.T) {
	root := repo(t)
	wt := filepath.Join(t.TempDir(), "worktree")
	command(t, root, "worktree", "add", "-b", "linked", wt)
	var stores []Store
	for _, dir := range []string{root, wt} {
		nested := filepath.Join(dir, "nested", "deep")
		if err := os.MkdirAll(nested, 0700); err != nil {
			t.Fatal(err)
		}
		t.Run(filepath.Base(dir), func(t *testing.T) {
			inDir(t, nested)
			s, err := Discover()
			if err != nil {
				t.Fatal(err)
			}
			if !filepath.IsAbs(s.GitPath) {
				t.Fatalf("relative state: %s", s.GitPath)
			}
			expected := command(t, nested, "rev-parse", "--path-format=absolute", "--git-path", "dolos")
			if filepath.Clean(s.GitPath) != filepath.Clean(expected) {
				t.Fatalf("state %s, want %s", s.GitPath, expected)
			}
			if err := os.MkdirAll(s.GitPath, 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(s.IndexPath(), []byte(dir), 0600); err != nil {
				t.Fatal(err)
			}
			stores = append(stores, s)
		})
	}
	if stores[0].GitPath == stores[1].GitPath {
		t.Fatal("worktree shares state")
	}
	for i, dir := range []string{root, wt} {
		got, err := os.ReadFile(stores[i].IndexPath())
		if err != nil || string(got) != dir {
			t.Fatalf("state not isolated: %s %v", got, err)
		}
	}
}
func TestStagedPathsRawNames(t *testing.T) {
	root := repo(t)
	inDir(t, root)
	names := []string{" leading", "trailing ", "unicode-雪", "quote\"name", "tab\tname", "line\nname"}
	if err := os.WriteFile(filepath.Join(root, "fixture"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	oid := command(t, root, "hash-object", "-w", "fixture")
	for _, name := range names {
		command(t, root, "-c", "core.protectNTFS=false", "update-index", "--add", "--cacheinfo", "100644", oid, name)
	}
	got, err := StagedPaths()
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Split(strings.TrimSuffix(command(t, root, "diff", "--cached", "--name-only", "-z"), "\x00"), "\x00")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
	if len(got) != len(names) {
		t.Fatalf("lost paths: %q", got)
	}
	for _, name := range names {
		found := false
		for _, p := range got {
			found = found || p == name
		}
		if !found {
			t.Fatalf("lost raw name %q in %q", name, got)
		}
	}
}
func TestWithLockExclusiveAndNeverStealsOldLock(t *testing.T) {
	s := Store{GitPath: t.TempDir()}
	sentinel := errors.New("callback failure")
	err := s.WithLock(func() error {
		called := false
		err := s.WithLock(func() error { called = true; return nil })
		if err == nil || called || !strings.Contains(err.Error(), "remove this lock manually") {
			t.Fatalf("nonexclusive lock: %v", err)
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.LockPath()); !os.IsNotExist(err) {
		t.Fatalf("lock not cleaned: %v", err)
	}
	if err := os.WriteFile(s.LockPath(), []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-24 * time.Hour)
	if err := os.Chtimes(s.LockPath(), old, old); err != nil {
		t.Fatal(err)
	}
	if err := s.WithLock(func() error { t.Fatal("stole old lock"); return nil }); err == nil {
		t.Fatal("accepted old lock")
	}
	b, _ := os.ReadFile(s.LockPath())
	if string(b) != "existing" {
		t.Fatal("mutated old lock")
	}
}
func TestWithLockDoesNotRemoveReplacement(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows prevents replacing an open lock file")
	}
	s := Store{GitPath: t.TempDir()}
	err := s.WithLock(func() error {
		// Rename preserves the original inode, so replacement identity is distinct.
		if err := os.Rename(s.LockPath(), s.LockPath()+".old"); err != nil {
			return err
		}
		return os.WriteFile(s.LockPath(), []byte("replacement"), 0600)
	})
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(s.LockPath())
	if err != nil || string(b) != "replacement" {
		t.Fatalf("removed replacement: %s %v", b, err)
	}
}
