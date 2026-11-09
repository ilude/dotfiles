package cli

import (
	"encoding/hex"
	"fmt"
	"os"

	"dolos/internal/gitstore"
	"dolos/internal/state"
)

type archiveStatus struct {
	name           string
	plain          bool
	artifact       bool
	plainDigest    string
	artifactDigest string
}

func readTrustedIndex(path string) (state.Index, error) {
	idx, err := state.ReadIndex(path)
	if err != nil {
		return idx, err
	}
	if idx.Version != 1 || idx.Archive != state.ArchiveName || !validDigest(idx.PlainDigest) || !validDigest(idx.ArtifactDigest) {
		return idx, fmt.Errorf("invalid Dolos index")
	}
	return idx, nil
}

func validDigest(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == 32
}

func existingArtifactDigest(path string) (string, bool, error) {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}
	digest, err := state.FileDigest(path)
	return digest, true, err
}

func inspectArchive(s gitstore.Store) (archiveStatus, error) {
	st := archiveStatus{name: "no-index"}
	if _, err := os.Lstat(s.PlainPath()); err == nil {
		st.plain = true
		m, err := state.TreeManifest(s.PlainPath())
		if err != nil {
			return st, fmt.Errorf("read private/ state: %w", err)
		}
		st.plainDigest = m.Digest
	} else if !os.IsNotExist(err) {
		return st, fmt.Errorf("read private/ state: %w", err)
	}
	var err error
	st.artifactDigest, st.artifact, err = existingArtifactDigest(s.ArtifactPath())
	if err != nil {
		return st, fmt.Errorf("read encrypted artifact: %w", err)
	}
	idx, err := readTrustedIndex(s.IndexPath())
	if os.IsNotExist(err) {
		if st.plain || st.artifact {
			st.name = "untracked"
		}
		return st, nil
	}
	if err != nil {
		return st, fmt.Errorf("read Dolos index: %w", err)
	}
	plainChanged := st.plainDigest != idx.PlainDigest
	artifactChanged := st.artifactDigest != idx.ArtifactDigest
	switch {
	case plainChanged && artifactChanged:
		st.name = "diverged"
	case plainChanged:
		st.name = "plain-changed"
	case artifactChanged:
		st.name = "artifact-changed"
	default:
		st.name = "clean"
	}
	return st, nil
}

func checkUnpackOverwrite(s gitstore.Store, force bool) error {
	if _, err := os.Lstat(s.PlainPath()); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if force {
		return nil
	}
	idx, err := readTrustedIndex(s.IndexPath())
	if err != nil {
		return fmt.Errorf("private/ exists without a trusted index; inspect it, then use unpack --force only to intentionally replace it: %w", err)
	}
	m, err := state.TreeManifest(s.PlainPath())
	if err != nil {
		return fmt.Errorf("cannot establish that private/ is unchanged; inspect it before using unpack --force: %w", err)
	}
	if m.Digest != idx.PlainDigest {
		return fmt.Errorf("private/ has local changes; preserve them or use unpack --force to intentionally discard them")
	}
	return nil
}
