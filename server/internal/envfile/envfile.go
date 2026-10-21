// Package envfile reads and writes the .env file `docker run --env-file` takes: KEY=VALUE
// lines, values taken literally (no quotes, no escapes, no comments after a value).
// Lines Lort doesn't know are kept as they are.
package envfile

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
	"time"
)

// File is a parsed .env. The zero value is an empty file.
type File struct {
	lines []string
	raw   []byte // the bytes it was read from, to notice a change before writing
}

// Parse splits data into lines, dropping CR so a file edited on Windows still reads.
func Parse(data []byte) File {
	f := File{raw: data}
	s := strings.ReplaceAll(string(data), "\r\n", "\n")
	s = strings.TrimSuffix(s, "\n")
	if s != "" {
		f.lines = strings.Split(s, "\n")
	}
	return f
}

// Get returns the value of the last KEY=VALUE line for key, and how many such lines exist.
func (f File) Get(key string) (value string, n int) {
	for _, l := range f.lines {
		if k, v, ok := strings.Cut(l, "="); ok && k == key {
			value, n = v, n+1
		}
	}
	return value, n
}

// Mentions reports whether any line names key, well-formed or not.
func (f File) Mentions(key string) bool {
	for _, l := range f.lines {
		if strings.Contains(l, key) {
			return true
		}
	}
	return false
}

// Set replaces the KEY=VALUE line for key, or appends one.
func (f *File) Set(key, value string) {
	for i, l := range f.lines {
		if k, _, ok := strings.Cut(l, "="); ok && k == key {
			f.lines[i] = key + "=" + value
			return
		}
	}
	f.lines = append(f.lines, key+"="+value)
}

// Bytes is the file's content with LF endings.
func (f File) Bytes() []byte {
	if len(f.lines) == 0 {
		return nil
	}
	return []byte(strings.Join(f.lines, "\n") + "\n")
}

// Read reads path. A missing file is an empty File; a symlink is refused, so setup never
// writes the key somewhere the owner didn't expect.
func Read(path string) (File, error) {
	fi, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return File{}, nil
	}
	if err != nil {
		return File{}, err
	}
	if fi.Mode()&fs.ModeSymlink != 0 {
		return File{}, fmt.Errorf("%s is a symlink. Setup only writes a real file there: replace the link with a copy of the file, then run setup again", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return File{}, err
	}
	return Parse(data), nil
}

// staleLock is how old a lock must be before Write treats it as left by a crashed setup.
const staleLock = 10 * time.Minute

// Write replaces the content of path with data, but only if the file still holds what old
// was read from. It copies the old content to path+".previous" first (owner-only), holds
// path+".lock" meanwhile, writes in place (keeping the file's permissions and, on Windows,
// its ACL), syncs, and reads the result back.
func Write(path string, old File, data []byte) error {
	lock := path + ".lock"
	if fi, err := os.Stat(lock); err == nil && time.Since(fi.ModTime()) > staleLock {
		_ = os.Remove(lock)
	}
	l, err := os.OpenFile(lock, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		if errors.Is(err, fs.ErrExist) {
			return fmt.Errorf("another setup is writing %s right now. Wait for it to finish (or, if none is running, delete %s) and try again", path, lock)
		}
		return err
	}
	_ = l.Close()
	defer os.Remove(lock)

	current, err := Read(path)
	if err != nil {
		return err
	}
	if !bytes.Equal(current.raw, old.raw) {
		return fmt.Errorf("%s changed while setup was running, so setup left it alone. Run setup again", path)
	}
	if len(current.raw) > 0 {
		if err := writeFile(path+".previous", current.raw, true); err != nil {
			return fmt.Errorf("couldn't save a copy of the old %s: %w", path, err)
		}
	}
	if err := writeFile(path, data, false); err != nil {
		return err
	}
	back, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(back, data) {
		return fmt.Errorf("%s didn't read back as written (%v). Check the disk, then run setup again", path, err)
	}
	return nil
}

// writeFile writes data into path in place, creating it owner-only if needed.
func writeFile(path string, data []byte, truncateFirst bool) error {
	flags := os.O_WRONLY | os.O_CREATE
	if truncateFirst {
		flags |= os.O_TRUNC
	}
	f, err := os.OpenFile(path, flags, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.WriteAt(data, 0); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Truncate(int64(len(data))); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}
