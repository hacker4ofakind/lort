package setup

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"os"
	"strings"

	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/envfile"
)

func readEnv(path string) (envfile.File, error) {
	f, err := envfile.Read(path)
	if err != nil {
		return f, fmt.Errorf("couldn't read .env: %w", err)
	}
	return f, nil
}

// savedKey returns the key .env already holds, or "" when it has none. A key line that is
// repeated or malformed stops setup: guessing which key the data was saved with, or minting a
// new one, could lock the owner out of their own board.
func savedKey(f envfile.File) (string, error) {
	if !f.Mentions(config.EncryptionEnv) {
		return "", nil
	}
	key, n := f.Get(config.EncryptionEnv)
	switch {
	case n > 1:
		return "", fmt.Errorf(".env has %d LORT_ENCRYPTION_KEY lines. Keep the one your board's data was saved with, delete the others, then run setup again", n)
	case n == 0:
		return "", fmt.Errorf(".env mentions LORT_ENCRYPTION_KEY, but not as a plain LORT_ENCRYPTION_KEY=... line. Fix that line (no spaces, quotes or export), then run setup again")
	case len(key) != config.KeyLength:
		return "", fmt.Errorf(".env's LORT_ENCRYPTION_KEY should be %d characters (it has %d). Put the original key back, then run setup again. "+
			"If this is a brand new board with no data yet, delete the line and setup will make a key", config.KeyLength, len(key))
	}
	return key, nil
}

const keyAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

// newKey makes a 32-character key of letters and digits from crypto/rand.
func newKey() (string, error) {
	var b strings.Builder
	max := big.NewInt(int64(len(keyAlphabet)))
	for range config.KeyLength {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b.WriteByte(keyAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// writeEnv saves the answers into .env, keeping every line it doesn't own, and gives the file
// to whoever owns the working folder (setup runs as root in the container).
func writeEnv(path, workdir string, saved envfile.File, addr address, mode Mode, key string) error {
	next := envfile.Parse(saved.Bytes())
	next.Set("LORT_URL", addr.url())
	tls := "off"
	if mode == ModeHTTPS {
		tls = "auto"
	}
	next.Set("LORT_TLS", tls)
	next.Set(config.EncryptionEnv, key)
	if err := envfile.Write(path, saved, next.Bytes()); err != nil {
		return err
	}
	for _, f := range []string{path, path + ".previous"} {
		if _, err := os.Stat(f); err == nil {
			if err := chownLike(f, workdir); err != nil {
				return fmt.Errorf("couldn't give %s to the folder's owner: %w", f, err)
			}
		}
	}
	return nil
}
