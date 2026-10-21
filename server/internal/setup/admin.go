package setup

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/mail"
	"os"
	"os/exec"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/team"
)

// Password limits: PocketBase hashes with bcrypt, which ignores everything past 72 bytes.
const (
	minPassword = 8
	maxPassword = 71
)

// passwordProblem says what's wrong with pw, or "" when it's fine.
func passwordProblem(pw string) string {
	switch {
	case len(pw) < minPassword:
		return fmt.Sprintf("That's too short. Use at least %d characters.", minPassword)
	case len(pw) > maxPassword:
		return fmt.Sprintf("That's too long. Passwords can be at most %d bytes.", maxPassword)
	}
	return ""
}

// askPassword asks for a password twice, hidden, until both match and fit the limits.
func askPassword(p Prompter) (string, error) {
	for {
		pw, err := p.AskSecret("Password (8 to 71 characters)")
		if err != nil {
			return "", ended(err)
		}
		if problem := passwordProblem(pw); problem != "" {
			p.Say("%s", problem)
			continue
		}
		again, err := p.AskSecret("Type it once more")
		if err != nil {
			return "", ended(err)
		}
		if again != pw {
			p.Say("Those didn't match. Let's try again.")
			continue
		}
		return pw, nil
	}
}

func askEmail(p Prompter, question string) (string, error) {
	for {
		in, err := p.Ask(question, "")
		if err != nil {
			return "", ended(err)
		}
		addr, err := mail.ParseAddress(strings.TrimSpace(in))
		if err != nil || addr.Name != "" {
			p.Say("Enter an email address like name@example.com.")
			continue
		}
		return addr.Address, nil
	}
}

func adminStep(ctx context.Context, h Host, o Options, key string) error {
	p := h.Prompt
	if o.ContainerRunning {
		p.Say("Lort is running right now, so setup left its database alone and didn't check for an admin.")
		return nil
	}
	if err := ownData(o.DataDir); err != nil {
		return fmt.Errorf("couldn't give the lort_data volume to the lort user: %w", err)
	}
	state, err := h.Admin.Check(ctx, key)
	switch {
	case state == AdminExists && err == nil:
		p.Say("This board already has an admin, so there's nothing to ask. (Forgot the password? Run %s --reset-admin.)", scriptName(o))
		p.Say("")
		return nil
	case state != AdminMissing || err != nil:
		return fmt.Errorf("setup couldn't tell whether this board already has an admin (%v). Nothing was changed. Run setup again", err)
	}

	p.Say("Now your admin account, for signing in to the dashboard.")
	email, err := askEmail(p, "Admin email")
	if err != nil {
		return err
	}
	pw, err := askPassword(p)
	if err != nil {
		return err
	}
	if err := h.Admin.Create(ctx, key, email, pw); err != nil {
		return fmt.Errorf("couldn't create the admin: %w", err)
	}
	// Creating does nothing when an admin already exists, so only a read-back proves it.
	if state, err := h.Admin.Check(ctx, key); err != nil || state != AdminExists {
		return fmt.Errorf("the admin didn't show up in the database afterwards (%v). Run setup again", err)
	}
	p.Say("Admin created. You'll sign in at /dashboard with %s.", email)
	p.Say("")
	return nil
}

// AppAdmin is Admin on an open PocketBase app: the setup-admin child and reset-admin use it.
type AppAdmin struct{ App core.App }

func (a AppAdmin) Check(context.Context, string) (AdminState, error) {
	has, err := team.HasAdmin(a.App)
	switch {
	case err != nil:
		return AdminUnknown, err
	case has:
		return AdminExists, nil
	}
	return AdminMissing, nil
}

func (a AppAdmin) Create(_ context.Context, _, email, password string) error {
	if err := schema.Ensure(a.App); err != nil { // the admin's board profile needs the collections
		return err
	}
	return team.SeedFirstAdmin(a.App, email, password)
}

