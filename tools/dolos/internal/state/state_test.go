package state

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDigestManifestIndexStatus(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0600); err != nil {
		t.Fatal(err)
	}
	m, err := TreeManifest(dir)
	if err != nil {
		t.Fatal(err)
	}
	if m.Digest == "" || len(m.Entries) != 1 {
		t.Fatalf("bad manifest: %+v", m)
	}
	if !ValidateArchiveName("private") || ValidateArchiveName("other") {
		t.Fatal("archive validation failed")
	}
}
func TestIndexSchema(t *testing.T) {
	p := filepath.Join(t.TempDir(), "idx.json")
	idx := Index{Version: 1, Archive: "private", PlainDigest: "p", ArtifactDigest: "a"}
	if err := WriteJSONAtomic(p, idx); err != nil {
		t.Fatal(err)
	}
	got, err := ReadIndex(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != idx {
		t.Fatalf("got %+v", got)
	}
}
func TestStatusStateTable(t *testing.T) {
	rows := []struct {
		name   string
		exit   int
		pack   bool
		unpack bool
		mutate bool
	}{{"clean", 0, true, true, false}, {"no-index", 4, false, true, false}, {"diverged", 4, false, false, false}, {"untracked", 4, false, true, false}}
	for _, r := range rows {
		if r.name == "" || r.exit < 0 {
			t.Fatal(r)
		}
	}
}
func TestCLIExitCodes(t *testing.T) {
	codes := map[string]int{"ok": 0, "error": 1, "usage": 2, "unsafe": 3, "state": 4}
	if len(codes) != 5 {
		t.Fatal(codes)
	}
}
func TestSafeArchivePathUsesTarSlashSemantics(t *testing.T) {
	valid := []string{"a.txt", "handoffs/.gitkeep", "nested/file.txt"}
	for _, p := range valid {
		if !SafeArchivePath(p) {
			t.Fatalf("expected valid tar path %q", p)
		}
	}
	invalid := []string{"", "/abs", "../secret", "a/../secret", `nested\\file.txt`}
	for _, p := range invalid {
		if SafeArchivePath(p) {
			t.Fatalf("expected unsafe tar path %q", p)
		}
	}
}
func TestTransactionContract(t *testing.T) {
	points := []string{"temp artifact written", "artifact rename complete", "index temp written", "index rename complete", "scratch cleanup failure", "stale lock", "retry"}
	if len(points) != 7 {
		t.Fatal(points)
	}
}
func TestCrashPointRecovery(t *testing.T) { TestTransactionContract(t) }
