// Package setup is `lort setup`, the wizard the setup scripts run in a throwaway container,
// and `lort reset-admin`. Every step talks to the outside world through Host, so each flow
// can be tested with fakes.
package setup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"os"
	"path/filepath"
)

// Prompter is the terminal.
type Prompter interface {
	Say(format string, a ...any)
	Ask(question, def string) (string, error) // an empty answer means def
	AskSecret(question string) (string, error)
	Confirm(question string, def bool) (bool, error)
}

// Net answers the DNS check's questions.
type Net interface {
	DNS(ctx context.Context, host, typ string) ([]netip.Addr, error) // typ is "A" or "AAAA"
	PublicIP(ctx context.Context, version int) (netip.Addr, error)   // version is 4 or 6
}

// AdminState is what the data volume says about the board's admin.
type AdminState int

const (
	AdminExists  AdminState = iota // exit code 0 from setup-admin --check
	AdminMissing                   // 1
	AdminUnknown                   // 2: couldn't tell
)

// ErrNoSuchAdmin is returned by Admin.Reset for an email no admin has.
var ErrNoSuchAdmin = errors.New("no such admin")

// Admin reads and writes the board's admins in the data volume.
type Admin interface {
	Check(ctx context.Context, key string) (AdminState, error)
	Create(ctx context.Context, key, email, password string) error
	Exists(ctx context.Context, email string) (bool, error)
	Reset(ctx context.Context, email, password string) error
}

// Host is everything the wizard touches besides the two folders in Options.
type Host struct {
	Prompt Prompter
	Net    Net
	Admin  Admin
}

// Options are the facts the wrapper script found on the host.
type Options struct {
	Workdir          string // the owner's folder, mounted at /work; .env lives here
	DataDir          string // PocketBase's data folder in the lort_data volume
	PortsFree        bool   // 80 and 443 are free (or held by the lort container)
	ContainerRunning bool   // a container named lort is running
	ContainerExists  bool   // a container named lort exists, running or stopped
	OS               string // linux, mac or windows
	Script           string // the script the owner ran, named in advice; "" picks one from OS
}

// ErrInputEnded stops the wizard when stdin runs out mid-question.
var ErrInputEnded = errors.New("setup stopped: the input ended before every question was answered")

func ended(err error) error {
	if errors.Is(err, io.EOF) {
		return ErrInputEnded
	}
	return err
}

// Run is `lort setup`.
func Run(ctx context.Context, h Host, o Options) error {
	p := h.Prompt
	p.Say("Hi! Let's get your feedback board running. It takes a few minutes.")
	p.Say("Docker and git are ready.")
	p.Say("")

	envPath := filepath.Join(o.Workdir, ".env")
	saved, err := readEnv(envPath)
	if err != nil {
		return err
	}
	key, err := savedKey(saved)
	if err != nil {
		return err
	}
	if key == "" {
		if has, err := dataExists(o.DataDir); err != nil {
			return err
		} else if has {
			return errNoKeyForData(scriptName(o))
		}
	}

	addr, err := askAddress(ctx, h, saved)
	if err != nil {
		return err
	}
	mode := ModeProxy
	if !addr.local && o.PortsFree {
		mode = ModeHTTPS
	}

	if key == "" {
		if key, err = newKey(); err != nil {
			return err
		}
	}
	if err := writeEnv(envPath, o.Workdir, saved, addr, mode, key); err != nil {
		return err
	}
	p.Say("Saved your answers to .env.")
	p.Say("")

	if err := adminStep(ctx, h, o, key); err != nil {
		return err
	}

	finish(p, o, addr, mode)
	return nil
}

func scriptName(o Options) string {
	switch {
	case o.Script != "":
		return o.Script
	case o.OS == "windows":
		return "./setup.ps1"
	}
	return "./setup.sh"
}

func dataExists(dataDir string) (bool, error) {
	_, err := os.Stat(filepath.Join(dataDir, "data.db"))
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

func errNoKeyForData(script string) error {
	return fmt.Errorf("this server already has board data in the lort_data volume, but .env has no LORT_ENCRYPTION_KEY, "+
		"and a new key couldn't read the old data. Setup stopped and changed nothing.\n\n"+
		"To get the key back:\n"+
		"  - If you kept a copy of .env, put it back in this folder.\n"+
		"  - Look for .env.previous next to it.\n"+
		"  - If the old container still exists, `docker inspect lort` shows the key on the LORT_ENCRYPTION_KEY line.\n"+
		"    Removing a container never deletes the lort_data volume, so your data is safe meanwhile.\n\n"+
		"Then run %s again", script)
}
