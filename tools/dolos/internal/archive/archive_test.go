package archive

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dolos/internal/state"
)

func TestManifest(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "draft..md"), []byte("x"), 0600)
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

func TestPackRejectsReservedAndInvalidRoots(t *testing.T) {
	for _, directory := range []bool{false, true} {
		root := t.TempDir()
		p := filepath.Join(root, manifestName)
		var err error
		if directory {
			err = os.Mkdir(p, 0700)
		} else {
			err = os.WriteFile(p, nil, 0600)
		}
		if err != nil {
			t.Fatal(err)
		}
		if _, err := WriteTarGz(io.Discard, root); err == nil {
			t.Fatal("reserved manifest accepted")
		}
	}
	file := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(file, nil, 0600); err != nil {
		t.Fatal(err)
	}
	for _, root := range []string{file, file + "-missing"} {
		if _, err := WriteTarGz(io.Discard, root); err == nil {
			t.Fatal("invalid root accepted")
		}
	}
}

func TestPackRejectsLinks(t *testing.T) {
	for _, directory := range []bool{false, true} {
		t.Run(fmt.Sprint(directory), func(t *testing.T) {
			root := t.TempDir()
			target := filepath.Join(t.TempDir(), "target")
			var err error
			if directory {
				err = os.Mkdir(target, 0700)
			} else {
				err = os.WriteFile(target, []byte("fixture"), 0600)
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, filepath.Join(root, "link")); err != nil {
				t.Skipf("symlink unsupported: %v", err)
			}
			if _, err := WriteTarGz(io.Discard, root); err == nil {
				t.Fatal("link accepted")
			}
			if directory {
				if _, err := WriteTarGz(io.Discard, filepath.Join(root, "link")); err == nil {
					t.Fatal("linked root accepted")
				}
			}
		})
	}
}

func TestPackOversizedFile(t *testing.T) {
	root := t.TempDir()
	f, err := os.Create(filepath.Join(root, "large"))
	if err != nil {
		t.Fatal(err)
	}
	err = f.Truncate(MaxFileSize + 1)
	cerr := f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if cerr != nil {
		t.Fatal(cerr)
	}
	if _, err := WriteTarGz(io.Discard, root); err == nil || !strings.Contains(err.Error(), "file too large") {
		t.Fatalf("got %v", err)
	}
}

func TestLimitBoundaries(t *testing.T) {
	// Exercise the shared pack/extract budget without allocating hundreds of MiB.
	for _, size := range []int64{0, MaxFileSize} {
		var l limits
		if err := l.add(size); err != nil {
			t.Fatal(err)
		}
	}
	for _, l := range []limits{{files: MaxFiles}, {total: MaxTotalSize}} {
		if err := l.add(1); err == nil {
			t.Fatal("exceeded budget accepted")
		}
	}
	l := limits{files: MaxFiles - 1, total: MaxTotalSize - 1}
	if err := l.add(1); err != nil {
		t.Fatal(err)
	}
	if err := l.add(0); err == nil {
		t.Fatal("file count exceeded")
	}
	m := state.Manifest{}
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	m.Digest = strings.Repeat("x", MaxManifestSize-len(b))
	if b, err := encodeManifest(m); err != nil || len(b) != MaxManifestSize {
		t.Fatalf("boundary: %d, %v", len(b), err)
	}
	m.Digest += "x"
	if _, err := encodeManifest(m); err == nil {
		t.Fatal("oversized manifest accepted")
	}
}

type actionWriter struct {
	bytes.Buffer
	action func()
}

func (w *actionWriter) Write(p []byte) (int, error) {
	if w.action != nil {
		action := w.action
		w.action = nil
		action()
	}
	return w.Buffer.Write(p)
}

