//go:build windows

package archive

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"dolos/internal/state"
)

func TestPackRejectsJunction(t *testing.T) {
	root, target := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(target, "fixture"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "junction")
	quote := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	// Junctions need no symlink privilege on Windows. Both paths are disposable
	// generated fixtures; no workstation links or private content are touched.
	cmd := exec.Command("pwsh", "-NoProfile", "-NonInteractive", "-Command",
		"$ErrorActionPreference = 'Stop'; New-Item -ItemType Junction -Path "+quote(link)+" -Target "+quote(target)+" | Out-Null")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("junction creation unsupported: %v: %s", err, out)
	}
	for _, path := range []string{root, link} {
		if _, err := WriteTarGz(io.Discard, path); err == nil {
			t.Fatalf("junction accepted at %s", path)
		}
		if _, err := state.TreeManifest(path); err == nil {
			t.Fatalf("TreeManifest accepted junction at %s", path)
		}
	}
}
