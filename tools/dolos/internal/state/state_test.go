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

func TestTreeManifestRejectsLinksAndInvalidRoot(t *testing.T) {
	target := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(target, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := TreeManifest(target); err == nil {
		t.Fatal("file root accepted")
	}
	root := t.TempDir()
	if err := os.Symlink(target, filepath.Join(root, "link")); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	if _, err := TreeManifest(root); err == nil {
		t.Fatal("link silently omitted")
	}
	if _, err := OpenRegularFile(filepath.Join(root, "link")); err == nil {
		t.Fatal("link opened")
	}
}

func TestSafeArchivePathCrossPlatform(t *testing.T) {
	for _, name := range []string{"draft..md", "a..b/notes.txt", "résumé.txt", ".gitkeep"} {
		if !SafeArchivePath(name) {
			t.Errorf("valid path rejected: %q", name)
		}
	}
	for _, name := range []string{".", "..", "a/..", "C:/file", "a:stream", "NUL", "aux.txt", "COM1.txt", "LPT9", "a.", "a ", "a?", "a\x01"} {
		if SafeArchivePath(name) {
			t.Errorf("unsafe path accepted: %q", name)
		}
	}
}
