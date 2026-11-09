package gitstore

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Store struct{ Root, GitPath string }

func Discover() (Store, error) {
	root, err := git("rev-parse", "--show-toplevel")
	if err != nil {
		return Store{}, fmt.Errorf("cannot discover Git repository: %w", err)
	}
	gp, err := git("rev-parse", "--git-path", "dolos")
	if err != nil {
		return Store{}, fmt.Errorf("cannot locate Dolos Git state: %w", err)
	}
	if !filepath.IsAbs(gp) {
		gp, err = filepath.Abs(gp)
		if err != nil {
			return Store{}, fmt.Errorf("cannot resolve Dolos Git state: %w", err)
		}
	}
	return Store{Root: root, GitPath: gp}, nil
}
func git(args ...string) (string, error) {
	out, err := gitRaw(args...)
	return strings.TrimSuffix(out, "\n"), err
}
func gitRaw(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	var out, er bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &er
	if err := cmd.Run(); err != nil {
		if stderr := strings.TrimSpace(er.String()); stderr != "" {
			return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, stderr)
		}
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return out.String(), nil
}
func (s Store) ArtifactPath() string {
	return filepath.Join(s.Root, ".dolos", "artifacts", "private.tar.gz.age")
}
func (s Store) AuthorizedKeysPath() string { return filepath.Join(s.Root, ".dolos", "authorized_keys") }
func (s Store) PlainPath() string          { return filepath.Join(s.Root, "private") }
func (s Store) IndexPath() string          { return filepath.Join(s.GitPath, "private.index.json") }
func (s Store) ScratchPath() string        { return filepath.Join(s.GitPath, "scratch") }
func (s Store) LockPath() string           { return filepath.Join(s.GitPath, "lock") }
func (s Store) WithLock(fn func() error) error {
	if err := os.MkdirAll(s.GitPath, 0700); err != nil {
		return err
	}
	lock := s.LockPath()
	f, err := os.OpenFile(lock, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("dolos lock exists at %s; another Dolos operation may be running. If it is stale, confirm no Dolos operation is running, then remove this lock manually", lock)
		}
		return err
	}
	owned, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return err
	}
	defer func() {
		_ = f.Close()
		if current, err := os.Lstat(lock); err == nil && os.SameFile(owned, current) {
			_ = os.Remove(lock)
		}
	}()
	if _, err := fmt.Fprintf(f, "pid=%d\n", os.Getpid()); err != nil {
		return err
	}
	return fn()
}
func StagedPaths() ([]string, error) {
	out, err := gitRaw("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(strings.TrimSuffix(out, "\x00"), "\x00"), nil
}
