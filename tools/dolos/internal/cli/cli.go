package cli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"dolos/internal/archive"
	"dolos/internal/crypto"
	"dolos/internal/gitstore"
	"dolos/internal/state"
)

const (
	ExitOK     = 0
	ExitUsage  = 2
	ExitUnsafe = 3
	ExitState  = 4
	ExitError  = 1
)

func Run(args []string, out, er io.Writer) int {
	if len(args) == 0 || args[0] == "--help" || args[0] == "help" {
		usage(out)
		return ExitOK
	}
	s, err := gitstore.Discover()
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitUsage
	}
	switch args[0] {
	case "init":
		return initCmd(s, args[1:], out, er)
	case "status":
		return statusCmd(s, out, er)
	case "scan":
		return scanCmd(args[1:], out, er)
	case "verify":
		return verifyCmd(s, args[1:], out, er)
	case "doctor":
		return doctorCmd(s, args[1:], out, er)
	case "recipients":
		return recipientsCmd(s, args[1:], out, er)
	case "pack":
		return packCmd(s, args[1:], out, er)
	case "unpack":
		return unpackCmd(s, args[1:], out, er)
	default:
		fmt.Fprintln(er, "unknown command")
		usage(er)
		return ExitUsage
	}
}
func usage(w io.Writer) {
	fmt.Fprintln(w, `usage: dolos <command> [options]

Commands:
  init [--key PATH]              create .dolos metadata and import a public key
  status                         show archive state and next step
  pack private [--verify-identity KEY]
                                  encrypt private/ and optionally verify decryptability
  unpack private --identity KEY  decrypt artifact into private/
  verify private --identity KEY  decrypt to scratch and validate without changing private/
  recipients                     show recipient count and fingerprints
  doctor [--identity KEY]        check setup and optionally verify artifact decryptability
  scan --staged                  block unsafe staged private/.dolos paths
  help, --help                   show this help

init key selection:
  --key PATH overrides the default. Without --key, Dolos imports the first existing
  public key from ~/.ssh/id_ed25519.pub, then ~/.ssh/id_rsa.pub.`)
}
func initCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	keyPath := ""
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--key":
			if i+1 >= len(args) {
				fmt.Fprintln(er, "usage: dolos init [--key PATH]")
				return ExitUsage
			}
			keyPath = args[i+1]
			i++
		case "--help":
			fmt.Fprintln(out, "usage: dolos init [--key PATH]")
			return ExitOK
		default:
			fmt.Fprintln(er, "usage: dolos init [--key PATH]")
			return ExitUsage
		}
	}
	if err := os.MkdirAll(filepath.Dir(s.ArtifactPath()), 0755); err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	chosen, body, err := choosePublicKey(keyPath)
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	existing, readErr := os.ReadFile(s.AuthorizedKeysPath())
	if readErr == nil {
		updated, added := appendRecipient(existing, body)
		if !added {
			fmt.Fprintln(out, "initialized dolos private archive metadata")
			fmt.Fprintf(out, "recipient already present: %s\n", chosen)
			return ExitOK
		}
		if err := os.WriteFile(s.AuthorizedKeysPath(), updated, 0644); err != nil {
			fmt.Fprintln(er, err)
			return ExitError
		}
		fmt.Fprintln(out, "initialized dolos private archive metadata")
		fmt.Fprintf(out, "added recipient: %s\n", chosen)
		return ExitOK
	}
	if !os.IsNotExist(readErr) {
		fmt.Fprintln(er, readErr)
		return ExitError
	}
	if err := os.WriteFile(s.AuthorizedKeysPath(), body, 0644); err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintln(out, "initialized dolos private archive metadata")
	fmt.Fprintf(out, "imported recipient: %s\n", chosen)
	return ExitOK
}
func statusCmd(s gitstore.Store, out, er io.Writer) int {
	_, perr := os.Stat(s.PlainPath())
	_, aerr := os.Stat(s.ArtifactPath())
	idx, ierr := state.ReadIndex(s.IndexPath())
	cur := ""
	if perr == nil {
		m, _ := state.TreeManifest(s.PlainPath())
		cur = m.Digest
	}
	art := ""
	if aerr == nil {
		art, _ = state.FileDigest(s.ArtifactPath())
	}
	st := "no-index"
	if ierr == nil {
		if idx.PlainDigest == cur && idx.ArtifactDigest == art {
			st = "clean"
		} else {
			st = "diverged"
		}
	} else if perr == nil || aerr == nil {
		st = "untracked"
	}
	fmt.Fprintf(out, "archive=private status=%s plain=%t artifact=%t\n", st, perr == nil, aerr == nil)
	fmt.Fprintf(out, "next: %s\n", nextStep(st, perr == nil, aerr == nil))
	if st == "clean" {
		return ExitOK
	}
	return ExitState
}
func nextStep(st string, plain, artifact bool) string {
	switch st {
	case "clean":
		return "archive is current; use dolos verify private --identity KEY for a safe decrypt check"
	case "untracked":
		if plain && !artifact {
			return "run dolos pack private to create the encrypted artifact"
		}
		if artifact && !plain {
			return "run dolos unpack private --identity KEY to restore private/"
		}
		return "run dolos pack private after confirming private/ should become the source of truth"
	case "diverged":
		return "private/ and the encrypted artifact differ; inspect changes, then pack or unpack intentionally"
	default:
		return "run dolos init, then pack or unpack private intentionally"
	}
}

