package setup

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/term"
)

// Terminal is the real Prompter. When stdin isn't a terminal (a piped script, a coding
// agent) it reads secrets as plain lines and says so once.
type Terminal struct {
	in     *bufio.Reader
	fd     int
	tty    bool
	out    io.Writer
	state  *term.State
	warned bool
}

func NewTerminal(stdin *os.File, out io.Writer) *Terminal {
	t := &Terminal{in: bufio.NewReader(stdin), fd: int(stdin.Fd()), out: out}
	t.tty = term.IsTerminal(t.fd)
	if t.tty {
		t.state, _ = term.GetState(t.fd)
	}
	return t
}

// Restore puts the terminal back as it was (echo on), for an interrupted password prompt.
func (t *Terminal) Restore() {
	if t.state != nil {
		_ = term.Restore(t.fd, t.state)
	}
}

func (t *Terminal) Say(format string, a ...any) { fmt.Fprintf(t.out, format+"\n", a...) }

func (t *Terminal) Ask(question, def string) (string, error) {
	if def != "" {
		fmt.Fprintf(t.out, "%s [%s]: ", question, def)
	} else {
		fmt.Fprintf(t.out, "%s: ", question)
	}
	s, err := readLine(t.in)
	if !t.tty {
		fmt.Fprintln(t.out)
	}
	if err != nil {
		return "", err
	}
	if s = strings.TrimSpace(s); s == "" {
		return def, nil
	}
	return s, nil
}

func (t *Terminal) AskSecret(question string) (string, error) {
	if !t.tty {
		if !t.warned {
			t.Say("(Your input isn't a terminal, so setup reads the password as plain text. It still isn't shown or saved.)")
			t.warned = true
		}
		fmt.Fprintf(t.out, "%s: \n", question)
		return readLine(t.in)
	}
	fmt.Fprintf(t.out, "%s: ", question)
	b, err := term.ReadPassword(t.fd)
	fmt.Fprintln(t.out)
	return string(b), err
}

func (t *Terminal) Confirm(question string, def bool) (bool, error) {
	hint := "y/N"
	if def {
		hint = "Y/n"
	}
	for {
		a, err := t.Ask(question+" ("+hint+")", "")
		if err != nil {
			return def, err
		}
		switch strings.ToLower(a) {
		case "":
			return def, nil
		case "y", "yes":
			return true, nil
		case "n", "no":
			return false, nil
		}
		t.Say("Type y or n.")
	}
}

// NewHost is the real Host for `lort setup`.
func NewHost(t *Terminal, dataDir string) Host {
	return Host{Prompt: t, Net: newWebNet(), Admin: childAdmin{dataDir: dataDir}}
}
