package archive

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"

	"dolos/internal/state"
)

const manifestName = ".dolos-manifest.json"
const MaxFiles = 10000
const MaxFileSize int64 = 100 << 20
const MaxTotalSize int64 = 512 << 20

const MaxManifestSize = 1 << 20

type limits struct {
	files int
	total int64
}

func (l *limits) add(size int64) error {
	l.files++
	if l.files > MaxFiles {
		return fmt.Errorf("too many files")
	}
	if size < 0 || size > MaxFileSize {
		return fmt.Errorf("file too large")
	}
	l.total += size
	if l.total > MaxTotalSize {
		return fmt.Errorf("archive too large")
	}
	return nil
}

// inspectTree checks limits before hashing or writing file contents.
func inspectTree(root string) ([]string, error) {
	var dirs []string
	var budget limits
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if p == root {
			if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				return fmt.Errorf("root must be a regular directory")
			}
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if !state.SafeArchivePath(rel) || rel == manifestName {
			return fmt.Errorf("unsafe or reserved path %q", rel)
		}
		if info.IsDir() {
			dirs = append(dirs, rel)
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported non-regular entry %q", rel)
		}
		return budget.add(info.Size())
	})
	return dirs, err
}

func WriteTarGz(w io.Writer, root string) (m state.Manifest, err error) {
	dirs, err := inspectTree(root)
	if err != nil {
		return m, err
	}
	m, err = state.TreeManifest(root)
	if err != nil {
		return m, err
	}
	var budget limits
	for _, e := range m.Entries {
		if err := budget.add(e.Size); err != nil {
			return m, err
		}
	}
	mb, err := encodeManifest(m)
	if err != nil {
		return m, err
	}
	gw := gzip.NewWriter(w)
	tw := tar.NewWriter(gw)
	defer func() { err = errors.Join(err, tw.Close(), gw.Close()) }()
	if err := tw.WriteHeader(&tar.Header{Name: manifestName, Mode: 0600, Size: int64(len(mb))}); err != nil {
		return m, err
	}
	if _, err := tw.Write(mb); err != nil {
		return m, err
	}
	for _, dir := range dirs {
		if err := tw.WriteHeader(&tar.Header{Name: dir, Mode: 0700, Typeflag: tar.TypeDir}); err != nil {
			return m, err
		}
	}
	for _, e := range m.Entries {
		p := filepath.Join(root, filepath.FromSlash(e.Path))
		if err := tw.WriteHeader(&tar.Header{Name: e.Path, Mode: 0600, Size: e.Size, Typeflag: tar.TypeReg}); err != nil {
			return m, err
		}
		f, err := state.OpenRegularFile(p)
		if err != nil {
			return m, err
		}
		h := sha256.New()
		n, copyErr := io.Copy(io.MultiWriter(tw, h), f)
		closeErr := f.Close()
		if err := errors.Join(copyErr, closeErr); err != nil {
			return m, err
		}
		if n != e.Size || hex.EncodeToString(h.Sum(nil)) != e.SHA256 {
			return m, fmt.Errorf("file changed while packing %q", e.Path)
		}
	}
	finalDirs, err := inspectTree(root)
	if err != nil {
		return m, err
	}
	actual, err := state.TreeManifest(root)
	if err != nil {
		return m, err
	}
	if !slices.Equal(dirs, finalDirs) || !slices.Equal(m.Entries, actual.Entries) {
		return m, fmt.Errorf("tree changed while packing")
	}
	return m, nil
}

func encodeManifest(m state.Manifest) ([]byte, error) {
	b, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	if len(b) > MaxManifestSize {
		return nil, fmt.Errorf("manifest too large")
	}
	return b, nil
}

func ExtractTarGz(r io.Reader, dest string) (m state.Manifest, err error) {
	gr, err := gzip.NewReader(r)
	if err != nil {
		return state.Manifest{}, err
	}
	defer func() { err = errors.Join(err, gr.Close()) }()
	if err := os.MkdirAll(dest, 0700); err != nil {
		return m, err
	}
	tr := tar.NewReader(gr)
	seen := map[string]bool{}
	var budget limits
	manifestSeen := false
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return m, err
		}
		if h.Name == manifestName {
			if manifestSeen || h.Typeflag != tar.TypeReg {
				return m, fmt.Errorf("duplicate or invalid manifest")
			}
			manifestSeen = true
			if h.Size < 0 || h.Size > MaxManifestSize {
				return m, fmt.Errorf("manifest too large")
			}
			var b []byte
			b, err = io.ReadAll(io.LimitReader(tr, h.Size))
			if err == nil {
				err = json.Unmarshal(b, &m)
			}
			if err != nil {
				return m, err
			}
			continue
		}
		if !state.SafeArchivePath(h.Name) {
			return m, fmt.Errorf("unsafe path %q", h.Name)
		}
		if seen[h.Name] {
			return m, fmt.Errorf("duplicate path %q", h.Name)
		}
		seen[h.Name] = true
		if h.Typeflag == tar.TypeDir {
			if err := os.MkdirAll(filepath.Join(dest, filepath.FromSlash(h.Name)), 0700); err != nil {
				return m, err
			}
			continue
		}
		if h.Typeflag != tar.TypeReg {
			return m, fmt.Errorf("unsupported tar entry %q", h.Name)
		}
		if err := budget.add(h.Size); err != nil {
			return m, err
		}
		out := filepath.Join(dest, filepath.FromSlash(h.Name))
		if err := os.MkdirAll(filepath.Dir(out), 0700); err != nil {
			return m, err
		}
		f, err := os.OpenFile(out, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return m, err
		}
		_, err = io.CopyN(f, tr, h.Size)
		cerr := f.Close()
		if err != nil {
			return m, err
		}
		if cerr != nil {
			return m, cerr
		}
	}
	// Reading through gzip EOF checks its checksum and trailer as well.
	if _, err := io.Copy(io.Discard, gr); err != nil {
		return m, err
	}
	if m.Digest == "" {
		return m, fmt.Errorf("missing manifest")
	}
	actual, err := state.TreeManifest(dest)
	if err != nil {
		return m, err
	}
	if actual.Digest != m.Digest || !slices.Equal(actual.Entries, m.Entries) {
		return m, fmt.Errorf("manifest digest mismatch")
	}
	return m, nil
}
