package archive

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dolos/internal/state"
)

func TestManifest(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "f"), []byte("x"), 0600)
	var b bytes.Buffer
	m, err := WriteTarGz(&b, dir)
	if err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "out")
	got, err := ExtractTarGz(bytes.NewReader(b.Bytes()), out)
	if err != nil {
		t.Fatal(err)
	}
	if got.Digest != m.Digest {
		t.Fatal("digest mismatch")
	}
}
func TestArchiveValidation(t *testing.T) {
	manifest := state.Manifest{Digest: "fixture-digest"}
	cases := []struct {
		name    string
		headers []tarFixture
	}{
		{name: "absolute path", headers: []tarFixture{fileFixture("/abs", "x")}},
		{name: "parent traversal", headers: []tarFixture{fileFixture("../x", "x")}},
		{name: "nested parent traversal", headers: []tarFixture{fileFixture("a/../x", "x")}},
		{name: "backslash path", headers: []tarFixture{fileFixture("a\\b", "x")}},
		{name: "duplicate path", headers: []tarFixture{fileFixture("dup", "x"), fileFixture("dup", "y")}},
		{name: "symlink", headers: []tarFixture{{header: tar.Header{Name: "link", Typeflag: tar.TypeSymlink, Linkname: "target"}}}},
		{name: "hardlink", headers: []tarFixture{{header: tar.Header{Name: "hard", Typeflag: tar.TypeLink, Linkname: "target"}}}},
		{name: "fifo", headers: []tarFixture{{header: tar.Header{Name: "fifo", Typeflag: tar.TypeFifo}}}},
		{name: "character device", headers: []tarFixture{{header: tar.Header{Name: "char", Typeflag: tar.TypeChar}}}},
		{name: "block device", headers: []tarFixture{{header: tar.Header{Name: "block", Typeflag: tar.TypeBlock}}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dest, sentinel := destinationWithSentinel(t)
			b := makeFixtureTar(t, manifest, tc.headers...)
			if _, err := ExtractTarGz(bytes.NewReader(b), dest); err == nil {
				t.Fatal("expected rejection")
			}
			assertSentinelUnchanged(t, sentinel)
		})
	}
}

func TestWriteTarGzPreservesEmptyDirectories(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "handoffs", ".gitkeep"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "handoffs", "note.txt"), []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	var b bytes.Buffer
	if _, err := WriteTarGz(&b, dir); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "out")
	if _, err := ExtractTarGz(bytes.NewReader(b.Bytes()), out); err != nil {
		t.Fatal(err)
	}
	if st, err := os.Stat(filepath.Join(out, "handoffs", ".gitkeep")); err != nil || !st.IsDir() {
		t.Fatalf("empty directory not preserved: %v", err)
	}
}

func TestResourceLimits(t *testing.T) {
	cases := []struct {
		name    string
		headers []tarFixture
	}{
		{name: "oversized manifest", headers: []tarFixture{{header: tar.Header{Name: manifestName, Typeflag: tar.TypeReg, Size: 1<<20 + 1}, body: strings.Repeat("x", 1<<20+1)}}},
		{name: "oversized file", headers: []tarFixture{{header: tar.Header{Name: "huge", Typeflag: tar.TypeReg, Size: MaxFileSize + 1}}}},
		{name: "too many files", headers: manyZeroByteFiles(MaxFiles + 1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dest, sentinel := destinationWithSentinel(t)
			b := makeFixtureTar(t, state.Manifest{Digest: "fixture-digest"}, tc.headers...)
			if _, err := ExtractTarGz(bytes.NewReader(b), dest); err == nil {
				t.Fatal("expected limit error")
			}
			assertSentinelUnchanged(t, sentinel)
		})
	}
}

func TestUnpackRejects(t *testing.T) { TestArchiveValidation(t) }

type tarFixture struct {
	header tar.Header
	body   string
}

func fileFixture(name, body string) tarFixture {
	return tarFixture{header: tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0600, Size: int64(len(body))}, body: body}
}

func manyZeroByteFiles(count int) []tarFixture {
	out := make([]tarFixture, count)
	for i := range out {
		out[i] = fileFixture(fmt.Sprintf("file-%05d", i), "")
	}
	return out
}

func makeFixtureTar(t *testing.T, manifest state.Manifest, entries ...tarFixture) []byte {
	t.Helper()
	var b bytes.Buffer
	gw := gzip.NewWriter(&b)
	tw := tar.NewWriter(gw)
	hasManifest := false
	for _, e := range entries {
		if e.header.Name == manifestName {
			hasManifest = true
			break
		}
	}
	if !hasManifest {
		mb, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		if err := tw.WriteHeader(&tar.Header{Name: manifestName, Typeflag: tar.TypeReg, Mode: 0600, Size: int64(len(mb))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(mb); err != nil {
			t.Fatal(err)
		}
	}
	for _, e := range entries {
		h := e.header
		if h.Size == 0 && e.body != "" {
			h.Size = int64(len(e.body))
		}
		if err := tw.WriteHeader(&h); err != nil {
			t.Fatal(err)
		}
		if e.body != "" {
			if _, err := tw.Write([]byte(e.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil && !allowsShortBody(entries) {
		t.Fatal(err)
	}
	if err := gw.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func allowsShortBody(entries []tarFixture) bool {
	for _, e := range entries {
		if e.header.Typeflag == tar.TypeReg && e.header.Size > int64(len(e.body)) {
			return true
		}
	}
	return false
}

func destinationWithSentinel(t *testing.T) (string, string) {
	t.Helper()
	dest := t.TempDir()
	sentinel := filepath.Join(dest, "sentinel.txt")
	if err := os.WriteFile(sentinel, []byte("unchanged"), 0600); err != nil {
		t.Fatal(err)
	}
	return dest, sentinel
}

func assertSentinelUnchanged(t *testing.T, path string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "unchanged" {
		t.Fatalf("sentinel changed: %q", got)
	}
}
