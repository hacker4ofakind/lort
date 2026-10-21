package setup

import (
	"context"
	"fmt"
)

// ResetAdmin is `lort reset-admin`, run inside the running container by
// `./setup.sh --reset-admin`. It asks for the email and a new password on the terminal, so
// the password is never an argument and never on screen.
func ResetAdmin(ctx context.Context, h Host) error {
	p := h.Prompt
	p.Say("Let's set a new password for one of your board's admins.")
	email, err := askEmail(p, "Admin email")
	if err != nil {
		return err
	}
	ok, err := h.Admin.Exists(ctx, email)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("there's no admin with the email %s. Check the spelling (it's the email you sign in to the dashboard with) and try again", email)
	}
	pw, err := askPassword(p)
	if err != nil {
		return err
	}
	if err := h.Admin.Reset(ctx, email, pw); err != nil {
		return fmt.Errorf("couldn't save the new password: %w", err)
	}
	p.Say("Done. Sign in at /dashboard with %s and your new password. Old sessions are signed out.", email)
	return nil
}
