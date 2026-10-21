package setup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// script is a Prompter that answers from a list and records everything it was shown.
type script struct {
	answers []string
	out     strings.Builder
	secrets int
}

func answers(a ...string) *script { return &script{answers: a} }

func (s *script) next(q string) (string, error) {
	fmt.Fprintf(&s.out, "? %s\n", q)
	if len(s.answers) == 0 {
		return "", io.EOF
	}
	a := s.answers[0]
	s.answers = s.answers[1:]
	return a, nil
}

func (s *script) Say(format string, a ...any) { fmt.Fprintf(&s.out, format+"\n", a...) }

func (s *script) Ask(q, def string) (string, error) {
	a, err := s.next(q + " [" + def + "]")
	if a == "" && err == nil {
		a = def
	}
	return a, err
}

func (s *script) AskSecret(q string) (string, error) {
	s.secrets++
	return s.next(q)
}

func (s *script) Confirm(q string, def bool) (bool, error) {
	a, err := s.next(q)
	if err != nil || a == "" {
		return def, err
	}
	return strings.HasPrefix(strings.ToLower(a), "y"), nil
}

// dns is a Net with fixed answers; every lookup is counted.
type dns struct {
	records map[string][]netip.Addr // "host A" -> addresses
	errs    map[string]error
	ip4     netip.Addr
	ip6     netip.Addr
	ipErr   error
	calls   int
	after   func(d *dns) // runs after each A lookup, to change the answers between checks
	mu      sync.Mutex
}

func (d *dns) DNS(_ context.Context, host, typ string) ([]netip.Addr, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.calls++
	k := host + " " + typ
	addrs, err := d.records[k], d.errs[k]
	if typ == "A" && d.after != nil {
		defer d.after(d)
	}
	return addrs, err
}

func (d *dns) PublicIP(_ context.Context, v int) (netip.Addr, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.ipErr != nil {
		return netip.Addr{}, d.ipErr
	}
	if v == 6 {
		if !d.ip6.IsValid() {
			return netip.Addr{}, errors.New("network is unreachable")
		}
		return d.ip6, nil
	}
	return d.ip4, nil
}

func pointsHere() *dns {
	return &dns{
		records: map[string][]netip.Addr{"feedback.driftnote.app A": {netip.MustParseAddr("203.0.113.9")}},
		ip4:     netip.MustParseAddr("203.0.113.9"),
	}
}

// admin is an Admin that remembers what it was asked and what .env held when it was.
type admin struct {
	state    AdminState
	checkErr error
	created  []string
	envAtUse string
	workdir  string
	resetTo  map[string]string // email -> new password
	exists   map[string]bool
}

func (a *admin) Check(context.Context, string) (AdminState, error) { return a.state, a.checkErr }

func (a *admin) Create(_ context.Context, key, email, password string) error {
	b, _ := os.ReadFile(filepath.Join(a.workdir, ".env"))
	a.envAtUse = string(b)
	if !strings.Contains(a.envAtUse, "LORT_ENCRYPTION_KEY="+key) {
		return errors.New("the key isn't on disk yet")
	}
	a.created = append(a.created, email, password)
	a.state = AdminExists
	return nil
}

func (a *admin) Exists(_ context.Context, email string) (bool, error) { return a.exists[email], nil }

func (a *admin) Reset(_ context.Context, email, password string) error {
	if !a.exists[email] {
		return ErrNoSuchAdmin
	}
	if a.resetTo == nil {
		a.resetTo = map[string]string{}
	}
	a.resetTo[email] = password
	return nil
}

type fixture struct {
	t      *testing.T
	work   string
	data   string
	prompt *script
	net    *dns
	admin  *admin
	opts   Options
}

func newFixture(t *testing.T, s *script) *fixture {
	t.Helper()
	root := t.TempDir()
	f := &fixture{t: t, work: filepath.Join(root, "work"), data: filepath.Join(root, "data", "pb_data"), prompt: s, net: pointsHere()}
	_ = os.MkdirAll(f.work, 0o755)
	_ = os.WriteFile(filepath.Join(f.work, ".env"), nil, 0o600) // the wrapper's empty file
	f.admin = &admin{state: AdminMissing, workdir: f.work}
	f.opts = Options{Workdir: f.work, DataDir: f.data, PortsFree: true, OS: "linux"}
	return f
}

func (f *fixture) run() error {
	return Run(context.Background(), Host{Prompt: f.prompt, Net: f.net, Admin: f.admin}, f.opts)
}

func (f *fixture) env() string {
	b, _ := os.ReadFile(filepath.Join(f.work, ".env"))
	return string(b)
}

func (f *fixture) setEnv(s string) {
	_ = os.WriteFile(filepath.Join(f.work, ".env"), []byte(s), 0o600)
}

func (f *fixture) makeData() {
	_ = os.MkdirAll(f.data, 0o700)
	_ = os.WriteFile(filepath.Join(f.data, "data.db"), []byte("SQLite format 3"), 0o600)
}
