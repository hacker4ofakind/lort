//go:build unix

package setup

import (
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

// ownData does what the image's entrypoint does at every boot: give everything in the data
// volume to the lort user, including a subtree a restore left to root. It never follows a
// symlink: links are re-owned themselves, their targets are left alone.
func ownData(dataDir string) error {
	if os.Geteuid() != 0 {
		return nil
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return err
	}
	return filepath.WalkDir(filepath.Dir(dataDir), func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		fi, err := d.Info() // Lstat: WalkDir doesn't follow links
		if err != nil {
			return err
		}
		if st, ok := fi.Sys().(*syscall.Stat_t); ok && (st.Uid != lortUID || st.Gid != lortUID) {
			return os.Lchown(p, lortUID, lortUID)
		}
		return nil
	})
}

// asLort runs cmd as the lort user when setup runs as root, so the database and its
// -wal/-shm files are never root-owned.
func asLort(cmd *exec.Cmd) {
	if os.Geteuid() == 0 {
		cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: lortUID, Gid: lortUID}}
	}
}
