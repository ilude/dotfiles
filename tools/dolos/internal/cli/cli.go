package cli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"filippo.io/age"

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
  pack private [--verify-identity KEY] [--if-plain-changed]
                                  encrypt private/ and optionally verify before replacing
  unpack private --identity KEY [--force]
                                  restore private/; --force discards local changes
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
	st, err := inspectArchive(s)
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintf(out, "archive=private status=%s plain=%t artifact=%t\n", st.name, st.plain, st.artifact)
	fmt.Fprintf(out, "next: %s\n", nextStep(st.name, st.plain, st.artifact))
	if st.name == "clean" {
		return ExitOK
	}
	return ExitState
}
func nextStep(st string, plain, artifact bool) string {
	if !plain && artifact {
		return "private/ is missing; run dolos unpack private --identity KEY to restore private/"
	}
	switch st {
	case "clean":
		return "archive is current; use dolos verify private --identity KEY for a safe decrypt check"
	case "untracked":
		if plain && !artifact {
			return "run dolos pack private to create the encrypted artifact"
		}
		return "run dolos pack private after confirming private/ should become the source of truth"
	case "plain-changed":
		return "private/ changed; run dolos pack private to update the encrypted artifact"
	case "artifact-changed":
		return "the encrypted artifact changed; run dolos unpack private --identity KEY to restore it"
	case "diverged":
		return "both private/ and the encrypted artifact changed; preserve and compare both before choosing pack or unpack --force"
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
		allowedMetadata := p == ".dolos/authorized_keys" || p == ".dolos/artifacts/private.tar.gz.age"
		privatePath := p == "private" || strings.HasPrefix(p, "private/") || p == "private.bak" || strings.HasPrefix(p, "private.bak/")
		if privatePath || (!allowedMetadata && strings.HasPrefix(p, ".dolos/")) {
			fmt.Fprintf(er, "unsafe staged path: %q\n", p)
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

type packOptions struct {
	identities     []string
	ifPlainChanged bool
}

func parsePackArgs(args []string, er io.Writer) (packOptions, bool) {
	var opts packOptions
	if len(args) > 0 && state.ValidateArchiveName(args[0]) {
		for i := 1; i < len(args); i++ {
			switch {
			case args[i] == "--verify-identity" && i+1 < len(args):
				opts.identities = append(opts.identities, args[i+1])
				i++
			case args[i] == "--if-plain-changed":
				opts.ifPlainChanged = true
			default:
				fmt.Fprintln(er, "usage: dolos pack private [--verify-identity KEY] [--if-plain-changed]")
				return opts, false
			}
		}
		return opts, true
	}
	fmt.Fprintln(er, "usage: dolos pack private [--verify-identity KEY] [--if-plain-changed]")
	return opts, false
}

func writeEncryptedArchive(w io.Writer, root string, recipients []age.Recipient) (state.Manifest, error) {
	aw, err := crypto.Encrypt(w, recipients)
	if err != nil {
		return state.Manifest{}, err
	}
	m, err := archive.WriteTarGz(aw, root)
	if cerr := aw.Close(); err == nil {
		err = cerr
	}
	return m, err
}

func packCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	opts, ok := parsePackArgs(args, er)
	if !ok {
		return ExitUsage
	}
	packed := false
	err := s.WithLock(func() error {
		previousArtifact, _, err := existingArtifactDigest(s.ArtifactPath())
		if err != nil {
			return err
		}
		if opts.ifPlainChanged {
			st, err := inspectArchive(s)
			if err != nil {
				return err
			}
			if st.name == "clean" {
				return nil
			}
			if st.name != "plain-changed" {
				return fmt.Errorf("automatic packing refused: archive state is %s; inspect dolos status before choosing a sync direction", st.name)
			}
			if st.artifactDigest != previousArtifact {
				return fmt.Errorf("encrypted artifact changed while checking automatic packing; retry dolos status")
			}
		}
		rs, err := crypto.RecipientsFromAuthorizedKeys(s.AuthorizedKeysPath())
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(s.ArtifactPath()), 0755); err != nil {
			return err
		}
		f, err := os.CreateTemp(filepath.Dir(s.ArtifactPath()), ".private-*.age.tmp")
		if err != nil {
			return err
		}
		tmp := f.Name()
		defer os.Remove(tmp)
		m, err := writeEncryptedArchive(f, s.PlainPath(), rs)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
		if len(opts.identities) > 0 {
			verified, err := verifyArchiveFile(s, tmp, opts.identities)
			if err != nil {
				return fmt.Errorf("candidate archive verification failed: %w", err)
			}
			if verified.Digest != m.Digest {
				return fmt.Errorf("candidate archive does not match the packed manifest")
			}
		}
		current, err := state.TreeManifest(s.PlainPath())
		if err != nil {
			return err
		}
		if current.Digest != m.Digest {
			return fmt.Errorf("private/ changed while packing; existing archive was not replaced; retry when edits are complete")
		}
		ad, err := state.FileDigest(tmp)
		if err != nil {
			return err
		}
		latestArtifact, _, err := existingArtifactDigest(s.ArtifactPath())
		if err != nil {
			return err
		}
		if latestArtifact != previousArtifact {
			return fmt.Errorf("encrypted artifact changed while packing; existing archive was not replaced")
		}
		if err := os.Rename(tmp, s.ArtifactPath()); err != nil {
			return err
		}
		if err := state.WriteJSONAtomic(s.IndexPath(), state.Index{Version: 1, Archive: state.ArchiveName, PlainDigest: m.Digest, ArtifactDigest: ad}); err != nil {
			return err
		}
		packed = true
		return nil
	})
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	if !packed {
		fmt.Fprintln(out, "private archive is already current")
		return ExitOK
	}
	fmt.Fprintln(out, "packed private")
	if len(opts.identities) > 0 {
		fmt.Fprintln(out, "verified artifact decrypts with supplied identity")
	}
	return ExitOK
}

type identityOptions struct {
	identities []string
	force      bool
}

func parseArchiveIdentityArgs(args []string, command string, er io.Writer) (identityOptions, bool) {
	var opts identityOptions
	usage := "usage: dolos " + command + " private --identity KEY"
	if command == "unpack" {
		usage += " [--force]"
	}
	if len(args) > 0 && state.ValidateArchiveName(args[0]) {
		for i := 1; i < len(args); i++ {
			switch {
			case args[i] == "--identity" && i+1 < len(args):
				opts.identities = append(opts.identities, args[i+1])
				i++
			case args[i] == "--force" && command == "unpack":
				opts.force = true
			default:
				fmt.Fprintln(er, usage)
				return opts, false
			}
		}
		if len(opts.identities) > 0 {
			return opts, true
		}
	}
	fmt.Fprintln(er, usage)
	return opts, false
}

func verifyArchive(s gitstore.Store, ids []string) error {
	return s.WithLock(func() error { return verifyArchiveUnlocked(s, ids) })
}

func verifyArchiveFile(s gitstore.Store, path string, ids []string) (state.Manifest, error) {
	identities, err := crypto.IdentitiesFromFiles(ids)
	if err != nil {
		return state.Manifest{}, err
	}
	f, err := os.Open(path)
	if err != nil {
		return state.Manifest{}, err
	}
	defer f.Close()
	r, err := crypto.Decrypt(f, identities)
	if err != nil {
		return state.Manifest{}, err
	}
	scratch, err := os.MkdirTemp(s.GitPath, "verify-")
	if err != nil {
		return state.Manifest{}, err
	}
	defer os.RemoveAll(scratch)
	return archive.ExtractTarGz(r, scratch)
}

func verifyArchiveUnlocked(s gitstore.Store, ids []string) error {
	m, err := verifyArchiveFile(s, s.ArtifactPath(), ids)
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
	opts, ok := parseArchiveIdentityArgs(args, "verify", er)
	if !ok {
		return ExitUsage
	}
	err := verifyArchive(s, opts.identities)
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintln(out, "verified private archive decrypts and validates without changing private/")
	return ExitOK
}

func unpackCmd(s gitstore.Store, args []string, out, er io.Writer) int {
	opts, ok := parseArchiveIdentityArgs(args, "unpack", er)
	if !ok {
		return ExitUsage
	}
	err := s.WithLock(func() error {
		if err := checkUnpackOverwrite(s, opts.force); err != nil {
			return err
		}
		backup := s.PlainPath() + ".bak"
		if _, err := os.Lstat(backup); err == nil {
			return fmt.Errorf("private.bak already exists; inspect and move it before retrying unpack")
		} else if !os.IsNotExist(err) {
			return err
		}
		ad, _, err := existingArtifactDigest(s.ArtifactPath())
		if err != nil {
			return err
		}
		identities, err := crypto.IdentitiesFromFiles(opts.identities)
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
		scratch, err := os.MkdirTemp(s.GitPath, "unpack-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(scratch)
		m, err := archive.ExtractTarGz(r, scratch)
		if err != nil {
			return err
		}
		latestArtifact, _, err := existingArtifactDigest(s.ArtifactPath())
		if err != nil {
			return err
		}
		if latestArtifact != ad {
			return fmt.Errorf("encrypted artifact changed while unpacking; private/ was not replaced")
		}
		if err := checkUnpackOverwrite(s, opts.force); err != nil {
			return err
		}
		movedBackup := false
		if _, err := os.Lstat(s.PlainPath()); err == nil {
			if err := os.Rename(s.PlainPath(), backup); err != nil {
				return err
			}
			movedBackup = true
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := os.Rename(scratch, s.PlainPath()); err != nil {
			if movedBackup {
				if restoreErr := os.Rename(backup, s.PlainPath()); restoreErr != nil {
					return fmt.Errorf("promote archive: %w; restore private.bak: %v", err, restoreErr)
				}
			}
			return err
		}
		if err := state.WriteJSONAtomic(s.IndexPath(), state.Index{Version: 1, Archive: state.ArchiveName, PlainDigest: m.Digest, ArtifactDigest: ad}); err != nil {
			return fmt.Errorf("private/ restored but the index could not be updated; any private.bak was retained: %w", err)
		}
		if movedBackup {
			if err := os.RemoveAll(backup); err != nil {
				return fmt.Errorf("private/ restored but private.bak could not be removed: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		fmt.Fprintln(er, err)
		return ExitError
	}
	fmt.Fprintln(out, "unpacked private")
	return ExitOK
}
