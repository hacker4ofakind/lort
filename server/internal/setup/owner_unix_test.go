//go:build unix

package setup

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

// Needs root (it chowns), so it runs in the Linux container suite and CI's Docker checks.
func TestOwnDataFixesMixedOwnership(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("needs root")
	}
	root := t.TempDir()
	data := filepath.Join(root, "pb_data")
	nested := filepath.Join(data, "storage", "abc", "restored")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(data, "data.db"), nil, 0o600)
	_ = os.WriteFile(filepath.Join(nested, "pic.png"), nil, 0o600)
	outside := filepath.Join(t.TempDir(), "outside")
	_ = os.WriteFile(outside, nil, 0o600)
	_ = os.Symlink(outside, filepath.Join(data, "link"))
	_ = filepath.Walk(root, func(p string, _ os.FileInfo, _ error) error { return os.Lchown(p, lortUID, lortUID) })
	// A restore left one subtree to root.
	for _, p := range []string{filepath.Join(data, "storage", "abc", "restored"), filepath.Join(nested, "pic.png")} {
		_ = os.Lchown(p, 0, 0)
	}
	if err := ownData(data); err != nil {
		t.Fatal(err)
	}
	uid := func(p string) uint32 {
		fi, _ := os.Lstat(p)
		return fi.Sys().(*syscall.Stat_t).Uid
	}
	if uid(nested) != lortUID || uid(filepath.Join(nested, "pic.png")) != lortUID {
		t.Error("the nested root-owned files were left alone")
	}
	if uid(outside) != 0 {
		t.Error("the symlink's target outside the volume was chowned")
	}
}
