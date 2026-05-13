package archive

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"dolos/internal/state"
)

const manifestName = ".dolos-manifest.json"
const MaxFiles = 10000
const MaxFileSize int64 = 100 << 20
const MaxTotalSize int64 = 512 << 20

func WriteTarGz(w io.Writer, root string) (state.Manifest, error) {
	gw := gzip.NewWriter(w)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()
	m, err := state.TreeManifest(root)
	if err != nil {
		return m, err
	}
	mb, _ := json.Marshal(m)
	if err := tw.WriteHeader(&tar.Header{Name: manifestName, Mode: 0600, Size: int64(len(mb))}); err != nil {
		return m, err
	}
	if _, err := tw.Write(mb); err != nil {
		return m, err
	}
	if err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == root || !d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		return tw.WriteHeader(&tar.Header{Name: filepath.ToSlash(rel), Mode: 0700, Typeflag: tar.TypeDir})
	}); err != nil {
		return m, err
	}
	for _, e := range m.Entries {
		p := filepath.Join(root, filepath.FromSlash(e.Path))
		if err := tw.WriteHeader(&tar.Header{Name: e.Path, Mode: 0600, Size: e.Size, Typeflag: tar.TypeReg}); err != nil {
			return m, err
		}
		f, err := os.Open(p)
		if err != nil {
			return m, err
		}
		_, err = io.Copy(tw, f)
		f.Close()
		if err != nil {
			return m, err
		}
	}
	return m, nil
}

func ExtractTarGz(r io.Reader, dest string) (state.Manifest, error) {
	gr, err := gzip.NewReader(r)
	if err != nil {
		return state.Manifest{}, err
	}
	defer gr.Close()
	tr := tar.NewReader(gr)
	seen := map[string]bool{}
	var m state.Manifest
	var files int
	var total int64
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return m, err
		}
		if h.Name == manifestName {
			if h.Size > 1<<20 {
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
		files++
		if files > MaxFiles {
			return m, fmt.Errorf("too many files")
		}
		if h.Size < 0 || h.Size > MaxFileSize {
			return m, fmt.Errorf("file too large")
		}
		total += h.Size
		if total > MaxTotalSize {
			return m, fmt.Errorf("archive too large")
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
	if m.Digest == "" {
		return m, fmt.Errorf("missing manifest")
	}
	actual, err := state.TreeManifest(dest)
	if err != nil {
		return m, err
	}
	if actual.Digest != m.Digest {
		return m, fmt.Errorf("manifest digest mismatch")
	}
	return m, nil
}
