package cli

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"filippo.io/age"

	"dolos/internal/gitstore"
)

func packedFixture(t *testing.T) (gitstore.Store, string) {
	t.Helper()
	dir := inTempRepo(t)
	withCwd(t, dir)
	key, pub := genKey(t, dir, "fixture-key")
	if code, _, err := runCLI("init", "--key", pub); code != ExitOK {
		t.Fatalf("init: %s", err)
	}
	if err := os.Mkdir("private", 0700); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, filepath.Join(dir, "private", "note.txt"), []byte("version one"))
	if code, _, err := runCLI("pack", "private"); code != ExitOK {
		t.Fatalf("pack: %s", err)
	}
	s, err := gitstore.Discover()
	if err != nil {
		t.Fatal(err)
	}
	return s, key
}

func writeFixture(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}

func readFixture(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestStatusSyncDirections(t *testing.T) {
	cases := []struct {
		name    string
		plain   bool
		archive bool
		want    string
	}{
		{"clean", false, false, "clean"},
		{"plaintext", true, false, "plain-changed"},
		{"artifact", false, true, "artifact-changed"},
		{"both", true, true, "diverged"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := packedFixture(t)
			if tc.plain {
				writeFixture(t, filepath.Join(s.PlainPath(), "note.txt"), []byte("local changes"))
			}
			if tc.archive {
				writeFixture(t, s.ArtifactPath(), []byte("different generated artifact"))
			}
			code, out, err := runCLI("status")
			wantCode := ExitState
			if tc.want == "clean" {
				wantCode = ExitOK
			}
			if code != wantCode || !strings.Contains(out, "status="+tc.want+" ") || err != "" {
				t.Fatalf("status: code=%d out=%q err=%q", code, out, err)
			}
		})
	}
}

func TestStatusMissingPlaintextRecommendsRestore(t *testing.T) {
	s, key := packedFixture(t)
	if err := os.RemoveAll(s.PlainPath()); err != nil {
		t.Fatal(err)
	}
	code, out, err := runCLI("status")
	if code != ExitState || !strings.Contains(out, "status=plain-changed plain=false artifact=true") || err != "" {
		t.Fatalf("status: code=%d out=%q err=%q", code, out, err)
	}
	if !strings.Contains(out, "next: private/ is missing; run dolos unpack private --identity KEY to restore private/") || strings.Contains(out, "--force") {
		t.Fatalf("incorrect restore guidance: %q", out)
	}
	if code, _, err := runCLI("unpack", "private", "--identity", key); code != ExitOK {
		t.Fatalf("restore without force: %s", err)
	}
	if string(readFixture(t, filepath.Join(s.PlainPath(), "note.txt"))) != "version one" {
		t.Fatal("restore did not recover the archived plaintext")
	}
}

func TestConditionalPackRechecksState(t *testing.T) {
	s, _ := packedFixture(t)
	writeFixture(t, filepath.Join(s.PlainPath(), "note.txt"), []byte("local edits"))
	if code, _, err := runCLI("pack", "private", "--if-plain-changed"); code != ExitOK {
		t.Fatalf("plaintext-only pack: %s", err)
	}
	current := readFixture(t, s.ArtifactPath())
	if code, _, err := runCLI("pack", "private", "--if-plain-changed"); code != ExitOK {
		t.Fatalf("clean conditional pack: %s", err)
	}
	if !bytes.Equal(current, readFixture(t, s.ArtifactPath())) {
		t.Fatal("clean conditional pack rewrote the archive")
	}
	writeFixture(t, filepath.Join(s.PlainPath(), "note.txt"), []byte("more local edits"))
	if code, out, err := runCLI("status"); code != ExitState || !strings.Contains(out, "status=plain-changed") {
		t.Fatalf("initial status: %d %q %q", code, out, err)
	}
	writeFixture(t, s.ArtifactPath(), []byte("artifact changed after status"))
	before := readFixture(t, s.ArtifactPath())
	index := readFixture(t, s.IndexPath())
	if code, _, err := runCLI("pack", "private", "--if-plain-changed"); code != ExitError || !strings.Contains(err, "automatic packing refused") {
		t.Fatalf("stale conditional pack: code=%d err=%q", code, err)
	}
	if !bytes.Equal(before, readFixture(t, s.ArtifactPath())) || !bytes.Equal(index, readFixture(t, s.IndexPath())) {
		t.Fatal("refused automatic pack modified the artifact or index")
	}
}

