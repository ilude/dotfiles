package gitstore

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Store struct{ Root, GitPath string }

func Discover() (Store, error) {
	root, err := git("rev-parse", "--show-toplevel")
	if err != nil {
		return Store{}, errors.New("not a git repository")
	}
	gp, err := git("rev-parse", "--git-path", "dolos")
	if err != nil {
		return Store{}, err
	}
	if !filepath.IsAbs(gp) {
		gp = filepath.Join(root, gp)
	}
	return Store{Root: root, GitPath: gp}, nil
}
func git(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	var out, er bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &er
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %v: %w: %s", args, err, er.String())
	}
	return strings.TrimSpace(out.String()), nil
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
	if b, err := os.ReadFile(lock); err == nil {
		if info, stat := os.Stat(lock); stat == nil && time.Since(info.ModTime()) < time.Hour {
			return fmt.Errorf("dolos lock exists: %s", strings.TrimSpace(string(b)))
		}
		_ = os.Remove(lock)
	}
	if err := os.WriteFile(lock, []byte(fmt.Sprintf("pid=%d\n", os.Getpid())), 0600); err != nil {
		return err
	}
	defer os.Remove(lock)
	return fn()
}
func StagedPaths() ([]string, error) {
	out, err := git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(out, "\n"), nil
}
