package crypto

import (
	"bufio"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"strings"

	"filippo.io/age"
	"filippo.io/age/agessh"
)

type RecipientInfo struct {
	PublicKey   string
	Fingerprint string
}

func AuthorizedKeyRecipients(path string) ([]RecipientInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("authorized_keys required: %w", err)
	}
	defer f.Close()
	seen := map[string]bool{}
	var infos []RecipientInfo
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return nil, fmt.Errorf("malformed authorized_keys line")
		}
		if !strings.HasPrefix(fields[0], "ssh-") {
			return nil, fmt.Errorf("authorized_keys options are not supported")
		}
		pub := fields[0] + " " + fields[1]
		if seen[pub] {
			continue
		}
		if _, err := agessh.ParseRecipient(pub); err != nil {
			return nil, fmt.Errorf("unsupported ssh recipient: %w", err)
		}
		seen[pub] = true
		infos = append(infos, RecipientInfo{PublicKey: pub, Fingerprint: fingerprint(pub)})
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if len(infos) == 0 {
		return nil, fmt.Errorf("authorized_keys has no recipients")
	}
	return infos, nil
}

func RecipientsFromAuthorizedKeys(path string) ([]age.Recipient, error) {
	infos, err := AuthorizedKeyRecipients(path)
	if err != nil {
		return nil, err
	}
	rs := make([]age.Recipient, 0, len(infos))
	for _, info := range infos {
		r, err := agessh.ParseRecipient(info.PublicKey)
		if err != nil {
			return nil, fmt.Errorf("unsupported ssh recipient: %w", err)
		}
		rs = append(rs, r)
	}
	return rs, nil
}

func fingerprint(pub string) string {
	sum := sha256.Sum256([]byte(pub))
	return "SHA256:" + base64.RawStdEncoding.EncodeToString(sum[:])
}

func IdentitiesFromFiles(paths []string) ([]age.Identity, error) {
	var ids []age.Identity
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err != nil {
			return nil, err
		}
		id, err := agessh.ParseIdentity(b)
		if err != nil {
			return nil, fmt.Errorf("parse identity %s: %w", p, err)
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("no identities supplied; use --identity")
	}
	return ids, nil
}
func Encrypt(w io.Writer, rs []age.Recipient) (io.WriteCloser, error) { return age.Encrypt(w, rs...) }
func Decrypt(r io.Reader, ids []age.Identity) (io.Reader, error)      { return age.Decrypt(r, ids...) }