func (a AppAdmin) find(email string) (*core.Record, error) {
	if strings.EqualFold(email, core.DefaultInstallerEmail) {
		return nil, ErrNoSuchAdmin
	}
	// PocketBase's own lookup first (it honours a NOCASE email index where one exists).
	if r, err := a.App.FindAuthRecordByEmail(core.CollectionNameSuperusers, email); err == nil {
		return r, nil
	}
	// The superusers' index is case-sensitive, so an owner who types their email in another
	// case still means their admin: accept it when exactly one admin matches.
	rs, err := a.App.FindRecordsByFilter(core.CollectionNameSuperusers, "email:lower = {:email}", "", 2, 0,
		dbx.Params{"email": strings.ToLower(email)})
	if err != nil || len(rs) != 1 {
		return nil, ErrNoSuchAdmin
	}
	return rs[0], nil
}

func (a AppAdmin) Exists(_ context.Context, email string) (bool, error) {
	_, err := a.find(email)
	return err == nil, nil
}

func (a AppAdmin) Reset(_ context.Context, email, password string) error {
	su, err := a.find(email)
	if err != nil {
		return err
	}
	su.SetPassword(password)
	su.RefreshTokenKey() // sign out every old session
	return a.App.Save(su)
}

// childAdmin is the wizard's Admin: it runs `lort setup-admin` as the lort user, so PocketBase
// opens (or creates) the database with the right owner and the key from .env.
type childAdmin struct{ dataDir string }

func (c childAdmin) cmd(ctx context.Context, key string, args ...string) (*exec.Cmd, error) {
	self, err := os.Executable()
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, self, append([]string{"setup-admin", "--dir", c.dataDir}, args...)...)
	// Only what PocketBase needs; the key goes through the environment, never argv.
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=/tmp", config.EncryptionEnv + "=" + key, "LORT_DATA=" + c.dataDir}
	asLort(cmd)
	return cmd, nil
}

func (c childAdmin) Check(ctx context.Context, key string) (AdminState, error) {
	cmd, err := c.cmd(ctx, key, "--check")
	if err != nil {
		return AdminUnknown, err
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	err = cmd.Run()
	var exit *exec.ExitError
	switch {
	case err == nil:
		return AdminExists, nil
	case errors.As(err, &exit) && exit.ExitCode() == 1:
		return AdminMissing, nil
	}
	return AdminUnknown, fmt.Errorf("%v: %s", err, strings.TrimSpace(stderr.String()))
}

func (c childAdmin) Create(ctx context.Context, key, email, password string) error {
	cmd, err := c.cmd(ctx, key)
	if err != nil {
		return err
	}
	cmd.Stdin = strings.NewReader(email + "\n" + password + "\n")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (childAdmin) Exists(context.Context, string) (bool, error) {
	return false, errors.New("not available during setup")
}

func (childAdmin) Reset(context.Context, string, string) error {
	return errors.New("not available during setup")
}

// SetupAdmin is the hidden `lort setup-admin` command, run by the wizard as the lort user.
// With check it exits 0 when an admin exists and 1 when none does (2, from main, when it
// couldn't tell). Otherwise it reads an email and a password, one per line, from stdin.
func SetupAdmin(app core.App, check bool, stdin io.Reader) int {
	a := AppAdmin{App: app}
	if check {
		switch state, err := a.Check(context.Background(), ""); state {
		case AdminExists:
			return 0
		case AdminMissing:
			return 1
		default:
			fmt.Fprintln(os.Stderr, err)
			return 2
		}
	}
	r := bufio.NewReader(stdin)
	email, err1 := readLine(r)
	pw, err2 := readLine(r)
	if err := errors.Join(err1, err2); err != nil {
		fmt.Fprintln(os.Stderr, "setup-admin: reading the email and password:", err)
		return 2
	}
	if err := a.Create(context.Background(), "", email, pw); err != nil {
		fmt.Fprintln(os.Stderr, "setup-admin:", err)
		return 2
	}
	return 0
}

// readLine reads one line verbatim: only the line ending is removed, never spaces.
func readLine(r *bufio.Reader) (string, error) {
	s, err := r.ReadString('\n')
	if err != nil && (err != io.EOF || s == "") {
		return "", err
	}
	s = strings.TrimSuffix(s, "\n")
	return strings.TrimSuffix(s, "\r"), nil
}