func TestPackVerificationFailurePreservesCurrentArchive(t *testing.T) {
	s, key := packedFixture(t)
	oldArtifact := readFixture(t, s.ArtifactPath())
	oldIndex := readFixture(t, s.IndexPath())
	writeFixture(t, filepath.Join(s.PlainPath(), "note.txt"), []byte("new private data"))
	wrongKey, _ := genKey(t, t.TempDir(), "wrong-key")
	if code, _, err := runCLI("pack", "private", "--verify-identity", wrongKey); code != ExitError || !strings.Contains(err, "candidate archive verification failed") {
		t.Fatalf("verification failure: code=%d err=%q", code, err)
	}
	if !bytes.Equal(oldArtifact, readFixture(t, s.ArtifactPath())) || !bytes.Equal(oldIndex, readFixture(t, s.IndexPath())) {
		t.Fatal("failed verification replaced the artifact or index")
	}
	pending, err := filepath.Glob(filepath.Join(filepath.Dir(s.ArtifactPath()), ".private-*.age.tmp"))
	if err != nil || len(pending) != 0 {
		t.Fatalf("candidate files left behind: %v %v", pending, err)
	}
	if code, _, err := runCLI("pack", "private", "--verify-identity", key); code != ExitOK {
		t.Fatalf("verified pack: %s", err)
	}
	m, err := verifyArchiveFile(s, s.ArtifactPath(), []string{key})
	if err != nil {
		t.Fatal(err)
	}
	idx, err := readTrustedIndex(s.IndexPath())
	if err != nil || idx.PlainDigest != m.Digest {
		t.Fatalf("index differs from archived manifest: %+v %v", idx, err)
	}
}

func TestUnpackRequiresExplicitForce(t *testing.T) {
	for _, reason := range []string{"local-changes", "missing-index", "invalid-index"} {
		t.Run(reason, func(t *testing.T) {
			s, key := packedFixture(t)
			note := filepath.Join(s.PlainPath(), "note.txt")
			writeFixture(t, note, []byte("local data to preserve"))
			switch reason {
			case "missing-index":
				if err := os.Remove(s.IndexPath()); err != nil {
					t.Fatal(err)
				}
			case "invalid-index":
				writeFixture(t, s.IndexPath(), []byte("{}"))
			}
			if code, _, err := runCLI("unpack", "private", "--identity", key); code != ExitError || !strings.Contains(err, "--force") {
				t.Fatalf("unprotected unpack: code=%d err=%q", code, err)
			}
			if string(readFixture(t, note)) != "local data to preserve" {
				t.Fatal("refused unpack changed private data")
			}
			if code, _, err := runCLI("unpack", "private", "--identity", key, "--force"); code != ExitOK {
				t.Fatalf("forced unpack: %s", err)
			}
			if string(readFixture(t, note)) != "version one" {
				t.Fatal("forced unpack did not restore archive contents")
			}
		})
	}
}

func TestUnpackAcceptsArtifactOnlyChange(t *testing.T) {
	s, key := packedFixture(t)
	oldIndex := readFixture(t, s.IndexPath())
	note := filepath.Join(s.PlainPath(), "note.txt")
	writeFixture(t, note, []byte("remote version two"))
	if code, _, err := runCLI("pack", "private"); code != ExitOK {
		t.Fatalf("prepare new artifact: %s", err)
	}
	writeFixture(t, s.IndexPath(), oldIndex)
	writeFixture(t, note, []byte("version one"))
	if code, _, err := runCLI("unpack", "private", "--identity", key); code != ExitOK {
		t.Fatalf("artifact-only restore: %s", err)
	}
	if string(readFixture(t, note)) != "remote version two" {
		t.Fatal("artifact-only restore did not apply the newer data")
	}
}

func TestUnpackPreservesExistingBackup(t *testing.T) {
	s, key := packedFixture(t)
	backup := s.PlainPath() + ".bak"
	if err := os.Mkdir(backup, 0700); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, filepath.Join(backup, "sentinel"), []byte("previous backup"))
	if code, _, err := runCLI("unpack", "private", "--identity", key, "--force"); code != ExitError || !strings.Contains(err, "private.bak already exists") {
		t.Fatalf("existing backup: code=%d err=%q", code, err)
	}
	if string(readFixture(t, filepath.Join(backup, "sentinel"))) != "previous backup" {
		t.Fatal("existing backup was changed")
	}
}

func TestScanQuotedPrivateAndBackupPaths(t *testing.T) {
	dir := inTempRepo(t)
	withCwd(t, dir)
	for _, name := range []string{"private/café.txt", "private.bak/note.txt"} {
		path := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		writeFixture(t, path, []byte("generated fixture"))
		if b, err := exec.Command("git", "add", "-f", "--", name).CombinedOutput(); err != nil {
			t.Fatalf("stage fixture: %v %s", err, b)
		}
	}
	if code, _, err := runCLI("scan", "--staged"); code != ExitUnsafe || !strings.Contains(err, "café.txt") || !strings.Contains(err, "private.bak/") {
		t.Fatalf("unsafe paths missed: code=%d err=%q", code, err)
	}
}

type failedArchiveWriter struct{}

func (failedArchiveWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestEncryptionWriteFailureReturnsError(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := writeEncryptedArchive(failedArchiveWriter{}, t.TempDir(), []age.Recipient{identity.Recipient()}); err == nil {
		t.Fatal("expected encryption write failure")
	}
}
