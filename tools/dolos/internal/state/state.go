package state

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
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
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()
		h := sha256.New()
		if _, err := io.Copy(h, f); err != nil {
			return err
		}
		m.Entries = append(m.Entries, ManifestEntry{Path: rel, Size: info.Size(), SHA256: hex.EncodeToString(h.Sum(nil))})
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
	return p != "" && !strings.HasPrefix(p, "/") && !strings.Contains(p, "\\") && !strings.Contains(p, "..") && path.Clean(p) == p
}