func scanCmd(args []string, out, er io.Writer) int {
	if len(args) != 1 || args[0] != "--staged" {
		return ExitUsage
	}
	ps, err := gitstore.StagedPaths()
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	bad := 0
	for _, p := range ps {
		ok := p == ".dolos/authorized_keys" || p == ".dolos/artifacts/private.tar.gz.age"
		if p == "private" || len(p) > 8 && p[:8] == "private/" {
			ok = false
		}
		if !ok && (len(p) >= 7 && p[:7] == ".dolos/") {
			ok = false
		}
		if !ok && (p == "private" || len(p) > 8 && p[:8] == "private/" || len(p) >= 7 && p[:7] == ".dolos/") {
			fmt.Fprintln(er, "unsafe staged path:", p)
			bad++
		}
	}
	if bad > 0 {
		return ExitUnsafe
	}
	fmt.Fprintln(out, "dolos scan ok")
	return ExitOK
}
func appendRecipient(existing, recipient []byte) ([]byte, bool) {
	candidate := strings.TrimSpace(string(recipient))
	if candidate == "" {
		return existing, false
	}
	for _, line := range strings.Split(string(existing), "\n") {
		if strings.TrimSpace(line) == candidate {
			return existing, false
		}
	}
	updated := append([]byte{}, existing...)
	if len(updated) > 0 && updated[len(updated)-1] != '\n' {
		updated = append(updated, '\n')
	}
	updated = append(updated, candidate...)
	updated = append(updated, '\n')
	return updated, true
}

func choosePublicKey(override string) (string, []byte, error) {
	candidates := []string{override}
	if override == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", nil, err
		}
		candidates = []string{filepath.Join(home, ".ssh", "id_ed25519.pub"), filepath.Join(home, ".ssh", "id_rsa.pub")}
	}
	for _, p := range candidates {
		if p == "" {
			continue
		}
		if len(p) >= 2 && p[:2] == "~/" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", nil, err
			}
			p = filepath.Join(home, p[2:])
		}
		b, err := os.ReadFile(p)
		if err == nil {
			if len(b) == 0 || b[len(b)-1] != '\n' {
				b = append(b, '\n')
			}
			return p, b, nil
		}
		if override != "" {
			return "", nil, err
		}
	}
	return "", nil, fmt.Errorf("no default public key found; create ~/.ssh/id_ed25519.pub or run dolos init --key PATH")
}

func recipientsCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	if len(args) != 0 {
		fmt.Fprintln(er, "usage: dolos recipients")
		return ExitUsage
	}
	infos, err := crypto.AuthorizedKeyRecipients(s.AuthorizedKeysPath())
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintf(out, "recipients=%d\n", len(infos))
	for i, info := range infos {
		fmt.Fprintf(out, "%d: %s\n", i+1, info.Fingerprint)
	}
	return ExitOK
}

func doctorCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	var ids []string
	for i := 0; i < len(args); i++ {
		if args[i] == "--identity" && i+1 < len(args) {
			ids = append(ids, args[i+1])
			i++
			continue
		}
		fmt.Fprintln(er, "usage: dolos doctor [--identity KEY]")
		return ExitUsage
	}
	fmt.Fprintln(out, "ok: git repository detected")
	infos, err := crypto.AuthorizedKeyRecipients(s.AuthorizedKeysPath())
	if err != nil {
		fmt.Fprintln(er, "not ok: recipients:", err)
		return ExitError
	}
	fmt.Fprintf(out, "ok: recipients=%d\n", len(infos))
	if _, err := os.Stat(s.PlainPath()); err == nil {
		fmt.Fprintln(out, "ok: private/ exists")
	} else {
		fmt.Fprintln(out, "warn: private/ is missing")
	}
	if _, err := os.Stat(s.ArtifactPath()); err == nil {
		fmt.Fprintln(out, "ok: encrypted artifact exists")
	} else {
		fmt.Fprintln(out, "warn: encrypted artifact is missing")
	}
	if len(ids) > 0 {
		if err := verifyArchive(s, ids); err != nil {
			fmt.Fprintln(er, "not ok: verify:", err)
			return ExitError
		}
		fmt.Fprintln(out, "ok: artifact decrypts with supplied identity")
	}
	return ExitOK
}

func parsePackArgs(args []string, er io.Writer) ([]string, bool) {
	if len(args) == 0 || !state.ValidateArchiveName(args[0]) {
		fmt.Fprintln(er, "usage: dolos pack private [--verify-identity KEY]")
		return nil, false
	}
	var ids []string
	for i := 1; i < len(args); i++ {
		if args[i] == "--verify-identity" && i+1 < len(args) {
			ids = append(ids, args[i+1])
			i++
			continue
		}
		fmt.Fprintln(er, "usage: dolos pack private [--verify-identity KEY]")
		return nil, false
	}
	return ids, true
}

func packCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	verifyIDs, ok := parsePackArgs(args, er)
	if !ok {
		return ExitUsage
	}
	err := s.WithLock(func() error {
		rs, err := crypto.RecipientsFromAuthorizedKeys(s.AuthorizedKeysPath())
		if err != nil {
			return err
		}
		if _, err := os.Stat(s.PlainPath()); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(s.ArtifactPath()), 0755); err != nil {
			return err
		}
		tmp := s.ArtifactPath() + ".tmp"
		f, err := os.Create(tmp)
		if err != nil {
			return err
		}
		aw, err := crypto.Encrypt(f, rs)
		if err == nil {
			_, err = archive.WriteTarGz(aw, s.PlainPath())
		}
		if cerr := aw.Close(); err == nil {
			err = cerr
		}
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			os.Remove(tmp)
			return err
		}
		if err := os.Rename(tmp, s.ArtifactPath()); err != nil {
			return err
		}
		m, err := state.TreeManifest(s.PlainPath())
		if err != nil {
			return err
		}
		ad, err := state.FileDigest(s.ArtifactPath())
		if err != nil {
			return err
		}
		if err := state.WriteJSONAtomic(s.IndexPath(), state.Index{Version: 1, Archive: "private", PlainDigest: m.Digest, ArtifactDigest: ad}); err != nil {
			return err
		}
		if len(verifyIDs) > 0 {
			return verifyArchiveUnlocked(s, verifyIDs)
		}
		return nil
	})
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintln(out, "packed private")
	if len(verifyIDs) > 0 {
		fmt.Fprintln(out, "verified artifact decrypts with supplied identity")
	}
	return ExitOK
}
func parseArchiveIdentityArgs(args []string, command string, er io.Writer) (string, []string, bool) {
	if len(args) == 0 || !state.ValidateArchiveName(args[0]) {
		fmt.Fprintf(er, "usage: dolos %s private --identity KEY\n", command)
		return "", nil, false
	}
	var ids []string
	for i := 1; i < len(args); i++ {
		if args[i] == "--identity" && i+1 < len(args) {
			ids = append(ids, args[i+1])
			i++
			continue
		}
		fmt.Fprintf(er, "usage: dolos %s private --identity KEY\n", command)
		return "", nil, false
	}
	if len(ids) == 0 {
		fmt.Fprintf(er, "usage: dolos %s private --identity KEY\n", command)
		return "", nil, false
	}
	return args[0], ids, true
}