func TestPackDetectsConcurrentChanges(t *testing.T) {
	for _, change := range []string{"same-size", "shrink", "grow", "add", "delete", "add-directory"} {
		t.Run(change, func(t *testing.T) {
			root := t.TempDir()
			p := filepath.Join(root, "file")
			if err := os.WriteFile(p, []byte("before"), 0600); err != nil {
				t.Fatal(err)
			}
			w := &actionWriter{action: func() {
				var err error
				switch change {
				case "same-size":
					err = os.WriteFile(p, []byte("after!"), 0600)
				case "shrink":
					err = os.WriteFile(p, nil, 0600)
				case "grow":
					err = os.WriteFile(p, []byte("much longer content"), 0600)
				case "add":
					err = os.WriteFile(filepath.Join(root, "added"), nil, 0600)
				case "delete":
					err = os.Remove(p)
				case "add-directory":
					err = os.Mkdir(filepath.Join(root, "added"), 0700)
				}
				if err != nil {
					t.Fatal(err)
				}
			}}
			if _, err := WriteTarGz(w, root); err == nil {
				t.Fatal("concurrent change accepted")
			}
		})
	}
}

type failingWriter struct {
	calls  int
	err    error
	failAt int
}

func (w *failingWriter) Write(p []byte) (int, error) {
	w.calls++
	if w.calls >= w.failAt {
		return 0, w.err
	}
	return len(p), nil
}
func TestPackReportsWriterAndCloseErrors(t *testing.T) {
	for _, failAt := range []int{1, 2} {
		failure := errors.New("fixture writer failure")
		w := &failingWriter{err: failure, failAt: failAt}
		if _, err := WriteTarGz(w, t.TempDir()); !errors.Is(err, failure) {
			t.Fatalf("write %d: %v", failAt, err)
		}
	}
}

func TestExtractRejectsManifestTypeAndDuplicate(t *testing.T) {
	for _, entries := range [][]tarFixture{
		{{header: tar.Header{Name: manifestName, Typeflag: tar.TypeDir}}},
		{fileFixture(manifestName, `{}`), fileFixture(manifestName, `{}`)},
	} {
		b := makeFixtureTar(t, state.Manifest{}, entries...)
		if _, err := ExtractTarGz(bytes.NewReader(b), t.TempDir()); err == nil {
			t.Fatal("invalid manifest accepted")
		}
	}
}

// gzip emits its compressed body on Close for this small fixture, after the
// final source check. A change then must not replace the archived manifest.
type finalizingWriter struct {
	bytes.Buffer
	writes     int
	onFinalize func()
}

func (w *finalizingWriter) Write(p []byte) (int, error) {
	w.writes++
	if w.writes == 2 {
		w.onFinalize()
	}
	return w.Buffer.Write(p)
}
func TestReturnedManifestDescribesArchivedBytes(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "file")
	if err := os.WriteFile(p, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	expected, err := state.TreeManifest(root)
	if err != nil {
		t.Fatal(err)
	}
	w := &finalizingWriter{onFinalize: func() {
		if err := os.WriteFile(p, []byte("after!"), 0600); err != nil {
			t.Fatal(err)
		}
	}}
	m, err := WriteTarGz(w, root)
	if err != nil {
		t.Fatal(err)
	}
	if w.writes < 2 {
		t.Fatal("finalization callback was not exercised")
	}
	if m.Digest != expected.Digest {
		t.Fatal("returned manifest reflects later source content")
	}
	out := t.TempDir()
	if _, err := ExtractTarGz(bytes.NewReader(w.Bytes()), out); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(out, "file"))
	if err != nil || string(b) != "before" {
		t.Fatalf("archive bytes: %q, %v", b, err)
	}
	later, err := state.TreeManifest(root)
	if err != nil {
		t.Fatal(err)
	}
	if m.Digest == later.Digest {
		t.Fatal("fixture did not change source")
	}
}

func TestExtractChecksGzipTrailer(t *testing.T) {
	var b bytes.Buffer
	if _, err := WriteTarGz(&b, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	data := b.Bytes()
	data[len(data)-8] ^= 1
	if _, err := ExtractTarGz(bytes.NewReader(data), t.TempDir()); err == nil {
		t.Fatal("corrupt gzip checksum accepted")
	}
}
