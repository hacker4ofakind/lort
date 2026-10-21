package setup

import (
	"context"
	"errors"
	"io"
	"net/netip"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const (
	httpsLine = "docker run -d --name lort --restart unless-stopped --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges --log-opt max-size=10m --log-opt max-file=3 -p 80:80 -p 443:443 -v lort_data:/data --env-file .env lort"
	proxyLine = "docker run -d --name lort --restart unless-stopped --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges --log-opt max-size=10m --log-opt max-file=3 -p 127.0.0.1:4052:4052 -v lort_data:/data --env-file .env lort"
)

var keyLine = regexp.MustCompile(`(?m)^LORT_ENCRYPTION_KEY=([A-Za-z0-9]{32})$`)

func TestRunLines(t *testing.T) {
	if RunLine(ModeHTTPS) != httpsLine || RunLine(ModeProxy) != proxyLine {
		t.Errorf("run lines drifted from the spec:\n%s\n%s", RunLine(ModeHTTPS), RunLine(ModeProxy))
	}
}

func TestNormalizeHost(t *testing.T) {
	for in, want := range map[string]string{
		"feedback.driftnote.app":                  "feedback.driftnote.app",
		"  https://Feedback.Driftnote.App/  ":     "feedback.driftnote.app",
		"http://feedback.driftnote.app/board?x=1": "feedback.driftnote.app",
		"FEEDBACK.driftnote.app.":                 "feedback.driftnote.app",
		"localhost":                               "localhost",
		"http://localhost:4052":                   "localhost",
	} {
		if got, err := normalizeHost(in); err != nil || got != want {
			t.Errorf("%q = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "feed back.app", "203.0.113.9", "feedback.driftnote.app:8443", "feedback", "[2001:db8::1]"} {
		if got, err := normalizeHost(bad); err == nil {
			t.Errorf("%q = %q, want a refusal", bad, got)
		}
	}
}

func TestDNSVerdicts(t *testing.T) {
	here := netip.MustParseAddr("203.0.113.9")
	there := netip.MustParseAddr("198.51.100.7")
	here6 := netip.MustParseAddr("2001:db8::9")
	there6 := netip.MustParseAddr("2001:db8::7")
	down := errors.New("timeout")
	for _, c := range []struct {
		name string
		l    lookup
		want verdict
	}{
		{"ok", lookup{a: []netip.Addr{here}, ip4: here}, verdictOK},
		{"ok with both", lookup{a: []netip.Addr{here}, aaaa: []netip.Addr{here6}, ip4: here, ip6: here6}, verdictOK},
		{"missing", lookup{ip4: here}, verdictMissing},
		{"mismatch", lookup{a: []netip.Addr{there}, ip4: here}, verdictMismatch},
		{"partly", lookup{a: []netip.Addr{here, there}, ip4: here}, verdictPartly},
		{"stale AAAA", lookup{a: []netip.Addr{here}, aaaa: []netip.Addr{there6}, ip4: here, ip6: here6}, verdictPartly},
		{"resolver down", lookup{aErr: down, ip4: here}, verdictUnknown},
		{"ipify down", lookup{a: []netip.Addr{here}, ip4Err: down, ip6Err: down}, verdictUnknown},
		{"AAAA unchecked is a note", lookup{a: []netip.Addr{here}, aaaa: []netip.Addr{there6}, ip4: here, ip6Err: down}, verdictOK},
		{"only AAAA, no IPv6 here", lookup{aaaa: []netip.Addr{here6}, ip4: here, ip6Err: down}, verdictUnknown},
	} {
		if got := c.l.verdict(); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestPasswordRules(t *testing.T) {
	long := strings.Repeat("x", 72)
	s := answers("short", long, "correct horse", "different", "correct horse", "correct horse")
	pw, err := askPassword(s)
	if err != nil || pw != "correct horse" {
		t.Fatalf("pw = %q, %v", pw, err)
	}
	out := s.out.String()
	if !strings.Contains(out, "at least 8") || !strings.Contains(out, "71") || !strings.Contains(out, "didn't match") {
		t.Errorf("transcript:\n%s", out)
	}
	if strings.Contains(out, "correct horse") {
		t.Error("the password was echoed")
	}
	if _, err := askPassword(answers("correct horse")); err == nil || !strings.Contains(err.Error(), "ended") {
		t.Errorf("input running out: %v", err)
	}
	if pw, _ := askPassword(answers(strings.Repeat("y", 71), strings.Repeat("y", 71))); len(pw) != 71 {
		t.Error("71 bytes should be allowed")
	}
}

func TestFirstRunHTTPS(t *testing.T) {
	f := newFixture(t, answers("https://feedback.driftnote.app/", "luk@driftnote.app", "pass word $HOME \"#", "pass word $HOME \"#"))
	if err := f.run(); err != nil {
		t.Fatalf("%v\n%s", err, f.prompt.out.String())
	}
	env := f.env()
	m := keyLine.FindStringSubmatch(env)
	if m == nil {
		t.Fatalf(".env has no key:\n%s", env)
	}
	if env != "LORT_URL=https://feedback.driftnote.app\nLORT_TLS=auto\nLORT_ENCRYPTION_KEY="+m[1]+"\n" {
		t.Errorf(".env = %q", env)
	}
	if strings.Contains(env, "pass word") {
		t.Error("the admin password reached .env")
	}
	if len(f.admin.created) != 2 || f.admin.created[1] != "pass word $HOME \"#" {
		t.Errorf("admin = %q", f.admin.created)
	}
	out := f.prompt.out.String()
	if !strings.Contains(out, httpsLine) || strings.Contains(out, proxyLine) {
		t.Errorf("want the HTTPS run line:\n%s", out)
	}
	if !strings.Contains(out, "dns.google") || !strings.Contains(out, "ipify") {
		t.Error("setup should say where the DNS check sends what")
	}
	if !strings.Contains(out, "copy of .env") {
		t.Error("setup should remind the owner to keep .env safe")
	}
	if strings.Contains(out, "pass word") {
		t.Error("the password was echoed")
	}
}

func TestTakenPortsPickProxyMode(t *testing.T) {
	f := newFixture(t, answers("feedback.driftnote.app", "luk@driftnote.app", "correcthorse", "correcthorse"))
	f.opts.PortsFree = false
	if err := f.run(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(f.env(), "LORT_URL=https://feedback.driftnote.app\nLORT_TLS=off\n") {
		t.Errorf(".env = %q", f.env())
	}
	out := f.prompt.out.String()
	for _, want := range []string{
		proxyLine,
		"server_name feedback.driftnote.app;", "proxy_pass http://127.0.0.1:4052;", "$proxy_add_x_forwarded_for",
		"client_max_body_size 16m;", "proxy_buffering off;", "proxy_read_timeout",
		"feedback.driftnote.app {", "reverse_proxy 127.0.0.1:4052",
		`Strict-Transport-Security "max-age=31536000"`,
		"Add a reverse proxy from feedback.driftnote.app to 127.0.0.1:4052 with HTTPS",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
	if strings.Count(out, "Strict-Transport-Security") < 2 {
		t.Error("both proxy blocks need HSTS")
	}
}

func TestLocalTryOut(t *testing.T) {
	f := newFixture(t, answers("localhost", "me@example.test", "correcthorse", "correcthorse"))
	if err := f.run(); err != nil {
		t.Fatal(err)
	}
	if f.net.calls != 0 {
		t.Error("localhost needs no DNS check")
	}
	m := keyLine.FindStringSubmatch(f.env())
	if m == nil || f.env() != "LORT_URL=http://localhost:4052\nLORT_TLS=off\nLORT_ENCRYPTION_KEY="+m[1]+"\n" {
		t.Errorf(".env = %q", f.env())
	}
	if out := f.prompt.out.String(); !strings.Contains(out, proxyLine) || strings.Contains(out, "server_name") {
		t.Errorf("want the proxy line and no proxy blocks:\n%s", out)
	}
}

func TestRerunKeepsAnswersKeyAndUnknownLines(t *testing.T) {
	f := newFixture(t, answers("", ""))
	f.setEnv("LORT_URL=https://feedback.driftnote.app\nLORT_TLS=auto\nLORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345\nLORT_PB_ADMIN=1\n")
	f.makeData()
	f.admin.state = AdminExists
	before, _ := os.Stat(filepath.Join(f.work, ".env"))
	if err := f.run(); err != nil {
		t.Fatalf("%v\n%s", err, f.prompt.out.String())
	}
	want := "LORT_URL=https://feedback.driftnote.app\nLORT_TLS=auto\nLORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345\nLORT_PB_ADMIN=1\n"
	if f.env() != want {
		t.Errorf(".env = %q", f.env())
	}
	after, _ := os.Stat(filepath.Join(f.work, ".env"))
	if !os.SameFile(before, after) {
		t.Error(".env should be written in place")
	}
	if f.prompt.secrets != 0 || len(f.admin.created) != 0 {
		t.Error("an existing admin should skip the password question")
	}
	if !strings.Contains(f.prompt.out.String(), "already has an admin") {
		t.Errorf("transcript:\n%s", f.prompt.out.String())
	}
	if !strings.Contains(f.prompt.out.String(), "[feedback.driftnote.app]") {
		t.Error("the saved address should be offered")
	}
}

func TestExistingDataWithoutAKeyStops(t *testing.T) {
	f := newFixture(t, answers("feedback.driftnote.app"))
	f.makeData()
	err := f.run()
	if err == nil || !strings.Contains(err.Error(), "a new key couldn't read") {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "docker inspect lort") || strings.Contains(err.Error(), "docker rm") {
		t.Errorf("advice = %v", err)
	}
	if f.env() != "" {
		t.Errorf(".env was written: %q", f.env())
	}
}

func TestEmptyVolumeIsFine(t *testing.T) {
	f := newFixture(t, answers("localhost", "me@example.test", "correcthorse", "correcthorse"))
	_ = os.MkdirAll(f.data, 0o700) // an aborted run left the folder, no database
	if err := f.run(); err != nil {
		t.Fatal(err)
	}
}

func TestEnvIsWrittenBeforeTheAdmin(t *testing.T) {
	f := newFixture(t, answers("localhost", "me@example.test", "correcthorse", "correcthorse"))
	if err := f.run(); err != nil {
		t.Fatal(err) // the fake Create fails if the key isn't on disk yet
	}
	if !keyLine.MatchString(f.admin.envAtUse) {
		t.Errorf(".env when the admin was made = %q", f.admin.envAtUse)
	}
}

func TestBadKeyLinesStop(t *testing.T) {
	for _, env := range []string{
		"LORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345\nLORT_ENCRYPTION_KEY=543210zyxwvutsrqponmlkjihgfedcba\n",
		"LORT_ENCRYPTION_KEY=short\n",
		"LORT_ENCRYPTION_KEY=\n",
		"export LORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345\n",
	} {
		f := newFixture(t, answers("localhost", "me@example.test", "correcthorse", "correcthorse"))
		f.setEnv(env)
		if err := f.run(); err == nil || !strings.Contains(err.Error(), "LORT_ENCRYPTION_KEY") {
			t.Errorf("%q: err = %v", env, err)
		}
		if f.env() != env {
			t.Errorf("%q was changed to %q", env, f.env())
		}
	}
}

func TestDNSMismatchOffersRecheck(t *testing.T) {
	f := newFixture(t, answers("feedback.driftnote.app", "y", "luk@driftnote.app", "correcthorse", "correcthorse"))
	f.net.records["feedback.driftnote.app A"] = []netip.Addr{netip.MustParseAddr("198.51.100.7")}
	f.net.after = func(d *dns) { d.records["feedback.driftnote.app A"] = []netip.Addr{d.ip4} } // fixed before the re-check
	if err := f.run(); err != nil {
		t.Fatal(err)
	}
	out := f.prompt.out.String()
	for _, want := range []string{"198.51.100.7", "203.0.113.9", "Cloudflare", "AAAA", "Check again?", "points here"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

func TestDNSCouldntCheckIsNotMissing(t *testing.T) {
	f := newFixture(t, answers("feedback.driftnote.app", "n", "luk@driftnote.app", "correcthorse", "correcthorse"))
	f.net.ipErr = errors.New("dial tcp: i/o timeout")
	if err := f.run(); err != nil {
		t.Fatal(err)
	}
	out := f.prompt.out.String()
	if !strings.Contains(out, "Couldn't check") || strings.Contains(out, "doesn't point anywhere") || strings.Contains(out, "no address yet") {
		t.Errorf("transcript:\n%s", out)
	}
}

func TestRunningContainerSkipsTheAdmin(t *testing.T) {
	f := newFixture(t, answers("", ""))
	f.setEnv("LORT_URL=http://localhost:4052\nLORT_TLS=off\nLORT_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz012345\n")
	f.makeData()
	f.opts.ContainerRunning = true
	f.admin.checkErr = errors.New("must not be called")
	if err := f.run(); err != nil {
		t.Fatal(err)
	}
	out := f.prompt.out.String()
	if !strings.Contains(out, "docker stop lort") || !strings.Contains(out, "lort_data") {
		t.Errorf("transcript:\n%s", out)
	}
}

func TestAdminUnknownStops(t *testing.T) {
	f := newFixture(t, answers("localhost"))
	f.admin.state = AdminUnknown
	f.admin.checkErr = errors.New("database is locked")
	if err := f.run(); err == nil || !strings.Contains(err.Error(), "couldn't tell") {
		t.Fatalf("err = %v", err)
	}
	if f.prompt.secrets != 0 {
		t.Error("asked for a password without knowing")
	}
}

func TestInputRunningOutEnds(t *testing.T) {
	f := newFixture(t, answers("localhost", "me@example.test"))
	if err := f.run(); err == nil || !errors.Is(err, io.EOF) && !strings.Contains(err.Error(), "ended") {
		t.Fatalf("err = %v", err)
	}
}

func TestResetAdmin(t *testing.T) {
	a := &admin{exists: map[string]bool{"me@example.test": true}}
	s := answers("me@example.test", "-starts-with-dash", "-starts-with-dash")
	if err := ResetAdmin(context.Background(), Host{Prompt: s, Admin: a}); err != nil {
		t.Fatal(err)
	}
	if a.resetTo["me@example.test"] != "-starts-with-dash" {
		t.Errorf("reset = %v", a.resetTo)
	}
	if strings.Contains(s.out.String(), "-starts-with-dash") {
		t.Error("the password was echoed")
	}

	err := ResetAdmin(context.Background(), Host{Prompt: answers("nobody@example.test", "correcthorse", "correcthorse"), Admin: a})
	if err == nil || !strings.Contains(err.Error(), "no admin") {
		t.Errorf("unknown admin: %v", err)
	}
	s = answers("me@example.test", "short", strings.Repeat("z", 80))
	if err := ResetAdmin(context.Background(), Host{Prompt: s, Admin: a}); err == nil {
		t.Error("bad lengths should end with an error once input runs out")
	}
	if out := s.out.String(); !strings.Contains(out, "at least 8") || !strings.Contains(out, "71") {
		t.Errorf("transcript:\n%s", out)
	}
}

func TestAdviceNamesTheScriptTheOwnerRan(t *testing.T) {
	f := newFixture(t, answers("localhost"))
	f.makeData()
	f.opts.OS, f.opts.Script = "windows", "./setup.sh" // setup.sh in Git Bash
	if err := f.run(); err == nil || !strings.Contains(err.Error(), "run ./setup.sh again") {
		t.Errorf("err = %v", err)
	}
	f = newFixture(t, answers("localhost"))
	f.makeData()
	f.opts.OS = "windows"
	if err := f.run(); err == nil || !strings.Contains(err.Error(), "run ./setup.ps1 again") {
		t.Errorf("default for Windows: %v", err)
	}
}
