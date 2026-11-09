package state

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

const ArchiveName = "private"

type ManifestEntry struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type Manifest struct {
	Version int             `json:"version"`
	Archive string          `json:"archive"`
	Entries []ManifestEntry `json:"entries"`
	Digest  string          `json:"digest"`
}
type Index struct {
	Version        int    `json:"version"`
	Archive        string `json:"archive"`
	PlainDigest    string `json:"plain_digest"`
	ArtifactDigest string `json:"artifact_digest"`
}

func ValidateArchiveName(name string) bool { return name == ArchiveName }

func TreeManifest(root string) (Manifest, error) {
	m := Manifest{Version: 1, Archive: ArchiveName}
	rootInfo, err := os.Lstat(root)
	if err != nil {
		return m, err
	}
	if !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return m, fmt.Errorf("root must be a regular directory: %s", root)
	}
	err = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == root {
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if !SafeArchivePath(rel) {
			return fmt.Errorf("unsafe path %q", rel)
		}
		if d.IsDir() {
			return nil
		}
		f, err := OpenRegularFile(p)
		if err != nil {
			return err
		}
		h := sha256.New()
		n, err := io.Copy(h, f)
		cerr := f.Close()
		if err != nil {
			return err
		}
		if cerr != nil {
			return cerr
		}
		m.Entries = append(m.Entries, ManifestEntry{Path: rel, Size: n, SHA256: hex.EncodeToString(h.Sum(nil))})
		return nil
	})
	if err != nil {
		return m, err
	}
	sort.Slice(m.Entries, func(i, j int) bool { return m.Entries[i].Path < m.Entries[j].Path })
	h := sha256.New()
	for _, e := range m.Entries {
		io.WriteString(h, e.Path)
		io.WriteString(h, "\x00")
		io.WriteString(h, e.SHA256)
		io.WriteString(h, "\x00")
	}
	m.Digest = hex.EncodeToString(h.Sum(nil))
	return m, nil
}

func FileDigest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	_, err = io.Copy(h, f)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func WriteJSONAtomic(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
func ReadIndex(path string) (Index, error) {
	var idx Index
	b, err := os.ReadFile(path)
	if err != nil {
		return idx, err
	}
	err = json.Unmarshal(b, &idx)
	return idx, err
}
func SafeArchivePath(p string) bool {
	if p == "" || p == "." || strings.HasPrefix(p, "/") || strings.ContainsAny(p, "\\\\:<>\"|?*\x00") || path.Clean(p) != p {
		return false
	}
	for _, part := range strings.Split(p, "/") {
		if part == ".." || strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") {
			return false
		}
		for _, c := range part {
			if c < 32 {
				return false
			}
		}
		base := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" {
			return false
		}
		if strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT") {
			suffix := base[3:]
			if len(suffix) == 1 && suffix[0] >= '1' && suffix[0] <= '9' || suffix == "¹" || suffix == "²" || suffix == "³" {
				return false
			}
		}
	}
	return true
}

// OpenRegularFile rejects links and special entries and checks that opening the
// path did not resolve to a different file from the one inspected with Lstat.
func OpenRegularFile(p string) (*os.File, error) {
	info, err := os.Lstat(p)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("unsupported non-regular entry %q", p)
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	opened, err := f.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		cerr := f.Close()
		if err != nil {
			return nil, err
		}
		if cerr != nil {
			return nil, cerr
		}
		return nil, fmt.Errorf("file changed while opening %q", p)
	}
	return f, nil
}
