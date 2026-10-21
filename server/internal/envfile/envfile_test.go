package envfile_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/hacker4ofakind/lort/server/internal/envfile"
)

func TestParseKeepsEverythingAndSetsInPlace(t *testing.T) {
	f := envfile.Parse([]byte("# mine\r\nLORT_URL=https://old.example\r\nLORT_PB_ADMIN=1\n\nODD LINE\n"))
	if v, n := f.Get("LORT_URL"); v != "https://old.example" || n != 1 {
		t.Fatalf("LORT_URL = %q (%d)", v, n)
	}
	f.Set("LORT_URL", "https://feedback.driftnote.app")
	f.Set("LORT_TLS", "auto")
	want := "# mine\nLORT_URL=https://feedback.driftnote.app\nLORT_PB_ADMIN=1\n\nODD LINE\nLORT_TLS=auto\n"
	if got := string(f.Bytes()); got != want {
		t.Errorf("got %q\nwant %q", got, want)
	}
}

func TestValuesAreTakenLiterally(t *testing.T) {
	odd := `pass word $HOME "quoted" #not-a-comment 'x'`
	f := envfile.Parse(nil)
	f.Set("SMTP_PASSWORD", odd)
	if got := string(f.Bytes()); got != "SMTP_PASSWORD="+odd+"\n" {
		t.Errorf("got %q", got)
	}
	if v, _ := envfile.Parse(f.Bytes()).Get("SMTP_PASSWORD"); v != odd {
		t.Errorf("round trip = %q", v)
	}
}

func TestGetCountsRepeatsAndSeesMalformedLines(t *testing.T) {
	f := envfile.Parse([]byte("K=a\nK=b\n export J=c\nJ\n"))
	if _, n := f.Get("K"); n != 2 {
		t.Errorf("K count = %d", n)
	}
	if !f.Mentions("J") || f.Mentions("Q") {
		t.Error("Mentions should find any line naming the key")
	}
}

func TestWriteInPlaceKeepsAPreviousCopy(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("LORT_ENCRYPTION_KEY=old\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	old, err := envfile.Read(path)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := os.Stat(path)
	if err := envfile.Write(path, old, []byte("LORT_ENCRYPTION_KEY=old\nLORT_TLS=off\n")); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(path)
	if !os.SameFile(before, after) {
		t.Error(".env was replaced, not written in place")
	}
	if b, _ := os.ReadFile(path); string(b) != "LORT_ENCRYPTION_KEY=old\nLORT_TLS=off\n" {
		t.Errorf(".env = %q", b)
	}
	prev, err := os.ReadFile(filepath.Join(dir, ".env.previous"))
	if err != nil || string(prev) != "LORT_ENCRYPTION_KEY=old\n" {
		t.Errorf(".env.previous = %q, %v", prev, err)
	}
	if runtime.GOOS != "windows" {
		if fi, _ := os.Stat(filepath.Join(dir, ".env.previous")); fi.Mode().Perm() != 0o600 {
			t.Errorf(".env.previous mode = %v", fi.Mode().Perm())
		}
	}
	if _, err := os.Stat(filepath.Join(dir, ".env.lock")); !os.IsNotExist(err) {
		t.Error("lock left behind")
	}
}

func TestWriteRefusesAFileThatChangedMeanwhile(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	_ = os.WriteFile(path, nil, 0o600)
	old, _ := envfile.Read(path)
	// Another setup wrote its key after this one read the file.
	_ = os.WriteFile(path, []byte("LORT_ENCRYPTION_KEY=theirs\n"), 0o600)
	err := envfile.Write(path, old, []byte("LORT_ENCRYPTION_KEY=mine\n"))
	if err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatalf("err = %v", err)
	}
	if b, _ := os.ReadFile(path); string(b) != "LORT_ENCRYPTION_KEY=theirs\n" {
		t.Errorf("the other key was overwritten: %q", b)
	}
}

func TestWriteRefusesWhileLocked(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	old, _ := envfile.Read(path)
	_ = os.WriteFile(filepath.Join(dir, ".env.lock"), nil, 0o600)
	if err := envfile.Write(path, old, []byte("X=1\n")); err == nil || !strings.Contains(err.Error(), "another setup") {
		t.Fatalf("err = %v", err)
	}
}

func TestReadRefusesSymlinks(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "elsewhere")
	_ = os.WriteFile(target, nil, 0o600)
	link := filepath.Join(dir, ".env")
	if err := os.Symlink(target, link); err != nil {
		t.Skip("symlinks need privileges here:", err)
	}
	if _, err := envfile.Read(link); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Errorf("err = %v", err)
	}
}

func TestReadMissingIsEmpty(t *testing.T) {
	f, err := envfile.Read(filepath.Join(t.TempDir(), ".env"))
	if err != nil || len(f.Bytes()) != 0 {
		t.Errorf("f = %q, %v", f.Bytes(), err)
	}
}