func verifyArchive(s gitstore.Store, ids []string) error {
	return s.WithLock(func() error { return verifyArchiveUnlocked(s, ids) })
}

func verifyArchiveUnlocked(s gitstore.Store, ids []string) error {
	identities, err := crypto.IdentitiesFromFiles(ids)
	if err != nil {
		return err
	}
	f, err := os.Open(s.ArtifactPath())
	if err != nil {
		return err
	}
	defer f.Close()
	r, err := crypto.Decrypt(f, identities)
	if err != nil {
		return err
	}
	scratch := filepath.Join(s.GitPath, "verify-scratch")
	_ = os.RemoveAll(scratch)
	if err := os.MkdirAll(scratch, 0700); err != nil {
		return err
	}
	defer os.RemoveAll(scratch)
	m, err := archive.ExtractTarGz(r, scratch)
	if err != nil {
		return err
	}
	idx, err := state.ReadIndex(s.IndexPath())
	if err == nil && idx.PlainDigest != "" && idx.PlainDigest != m.Digest {
		return fmt.Errorf("verified archive digest does not match local index")
	}
	return nil
}

func verifyCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	_, ids, ok := parseArchiveIdentityArgs(args, "verify", er)
	if !ok {
		return ExitUsage
	}
	err := verifyArchive(s, ids)
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintln(out, "verified private archive decrypts and validates without changing private/")
	return ExitOK
}

func unpackCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	_, ids, ok := parseArchiveIdentityArgs(args, "unpack", er)
	if !ok {
		return ExitUsage
	}
	err := s.WithLock(func() error {
		identities, err := crypto.IdentitiesFromFiles(ids)
		if err != nil {
			return err
		}
		f, err := os.Open(s.ArtifactPath())
		if err != nil {
			return err
		}
		defer f.Close()
		r, err := crypto.Decrypt(f, identities)
		if err != nil {
			return err
		}
		scratch := s.ScratchPath()
		_ = os.RemoveAll(scratch)
		if err := os.MkdirAll(scratch, 0700); err != nil {
			return err
		}
		defer os.RemoveAll(scratch)
		m, err := archive.ExtractTarGz(r, scratch)
		if err != nil {
			return err
		}
		backup := s.PlainPath() + ".bak"
		_ = os.RemoveAll(backup)
		if _, err := os.Stat(s.PlainPath()); err == nil {
			if err := os.Rename(s.PlainPath(), backup); err != nil {
				return err
			}
		}
		if err := os.Rename(scratch, s.PlainPath()); err != nil {
			if _, e := os.Stat(backup); e == nil {
				_ = os.Rename(backup, s.PlainPath())
			}
			return err
		}
		_ = os.RemoveAll(backup)
		ad, err := state.FileDigest(s.ArtifactPath())
		if err != nil {
			return err
		}
		return state.WriteJSONAtomic(s.IndexPath(), state.Index{Version: 1, Archive: "private", PlainDigest: m.Digest, ArtifactDigest: ad})
	})
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	if runtime.GOOS == "windows" {
		fmt.Fprintln(out, "unpacked private")
	} else {
		fmt.Fprintln(out, "unpacked private")
	}
	return ExitOK
}
