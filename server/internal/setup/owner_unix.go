//go:build unix

package setup

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

// lortUID owns everything in the data volume (the image's lort user).
const lortUID = 10001

// chownLike gives path the owner and group of ref. Only root can, and only root needs to.
func chownLike(path, ref string) error {
	if os.Geteuid() != 0 {
		return nil
	}
	fi, err := os.Stat(ref)
	if err != nil {
		return err
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return nil
	}
	return os.Lchown(path, int(st.Uid), int(st.Gid))
}

// ownData does what the image's entrypoint does at every boot: give the data volume to the
// lort user when its top level or the database belongs to someone else.
func ownData(dataDir string) error {
	if os.Geteuid() != 0 {
		return nil
	}
	root := filepath.Dir(dataDir)
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return err
	}
	wrong := false
	for _, p := range []string{root, dataDir, filepath.Join(dataDir, "data.db")} {
		fi, err := os.Lstat(p)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		if st, ok := fi.Sys().(*syscall.Stat_t); ok && st.Uid != lortUID {
			wrong = true
		}
	}
	if !wrong {
		return nil
	}
	return filepath.WalkDir(root, func(p string, _ fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		return os.Lchown(p, lortUID, lortUID)
	})
}

// asLort runs cmd as the lort user when setup runs as root, so the database and its
// -wal/-shm files are never root-owned.
func asLort(cmd *exec.Cmd) {
	if os.Geteuid() == 0 {
		cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: lortUID, Gid: lortUID}}
	}
}
